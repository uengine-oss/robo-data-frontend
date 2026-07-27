import assert from 'node:assert/strict'
import { createServer } from 'vite'

class FakeTimerRegistry {
  callbacks = new Map()

  schedule(key, callback) {
    this.callbacks.set(key, callback)
  }

  cancel(key) {
    this.callbacks.delete(key)
  }

  clear() {
    this.callbacks.clear()
  }

  pendingCount() {
    return this.callbacks.size
  }

  run(key) {
    const callback = this.callbacks.get(key)
    if (!callback) return
    this.callbacks.delete(key)
    callback()
  }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { createLatestTaskScope } = await vite.ssrLoadModule(
    '/src/shared/composables/useLatestTaskScope.ts',
  )
  const timers = new FakeTimerRegistry()
  const scope = createLatestTaskScope({
    schedule: (...args) => timers.schedule(...args),
    cancel: key => timers.cancel(key),
    clear: () => timers.clear(),
    pendingCount: () => timers.pendingCount(),
  })
  const events = []

  const initialGeneration = scope.current()
  assert.equal(scope.schedule('canvas-init', () => events.push('initial'), 10), true)
  const loadGeneration = scope.begin()
  assert.equal(loadGeneration, initialGeneration + 1)
  assert.equal(scope.pendingCount(), 0)
  assert.equal(
    scope.schedule('selection-restore', () => events.push('stale'), 10, initialGeneration),
    false,
  )

  scope.schedule('selection-restore', () => events.push('first'), 10, loadGeneration)
  scope.schedule('selection-restore', () => events.push('latest'), 10, loadGeneration)
  timers.run('selection-restore')
  assert.deepEqual(events, ['latest'])

  scope.schedule('canvas-viewport-sync', () => events.push('old-viewport'), 10, loadGeneration)
  scope.schedule('canvas-viewport-sync', () => events.push('latest-viewport'), 10, loadGeneration)
  timers.run('canvas-viewport-sync')
  assert.deepEqual(events, ['latest', 'latest-viewport'])

  const staleLayoutStop = scope.guard(loadGeneration, () => {
    scope.schedule('selection-restore', () => events.push('layout'), 10, loadGeneration)
  })
  scope.begin()
  staleLayoutStop()
  assert.equal(scope.pendingCount(), 0)

  const finalGeneration = scope.current()
  scope.schedule('schema-loading-settle', () => events.push('settled'), 10, finalGeneration)
  scope.clear()
  timers.run('schema-loading-settle')
  assert.deepEqual(events, ['latest', 'latest-viewport'])
  console.log('Latest task scope generation, replacement, guard, and clear policy passed')
} finally {
  await vite.close()
}
