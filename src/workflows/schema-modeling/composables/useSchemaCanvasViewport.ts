import type { Ref } from 'vue'
import type { FitView } from '@vue-flow/core'

import { projectSchemaCanvasFitPadding } from '../model/schemaCanvasViewport'

interface SchemaCanvasViewportOptions {
  canvas: Ref<HTMLElement | null>
  floatingControls: Ref<HTMLElement | null>
  toolbar: Ref<HTMLElement | null>
  legend: Ref<HTMLElement | null>
  fitView: FitView
  schedule: (key: string, callback: () => void, delayMs: number) => void
}

function visibleBounds(element: Element | null): DOMRect | null {
  if (!(element instanceof HTMLElement) || element.offsetParent === null) return null
  const bounds = element.getBoundingClientRect()
  return bounds.width > 0 && bounds.height > 0 ? bounds : null
}

function occlusionFromRight(
  canvasBounds: DOMRect,
  elements: readonly (Element | null)[],
): number {
  return elements.reduce((largest, element) => {
    const bounds = visibleBounds(element)
    return bounds ? Math.max(largest, canvasBounds.right - bounds.left) : largest
  }, 0)
}

export function useSchemaCanvasViewport(options: SchemaCanvasViewportOptions) {
  function fit(basePadding: number): unknown {
    const canvas = options.canvas.value
    if (!canvas) return options.fitView({ padding: basePadding })

    const canvasBounds = canvas.getBoundingClientRect()
    const floatingBounds = visibleBounds(options.floatingControls.value)
    const toolbarBounds = visibleBounds(options.toolbar.value)
    const padding = projectSchemaCanvasFitPadding({
      canvasWidth: canvasBounds.width,
      canvasHeight: canvasBounds.height,
      basePadding,
      topOcclusion: floatingBounds
        ? floatingBounds.bottom - canvasBounds.top
        : 0,
      rightOcclusion: occlusionFromRight(canvasBounds, [
        options.legend.value,
        canvas.querySelector('.vue-flow__minimap'),
      ]),
      bottomOcclusion: toolbarBounds
        ? canvasBounds.bottom - toolbarBounds.top
        : 0,
    })
    return options.fitView({ padding })
  }

  function scheduleFit(padding: number, delayMs = 150): void {
    options.schedule('fit-view', () => {
      void fit(padding)
    }, delayMs)
  }

  return {
    fit,
    scheduleFit,
  }
}
