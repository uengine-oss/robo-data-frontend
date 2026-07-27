import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, nextTick, ref } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function mutation(message, behavior) {
  return {
    success: true,
    message,
    ...(behavior ? { behavior } : {}),
  }
}

function deferred() {
  let resolve
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function settle() {
  await nextTick()
  await new Promise(resolve => setImmediate(resolve))
}

try {
  const api = await vite.ssrLoadModule('/src/domains/ontology/api/agents.ts')
  const policy = await vite.ssrLoadModule(
    '/src/domains/ontology/application/behaviorDraft.ts',
  )
  const { useBehaviorEditor } = await vite.ssrLoadModule(
    '/src/domains/ontology/application/useBehaviorEditor.ts',
  )

  const existing = {
    name: 'risk_check',
    description: '위험 확인',
    behaviorType: 'python',
    config: { code: 'result = {"risk": "LOW"}' },
    inputFields: ['age'],
    outputField: 'risk_level',
  }
  const existingDraft = policy.createBehaviorEditorDraft(existing, ['age', 'name'])
  assert.equal(existingDraft.outputSelection, policy.CUSTOM_OUTPUT_FIELD)
  assert.equal(existingDraft.customOutputField, 'risk_level')
  assert.equal(existingDraft.pythonCode, existing.config.code)

  const restDraft = policy.createBehaviorEditorDraft(undefined, ['age'])
  restDraft.name = '  run risk  '
  restDraft.description = '  위험 검사  '
  restDraft.endpoint = ' https://example.test/behavior '
  restDraft.inputFields = ['age']
  restDraft.outputSelection = policy.CUSTOM_OUTPUT_FIELD
  restDraft.customOutputField = '  risk_level '
  assert.deepEqual(policy.buildOntologyBehavior(restDraft), {
    name: 'run_risk',
    description: '위험 검사',
    behaviorType: 'rest_api',
    config: {
      endpoint: 'https://example.test/behavior',
      method: 'POST',
    },
    inputFields: ['age'],
    outputField: 'risk_level',
  })
  assert.throws(
    () => policy.buildOntologyBehavior({ ...restDraft, endpoint: '' }),
    /엔드포인트/,
  )
  assert.deepEqual(
    policy.toggleBehaviorInputField(['age'], 'name'),
    ['age', 'name'],
  )
  assert.deepEqual(
    policy.toggleBehaviorInputField(['age', 'name'], 'age'),
    ['name'],
  )
  assert.equal(
    policy.normalizeGeneratedPythonCode('```python\nresult = 1\n```'),
    'result = 1',
  )

  const generation = policy.buildBehaviorCodeGenerationSnapshot({
    objectTypeName: 'Customer',
    columns: ['age', 'name'],
    relatedObjectTypes: [{
      name: 'Order',
      relationName: 'orders',
      columns: ['amount'],
    }],
    description: '위험도를 계산한다',
  })
  assert.match(generation.prompt, /ObjectType: Customer/)
  assert.match(generation.prompt, /Order \(관계명: orders\)/)
  assert.match(generation.prompt, /위험도를 계산한다/)

  restDraft.testInstanceJson = '{"age": 42}'
  assert.deepEqual(policy.buildBehaviorExternalTestSnapshot(restDraft), {
    endpoint: 'https://example.test/behavior',
    method: 'POST',
    body: {
      behavior_name: '  run risk  ',
      instance_data: { age: 42 },
    },
  })
  assert.throws(
    () => policy.buildBehaviorExternalTestSnapshot({
      ...restDraft,
      testInstanceJson: '[]',
    }),
    /JSON 객체/,
  )

  assert.equal(
    api.parseBehaviorCodeGenerationResponse({
      success: true,
      code: 'result = 1',
      language: 'python',
    }, 'python').code,
    'result = 1',
  )
  assert.throws(
    () => api.parseBehaviorCodeGenerationResponse({
      success: true,
      language: 'python',
    }, 'python'),
    /code/,
  )
  assert.equal(
    api.parseBehaviorMutationResponse(
      mutation('생성 완료', existing),
      'Behavior 생성',
      existing,
    ).behavior.name,
    'risk_check',
  )
  assert.throws(
    () => api.parseBehaviorMutationResponse(
      mutation('생성 완료', { ...existing, name: 'other' }),
      'Behavior 생성',
      existing,
    ),
    /identity/,
  )
  assert.equal(
    api.parseBehaviorMutationResponse(
      mutation('생성 완료', {
        name: 'process_order',
        behaviorType: 'processGPT',
        config: {
          processId: 'process-a',
          processName: '주문 처리',
          triggerCondition: '승인 완료',
        },
      }),
      'Behavior 생성',
    ).behavior.behaviorType,
    'processGPT',
  )
  const processBehavior = {
    name: 'process_order',
    description: '주문 처리',
    behaviorType: 'processGPT',
    config: {
      processId: 'process-a',
      processName: '주문 처리',
      triggerCondition: '승인 완료',
    },
  }
  const processDraft = policy.createBehaviorEditorDraft(processBehavior, [])
  assert.equal(processDraft.behaviorType, 'processGPT')
  assert.deepEqual(policy.buildOntologyBehavior(processDraft), processBehavior)

  const visible = ref(true)
  const mode = ref('create')
  const objectTypeName = ref('Customer')
  const columns = ref(['age', 'name'])
  const behavior = ref()
  const generationCalls = []
  const saveCalls = []
  const testCalls = []
  const deleteCalls = []
  let generationAttempts = 0
  let saveAttempts = 0
  let testAttempts = 0
  let deleteAttempts = 0

  const scope = effectScope()
  const editor = scope.run(() => useBehaviorEditor(
    {
      visible,
      mode,
      objectTypeName,
      columns,
      relatedObjectTypes: ref([]),
      behavior,
    },
    {
      generate: async target => {
        generationCalls.push(cloneJson(target))
        generationAttempts += 1
        if (generationAttempts === 1) throw new Error('generation fixture outage')
        return {
          success: true,
          code: '```python\nresult = {"risk": "LOW"}\n```',
          language: 'python',
        }
      },
      create: async (targetObjectType, targetBehavior) => {
        saveCalls.push(cloneJson({ targetObjectType, targetBehavior }))
        saveAttempts += 1
        if (saveAttempts === 1) throw new Error('save fixture outage')
        return mutation('생성 완료', targetBehavior)
      },
      update: async (targetObjectType, originalName, targetBehavior) => {
        saveCalls.push(cloneJson({
          targetObjectType,
          originalName,
          targetBehavior,
        }))
        return mutation('수정 완료')
      },
      remove: async (targetObjectType, behaviorName) => {
        deleteCalls.push({ targetObjectType, behaviorName })
        deleteAttempts += 1
        if (deleteAttempts === 1) throw new Error('delete fixture outage')
        return mutation('삭제 완료')
      },
      test: async target => {
        testCalls.push(cloneJson(target))
        testAttempts += 1
        if (testAttempts === 1) throw new Error('test fixture outage')
        return { success: true, risk: 'LOW' }
      },
    },
  ))
  assert(editor)
  await settle()

  editor.draft.value.description = '위험도를 계산한다'
  assert.equal(await editor.generatePythonCode(), false)
  assert.equal(editor.generationCanRetry.value, true)
  assert.equal(await editor.retryGeneration(), true)
  assert.deepEqual(
    generationCalls[1],
    generationCalls[0],
    'generation retry changed the failed prompt snapshot',
  )
  assert.equal(editor.draft.value.behaviorType, 'python')
  assert.equal(editor.draft.value.pythonCode, 'result = {"risk": "LOW"}')

  editor.draft.value.name = 'risk_check'
  assert.equal(await editor.saveBehavior(), null)
  assert.equal(editor.saveCanRetry.value, true)
  assert(await editor.retrySave())
  assert.deepEqual(
    saveCalls[1],
    saveCalls[0],
    'save retry changed the failed mutation snapshot',
  )

  editor.draft.value.behaviorType = 'rest_api'
  editor.draft.value.endpoint = 'https://example.test/behavior'
  editor.draft.value.testInstanceJson = '{"age":42}'
  await settle()
  assert.equal(await editor.testBehavior(), false)
  assert.equal(editor.testCanRetry.value, true)
  assert.equal(await editor.retryTest(), true)
  assert.deepEqual(
    testCalls[1],
    testCalls[0],
    'test retry changed the failed external request snapshot',
  )
  assert.match(editor.testResultText.value, /"risk": "LOW"/)

  mode.value = 'edit'
  behavior.value = existing
  await settle()
  editor.draft.value.description = '수정된 위험 확인'
  const updated = await editor.saveBehavior()
  assert.equal(updated.description, '수정된 위험 확인')
  assert.equal(saveCalls.at(-1).originalName, 'risk_check')
  editor.requestDelete()
  assert.equal(editor.deleteDialogOpen.value, true)
  assert.equal(await editor.confirmDelete(), null)
  assert.equal(editor.deleteCanRetry.value, true)
  assert.equal(await editor.confirmDelete(), 'risk_check')
  assert.deepEqual(deleteCalls[1], deleteCalls[0])

  const lateGeneration = deferred()
  const abortSignals = []
  const lateScope = effectScope()
  const lateVisible = ref(true)
  const lateEditor = lateScope.run(() => useBehaviorEditor(
    {
      visible: lateVisible,
      mode: ref('create'),
      objectTypeName: ref('Customer'),
      columns: ref([]),
      relatedObjectTypes: ref([]),
      behavior: ref(),
    },
    {
      generate: async (_target, signal) => {
        abortSignals.push(signal)
        return lateGeneration.promise
      },
      create: async (_name, targetBehavior) =>
        mutation('생성 완료', targetBehavior),
      update: async () => mutation('수정 완료'),
      remove: async () => mutation('삭제 완료'),
      test: async () => ({ success: true }),
    },
  ))
  assert(lateEditor)
  lateEditor.draft.value.description = '늦은 생성'
  const lateResult = lateEditor.generatePythonCode()
  await settle()
  lateVisible.value = false
  await settle()
  assert.equal(abortSignals[0].aborted, true)
  lateGeneration.resolve({
    success: true,
    code: 'result = "late"',
    language: 'python',
  })
  assert.equal(await lateResult, false)
  assert.equal(
    lateEditor.draft.value.pythonCode,
    '',
    'closed editor accepted a late generation response',
  )
  lateScope.stop()
  scope.stop()

  console.log('Ontology Behavior editor contracts passed')
} finally {
  await vite.close()
}
