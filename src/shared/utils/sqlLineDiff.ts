export type SqlDiffStatus = 'unchanged' | 'added' | 'removed' | 'modified'

export interface PreviousSqlLine {
  id: string
  content: string
}

export interface SqlDiffLine {
  id: string
  content: string
  status: SqlDiffStatus
}

export interface SqlLineDiffOptions {
  /**
   * Similarity threshold to mark delete+insert pair as 'modified'
   * Range: [0, 1]
   */
  modifiedSimilarityThreshold?: number
  /**
   * Lookahead window when trying to pair deletes/inserts as modifications.
   * Small values preserve order and keep behavior predictable.
   */
  modifiedLookahead?: number
  /**
   * Custom ID generator for new lines.
   */
  createId?: () => string
}

type Edit =
  | { type: 'equal'; oldIndex: number; newIndex: number }
  | { type: 'delete'; oldIndex: number }
  | { type: 'insert'; newIndex: number }

function defaultCreateIdFactory(prefix: string) {
  let counter = 0
  return () => `${prefix}-${++counter}-${Date.now()}`
}

function normalizeForCompare(s: string): string {
  return (s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  // SQL-ish tokenization: separate punctuation a bit to improve Jaccard usefulness.
  const normalized = normalizeForCompare(s)
    .replace(/([(),=<>!+\-*/])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return []
  return normalized.split(' ')
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length === 0 && tb.length === 0) return 1
  if (ta.length === 0 || tb.length === 0) return 0

  const sa = new Set(ta)
  const sb = new Set(tb)
  let intersect = 0
  for (const t of sa) {
    if (sb.has(t)) intersect++
  }
  const union = sa.size + sb.size - intersect
  return union === 0 ? 0 : intersect / union
}

function levenshteinDistance(a: string, b: string): number {
  // Standard DP, optimized for short strings by using 2 rows.
  const s = normalizeForCompare(a)
  const t = normalizeForCompare(b)
  const n = s.length
  const m = t.length
  if (n === 0) return m
  if (m === 0) return n

  let prev = new Uint16Array(m + 1)
  let cur = new Uint16Array(m + 1)
  for (let j = 0; j <= m; j++) prev[j] = j

  for (let i = 1; i <= n; i++) {
    cur[0] = i
    const si = s.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const cost = si === t.charCodeAt(j - 1) ? 0 : 1
      const del = prev[j] + 1
      const ins = cur[j - 1] + 1
      const sub = prev[j - 1] + cost
      cur[j] = Math.min(del, ins, sub)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[m]
}

function similarityScore(a: string, b: string): number {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (na === nb) return 1
  const jac = jaccardSimilarity(na, nb)

  // Levenshtein can be expensive; keep it bounded to "reasonable" line lengths.
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return 1
  if (maxLen > 240) return jac

  const dist = levenshteinDistance(na, nb)
  const ratio = 1 - dist / maxLen
  return Math.max(jac, ratio)
}

/**
 * Myers diff (shortest edit script) on arrays of strings.
 * Returns an ordered list of edits (equal/insert/delete).
 */
function myersDiff(oldLines: string[], newLines: string[]): Edit[] {
  const n = oldLines.length
  const m = newLines.length
  const max = n + m
  const offset = max

  // v[k] = furthest x on diagonal k
  let v = new Int32Array(2 * max + 1)
  v.fill(-1)
  v[offset + 1] = 0

  const trace: Int32Array[] = []

  for (let d = 0; d <= max; d++) {
    trace.push(new Int32Array(v))
    for (let k = -d; k <= d; k += 2) {
      const kIndex = offset + k
      let x: number

      if (k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1])) {
        // down (insert in old / consume new)
        x = v[kIndex + 1]
      } else {
        // right (delete from old)
        x = v[kIndex - 1] + 1
      }
      let y = x - k

      // snake
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++
        y++
      }
      v[kIndex] = x

      if (x >= n && y >= m) {
        // backtrack
        const edits: Edit[] = []
        let curX = n
        let curY = m
        for (let curD = d; curD >= 0; curD--) {
          const vv = trace[curD]
          const curK = curX - curY
          const curKIndex = offset + curK

          let prevK: number
          if (
            curK === -curD ||
            (curK !== curD && vv[curKIndex - 1] < vv[curKIndex + 1])
          ) {
            prevK = curK + 1
          } else {
            prevK = curK - 1
          }

          const prevX = vv[offset + prevK]
          const prevY = prevX - prevK

          while (curX > prevX && curY > prevY) {
            edits.push({ type: 'equal', oldIndex: curX - 1, newIndex: curY - 1 })
            curX--
            curY--
          }

          if (curD === 0) break

          if (curX === prevX) {
            edits.push({ type: 'insert', newIndex: curY - 1 })
            curY--
          } else {
            edits.push({ type: 'delete', oldIndex: curX - 1 })
            curX--
          }
        }
        edits.reverse()
        return edits
      }
    }
  }

  // Fallback (shouldn't happen)
  const fallback: Edit[] = []
  const min = Math.min(n, m)
  for (let i = 0; i < min; i++) {
    if (oldLines[i] === newLines[i]) fallback.push({ type: 'equal', oldIndex: i, newIndex: i })
    else {
      fallback.push({ type: 'delete', oldIndex: i })
      fallback.push({ type: 'insert', newIndex: i })
    }
  }
  for (let i = min; i < n; i++) fallback.push({ type: 'delete', oldIndex: i })
  for (let i = min; i < m; i++) fallback.push({ type: 'insert', newIndex: i })
  return fallback
}

function mergeModifiedWithinBlock(
  delBlock: Array<{ id: string; content: string }>,
  insBlock: Array<{ content: string }>,
  options: Required<Pick<SqlLineDiffOptions, 'modifiedLookahead' | 'modifiedSimilarityThreshold'>>
): Array<
  | { type: 'removed'; id: string; content: string }
  | { type: 'added'; content: string }
  | { type: 'modified'; id: string; content: string }
> {
  const lookahead = options.modifiedLookahead
  const threshold = options.modifiedSimilarityThreshold

  const out: Array<
    | { type: 'removed'; id: string; content: string }
    | { type: 'added'; content: string }
    | { type: 'modified'; id: string; content: string }
  > = []

  let i = 0
  let j = 0

  const bestMatchInsIndexForDel = (delIdx: number, startIns: number) => {
    let bestJ = -1
    let bestScore = -1
    for (let jj = startIns; jj < insBlock.length && jj < startIns + lookahead; jj++) {
      const score = similarityScore(delBlock[delIdx].content, insBlock[jj].content)
      if (score > bestScore) {
        bestScore = score
        bestJ = jj
      }
    }
    return { bestJ, bestScore }
  }

  const bestMatchDelIndexForIns = (insIdx: number, startDel: number) => {
    let bestI = -1
    let bestScore = -1
    for (let ii = startDel; ii < delBlock.length && ii < startDel + lookahead; ii++) {
      const score = similarityScore(delBlock[ii].content, insBlock[insIdx].content)
      if (score > bestScore) {
        bestScore = score
        bestI = ii
      }
    }
    return { bestI, bestScore }
  }

  while (i < delBlock.length || j < insBlock.length) {
    if (i >= delBlock.length) {
      out.push({ type: 'added', content: insBlock[j++].content })
      continue
    }
    if (j >= insBlock.length) {
      out.push({ type: 'removed', id: delBlock[i].id, content: delBlock[i++].content })
      continue
    }

    const direct = similarityScore(delBlock[i].content, insBlock[j].content)
    if (direct >= threshold) {
      out.push({ type: 'modified', id: delBlock[i].id, content: insBlock[j].content })
      i++
      j++
      continue
    }

    const { bestJ, bestScore: bestDelScore } = bestMatchInsIndexForDel(i, j)
    const { bestI, bestScore: bestInsScore } = bestMatchDelIndexForIns(j, i)

    // If we can find a good mutual-best pairing in the local window, align to it.
    if (bestJ !== -1 && bestI !== -1 && bestJ === j && bestI === i && bestDelScore >= threshold) {
      out.push({ type: 'modified', id: delBlock[i].id, content: insBlock[j].content })
      i++
      j++
      continue
    }

    // Otherwise, choose the operation that seems less likely to be a modification.
    // Heuristic: if del[i] has a stronger potential match later than ins[j], emit 'added' now to align.
    if (bestDelScore > bestInsScore && bestDelScore >= threshold) {
      out.push({ type: 'added', content: insBlock[j++].content })
    } else {
      out.push({ type: 'removed', id: delBlock[i].id, content: delBlock[i++].content })
    }
  }

  return out
}

export function buildSqlLineDiff(
  previous: PreviousSqlLine[],
  nextSqlText: string,
  options?: SqlLineDiffOptions
): {
  displayLines: SqlDiffLine[]
  nextPrevious: PreviousSqlLine[]
} {
  const nextLines = (nextSqlText ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const prevLines = previous ?? []
  const oldContents = prevLines.map(l => l.content)
  const edits = myersDiff(oldContents, nextLines)

  const createId = options?.createId ?? defaultCreateIdFactory('sql-line')
  const modifiedSimilarityThreshold = options?.modifiedSimilarityThreshold ?? 0.62
  const modifiedLookahead = options?.modifiedLookahead ?? 3

  // We'll output in-place: deletes appear where they occur in the edit stream.
  // To support 'modified', we group consecutive non-equal edits and merge within each block.
  const display: SqlDiffLine[] = []
  const nextPrev: PreviousSqlLine[] = []

  const flushNonEqualBlock = (
    delBlock: Array<{ id: string; content: string }>,
    insBlock: Array<{ content: string }>
  ) => {
    if (delBlock.length === 0 && insBlock.length === 0) return

    const merged = mergeModifiedWithinBlock(delBlock, insBlock, {
      modifiedLookahead,
      modifiedSimilarityThreshold
    })

    for (const item of merged) {
      if (item.type === 'removed') {
        display.push({ id: item.id, content: item.content, status: 'removed' })
      } else if (item.type === 'added') {
        const id = createId()
        display.push({ id, content: item.content, status: 'added' })
        nextPrev.push({ id, content: item.content })
      } else {
        // modified: reuse the deleted line's id for key stability
        display.push({ id: item.id, content: item.content, status: 'modified' })
        nextPrev.push({ id: item.id, content: item.content })
      }
    }
  }

  let delBlock: Array<{ id: string; content: string }> = []
  let insBlock: Array<{ content: string }> = []

  for (const e of edits) {
    if (e.type === 'equal') {
      flushNonEqualBlock(delBlock, insBlock)
      delBlock = []
      insBlock = []

      const prev = prevLines[e.oldIndex]
      const content = nextLines[e.newIndex]
      if (prev) {
        display.push({ id: prev.id, content, status: 'unchanged' })
        nextPrev.push({ id: prev.id, content })
      } else {
        const id = createId()
        display.push({ id, content, status: 'unchanged' })
        nextPrev.push({ id, content })
      }
    } else if (e.type === 'delete') {
      const prev = prevLines[e.oldIndex]
      delBlock.push({
        id: prev?.id ?? createId(),
        content: prev?.content ?? oldContents[e.oldIndex] ?? ''
      })
    } else {
      insBlock.push({ content: nextLines[e.newIndex] ?? '' })
    }
  }

  flushNonEqualBlock(delBlock, insBlock)

  return {
    displayLines: display,
    nextPrevious: nextPrev
  }
}


