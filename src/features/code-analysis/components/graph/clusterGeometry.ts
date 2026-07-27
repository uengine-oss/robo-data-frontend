export interface ClusterPoint {
  id?: string
  x: number
  y: number
}

export interface PositionedCluster {
  key: string
  points: ClusterPoint[]
}

export interface ClusterOverlap {
  firstKey: string
  secondKey: string
  intersectionArea: number
  ratioToSmaller: number
}

export interface ClusterTranslation {
  key: string
  dx: number
  dy: number
}

export interface ClusterSeparationPlan {
  positions: ClusterPoint[]
  translations: ClusterTranslation[]
  before: ClusterOverlap[]
  after: ClusterOverlap[]
  adjustedPairCount: number
}

interface MutableCluster extends PositionedCluster {
  dx: number
  dy: number
}

const EPSILON = 1e-7

function cross(origin: ClusterPoint, first: ClusterPoint, second: ClusterPoint): number {
  return (first.x - origin.x) * (second.y - origin.y)
    - (first.y - origin.y) * (second.x - origin.x)
}

export function convexHull(points: ClusterPoint[]): ClusterPoint[] {
  if (points.length <= 2) return points.slice()
  const sorted = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y))
  const lower: ClusterPoint[] = []
  for (const point of sorted) {
    while (
      lower.length >= 2
      && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) lower.pop()
    lower.push(point)
  }
  const upper: ClusterPoint[] = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (
      upper.length >= 2
      && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function polygonArea(points: ClusterPoint[]): number {
  if (points.length < 3) return 0
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]
    twiceArea += points[index].x * next.y - points[index].y * next.x
  }
  return Math.abs(twiceArea) / 2
}

function signedPolygonArea(points: ClusterPoint[]): number {
  if (points.length < 3) return 0
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]
    twiceArea += points[index].x * next.y - points[index].y * next.x
  }
  return twiceArea / 2
}

function lineIntersection(
  firstStart: ClusterPoint,
  firstEnd: ClusterPoint,
  secondStart: ClusterPoint,
  secondEnd: ClusterPoint,
): ClusterPoint {
  const a1 = firstEnd.y - firstStart.y
  const b1 = firstStart.x - firstEnd.x
  const c1 = a1 * firstStart.x + b1 * firstStart.y
  const a2 = secondEnd.y - secondStart.y
  const b2 = secondStart.x - secondEnd.x
  const c2 = a2 * secondStart.x + b2 * secondStart.y
  const determinant = a1 * b2 - a2 * b1
  if (Math.abs(determinant) <= EPSILON) return firstEnd
  return {
    x: (b2 * c1 - b1 * c2) / determinant,
    y: (a1 * c2 - a2 * c1) / determinant,
  }
}

function convexIntersection(
  subject: ClusterPoint[],
  clipper: ClusterPoint[],
): ClusterPoint[] {
  if (subject.length < 3 || clipper.length < 3) return []
  let output = subject.slice()
  const counterClockwise = signedPolygonArea(clipper) >= 0
  for (let edgeIndex = 0; edgeIndex < clipper.length; edgeIndex += 1) {
    const clipStart = clipper[edgeIndex]
    const clipEnd = clipper[(edgeIndex + 1) % clipper.length]
    const input = output
    output = []
    if (input.length === 0) break
    let previous = input[input.length - 1]
    for (const point of input) {
      const pointInside = counterClockwise
        ? cross(clipStart, clipEnd, point) >= -EPSILON
        : cross(clipStart, clipEnd, point) <= EPSILON
      const previousInside = counterClockwise
        ? cross(clipStart, clipEnd, previous) >= -EPSILON
        : cross(clipStart, clipEnd, previous) <= EPSILON
      if (pointInside) {
        if (!previousInside) {
          output.push(lineIntersection(previous, point, clipStart, clipEnd))
        }
        output.push(point)
      } else if (previousInside) {
        output.push(lineIntersection(previous, point, clipStart, clipEnd))
      }
      previous = point
    }
  }
  return output
}

function translatedHull(cluster: MutableCluster): ClusterPoint[] {
  return convexHull(cluster.points.map(point => ({
    x: point.x + cluster.dx,
    y: point.y + cluster.dy,
  })))
}

function measureMutableOverlaps(clusters: MutableCluster[]): ClusterOverlap[] {
  const hulls = clusters.map(cluster => ({
    cluster,
    hull: translatedHull(cluster),
  }))
  const overlaps: ClusterOverlap[] = []
  for (let first = 0; first < hulls.length; first += 1) {
    const firstArea = polygonArea(hulls[first].hull)
    if (firstArea <= EPSILON) continue
    for (let second = first + 1; second < hulls.length; second += 1) {
      const secondArea = polygonArea(hulls[second].hull)
      if (secondArea <= EPSILON) continue
      const intersectionArea = polygonArea(
        convexIntersection(hulls[first].hull, hulls[second].hull),
      )
      if (intersectionArea <= EPSILON) continue
      overlaps.push({
        firstKey: hulls[first].cluster.key,
        secondKey: hulls[second].cluster.key,
        intersectionArea,
        ratioToSmaller: intersectionArea / Math.min(firstArea, secondArea),
      })
    }
  }
  return overlaps.sort((a, b) => b.ratioToSmaller - a.ratioToSmaller)
}

function clusterPairOverlapRatio(first: MutableCluster, second: MutableCluster): number {
  const firstHull = translatedHull(first)
  const secondHull = translatedHull(second)
  const firstArea = polygonArea(firstHull)
  const secondArea = polygonArea(secondHull)
  if (firstArea <= EPSILON || secondArea <= EPSILON) return 0
  const intersectionArea = polygonArea(convexIntersection(firstHull, secondHull))
  return intersectionArea / Math.min(firstArea, secondArea)
}

function polygonCenter(points: ClusterPoint[]): ClusterPoint {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  )
  return {
    x: total.x / Math.max(points.length, 1),
    y: total.y / Math.max(points.length, 1),
  }
}

function axesFor(points: ClusterPoint[]): ClusterPoint[] {
  const axes: ClusterPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]
    const edgeX = next.x - points[index].x
    const edgeY = next.y - points[index].y
    const length = Math.hypot(edgeX, edgeY)
    if (length <= EPSILON) continue
    axes.push({ x: -edgeY / length, y: edgeX / length })
  }
  return axes
}

function project(points: ClusterPoint[], axis: ClusterPoint): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

/**
 * Returns the smallest relative translation that separates second from first.
 * The vector is split across both clusters by the caller, so neither cluster is pinned.
 */
function minimumSeparationVector(
  first: ClusterPoint[],
  second: ClusterPoint[],
  gap: number,
): ClusterPoint | null {
  if (first.length < 3 || second.length < 3) return null
  let bestDistance = Number.POSITIVE_INFINITY
  let bestAxis: ClusterPoint | null = null
  const firstCenter = polygonCenter(first)
  const secondCenter = polygonCenter(second)
  const centerDelta = {
    x: secondCenter.x - firstCenter.x,
    y: secondCenter.y - firstCenter.y,
  }
  for (const rawAxis of [...axesFor(first), ...axesFor(second)]) {
    const firstProjection = project(first, rawAxis)
    const secondProjection = project(second, rawAxis)
    if (
      firstProjection.max <= secondProjection.min + EPSILON
      || secondProjection.max <= firstProjection.min + EPSILON
    ) return null

    const moveSecondPositive = firstProjection.max - secondProjection.min
    const moveSecondNegative = secondProjection.max - firstProjection.min
    let axis = rawAxis
    let distance = moveSecondPositive
    if (moveSecondNegative < moveSecondPositive) {
      axis = { x: -rawAxis.x, y: -rawAxis.y }
      distance = moveSecondNegative
    } else if (Math.abs(moveSecondNegative - moveSecondPositive) <= EPSILON) {
      const towardSecond = centerDelta.x * rawAxis.x + centerDelta.y * rawAxis.y
      if (towardSecond < 0) axis = { x: -rawAxis.x, y: -rawAxis.y }
    }
    if (distance < bestDistance) {
      bestDistance = distance
      bestAxis = axis
    }
  }
  if (!bestAxis || !Number.isFinite(bestDistance)) return null
  return {
    x: bestAxis.x * (bestDistance + Math.max(gap, 0)),
    y: bestAxis.y * (bestDistance + Math.max(gap, 0)),
  }
}

export function measureClusterOverlaps(clusters: PositionedCluster[]): ClusterOverlap[] {
  return measureMutableOverlaps(
    clusters.map(cluster => ({ ...cluster, dx: 0, dy: 0 })),
  )
}

/**
 * Keeps each cluster's internal force result unchanged and translates only severe intersections.
 * It is intentionally a one-shot planner; lifecycle code decides when to apply it.
 */
export function planSevereClusterSeparation(
  clusters: PositionedCluster[],
  options: {
    severeOverlapRatio?: number
    gap?: number
    maxAdjustments?: number
  } = {},
): ClusterSeparationPlan {
  const severeOverlapRatio = options.severeOverlapRatio ?? 0.35
  const gap = options.gap ?? 0
  const mutable = clusters
    .filter(cluster => cluster.points.length >= 3)
    .map(cluster => ({ ...cluster, dx: 0, dy: 0 }))
  const before = measureMutableOverlaps(mutable)
  const maxAdjustments = options.maxAdjustments ?? Math.max(1, mutable.length * 4)
  let adjustedPairCount = 0

  for (let attempt = 0; attempt < maxAdjustments; attempt += 1) {
    const severe = measureMutableOverlaps(mutable)
      .find(overlap => overlap.ratioToSmaller >= severeOverlapRatio)
    if (!severe) break
    const first = mutable.find(cluster => cluster.key === severe.firstKey)
    const second = mutable.find(cluster => cluster.key === severe.secondKey)
    if (!first || !second) break
    const vector = minimumSeparationVector(
      translatedHull(first),
      translatedHull(second),
      gap,
    )
    if (!vector) break

    const firstMass = Math.max(first.points.length, 1)
    const secondMass = Math.max(second.points.length, 1)
    const totalMass = firstMass + secondMass
    const firstShare = secondMass / totalMass
    const secondShare = firstMass / totalMass

    // 완전 분리까지 밀지 않고 임계값 바로 아래까지만 이동해 화면 축소를 최소화한다.
    const original = {
      firstDx: first.dx,
      firstDy: first.dy,
      secondDx: second.dx,
      secondDy: second.dy,
    }
    const targetRatio = severeOverlapRatio * 0.9
    let low = 0
    let high = 1
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const fraction = (low + high) / 2
      first.dx = original.firstDx - vector.x * firstShare * fraction
      first.dy = original.firstDy - vector.y * firstShare * fraction
      second.dx = original.secondDx + vector.x * secondShare * fraction
      second.dy = original.secondDy + vector.y * secondShare * fraction
      if (clusterPairOverlapRatio(first, second) <= targetRatio) high = fraction
      else low = fraction
    }
    first.dx = original.firstDx - vector.x * firstShare * high
    first.dy = original.firstDy - vector.y * firstShare * high
    second.dx = original.secondDx + vector.x * secondShare * high
    second.dy = original.secondDy + vector.y * secondShare * high
    adjustedPairCount += 1
  }

  const translations = mutable.map(cluster => ({
    key: cluster.key,
    dx: cluster.dx,
    dy: cluster.dy,
  }))
  const positions = mutable.flatMap(cluster => cluster.points.map(point => ({
    ...point,
    x: point.x + cluster.dx,
    y: point.y + cluster.dy,
  })))
  return {
    positions,
    translations,
    before,
    after: measureMutableOverlaps(mutable),
    adjustedPairCount,
  }
}
