export interface OntologyGraphHistorySnapshot<Node, Relationship> {
  nodes: Node[]
  relationships: Relationship[]
}

export type OntologyGraphHistoryAction = 'undo' | 'redo'

function cloneGraphHistoryValue<T>(
  value: T,
  seen: WeakMap<object, unknown>,
): T {
  if (typeof value !== 'object' || value === null) return value
  if (value instanceof Date) return new Date(value.getTime()) as T
  const cached = seen.get(value)
  if (cached !== undefined) return cached as T
  if (Array.isArray(value)) {
    const clone: unknown[] = []
    seen.set(value, clone)
    for (const entry of value) {
      clone.push(cloneGraphHistoryValue(entry, seen))
    }
    return clone as T
  }
  const clone: Record<string, unknown> = {}
  seen.set(value, clone)
  for (const [key, entry] of Object.entries(value)) {
    clone[key] = cloneGraphHistoryValue(entry, seen)
  }
  return clone as T
}

export function cloneOntologyGraphHistorySnapshot<Node, Relationship>(
  nodes: readonly Node[],
  relationships: readonly Relationship[],
): OntologyGraphHistorySnapshot<Node, Relationship> {
  return cloneGraphHistoryValue({
    nodes: [...nodes],
    relationships: [...relationships],
  }, new WeakMap())
}

export function appendBoundedHistory<T>(
  history: readonly T[],
  entry: T,
  maximumSize: number,
): T[] {
  if (!Number.isInteger(maximumSize) || maximumSize < 1) {
    throw new Error('그래프 history 최대 크기는 1 이상의 정수여야 합니다.')
  }
  const next = [...history, entry]
  return next.length > maximumSize
    ? next.slice(next.length - maximumSize)
    : next
}

export function isGraphHistoryEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false
  return Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  ))
}

export function resolveGraphHistoryShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): OntologyGraphHistoryAction | null {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}
