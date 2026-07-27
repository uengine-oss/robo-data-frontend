import {
  useManagedTimeouts,
  type ManagedTimeoutScheduler,
} from './useManagedTimeouts'

export interface LatestTaskTimerRegistry {
  schedule: (key: string, callback: () => void, delayMs: number) => void
  cancel: (key: string) => void
  clear: () => void
  pendingCount: () => number
}

export function createLatestTaskScope(timers: LatestTaskTimerRegistry) {
  let generation = 0

  function begin(): number {
    generation += 1
    timers.clear()
    return generation
  }

  function current(): number {
    return generation
  }

  function isCurrent(expectedGeneration: number): boolean {
    return expectedGeneration === generation
  }

  function schedule(
    key: string,
    callback: () => void,
    delayMs: number,
    expectedGeneration: number = generation,
  ): boolean {
    if (!isCurrent(expectedGeneration)) return false
    timers.schedule(key, () => {
      if (isCurrent(expectedGeneration)) callback()
    }, delayMs)
    return true
  }

  function guard(
    expectedGeneration: number,
    callback: () => void,
  ): () => void {
    return () => {
      if (isCurrent(expectedGeneration)) callback()
    }
  }

  function cancel(key: string): void {
    timers.cancel(key)
  }

  function clear(): void {
    generation += 1
    timers.clear()
  }

  return {
    begin,
    current,
    isCurrent,
    schedule,
    guard,
    cancel,
    clear,
    pendingCount: timers.pendingCount,
  }
}

export function useLatestTaskScope(scheduler?: ManagedTimeoutScheduler) {
  return createLatestTaskScope(useManagedTimeouts(scheduler))
}
