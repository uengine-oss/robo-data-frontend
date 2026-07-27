import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { createServer: createViteServer } = require('vite')

const probe = createServer()
await new Promise(resolveListening => probe.listen(0, '127.0.0.1', resolveListening))
const address = probe.address()
assert(address && typeof address === 'object')
const port = address.port
await new Promise(resolveClosed => probe.close(resolveClosed))

const vite = await createViteServer({
  root: repoRoot,
  server: { middlewareMode: true, hmr: false, port },
  appType: 'custom',
})

try {
  const draft = await vite.ssrLoadModule(
    '/src/domains/catalog/glossary/application/bulkUploadDraft.ts',
  )
  const calendarDraft = await vite.ssrLoadModule(
    '/src/domains/catalog/glossary/application/businessCalendarDraft.ts',
  )
  const api = await vite.ssrLoadModule('/src/domains/catalog/glossary/api.ts')
  const upload = {
    session_id: 'session-1',
    term_source_file: 'terms.csv',
    no_term_source: false,
    files: [
      {
        filename: 'terms.csv',
        role: 'term_source',
        total_rows: 2,
        headers: ['용어', '상태', '코드'],
        sample_rows: [['고객', '승인', 'C1']],
        parse_status: 'parsed',
        column_mapping: {
          term_name: '용어',
          term_status: '상태',
        },
      },
      {
        filename: 'words.csv',
        role: 'word_dictionary',
        total_rows: 2,
        headers: ['코드', '동의어'],
        sample_rows: [['C1', '구매자']],
        parse_status: 'parsed',
        column_mapping: { word_synonyms: '동의어' },
      },
    ],
    join_rules: [
      {
        left_file: 'terms.csv',
        left_column: '코드',
        right_file: 'words.csv',
        right_column: '코드',
        join_type: 'left',
      },
    ],
  }

  const parsedUpload = api.parseBulkUploadResponse(upload)
  assert.equal(parsedUpload.session_id, upload.session_id)
  assert.deepEqual(parsedUpload.files.map(file => file.filename), ['terms.csv', 'words.csv'])
  assert.deepEqual(parsedUpload.join_rules[0], {
    ...upload.join_rules[0],
    purpose: undefined,
    confidence: undefined,
  })
  assert.throws(
    () => api.parseBulkUploadResponse({ ...upload, session_id: 7 }),
    /session_id/,
  )
  assert.deepEqual(api.parseBulkImportResponse({
    batch_id: 'batch-1',
    created: 2,
    skipped: 0,
    errors: [],
    domains_created: 1,
    domains_existing: 0,
    unmapped_columns_reminder: ['기타'],
    next_steps: ['검토'],
  }), {
    batch_id: 'batch-1',
    created: 2,
    skipped: 0,
    errors: [],
    domains_created: 1,
    domains_existing: 0,
    unmapped_columns_reminder: ['기타'],
    next_steps: ['검토'],
  })
  assert.deepEqual(api.parseBulkRollbackResponse({
    deleted: 2,
    batch_id: 'batch-1',
  }), {
    deleted: 2,
    batch_id: 'batch-1',
  })

  const hydrated = draft.hydrateBulkUpload(upload)
  assert.equal(hydrated.mapping.term_source_file, 'terms.csv')
  assert.equal(hydrated.mapping.term_name_column, '용어')
  assert.deepEqual(hydrated.mapping.term_synonyms_column, {
    source: 'joined',
    file: 'words.csv',
    column: '동의어',
    join_rule_index: 0,
  })
  assert.equal(hydrated.joins[0].enabled, true)

  const encoded = draft.encodeColumnSelection(hydrated.mapping.term_synonyms_column)
  assert.deepEqual(draft.decodeColumnSelection(encoded), hydrated.mapping.term_synonyms_column)
  assert.equal(draft.decodeColumnSelection('"용어"'), '용어')
  assert.equal(draft.decodeColumnSelection('not-json'), null)
  assert.equal(draft.decodeColumnSelection('{"source":"joined","file":"x"}'), null)
  assert.equal(
    draft.decodeColumnSelection(
      '{"source":"joined","file":"x","column":"y","join_rule_index":-1}',
    ),
    null,
  )

  const extractRequest = draft.buildBulkExtractRequest({
    sessionId: upload.session_id,
    mapping: hydrated.mapping,
    joins: [
      hydrated.joins[0],
      { ...hydrated.joins[0], right_file: 'disabled.csv', enabled: false },
    ],
    transforms: [
      { source: '승인', target: 'Approved' },
      { source: '', target: 'Draft' },
    ],
    useAiEnrichment: true,
  })
  assert.equal(extractRequest.confirmed_joins.length, 1)
  assert.deepEqual(extractRequest.value_transforms, {
    term_status: { 승인: 'Approved' },
  })
  assert.equal(extractRequest.use_ai_enrichment, true)

  const candidates = [
    {
      row_index: 0,
      name: '고객',
      description: '구매 주체',
      status: 'Approved',
      synonyms: ['구매자'],
      domains: ['영업'],
      tags: [],
    },
    {
      row_index: 1,
      name: '',
      description: '주문 레코드',
      status: 'Draft',
      synonyms: [],
      domains: ['판매'],
      tags: [],
    },
  ]
  const cloned = draft.cloneBulkCandidates(candidates)
  cloned[0].synonyms.push('소비자')
  assert.deepEqual(candidates[0].synonyms, ['구매자'])
  assert.deepEqual(
    draft.filterAndSortBulkCandidates(candidates, {
      searchQuery: '',
      status: '',
      emptyOnly: true,
      sortKey: 'name',
      sortDirection: 'asc',
    }).map(candidate => candidate.row_index),
    [1],
  )
  assert.equal(draft.updateBulkCandidate(candidates, 1, 'name', '주문')[1].name, '주문')
  assert.strictEqual(
    draft.updateBulkCandidate(candidates, 1, 'status', 'invalid'),
    candidates,
  )
  assert.deepEqual(
    draft.buildBulkImportRequest(candidates, [1], ['미매핑']).terms.map(candidate => candidate.row_index),
    [1],
  )
  assert.equal(draft.shouldPersistBulkPreview(0), false)
  assert.equal(draft.shouldPersistBulkPreview(200), true)
  assert.equal(draft.shouldPersistBulkPreview(201), false)

  const snapshot = {
    version: 1,
    step: 2,
    uploadResponse: upload,
    confirmedMapping: hydrated.mapping,
    confirmedJoins: hydrated.joins,
    valueTransforms: [],
    useAiEnrichment: false,
    extractResult: null,
    editableCandidates: [],
    importResult: null,
    selectedRowIndexes: [],
    searchQuery: '',
    statusFilter: '',
    emptyOnly: false,
    sortKey: 'name',
    sortDirection: 'asc',
    hasPreviewData: false,
    needsPreviewRestore: false,
  }
  assert.equal(draft.parseBulkUploadSnapshot(JSON.stringify(snapshot)).step, 2)
  assert.equal(
    draft.parseBulkUploadSnapshot(JSON.stringify({
      ...snapshot,
      confirmedMapping: {
        ...snapshot.confirmedMapping,
        term_name_column: { source: 'joined', file: 'words.csv' },
      },
    })),
    null,
  )
  assert.equal(draft.parseBulkUploadSnapshot('{broken'), null)

  assert.deepEqual(
    api.parseGlossaryListResponse({
      glossaries: [{
        id: 'g1',
        name: '표준 용어',
        description: '',
        type: 'Business',
        termCount: 2,
      }],
    }).glossaries.map(glossary => glossary.id),
    ['g1'],
  )
  assert.throws(
    () => api.parseGlossaryListResponse({
      glossaries: [{ id: 'g1', name: '표준 용어', type: 'Business' }],
    }),
    /termCount 응답 계약 오류/,
  )
  assert.equal(
    api.parseTermResponse({
      id: 't1',
      name: '고객',
      status: 'Approved',
      domains: ['영업'],
      owners: [{ id: 'o1', name: '영업팀' }],
      tags: ['핵심'],
    }).domains[0].id,
    '영업',
  )
  assert.throws(
    () => api.parseTermResponse({ id: '', name: '고객', status: 'Draft' }),
    /id와 name/,
  )
  assert.throws(
    () => api.parseTermResponse({ id: 't1', name: '고객', status: 'Unknown' }),
    /term\.status 응답 계약 오류/,
  )
  assert.throws(
    () => api.parseTermResponse({
      id: 't1',
      name: '고객',
      status: 'Draft',
      owners: [{ id: 'o1' }],
    }),
    /이름이 필요/,
  )
  assert.deepEqual(
    api.parseGlossaryMetadataResponse({
      domains: [{ id: 'd1', name: '영업', termCount: 2 }],
    }, 'domains').domains.map(domain => domain.name),
    ['영업'],
  )
  assert.throws(
    () => api.parseGlossaryMetadataResponse({ owners: [{ id: 'o1' }] }, 'owners'),
    /id와 name/,
  )

  const holidays = [{ date: '2026-07-17', name: '제헌절 검증' }]
  const calendarDays = calendarDraft.buildBusinessCalendarDays({
    year: 2026,
    month: 6,
    selectedDates: new Set(['2026-07-20']),
    includeWeekends: true,
    holidays,
    businessDays: [{ date: '2026-07-20', isBusinessDay: false, reason: '회사 휴무' }],
  })
  assert.equal(calendarDays.length, 42)
  assert.equal(calendarDays.find(day => day.date === '2026-07-20').reason, '회사 휴무')
  const calendarStats = calendarDraft.calculateBusinessCalendarStats({
    year: 2026,
    month: 6,
    selectedDates: new Set(['2026-07-20']),
    includeWeekends: true,
    holidays,
  })
  assert.equal(calendarStats.businessDayCount + calendarStats.nonBusinessDays, 31)
  assert.equal(calendarStats.holidayDays, 1)
  assert.deepEqual(
    calendarDraft.buildSaveBusinessDaysRequest({
      year: 2026,
      selectedDates: new Set(['2026-07-20']),
      includeWeekends: true,
      holidays,
      businessDays: [{ date: '2026-07-20', isBusinessDay: false, reason: '회사 휴무' }],
    }).nonBusinessDays,
    [{ date: '2026-07-20', isBusinessDay: false, reason: '회사 휴무' }],
  )
  assert.equal(
    calendarDraft.mergeFixedKoreanHolidays(2026, [
      { date: '2026-01-01', name: '사용자 이름' },
    ]).filter(holiday => holiday.date === '2026-01-01').length,
    1,
  )
  assert.equal(
    api.parseBusinessDaysResponse({
      businessDays: [{ date: '2026-07-20', isBusinessDay: false, reason: '회사 휴무' }],
      holidays,
      settings: { excludeWeekends: true },
    }).settings.excludeWeekends,
    true,
  )
  assert.throws(
    () => api.parseBusinessDaysResponse({
      businessDays: [{ date: 'July 20', isBusinessDay: false }],
      holidays: [],
      settings: { excludeWeekends: true },
    }),
    /YYYY-MM-DD/,
  )
  assert.throws(
    () => api.parseBusinessCalendarMutationResponse({ success: false }),
    /success=false/,
  )

  console.log('Catalog bulk upload draft: mapping + request + selection + preview editing passed')
} finally {
  await vite.close()
}
