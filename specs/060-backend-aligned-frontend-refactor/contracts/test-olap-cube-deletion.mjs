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

function dependencies(overrides = {}) {
  const calls = []
  return {
    calls,
    value: {
      deleteCube: async cubeName => {
        calls.push(['deleteCube', cubeName])
        return { success: true }
      },
      deleteAllCubes: async () => {
        calls.push(['deleteAllCubes'])
        return { success: true }
      },
      deleteETLConfig: async cubeName => {
        calls.push(['deleteETLConfig', cubeName])
        return { success: true }
      },
      deleteAllETLConfigs: async () => {
        calls.push(['deleteAllETLConfigs'])
        return { success: true }
      },
      deleteDWTables: async (tables, schemaName) => {
        calls.push(['deleteDWTables', tables, schemaName])
        return { success: true }
      },
      ...overrides,
    },
  }
}

try {
  const { executeCubeDeletion } = await vite.ssrLoadModule(
    '/src/domains/olap/application/cubeDeletion.ts',
  )
  const {
    CubeProvisionError,
    executeCubeProvision,
  } = await vite.ssrLoadModule('/src/domains/olap/application/provisionCube.ts')
  const { parsePivotDropPayload } = await vite.ssrLoadModule(
    '/src/domains/olap/application/pivotDrop.ts',
  )

  const single = dependencies()
  assert.deepEqual(
    await executeCubeDeletion({ scope: 'single', cubeName: 'SalesCube' }, single.value),
    {
      request: { scope: 'single', cubeName: 'SalesCube' },
      cleanupErrors: [],
    },
  )
  assert.deepEqual(single.calls, [
    ['deleteCube', 'SalesCube'],
    ['deleteETLConfig', 'SalesCube'],
  ])

  let cleanupCalls = 0
  const rejectedPrimary = dependencies({
    deleteCube: async () => ({ success: false, message: 'cube mutation rejected' }),
    deleteETLConfig: async () => {
      cleanupCalls += 1
      return { success: true }
    },
  })
  await assert.rejects(
    executeCubeDeletion({ scope: 'single', cubeName: 'Rejected' }, rejectedPrimary.value),
    /cube mutation rejected/,
  )
  assert.equal(cleanupCalls, 0, 'cleanup ran before primary mutation success')

  const allWithoutDw = dependencies()
  await executeCubeDeletion({ scope: 'all', deleteAllDwTables: false }, allWithoutDw.value)
  assert.deepEqual(allWithoutDw.calls, [
    ['deleteAllCubes'],
    ['deleteAllETLConfigs'],
  ])

  const allWithDw = dependencies({
    deleteDWTables: async (tables, schemaName) => {
      allWithDw.calls.push(['deleteDWTables', tables, schemaName])
      return { success: false, message: 'DW cleanup rejected' }
    },
  })
  const partial = await executeCubeDeletion(
    { scope: 'all', deleteAllDwTables: true },
    allWithDw.value,
  )
  assert.deepEqual(allWithDw.calls, [
    ['deleteAllCubes'],
    ['deleteAllETLConfigs'],
    ['deleteDWTables', [], 'dw'],
  ])
  assert.deepEqual(partial.cleanupErrors, ['DW 전체 테이블 정리: DW cleanup rejected'])

  const provisionInput = {
    identity: 'cube-v1',
    cubeName: 'SalesCube',
    aiSuggestion: null,
    dimensions: [],
    measures: [],
    factTable: 'dw.fact_sales',
    dwSchema: 'dw',
    schemaXml: '<Schema/>',
    etlConfig: {
      cube_name: 'SalesCube',
      fact_table: 'dw.fact_sales',
      dimension_tables: [],
      source_tables: [],
      mappings: [],
      dw_schema: 'dw',
      sync_mode: 'full',
      incremental_column: null,
    },
  }
  const provisionCalls = []
  let initialRunSucceeds = false
  const provisionDependencies = {
    createDWSchema: async () => {
      provisionCalls.push('dw-schema')
      return { success: true }
    },
    provisionCube: async () => {
      provisionCalls.push('dw-tables')
      return { success: true, steps: [], errors: [] }
    },
    uploadSchemaText: async () => {
      provisionCalls.push('cube-schema')
      return { cubes: {} }
    },
    createETLConfig: async config => {
      provisionCalls.push(['etl-config', config.cube_name])
      return { success: true, config }
    },
    deployETLPipeline: async () => {
      provisionCalls.push('airflow-deploy')
      return { success: true, dag_id: 'sales-dag' }
    },
    runETLPipeline: async () => {
      provisionCalls.push('initial-run')
      return initialRunSucceeds
        ? { success: true }
        : { success: false, error: 'Airflow run rejected' }
    },
  }
  const firstProvision = await executeCubeProvision(
    provisionInput,
    null,
    provisionDependencies,
  )
  assert.match(firstProvision.warning, /Airflow run rejected/)
  assert.deepEqual(firstProvision.checkpoint.completed, [
    'dw-schema',
    'dw-tables',
    'cube-schema',
    'etl-config',
    'airflow-deploy',
  ])
  assert.deepEqual(provisionCalls, [
    'dw-schema',
    'dw-tables',
    'cube-schema',
    ['etl-config', 'SalesCube'],
    'airflow-deploy',
    'initial-run',
  ])

  provisionCalls.length = 0
  initialRunSucceeds = true
  const resumedProvision = await executeCubeProvision(
    provisionInput,
    firstProvision.checkpoint,
    provisionDependencies,
  )
  assert.equal(resumedProvision.warning, null)
  assert.deepEqual(provisionCalls, ['initial-run'])
  assert(resumedProvision.checkpoint.completed.includes('initial-run'))

  let deployCalls = 0
  await assert.rejects(
    executeCubeProvision(
      { ...provisionInput, identity: 'cube-v2' },
      resumedProvision.checkpoint,
      {
        ...provisionDependencies,
        createETLConfig: async config => ({
          success: false,
          config,
        }),
        deployETLPipeline: async () => {
          deployCalls += 1
          return { success: true }
        },
      },
    ),
    error => error instanceof CubeProvisionError
      && error.step === 'etl-config'
      && /ETL 설정 저장/.test(error.message),
  )
  assert.equal(deployCalls, 0)

  assert.deepEqual(parsePivotDropPayload(
    '{"type":"dimension","dimension":"Time","level":"Month"}',
  ), {
    type: 'dimension',
    dimension: 'Time',
    level: 'Month',
  })
  assert.deepEqual(parsePivotDropPayload(
    '{"type":"measure","name":"Revenue"}',
  ), {
    type: 'measure',
    name: 'Revenue',
  })
  assert.throws(
    () => parsePivotDropPayload('{"type":"dimension","dimension":"","level":"Month"}'),
    /dimension/,
  )
  assert.throws(() => parsePivotDropPayload('{broken'), /JSON/)

  console.log(
    'OLAP operations: exact deletion scope + resumable provisioning + strict drop payload passed',
  )
} finally {
  await vite.close()
}
