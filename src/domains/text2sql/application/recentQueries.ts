export interface RecentQueryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface RecentQueryReadResult {
  queries: string[]
  warning: string | null
}

export interface RecentQueryWriteResult {
  queries: string[]
  warning: string | null
}

export const MAX_RECENT_QUERIES = 10

function normalizeRecentQueries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('최근 질문 저장값이 배열이 아닙니다.')
  }

  const seen = new Set<string>()
  const queries: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const query = item.trim()
    if (query.length < 3 || seen.has(query)) continue
    seen.add(query)
    queries.push(query)
    if (queries.length === MAX_RECENT_QUERIES) break
  }
  return queries
}

export function readRecentQueries(
  storage: RecentQueryStorage,
  key: string,
): RecentQueryReadResult {
  try {
    const raw = storage.getItem(key)
    if (!raw) return { queries: [], warning: null }
    return {
      queries: normalizeRecentQueries(JSON.parse(raw)),
      warning: null,
    }
  } catch {
    return {
      queries: [],
      warning: '저장된 최근 질문을 불러오지 못했습니다.',
    }
  }
}

export function appendRecentQuery(current: string[], query: string): string[] {
  const normalized = query.trim()
  if (normalized.length < 3) return [...current]
  return normalizeRecentQueries([normalized, ...current])
}

export function persistRecentQuery(
  storage: RecentQueryStorage,
  key: string,
  current: string[],
  query: string,
): RecentQueryWriteResult {
  const queries = appendRecentQuery(current, query)
  try {
    storage.setItem(key, JSON.stringify(queries))
    return { queries, warning: null }
  } catch {
    return {
      queries,
      warning: '최근 질문을 이 브라우저에 저장하지 못했습니다.',
    }
  }
}
