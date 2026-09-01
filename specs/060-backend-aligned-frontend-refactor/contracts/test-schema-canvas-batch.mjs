import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const batch = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/application/schemaCanvasBatch.ts',
  )
  const projection = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/model/schemaCanvasNodeProjection.ts',
  )

  const tables = [{
    name: 'orders',
    schema: 'sales',
    datasource: 'warehouse',
    logical_name: '주문',
    description: '주문 원장',
    summary: '고객별 주문',
    column_count: 0,
  }]
  const snapshot = structuredClone(tables)
  const attempt = batch.createSchemaCanvasBatchAttempt('top', tables)
  assert.deepEqual(tables, snapshot)
  assert.notEqual(attempt.tables, tables)
  assert.notEqual(attempt.tables[0], tables[0])
  tables[0].name = 'mutated'
  assert.equal(attempt.tables[0].name, 'orders')

  const retry = batch.cloneSchemaCanvasBatchAttempt(attempt)
  attempt.tables[0].schema = 'mutated'
  assert.equal(retry.tables[0].schema, 'sales')

  const columns = [{
    name: 'order_id',
    table_name: 'orders',
    data_type: 'uuid',
    nullable: false,
    logical_name: '주문 ID',
    description: '식별자',
  }]
  const behaviors = [{
    name: 'cancel',
    behaviorType: 'rest_api',
    config: {
      endpoint: '/orders/cancel',
      method: 'POST',
      parameters: { reason: 'string' },
    },
    inputFields: ['order_id'],
  }]
  const node = projection.projectSchemaCanvasNode(
    retry.tables[0],
    columns,
    { x: 50, y: 50 },
    { isPrimary: false, isObjectType: true, behaviors },
  )
  assert.deepEqual(node, {
    id: 'table-%5B%22warehouse%22%2C%22sales%22%2C%22orders%22%5D',
    type: 'tableNode',
    position: { x: 50, y: 50 },
    data: {
      tableName: 'orders',
      schema: 'sales',
      datasource: 'warehouse',
      logical_name: '주문',
      description: '주문 원장',
      summary: '고객별 주문',
      columns,
      columnCount: 1,
      isPrimary: false,
      isObjectType: true,
      behaviors,
    },
  })
  columns[0].name = 'mutated'
  behaviors[0].config.parameters.reason = 'mutated'
  behaviors[0].inputFields[0] = 'mutated'
  assert.equal(node.data.columns[0].name, 'order_id')
  assert.equal(node.data.behaviors[0].config.parameters.reason, 'string')
  assert.equal(node.data.behaviors[0].inputFields[0], 'order_id')

  assert.deepEqual(
    Array.from({ length: 5 }, (_, index) => (
      projection.projectSchemaCanvasGridPosition(index, 5)
    )),
    [
      { x: 50, y: 50 },
      { x: 380, y: 50 },
      { x: 710, y: 50 },
      { x: 50, y: 300 },
      { x: 380, y: 300 },
    ],
  )
  assert.throws(
    () => projection.projectSchemaCanvasGridPosition(-1, 1),
    /nonnegative integer/,
  )
  assert.throws(
    () => projection.projectSchemaCanvasGridPosition(1, 1),
    /contain the requested index/,
  )

  console.log('PASS schema canvas batch projection contract')
} finally {
  await vite.close()
}
