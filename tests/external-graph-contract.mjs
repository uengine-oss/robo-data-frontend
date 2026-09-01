import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const progress = await vite.ssrLoadModule(
    '/src/workflows/code-analysis/model/analysisProgress.ts',
  )
  const projection = await vite.ssrLoadModule(
    '/src/workflows/code-analysis/model/graphProjection.ts',
  )
  const visibility = await vite.ssrLoadModule(
    '/src/shared/utils/graphVisibility.ts',
  )

  assert.deepEqual([...progress.ANALYSIS_PHASES], [
    'DDL 파싱', '소스 적재', '프로젝트 스캔', '관계 연결',
    '분석 컨텍스트 구성', '코드 분석', '후처리',
  ])
  assert.equal(progress.FRAMEWORK_LEAVES.length, 14)
  assert.equal(progress.DBMS_LEAVES.length, 12)
  assert.equal(
    progress.nextRunningLeaf(new Set(['parse_ddl_step', 'load_ast_step']), 'framework'),
    'load_external_step',
  )
  assert.equal(progress.STEP_TO_PHASE.load_external_step, 1)
  assert.equal(progress.STEP_TO_PHASE.scan_external_step, 2)
  assert.equal(progress.STEP_TO_PHASE.link_external_step, 3)
  assert.equal(progress.STEP_SUBLABEL.load_external_step, '외부 파일 읽는 중')
  assert.equal(progress.STEP_SUBLABEL.link_external_step, '외부 파일 연결하는 중')

  assert.equal(
    projection.resolveNodeName({ name: 'getOrderDetail' }, ['EXTERNAL_CHUNK'], 'opaque:1'),
    'getOrderDetail',
  )
  assert.equal(
    projection.resolveNodeName({ key: ['orders', 'order.detail'] }, ['EXTERNAL_CHUNK'], 'opaque:2'),
    'orders,order.detail',
  )
  assert.equal(projection.resolveNodeName({}, [], 'opaque:3'), 'opaque:3')
  assert.equal(progress.NODE_KIND_LABELS.EXTERNAL_CHUNK, '외부 청크')
  assert.equal(progress.NODE_KIND_EMOJI['외부 청크'], '📌')

  assert.equal(
    visibility.isNodeHidden({ id: 'external', labels: ['EXTERNAL_CHUNK'], properties: {} }),
    true,
  )
  for (const type of ['CALLS', 'READS', 'WRITES', 'HAS_COLUMN', 'FK']) {
    assert.equal(visibility.isLinkHidden(type), false, type)
  }
  for (const type of ['PARENT_OF', 'NEXT', 'REFERENCES', 'INIT_BY', 'HAS_RULE']) {
    assert.equal(visibility.isLinkHidden(type), true, type)
  }

  console.log('[OK] current graph frontend contract')
} finally {
  await vite.close()
}
