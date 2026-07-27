import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, nextTick } from 'vue'

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

try {
  const policy = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/documentGeneration.ts',
  )
  const { useOntologyDocumentGeneration } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyDocumentGeneration.ts',
  )
  const selectedIds = ['glossary-a']
  const form = {
    inputType: 'text',
    text: '  original document  ',
    pdfUrl: '',
    selectedGlossaryIds: selectedIds,
  }
  const textTarget = policy.createOntologyDocumentGenerationTarget(form, false)
  assert.deepEqual(textTarget, {
    inputType: 'text',
    body: {
      inputType: 'text',
      text: '  original document  ',
      glossary_ids: ['glossary-a'],
    },
  })
  selectedIds.push('mutated-after-start')
  form.text = 'changed-after-start'
  assert.deepEqual(textTarget.body, {
    inputType: 'text',
    text: '  original document  ',
    glossary_ids: ['glossary-a'],
  })
  assert(Object.isFrozen(textTarget))
  assert(Object.isFrozen(textTarget.body))
  assert(Object.isFrozen(textTarget.body.glossary_ids))

  const urlTarget = policy.createOntologyDocumentGenerationTarget({
    inputType: 'url',
    text: '',
    pdfUrl: 'https://example.test/ontology.pdf',
    selectedGlossaryIds: ['ignored'],
  }, true)
  assert.deepEqual(urlTarget, {
    inputType: 'url',
    body: {
      inputType: 'pdf',
      pdfUrl: 'https://example.test/ontology.pdf',
    },
  })
  const pdfTarget = policy.createOntologyDocumentGenerationTarget({
    inputType: 'pdf',
    text: '',
    pdfUrl: '',
    selectedGlossaryIds: ['glossary-b'],
  }, false, 'frozen-pdf-content')
  assert.deepEqual(pdfTarget.body, {
    inputType: 'pdf',
    pdfContent: 'frozen-pdf-content',
    glossary_ids: ['glossary-b'],
  })
  assert.equal(policy.isPdfDocument({ name: 'ontology.PDF', type: '' }), true)
  assert.equal(policy.isPdfDocument({ name: 'ontology.txt', type: 'text/plain' }), false)
  assert.equal(
    policy.canCreateOntologyDocumentGenerationTarget(
      { inputType: 'text', text: 'value', pdfUrl: '', selectedGlossaryIds: [] },
      false,
      false,
    ),
    false,
  )
  assert.throws(
    () => policy.createOntologyDocumentGenerationTarget(
      { inputType: 'text', text: ' ', pdfUrl: '', selectedGlossaryIds: [] },
      true,
    ),
    /문서 내용을 입력/,
  )

  const glossaryReads = []
  const generationCalls = []
  const events = []
  const failures = []
  const starts = []
  let encodeCount = 0
  let generationMode = 'fail'
  let ignoredLateGeneration = null

  const scope = effectScope()
  const lifecycle = scope.run(() => useOntologyDocumentGeneration({
    loadGlossaries(signal) {
      const read = deferred()
      glossaryReads.push({ ...read, signal })
      return read.promise
    },
    async generate(body, onEvent, signal) {
      generationCalls.push({ body, signal })
      if (generationMode === 'fail') {
        throw new Error('generation unavailable')
      }
      if (generationMode === 'event-error') {
        onEvent({ event: 'error', message: 'terminal generation error' })
        return
      }
      if (generationMode === 'late') {
        const pending = deferred()
        ignoredLateGeneration = { ...pending, onEvent }
        return pending.promise
      }
      onEvent({
        event: 'complete',
        data: {
          success: true,
          schema: { nodes: [], relationships: [] },
          synonymSuggestions: [],
        },
      })
    },
    async encodePdf(_file, signal) {
      assert.equal(signal.aborted, false)
      encodeCount += 1
      return 'encoded-once'
    },
    onStart: inputType => starts.push(inputType),
    onEvent: event => events.push(event),
    onCancel: () => events.push({ event: 'cancelled-by-user' }),
    onFailure: message => failures.push(message),
  }))

  lifecycle.openGenerateDialog('document')
  await nextTick()
  assert.equal(glossaryReads.length, 1)
  const firstRead = glossaryReads[0]
  const retryReadPromise = lifecycle.loadGlossariesForGeneration()
  assert.equal(firstRead.signal.aborted, true)
  assert.equal(glossaryReads.length, 2)
  glossaryReads[1].resolve([{ id: 'latest' }])
  await retryReadPromise
  firstRead.resolve([{ id: 'stale' }])
  await Promise.resolve()
  assert.deepEqual(lifecycle.glossariesForSelect.value, [{ id: 'latest' }])

  const failedReadPromise = lifecycle.loadGlossariesForGeneration()
  glossaryReads[2].reject(new Error('glossary unavailable'))
  await failedReadPromise
  assert.equal(lifecycle.glossaryError.value, 'glossary unavailable')
  assert.deepEqual(
    lifecycle.glossariesForSelect.value,
    [{ id: 'latest' }],
    'Glossary failure discarded the last successful list',
  )

  lifecycle.generateForm.value = {
    inputType: 'text',
    text: 'frozen input',
    pdfUrl: '',
    selectedGlossaryIds: [],
  }
  lifecycle.useAllGlossaries.value = true
  await lifecycle.runGeneration()
  assert.equal(lifecycle.generateError.value, 'generation unavailable')
  assert.equal(generationCalls.length, 1)
  lifecycle.generateForm.value.text = 'changed before retry'
  generationMode = 'success'
  await lifecycle.retryGeneration()
  assert.equal(generationCalls.length, 2)
  assert.deepEqual(generationCalls[1].body, generationCalls[0].body)
  assert.equal(generationCalls[1].body.text, 'frozen input')
  assert.deepEqual(starts.slice(0, 2), ['text', 'text'])

  lifecycle.generateForm.value = {
    inputType: 'pdf',
    text: '',
    pdfUrl: '',
    selectedGlossaryIds: [],
  }
  lifecycle.uploadedFile.value = new File(['%PDF fixture'], 'fixture.pdf', {
    type: 'application/pdf',
  })
  generationMode = 'fail'
  await lifecycle.runGeneration()
  assert.equal(encodeCount, 1)
  generationMode = 'success'
  await lifecycle.retryGeneration()
  assert.equal(encodeCount, 1, 'PDF exact retry encoded a different request target')
  assert.equal(generationCalls.at(-1).body.pdfContent, 'encoded-once')

  generationMode = 'event-error'
  lifecycle.generateForm.value = {
    inputType: 'url',
    text: '',
    pdfUrl: 'https://example.test/failure.pdf',
    selectedGlossaryIds: [],
  }
  await lifecycle.runGeneration()
  assert.equal(lifecycle.generateError.value, 'terminal generation error')
  assert.equal(failures.at(-1), 'terminal generation error')

  generationMode = 'late'
  lifecycle.generateForm.value.pdfUrl = 'https://example.test/late.pdf'
  const lateRun = lifecycle.runGeneration()
  await Promise.resolve()
  assert.equal(lifecycle.generating.value, true)
  lifecycle.cancelGeneration()
  assert.equal(lifecycle.generating.value, false)
  const eventCountAfterCancel = events.length
  ignoredLateGeneration.onEvent({
    event: 'complete',
    data: {
      success: true,
      schema: { nodes: [{ id: 'late' }], relationships: [] },
      synonymSuggestions: [],
    },
  })
  ignoredLateGeneration.resolve()
  await lateRun
  assert.equal(events.length, eventCountAfterCancel)
  assert.equal(generationCalls.at(-1).signal.aborted, true)

  const pendingRead = lifecycle.loadGlossariesForGeneration()
  const disposalRead = glossaryReads.at(-1)
  scope.stop()
  assert.equal(disposalRead.signal.aborted, true)
  disposalRead.resolve([])
  await pendingRead

  console.log('Ontology document generation policy and lifecycle contracts passed')
} finally {
  await vite.close()
}
