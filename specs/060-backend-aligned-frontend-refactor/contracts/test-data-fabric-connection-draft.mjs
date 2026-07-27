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
  const draft = await vite.ssrLoadModule('/src/domains/data-fabric/application/connectionDraft.ts')
  const catalog = await vite.ssrLoadModule('/src/domains/data-fabric/catalog/connectors.ts')
  const presentation = await vite.ssrLoadModule('/src/domains/data-fabric/catalog/connectorPresentation.ts')
  const types = catalog.getAllDataSourceTypes()
  const postgres = types.find(type => type.type === 'postgres')
  assert(postgres)

  const allGroups = draft.groupConnectorTypes(types, ' ')
  assert.equal(Object.values(allGroups).flat().length, types.length)
  assert.deepEqual(
    draft.groupConnectorTypes(types, 'PostgreSQL').database.map(type => type.type),
    ['postgres'],
  )
  assert.deepEqual(
    draft.groupConnectorTypes(types, '강력한 오픈소스').database.map(type => type.type),
    ['postgres'],
  )

  assert.deepEqual(draft.createConnectionParameters(postgres), {
    host: 'localhost',
    port: 5432,
    schema: '',
  })
  assert.deepEqual(
    draft.buildConnectionTestRequest(postgres, {
      host: 'db.internal',
      port: '5544',
      user: 'reader',
      password: '',
      database: 'shop',
    }),
    {
      engine: 'postgres',
      host: 'db.internal',
      port: 5544,
      user: 'reader',
      password: undefined,
      database: 'shop',
    },
  )
  assert.equal(presentation.getConnectorPresentation('postgres').icon, '🐘')
  assert.equal(presentation.getConnectorPresentation('POSTGRES').icon, '🐘')
  assert.equal(presentation.getConnectorPresentation('not-in-catalog').icon, '📦')

  console.log('Data Fabric connection draft: catalog grouping + defaults + test payload + presentation passed')
} finally {
  await vite.close()
}
