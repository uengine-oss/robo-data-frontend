type Row = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function findRawBrushRange(event: unknown): { value: unknown[]; coordinateRange: boolean } | null {
  if (!isRecord(event)) return null

  const areas = asArray(event.areas)
  const area = areas?.find(isRecord)
  const areaRange = area && asArray(area.coordRange)
  if (areaRange) return { value: areaRange, coordinateRange: true }

  const batch = asArray(event.batch)
  const batchItem = batch?.find(isRecord)
  if (!batchItem) return null

  const directRange = asArray(batchItem.coordRange)
  if (directRange) return { value: directRange, coordinateRange: true }

  const batchAreas = asArray(batchItem.areas)
  const batchArea = batchAreas?.find(isRecord)
  const batchAreaRange = batchArea && asArray(batchArea.coordRange)
  if (batchAreaRange) return { value: batchAreaRange, coordinateRange: true }

  const selected = asArray(batchItem.selected)
  const selection = selected?.find(isRecord)
  const selectedAreas = selection && asArray(selection.areas)
  const selectedArea = selectedAreas?.find(isRecord)
  const selectedRange = selectedArea && asArray(selectedArea.coordRange)
  if (selectedRange) return { value: selectedRange, coordinateRange: true }

  const pixelRange = asArray(batchItem.range)
  if (pixelRange) return { value: pixelRange, coordinateRange: false }
  if (isRecord(batchItem.range) && batchItem.range.start != null && batchItem.range.end != null) {
    return { value: [batchItem.range.start, batchItem.range.end], coordinateRange: false }
  }
  return null
}

/** Normalize every ECharts brush event shape used by the application to an ordered X range. */
export function extractBrushXAxisRange(event: unknown): [number, number] | null {
  const raw = findRawBrushRange(event)
  if (!raw || raw.value.length < 2) return null

  let start: number
  let end: number
  if (Array.isArray(raw.value[0])) {
    if (raw.coordinateRange) {
      const xCoordinates = raw.value[0]
      if (xCoordinates.length < 2) return null
      start = Number(xCoordinates[0])
      end = Number(xCoordinates[1])
    } else {
      const firstPoint = raw.value[0]
      const secondPoint = raw.value[1]
      if (!Array.isArray(secondPoint) || firstPoint.length === 0 || secondPoint.length === 0) return null
      start = Number(firstPoint[0])
      end = Number(secondPoint[0])
    }
  } else {
    start = Number(raw.value[0])
    end = Number(raw.value[1])
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return start <= end ? [start, end] : [end, start]
}

export function escapeTooltipHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function resolveBrushRowRange(rows: Row[], xAxis: string, start: string, end: string) {
  const startIndex = rows.findIndex(row => String(row[xAxis] ?? '') >= start)
  if (startIndex < 0) return null

  let endIndex = -1
  for (let index = rows.length - 1; index >= startIndex; index -= 1) {
    if (String(rows[index]?.[xAxis] ?? '') <= end) {
      endIndex = index
      break
    }
  }
  return endIndex > startIndex ? { startIdx: startIndex, endIdx: endIndex } : null
}

function metricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function inferAnalysisTypeFromRange(
  rows: Row[],
  metric: string,
  startIndex: number,
  endIndex: number,
): 'increase' | 'decrease' {
  const startValue = metricNumber(rows[startIndex]?.[metric])
  const endValue = metricNumber(rows[endIndex]?.[metric])
  if (startValue != null && endValue != null) {
    return endValue > startValue ? 'increase' : 'decrease'
  }

  const midpoint = Math.floor((startIndex + endIndex) / 2)
  const averages = [[startIndex, midpoint], [midpoint + 1, endIndex]].map(([from, to]) => {
    const values: number[] = []
    for (let index = from; index <= to; index += 1) {
      const value = metricNumber(rows[index]?.[metric])
      if (value != null) values.push(value)
    }
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  })

  return averages[0] != null && averages[1] != null && averages[1] <= averages[0]
    ? 'decrease'
    : 'increase'
}
