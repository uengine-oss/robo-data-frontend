export const INSTANCE_NODE_WIDTH = 112
export const INSTANCE_NODE_HEIGHT = 34
export const INSTANCE_NODE_GAP = 12
export const INSTANCE_GRID_COLUMNS = 5
export const INSTANCE_NODE_LIMIT = 20
export const ONTOLOGY_NODE_WIDTH = 200
export const INSTANCE_GRID_TOP_OFFSET = 180

export interface CanvasPosition {
  x: number
  y: number
}

export interface PositionedInstance<T> {
  instance: T
  position: CanvasPosition
}

/** Centers a non-overlapping instance grid below its owning ontology node. */
export function layoutCanvasInstances<T>(
  instances: readonly T[],
  parentPosition: CanvasPosition,
): PositionedInstance<T>[] {
  const visibleInstances = instances.slice(0, INSTANCE_NODE_LIMIT)
  const columnCount = Math.min(INSTANCE_GRID_COLUMNS, visibleInstances.length)
  if (columnCount === 0) return []

  const columnStep = INSTANCE_NODE_WIDTH + INSTANCE_NODE_GAP
  const rowStep = INSTANCE_NODE_HEIGHT + INSTANCE_NODE_GAP
  const gridWidth = INSTANCE_NODE_WIDTH + (columnCount - 1) * columnStep
  const startX = parentPosition.x + (ONTOLOGY_NODE_WIDTH - gridWidth) / 2

  return visibleInstances.map((instance, index) => ({
    instance,
    position: {
      x: startX + (index % INSTANCE_GRID_COLUMNS) * columnStep,
      y: parentPosition.y
        + INSTANCE_GRID_TOP_OFFSET
        + Math.floor(index / INSTANCE_GRID_COLUMNS) * rowStep,
    },
  }))
}
