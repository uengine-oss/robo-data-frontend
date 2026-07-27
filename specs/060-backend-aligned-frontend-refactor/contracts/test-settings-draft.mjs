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
  const draft = await vite.ssrLoadModule('/src/app/settings/application/settingsDraft.ts')

  assert.equal(draft.parseUmlDepth('1'), 1)
  assert.equal(draft.parseUmlDepth('10'), 10)
  assert.equal(draft.parseUmlDepth('0'), 3)
  assert.equal(draft.parseUmlDepth('11'), 3)
  assert.equal(draft.parseUmlDepth('3.5'), 3)
  assert.equal(draft.parseUmlDepth('not-a-number'), 3)
  assert.equal(draft.parseUmlDepth(null), 3)

  assert.deepEqual(draft.createSettingsDraft({
    appTitle: 'ROBO',
    theme: 'light',
    apiKey: 'key',
    apiProvider: 'anthropic',
    storedUmlDepth: '7',
  }), {
    appTitle: 'ROBO',
    theme: 'light',
    apiKey: 'key',
    apiProvider: 'anthropic',
    umlDepth: 7,
  })
  assert.equal(draft.normalizeAppTitle('  My Analyzer  ', 'Robo Analyzer'), 'My Analyzer')
  assert.equal(draft.normalizeAppTitle('   ', 'Robo Analyzer'), 'Robo Analyzer')

  console.log('App settings draft: persisted depth bounds + snapshot + title normalization passed')
} finally {
  await vite.close()
}
