import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, ref } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

try {
  const policy = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/agentsMdEditorPolicy.ts',
  )
  const { useAgentsMdEditor } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useAgentsMdEditor.ts',
  )
  const {
    parseAgentContextResponse,
    parseAgentsMdMutationResponse,
    parseAgentsMdResponse,
    parseAgentsMdRewriteResponse,
  } = await vite.ssrLoadModule('/src/domains/ontology/api/agents.ts')

  const response = parseAgentsMdResponse({
    nodeTypeName: 'Order',
    content: '# Order agent',
    enabled: false,
  })
  assert.deepEqual(response, {
    nodeTypeName: 'Order',
    content: '# Order agent',
    enabled: false,
  })
  assert.deepEqual(parseAgentContextResponse({
    nodeTypeName: 'Order',
    description: 'Order context',
    dataSource: 'warehouse.orders',
    fields: [{ name: 'status', type: 'string', description: 'state' }],
    methods: [{ name: 'notify', behaviorType: 'rest_api', description: '' }],
    connectedObjects: [{ name: 'Customer', type: 'entity', relationship: 'belongs_to' }],
  }).fields, [{ name: 'status', type: 'string', description: 'state' }])
  assert.deepEqual(parseAgentsMdMutationResponse({ success: true }), { success: true })
  assert.deepEqual(
    parseAgentsMdRewriteResponse({ rewrittenContent: '# Rewritten' }),
    { rewrittenContent: '# Rewritten' },
  )
  assert.throws(() => parseAgentsMdResponse({
    nodeTypeName: 'Order',
    content: '# invalid',
    enabled: 'yes',
  }), /enabled/)
  assert.throws(() => parseAgentContextResponse({
    nodeTypeName: 'Order',
    fields: {},
    methods: [],
    connectedObjects: [],
  }), /배열/)
  assert.throws(
    () => parseAgentsMdMutationResponse({ success: false }),
    /success/,
  )
  assert.throws(
    () => parseAgentsMdRewriteResponse({ rewrittenContent: 42 }),
    /rewrittenContent/,
  )

  const loaded = policy.loadedAgentsMdDocument(response)
  assert.equal(policy.isAgentsMdDirty(loaded), false)
  assert.equal(policy.isAgentsMdEnabledDirty({ ...loaded, enabled: true }), true)
  assert.deepEqual(
    [...policy.computeChangedLineIndexes('a\nb', 'a\nc\nd')],
    [1, 2],
  )
  const processSnapshot = policy.createProcessGptBehaviorSnapshot(
    'Order',
    { id: 'proc-1', name: 'Approve Order', description: 'approval' },
    ' total > 100 ',
  )
  assert.equal(processSnapshot.behaviorName, 'approve_order')
  assert.equal(processSnapshot.body.config.processId, 'proc-1')
  assert.equal(
    policy.appendProcessGptReference('# Agent', processSnapshot),
    '# Agent\n- total > 100 → @method:process.approve_order 호출',
  )

  const contentReads = new Map()
  const contextReads = new Map()
  const saveCalls = []
  const deleteCalls = []
  const resetCalls = []
  const rewriteCalls = []
  const behaviorCalls = []
  const processReads = []

  const dependencies = {
    getContent(node, signal) {
      const request = deferred()
      contentReads.set(node, { ...request, signal })
      return request.promise
    },
    getContext(node, signal) {
      const request = deferred()
      contextReads.set(node, { ...request, signal })
      return request.promise
    },
    async create(node, customContent, signal) {
      resetCalls.push({ node, customContent, signal })
      return { nodeTypeName: node, content: '# Template', enabled: true }
    },
    async save(node, content, enabled, signal) {
      saveCalls.push({ node, content, enabled, signal })
      if (saveCalls.length === 1) throw new Error('save outage')
      return { success: true }
    },
    async remove(node, signal) {
      deleteCalls.push({ node, signal })
      if (deleteCalls.length === 1) throw new Error('delete outage')
      return { success: true }
    },
    rewrite(node, content, prompt, signal) {
      const request = deferred()
      rewriteCalls.push({ node, content, prompt, signal, request })
      return request.promise
    },
    listProcesses(signal) {
      processReads.push({ signal })
      return Promise.resolve([{ id: 'proc-1', name: 'Approve Order' }])
    },
    createBehavior(node, body, signal) {
      const request = deferred()
      behaviorCalls.push({ node, body, signal, request })
      return request.promise
    },
  }

  const node = ref('Order')
  const scope = effectScope()
  const editor = scope.run(() => useAgentsMdEditor(node, dependencies))
  assert(editor)
  await flush()

  node.value = 'Customer'
  await flush()
  assert.equal(contentReads.get('Order').signal.aborted, true)
  assert.equal(contextReads.get('Order').signal.aborted, true)
  contentReads.get('Customer').resolve({
    nodeTypeName: 'Customer',
    content: '# Customer',
    enabled: false,
  })
  contextReads.get('Customer').resolve({
    nodeTypeName: 'Customer',
    description: '',
    dataSource: '',
    fields: [],
    methods: [],
    connectedObjects: [],
  })
  await flush()
  contentReads.get('Order').resolve({
    nodeTypeName: 'Order',
    content: '# Late order',
    enabled: true,
  })
  contextReads.get('Order').resolve({
    nodeTypeName: 'Order',
    description: '',
    dataSource: '',
    fields: [{ name: 'late', type: 'string', description: '' }],
    methods: [],
    connectedObjects: [],
  })
  await flush()
  assert.equal(editor.content.value, '# Customer')
  assert.equal(editor.context.value.nodeTypeName, 'Customer')

  assert.equal(await editor.toggleEnabled(true), false)
  assert.equal(saveCalls[0].content, '# Customer')
  assert.equal(saveCalls[0].enabled, true)
  assert.equal(
    editor.enabled.value,
    false,
    'failed enabled-only save must restore the prior visible value',
  )
  assert.match(editor.saveOperation.error, /save outage/)
  assert.equal(await editor.retrySave(), true)
  assert.deepEqual(
    saveCalls.slice(0, 2).map(call => [call.node, call.content, call.enabled]),
    [
      ['Customer', '# Customer', true],
      ['Customer', '# Customer', true],
    ],
    'save retry must use the frozen document and enabled snapshot',
  )
  assert.equal(editor.enabled.value, true)
  assert.equal(editor.isDirty.value, false)

  assert.equal(await editor.deleteAgent(), false)
  node.value = 'Order'
  await flush()
  assert.equal(
    await editor.retryDelete(),
    false,
    'a frozen delete target must not retry after the node changes',
  )
  contentReads.get('Order').resolve({
    nodeTypeName: 'Order',
    content: '# Order',
    enabled: true,
  })
  contextReads.get('Order').resolve({
    nodeTypeName: 'Order',
    description: '',
    dataSource: '',
    fields: [],
    methods: [],
    connectedObjects: [],
  })
  await flush()
  assert.equal(await editor.deleteAgent(), true)
  assert.equal(editor.hasAgent.value, false)

  await editor.createAgent()
  editor.content.value = '# Local draft'
  await editor.resetToTemplate()
  assert.equal(editor.content.value, '# Template')
  assert.equal(
    editor.isContentDirty.value,
    false,
    'the create response is the current persisted server template after reset',
  )

  editor.content.value = '# Before rewrite'
  const firstRewrite = editor.rewrite('first prompt')
  await flush()
  const secondRewrite = editor.rewrite('second prompt')
  await flush()
  assert.equal(rewriteCalls[0].signal.aborted, true)
  rewriteCalls[1].request.resolve({ rewrittenContent: '# Current rewrite' })
  assert.deepEqual(await secondRewrite, {
    oldContent: '# Before rewrite',
    newContent: '# Current rewrite',
  })
  rewriteCalls[0].request.resolve({ rewrittenContent: '# Late rewrite' })
  assert.equal(await firstRewrite, null)
  assert.equal(editor.content.value, '# Current rewrite')

  await editor.loadProcesses()
  assert.equal(editor.processList.value[0].id, 'proc-1')
  const addPromise = editor.addProcess(editor.processList.value[0], 'total > 100')
  await flush()
  assert.equal(
    editor.processGptMethods.value.some(method => method.name === 'process.approve_order'),
    false,
    'process method must not commit before Behavior creation succeeds',
  )
  behaviorCalls[0].request.resolve({ success: true })
  assert.equal(await addPromise, true)
  assert.equal(
    editor.processGptMethods.value.some(method => method.name === 'process.approve_order'),
    true,
  )
  assert.match(editor.content.value, /@method:process\.approve_order/)

  scope.stop()
  assert.equal(
    rewriteCalls[1].signal.aborted,
    false,
    'completed rewrite controller should already be released',
  )

  console.log('Agents.md editor contracts passed')
} finally {
  await vite.close()
}
