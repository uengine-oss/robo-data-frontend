import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { resolveDialogFocusWrap } = await vite.ssrLoadModule(
    '/src/shared/composables/useDialogFocusLifecycle.ts',
  )
  const first = { id: 'first' }
  const middle = { id: 'middle' }
  const last = { id: 'last' }
  const focusable = [first, middle, last]

  assert.equal(resolveDialogFocusWrap(focusable, first, true), last)
  assert.equal(resolveDialogFocusWrap(focusable, last, false), first)
  assert.equal(resolveDialogFocusWrap(focusable, middle, false), null)
  assert.equal(resolveDialogFocusWrap(focusable, middle, true), null)
  assert.equal(resolveDialogFocusWrap([], null, false), null)
  assert.equal(resolveDialogFocusWrap([first], first, false), first)
  assert.equal(resolveDialogFocusWrap([first], first, true), first)
  console.log('Dialog focus wrap policy passed')
} finally {
  await vite.close()
}
