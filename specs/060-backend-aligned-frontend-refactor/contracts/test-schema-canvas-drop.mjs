import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function expectFailure(callback, pattern) {
  assert.throws(callback, pattern)
}

try {
  const drop = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/application/schemaCanvasDrop.ts',
  )

  const wrappedInput = {
    table: {
      name: 'orders',
      schema: 'sales',
      datasource: 'warehouse',
      logical_name: '주문',
      description: '주문 원장',
      description_source: 'user',
      analyzed_description: '고객 주문',
      column_count: 3,
    },
  }
  const wrappedSnapshot = structuredClone(wrappedInput)
  const wrapped = drop.parseSchemaCanvasDropPayload(
    JSON.stringify(wrappedInput),
  )
  assert.deepEqual(wrappedInput, wrappedSnapshot)
  assert.deepEqual(wrapped, {
    table: wrappedInput.table,
  })

  assert.deepEqual(
    drop.parseSchemaCanvasDropPayload(JSON.stringify({
      name: 'customers',
      description: '고객',
    })),
    {
      table: {
        name: 'customers',
        schema: 'public',
        datasource: undefined,
        logical_name: undefined,
        description: '고객',
        description_source: undefined,
        analyzed_description: undefined,
        column_count: 0,
      },
    },
  )

  const objectType = drop.parseSchemaCanvasDropPayload(JSON.stringify({
    name: 'Order',
    schema: 'ObjectType',
    description: '주문 객체',
    column_count: 1,
    columns: [{
      name: 'order_id',
      table_name: 'Order',
      dtype: 'string',
      nullable: false,
      description: '주문 식별자',
    }],
    isObjectType: true,
    behaviors: [{
      name: 'cancel',
      description: '주문 취소',
      behaviorType: 'rest_api',
      config: {
        endpoint: '/orders/cancel',
        method: 'POST',
        parameters: { reason: 'string' },
      },
      inputFields: ['order_id'],
      outputField: 'status',
    }],
  }))
  assert.equal(objectType.table.schema, 'ObjectType')
  assert.deepEqual(objectType.options, {
    autoLoadRelated: false,
    isPrimary: true,
    columns: [{
      name: 'order_id',
      table_name: 'Order',
      dtype: 'string',
      nullable: false,
      logical_name: undefined,
      description: '주문 식별자',
      description_source: undefined,
      analyzed_description: undefined,
    }],
    isObjectType: true,
    behaviors: [{
      name: 'cancel',
      description: '주문 취소',
      behaviorType: 'rest_api',
      config: {
        endpoint: '/orders/cancel',
        method: 'POST',
        parameters: { reason: 'string' },
        code: undefined,
        dmnXml: undefined,
        processId: undefined,
        processName: undefined,
        triggerCondition: undefined,
      },
      inputFields: ['order_id'],
      outputField: 'status',
    }],
  })

  const legacy = drop.parseSchemaCanvasDropPayload(JSON.stringify({
    name: 'Legacy',
    _isObjectType: true,
    _columns: [{ name: 'id' }],
    behaviors: [],
  }))
  assert.equal(legacy.table.schema, 'ObjectType')
  assert.equal(legacy.options.columns[0].table_name, 'Legacy')
  assert.equal(legacy.options.columns[0].dtype, 'string')

  const cloned = drop.cloneSchemaCanvasDropTarget(objectType)
  cloned.table.name = 'Changed'
  cloned.options.columns[0].name = 'changed'
  cloned.options.behaviors[0].config.parameters.reason = 'changed'
  cloned.options.behaviors[0].inputFields[0] = 'changed'
  assert.equal(objectType.table.name, 'Order')
  assert.equal(objectType.options.columns[0].name, 'order_id')
  assert.equal(
    objectType.options.behaviors[0].config.parameters.reason,
    'string',
  )
  assert.equal(objectType.options.behaviors[0].inputFields[0], 'order_id')

  expectFailure(
    () => drop.parseSchemaCanvasDropPayload('{'),
    /올바른 JSON/,
  )
  expectFailure(
    () => drop.parseSchemaCanvasDropPayload('[]'),
    /객체가 아닙니다/,
  )
  expectFailure(
    () => drop.parseSchemaCanvasDropPayload('{"name":"   "}'),
    /name/,
  )
  expectFailure(
    () => drop.parseSchemaCanvasDropPayload(
      '{"name":"orders","column_count":"3"}',
    ),
    /column_count/,
  )
  expectFailure(
    () => drop.parseSchemaCanvasDropPayload(JSON.stringify({
      name: 'Order',
      schema: 'ObjectType',
      columns: [{ name: '' }],
    })),
    /columns\[0\]\.name/,
  )
  expectFailure(
    () => drop.parseSchemaCanvasDropPayload(JSON.stringify({
      name: 'Order',
      schema: 'ObjectType',
      behaviors: [{
        name: 'invalid',
        behaviorType: 'shell',
      }],
    })),
    /Behavior 유형/,
  )

  console.log('PASS schema canvas drag intake contract')
} finally {
  await vite.close()
}
