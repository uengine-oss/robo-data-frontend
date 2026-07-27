import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const assetsDir = resolve(here, '../../../dist/assets')
const assetNames = await readdir(assetsDir)
const remoteAssets = assetNames.filter(name => /^__federation_expose_Remote-app-.*\.js$/.test(name))

assert.equal(remoteAssets.length, 1, `Expected one remote-app asset, found ${remoteAssets.length}`)

const remotePath = resolve(assetsDir, remoteAssets[0])
const remoteSource = await readFile(remotePath, 'utf8')
const remoteBytes = (await stat(remotePath)).size

assert.ok(
  remoteBytes < 3_200_000,
  `Remote app entry regressed to ${remoteBytes.toLocaleString()} bytes; code-analysis screens must remain lazy`,
)
assert.doesNotMatch(remoteSource, /__name:\s*["']UploadTab["']/)
assert.doesNotMatch(remoteSource, /__name:\s*["']GraphTab["']/)
assert.doesNotMatch(remoteSource, /cytoscape\.js-markov-cluster/)

console.log(JSON.stringify({
  result: 'passed',
  remoteAsset: remoteAssets[0],
  remoteBytes,
  excludedFromEntry: ['UploadTab', 'GraphTab', 'Cytoscape graph runtime'],
}, null, 2))
