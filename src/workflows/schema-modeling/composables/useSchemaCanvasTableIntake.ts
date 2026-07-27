import { ref } from 'vue'

import type { SchemaModelingTable } from '../application/schemaCatalogDiscovery'
import {
  cloneSchemaCanvasDropTarget,
  parseSchemaCanvasDropPayload,
  type SchemaCanvasDropTarget,
} from '../application/schemaCanvasDrop'

interface SchemaCanvasTableIntakeOptions {
  addTable: (
    table: SchemaModelingTable,
    position?: { x: number; y: number },
    options?: SchemaCanvasDropTarget['options'],
  ) => Promise<unknown>
  afterAdded: () => void
  reportError: (message: string, error: unknown) => void
}

export function useSchemaCanvasTableIntake(options: SchemaCanvasTableIntakeOptions) {
  const draggingOver = ref(false)
  const pending = ref(false)
  const error = ref<string | null>(null)
  const failedTarget = ref<SchemaCanvasDropTarget | null>(null)
  const failedPosition = ref<{ x: number; y: number } | undefined>()

  async function apply(
    target: SchemaCanvasDropTarget,
    position?: { x: number; y: number },
  ): Promise<boolean> {
    const frozenTarget = cloneSchemaCanvasDropTarget(target)
    const frozenPosition = position ? { ...position } : undefined
    pending.value = true
    error.value = null
    try {
      await options.addTable(
        frozenTarget.table,
        frozenPosition,
        frozenTarget.options,
      )
      failedTarget.value = null
      failedPosition.value = undefined
      options.afterAdded()
      return true
    } catch (cause: unknown) {
      options.reportError(
        `[SchemaCanvas] ${frozenTarget.table.name} 테이블 추가 실패`,
        cause,
      )
      failedTarget.value = frozenTarget
      failedPosition.value = frozenPosition
      error.value = cause instanceof Error
        ? cause.message
        : `${frozenTarget.table.name} 테이블을 캔버스에 추가하지 못했습니다.`
      return false
    } finally {
      pending.value = false
    }
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    draggingOver.value = false
    const data = event.dataTransfer?.getData('application/json')
    if (!data) {
      failedTarget.value = null
      failedPosition.value = undefined
      error.value = '지원하는 테이블 드래그 데이터가 없습니다.'
      return
    }

    try {
      const target = parseSchemaCanvasDropPayload(data)
      const canvas = event.currentTarget
      if (!(canvas instanceof HTMLElement)) {
        throw new Error('캔버스 위치를 확인할 수 없습니다.')
      }
      const bounds = canvas.getBoundingClientRect()
      await apply(target, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })
    } catch (cause: unknown) {
      options.reportError('드래그한 테이블 처리 실패', cause)
      failedTarget.value = null
      failedPosition.value = undefined
      error.value = cause instanceof Error
        ? cause.message
        : '드래그한 테이블을 확인하지 못했습니다.'
    }
  }

  async function addTable(table: SchemaModelingTable): Promise<boolean> {
    return apply({ table })
  }

  async function retry(): Promise<void> {
    if (pending.value || !failedTarget.value) return
    await apply(failedTarget.value, failedPosition.value)
  }

  function dismissError(): void {
    if (pending.value) return
    error.value = null
    failedTarget.value = null
    failedPosition.value = undefined
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault()
    draggingOver.value = true
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(): void {
    draggingOver.value = false
  }

  function startDrag(event: DragEvent, table: SchemaModelingTable): void {
    if (!event.dataTransfer) return
    event.dataTransfer.setData('application/json', JSON.stringify({ table }))
    event.dataTransfer.effectAllowed = 'copy'
  }

  return {
    draggingOver,
    pending,
    error,
    failedTarget,
    handleDrop,
    addTable,
    retry,
    dismissError,
    handleDragOver,
    handleDragLeave,
    startDrag,
  }
}
