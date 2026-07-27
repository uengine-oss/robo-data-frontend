export interface SchemaCanvasFitMetrics {
  canvasWidth: number
  canvasHeight: number
  basePadding: number
  topOcclusion?: number
  rightOcclusion?: number
  bottomOcclusion?: number
  leftOcclusion?: number
  overlayGap?: number
  minimumContentWidth?: number
  minimumContentHeight?: number
}

export interface SchemaCanvasFitPadding {
  top: `${number}px`
  right: `${number}px`
  bottom: `${number}px`
  left: `${number}px`
}

function finiteNonnegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function baseInset(viewport: number, padding: number): number {
  if (viewport <= 0 || !Number.isFinite(padding) || padding <= 0) return 0
  return Math.floor((viewport - viewport / (1 + padding)) * 0.5)
}

function clampAnchoredInset(
  desired: number,
  opposite: number,
  viewport: number,
  minimumContent: number,
): number {
  if (viewport <= 0) return 0
  const contentFloor = Math.min(
    finiteNonnegative(minimumContent),
    viewport * 0.5,
  )
  return Math.max(
    0,
    Math.min(desired, viewport - opposite - contentFloor),
  )
}

function pixels(value: number): `${number}px` {
  return `${Math.round(value)}px`
}

function overlayInset(extent: number | undefined, gap: number): number {
  const normalizedExtent = finiteNonnegative(extent)
  return normalizedExtent > 0 ? normalizedExtent + gap : 0
}

export function projectSchemaCanvasFitPadding(
  metrics: Readonly<SchemaCanvasFitMetrics>,
): SchemaCanvasFitPadding {
  const width = finiteNonnegative(metrics.canvasWidth)
  const height = finiteNonnegative(metrics.canvasHeight)
  const gap = finiteNonnegative(metrics.overlayGap ?? 12)
  const baseX = baseInset(width, metrics.basePadding)
  const baseY = baseInset(height, metrics.basePadding)

  const desiredLeft = Math.max(
    baseX,
    overlayInset(metrics.leftOcclusion, gap),
  )
  const desiredRight = Math.max(
    baseX,
    overlayInset(metrics.rightOcclusion, gap),
  )
  const desiredTop = Math.max(
    baseY,
    overlayInset(metrics.topOcclusion, gap),
  )
  const desiredBottom = Math.max(
    baseY,
    overlayInset(metrics.bottomOcclusion, gap),
  )

  const left = clampAnchoredInset(
    desiredLeft,
    baseX,
    width,
    metrics.minimumContentWidth ?? 120,
  )
  const right = clampAnchoredInset(
    desiredRight,
    left,
    width,
    metrics.minimumContentWidth ?? 120,
  )
  const top = clampAnchoredInset(
    desiredTop,
    baseY,
    height,
    metrics.minimumContentHeight ?? 100,
  )
  const bottom = clampAnchoredInset(
    desiredBottom,
    top,
    height,
    metrics.minimumContentHeight ?? 100,
  )

  return {
    top: pixels(top),
    right: pixels(right),
    bottom: pixels(bottom),
    left: pixels(left),
  }
}
