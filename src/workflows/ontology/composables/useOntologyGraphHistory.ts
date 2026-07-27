import {
  computed,
  shallowRef,
  type Ref,
} from 'vue'
import {
  appendBoundedHistory,
  cloneOntologyGraphHistorySnapshot,
  isGraphHistoryEditableTarget,
  resolveGraphHistoryShortcut,
  type OntologyGraphHistorySnapshot,
} from '../model/graphHistory'

export function useOntologyGraphHistory<Node, Relationship>(
  input: {
    nodes: Ref<Node[]>
    relationships: Ref<Relationship[]>
    onRestore: () => void
    maximumSize?: number
  },
) {
  const maximumSize = input.maximumSize ?? 50
  const undoStack = shallowRef<
    OntologyGraphHistorySnapshot<Node, Relationship>[]
  >([])
  const redoStack = shallowRef<
    OntologyGraphHistorySnapshot<Node, Relationship>[]
  >([])

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  function snapshot(): OntologyGraphHistorySnapshot<Node, Relationship> {
    return cloneOntologyGraphHistorySnapshot(
      input.nodes.value,
      input.relationships.value,
    )
  }

  function restore(
    target: OntologyGraphHistorySnapshot<Node, Relationship>,
  ): void {
    input.nodes.value = target.nodes
    input.relationships.value = target.relationships
    input.onRestore()
  }

  function checkpoint(): void {
    undoStack.value = appendBoundedHistory(
      undoStack.value,
      snapshot(),
      maximumSize,
    )
    redoStack.value = []
  }

  function undo(): boolean {
    const previous = undoStack.value.at(-1)
    if (!previous) return false
    redoStack.value = appendBoundedHistory(
      redoStack.value,
      snapshot(),
      maximumSize,
    )
    undoStack.value = undoStack.value.slice(0, -1)
    restore(previous)
    return true
  }

  function redo(): boolean {
    const next = redoStack.value.at(-1)
    if (!next) return false
    undoStack.value = appendBoundedHistory(
      undoStack.value,
      snapshot(),
      maximumSize,
    )
    redoStack.value = redoStack.value.slice(0, -1)
    restore(next)
    return true
  }

  function clear(): void {
    undoStack.value = []
    redoStack.value = []
  }

  function handleShortcut(event: KeyboardEvent): boolean {
    if (
      event.defaultPrevented
      || isGraphHistoryEditableTarget(event.target)
    ) return false
    const action = resolveGraphHistoryShortcut(event)
    if (!action) return false
    const restored = action === 'undo' ? undo() : redo()
    if (restored) event.preventDefault()
    return restored
  }

  return {
    canUndo,
    canRedo,
    checkpoint,
    undo,
    redo,
    clear,
    handleShortcut,
  }
}
