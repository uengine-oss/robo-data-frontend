export interface ExpiringMapScheduler {
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancel: (handle: ReturnType<typeof setTimeout>) => void
}

const defaultScheduler: ExpiringMapScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: handle => clearTimeout(handle),
}

export interface ExpiringMapController<Key, Value> {
  mark: (key: Key, value: Value) => void
  delete: (key: Key) => void
  clear: () => void
  pendingCount: () => number
}

export function createExpiringMapController<Key, Value>(
  values: Map<Key, Value>,
  durationMs = 5000,
  scheduler: ExpiringMapScheduler = defaultScheduler,
): ExpiringMapController<Key, Value> {
  const timers = new Map<Key, ReturnType<typeof setTimeout>>()

  function cancelTimer(key: Key) {
    const timer = timers.get(key)
    if (timer === undefined) return
    scheduler.cancel(timer)
    timers.delete(key)
  }

  function mark(key: Key, value: Value) {
    cancelTimer(key)
    values.set(key, value)
    const timer = scheduler.schedule(() => {
      if (timers.get(key) !== timer) return
      timers.delete(key)
      values.delete(key)
    }, durationMs)
    timers.set(key, timer)
  }

  function deleteValue(key: Key) {
    cancelTimer(key)
    values.delete(key)
  }

  function clear() {
    for (const timer of timers.values()) scheduler.cancel(timer)
    timers.clear()
    values.clear()
  }

  return {
    mark,
    delete: deleteValue,
    clear,
    pendingCount: () => timers.size,
  }
}
