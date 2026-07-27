import { onScopeDispose, ref } from 'vue'

export type ResizeAxis = 'x' | 'y'
export type ResizeDirection = 'negative' | 'positive'

export interface PanelResizeProjection {
  startValue: number
  startCoordinate: number
  currentCoordinate: number
  minValue: number
  maxValue: number
  direction: ResizeDirection
}

export interface ResizablePanelOptions {
  initialValue: number
  minValue: number
  maxValue: number | (() => number)
  axis: ResizeAxis
  direction: ResizeDirection
  keyboardStep?: number
  cursor: string
}

export function clampPanelSize(value: number, minValue: number, maxValue: number): number {
  const normalizedMax = Math.max(minValue, maxValue)
  return Math.min(normalizedMax, Math.max(minValue, value))
}

export function projectPanelSize({
  startValue,
  startCoordinate,
  currentCoordinate,
  minValue,
  maxValue,
  direction,
}: PanelResizeProjection): number {
  const movement = currentCoordinate - startCoordinate
  const delta = direction === 'positive' ? movement : -movement
  return clampPanelSize(startValue + delta, minValue, maxValue)
}

export function useResizablePanel(options: ResizablePanelOptions) {
  const value = ref(options.initialValue)
  const isResizing = ref(false)
  const keyboardStep = options.keyboardStep ?? 16

  let dragStartCoordinate = 0
  let dragStartValue = options.initialValue
  let previousBodyCursor = ''
  let previousBodyUserSelect = ''

  function resolveMaxValue(): number {
    return typeof options.maxValue === 'function'
      ? options.maxValue()
      : options.maxValue
  }

  function eventCoordinate(event: Pick<PointerEvent, 'clientX' | 'clientY'>): number {
    return options.axis === 'x' ? event.clientX : event.clientY
  }

  function restoreBodyInteraction(): void {
    document.body.style.cursor = previousBodyCursor
    document.body.style.userSelect = previousBodyUserSelect
  }

  function detachDragListeners(): void {
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', finishResize)
    document.removeEventListener('pointercancel', cancelResize)
    document.removeEventListener('keydown', handleDragKeydown)
  }

  function stopResize(): void {
    if (!isResizing.value) return
    isResizing.value = false
    detachDragListeners()
    restoreBodyInteraction()
  }

  function cancelResize(): void {
    if (!isResizing.value) return
    value.value = dragStartValue
    stopResize()
  }

  function finishResize(): void {
    stopResize()
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!isResizing.value) return
    value.value = projectPanelSize({
      startValue: dragStartValue,
      startCoordinate: dragStartCoordinate,
      currentCoordinate: eventCoordinate(event),
      minValue: options.minValue,
      maxValue: resolveMaxValue(),
      direction: options.direction,
    })
  }

  function handleDragKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancelResize()
  }

  function startResize(event: PointerEvent): void {
    if (event.button !== 0 || isResizing.value) return

    isResizing.value = true
    dragStartCoordinate = eventCoordinate(event)
    dragStartValue = value.value
    previousBodyCursor = document.body.style.cursor
    previousBodyUserSelect = document.body.style.userSelect
    document.body.style.cursor = options.cursor
    document.body.style.userSelect = 'none'

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', finishResize)
    document.addEventListener('pointercancel', cancelResize)
    document.addEventListener('keydown', handleDragKeydown)
    event.preventDefault()
  }

  function resizeBy(delta: number): void {
    value.value = clampPanelSize(
      value.value + delta,
      options.minValue,
      resolveMaxValue(),
    )
  }

  function handleResizeKeydown(event: KeyboardEvent): void {
    const increaseKey = options.axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    const decreaseKey = options.axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    const directionMultiplier = options.direction === 'negative' ? 1 : -1

    if (event.key === increaseKey) {
      event.preventDefault()
      resizeBy(keyboardStep * directionMultiplier)
      return
    }

    if (event.key === decreaseKey) {
      event.preventDefault()
      resizeBy(-keyboardStep * directionMultiplier)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      reset()
    }
  }

  function reset(): void {
    value.value = clampPanelSize(
      options.initialValue,
      options.minValue,
      resolveMaxValue(),
    )
  }

  onScopeDispose(stopResize)

  return {
    value,
    isResizing,
    startResize,
    stopResize,
    cancelResize,
    handleResizeKeydown,
    reset,
  }
}
