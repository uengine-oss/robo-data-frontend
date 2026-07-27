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
  const { projectChatMessageWindow } = await vite.ssrLoadModule(
    '/src/domains/text2sql/application/messageWindow.ts',
  )
  const messages = [
    { id: 'reasoning-1', type: 'reasoning' },
    { id: 'tool-1', type: 'tool' },
    { id: 'thinking-1', type: 'thinking' },
    { id: 'sql-1', type: 'sql' },
    { id: 'reasoning-2', type: 'reasoning' },
  ]

  assert.deepEqual(projectChatMessageWindow(messages, false, 2), {
    visibleMessages: [messages[3], messages[4]],
    hiddenMessageCount: 1,
  })
  assert.deepEqual(projectChatMessageWindow(messages, true, 2), {
    visibleMessages: [messages[0], messages[3], messages[4]],
    hiddenMessageCount: 0,
  })
  assert.deepEqual(messages.map(message => message.id), [
    'reasoning-1',
    'tool-1',
    'thinking-1',
    'sql-1',
    'reasoning-2',
  ])

  console.log('Text2SQL display filtering, window count, reveal, and input immutability passed')
} finally {
  await vite.close()
}
