import { createServer } from 'vite'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const defaultChecks = [
  'verify-schema-relationship-ui.mjs',
  'verify-shell-ui.mjs',
]
const requestedChecks = process.argv.slice(2)
const checks = requestedChecks.length > 0 ? requestedChecks : defaultChecks

for (const check of checks) {
  if (basename(check) !== check || !/^verify-[a-z0-9-]+-ui\.mjs$/.test(check)) {
    throw new Error(`Invalid browser verifier name: ${check}`)
  }
}

const server = await createServer({
  root: repoRoot,
  logLevel: 'warn',
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
  },
})

try {
  await server.listen()
  process.env.FRONTEND_URL = 'http://127.0.0.1:3000'
  for (const check of checks) {
    await import(pathToFileURL(resolve(here, check)).href)
  }
} finally {
  await server.close()
}
