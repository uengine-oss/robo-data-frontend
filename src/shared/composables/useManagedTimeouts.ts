import { onScopeDispose } from 'vue'

export interface ManagedTimeoutScheduler {
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancel: (handle: ReturnType<typeof setTimeout>) => void
}

const defaultScheduler: ManagedTimeoutScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: handle => clearTimeout(handle),
}

export function useManagedTimeouts(scheduler: ManagedTimeoutScheduler = defaultScheduler) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function cancel(key: string) {
    const timer = timers.get(key)
    if (timer === undefined) return
    scheduler.cancel(timer)
    timers.delete(key)
  }

  function schedule(key: string, callback: () => void, delayMs: number) {
    cancel(key)
    const timer = scheduler.schedule(() => {
      if (timers.get(key) !== timer) return
      timers.delete(key)
      callback()
    }, delayMs)
    timers.set(key, timer)
  }

  function clear() {
    for (const timer of timers.values()) scheduler.cancel(timer)
    timers.clear()
  }

  onScopeDispose(clear)

  return {
    schedule,
    cancel,
    clear,
    pendingCount: () => timers.size,
  }
}
