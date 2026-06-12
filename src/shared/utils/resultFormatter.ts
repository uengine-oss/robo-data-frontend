/**
 * LangChain 결과 포맷팅 유틸리티
 * SQL, 테이블 데이터, 일반 텍스트 등을 파싱하고 구조화
 */

export interface ParsedSql {
  type: 'sql'
  sql: string
}

export interface ParsedTable {
  type: 'table'
  columns: string[]
  rows: string[][]
  rowCount: number
}

export interface ParsedText {
  type: 'text'
  content: string
}

export interface ParsedToolCall {
  type: 'tool'
  name: string
  input: Record<string, unknown>
}

export interface ParsedOlapSuggestion {
  type: 'olap'
  complexityScore: number
  reasons: string[]
  frontendUrl: string
}

export interface ParsedLink {
  type: 'link'
  text: string
  url: string
}

export type ParsedContent = ParsedSql | ParsedTable | ParsedText | ParsedToolCall | ParsedOlapSuggestion | ParsedLink

/**
 * 결과 문자열을 파싱하여 구조화된 데이터로 변환
 */
export function parseResultContent(content: string): ParsedContent[] {
  const results: ParsedContent[] = []
  
  // Tool call JSON 파싱 (예: {'sql': 'SELECT ...'})
  const toolCallMatch = content.match(/^\s*\{['"]?(\w+)['"]?\s*:\s*['"](.+)['"]\s*\}\s*$/s)
  if (toolCallMatch) {
    const [, key, value] = toolCallMatch
    if (key === 'sql') {
      results.push({
        type: 'sql',
        sql: value.replace(/\\n/g, '\n').replace(/\\'/g, "'"),
      })
      return results
    }
  }
  
  // 더 유연한 SQL JSON 파싱
  const sqlJsonMatch = content.match(/\{\s*['"]sql['"]\s*:\s*['"](.+?)['"]\s*\}/s)
  if (sqlJsonMatch) {
    results.push({
      type: 'sql',
      sql: sqlJsonMatch[1].replace(/\\n/g, '\n').replace(/\\'/g, "'"),
    })
    
    // JSON 외의 나머지 텍스트도 파싱
    const remaining = content.replace(sqlJsonMatch[0], '').trim()
    if (remaining) {
      results.push(...parseResultContent(remaining))
    }
    return results
  }
  
  // 쿼리 실행 결과 파싱 (content='Query executed successfully...')
  const queryResultMatch = content.match(/content=['"]Query executed successfully\.\s*\\n(.+?)['"](?:\s+name=['"](\w+)['"])?/s)
  if (queryResultMatch) {
    const resultData = queryResultMatch[1]
    const parsed = parseQueryResult(resultData)
    if (parsed) {
      results.push(parsed)
      return results
    }
  }
  
  // 간단한 쿼리 결과 패턴 (Query executed successfully.\nColumns: ...)
  if (content.includes('Query executed successfully')) {
    const parsed = parseQueryResult(content)
    if (parsed) {
      results.push(parsed)
      return results
    }
  }
  
  // Columns: ... Row count: ... 패턴 직접 파싱
  if (content.includes('Columns:') && content.includes('Row count:')) {
    const parsed = parseQueryResult(content)
    if (parsed) {
      results.push(parsed)
      return results
    }
  }
  
  // OLAP 최적화 제안 파싱
  if (content.includes('OLAP 최적화 제안') || content.includes('OLAP 최적화 바로가기')) {
    const olapParsed = parseOlapSuggestion(content)
    if (olapParsed) {
      // OLAP 이전 텍스트가 있으면 먼저 추가
      const olapIndex = content.indexOf('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      if (olapIndex > 0) {
        const beforeOlap = content.substring(0, olapIndex).trim()
        if (beforeOlap) {
          // 재귀적으로 이전 내용 파싱
          results.push(...parseResultContent(beforeOlap))
        }
      }
      results.push(olapParsed)
      return results
    }
  }
  
  // URL 링크 파싱
  const urlMatch = content.match(/🔗\s*(?:OLAP 최적화 바로가기|바로가기):\s*(https?:\/\/[^\s]+)/i)
  if (urlMatch) {
    const beforeUrl = content.substring(0, content.indexOf(urlMatch[0])).trim()
    if (beforeUrl) {
      results.push({
        type: 'text',
        content: beforeUrl,
      })
    }
    results.push({
      type: 'link',
      text: 'OLAP 최적화 바로가기',
      url: urlMatch[1],
    })
    return results
  }
  
  // 그 외는 일반 텍스트로 처리
  if (content.trim()) {
    results.push({
      type: 'text',
      content: content.trim(),
    })
  }
  
  return results
}

/**
 * OLAP 최적화 제안 파싱
 */
function parseOlapSuggestion(content: string): ParsedOlapSuggestion | null {
  // 복잡도 점수 추출
  const scoreMatch = content.match(/복잡도 점수:\s*(\d+)|Complexity Score:\s*(\d+)/i)
  const complexityScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2], 10) : 0
  
  // 복잡성 요인 추출
  const reasons: string[] = []
  const reasonMatches = content.match(/•\s*([^\n•]+)/g)
  if (reasonMatches) {
    for (const match of reasonMatches) {
      const reason = match.replace(/•\s*/, '').trim()
      if (reason) {
        reasons.push(reason)
      }
    }
  }
  
  // 프론트엔드 URL 추출
  const urlMatch = content.match(/🔗\s*(?:OLAP 최적화 바로가기|바로가기):\s*(https?:\/\/[^\s]+)/i)
  const frontendUrl = urlMatch ? urlMatch[1] : ''
  
  if (!frontendUrl && complexityScore === 0 && reasons.length === 0) {
    return null
  }
  
  return {
    type: 'olap',
    complexityScore,
    reasons,
    frontendUrl,
  }
}

/**
 * 쿼리 실행 결과 파싱
 * Columns: col1, col2, ...
 * Row count: N
 * Results:
 *  1. col1: val1 | col2: val2 ...
 */
function parseQueryResult(content: string): ParsedTable | null {
  // Columns 추출
  const columnsMatch = content.match(/Columns:\s*([^\n]+)/)
  if (!columnsMatch) return null
  
  const columns = columnsMatch[1]
    .split(',')
    .map(c => c.trim())
    .filter(c => c)
  
  // Row count 추출
  const rowCountMatch = content.match(/Row count:\s*(\d+)/)
  const rowCount = rowCountMatch ? parseInt(rowCountMatch[1], 10) : 0
  
  // Results 추출
  const rows: string[][] = []
  
  // 결과 행 패턴: 숫자. 컬럼: 값 | 컬럼: 값 ...
  const resultsMatch = content.match(/Results:\s*\\n(.+?)(?:'|$)/s) || 
                       content.match(/Results:\s*\n(.+?)$/s)
  
  if (resultsMatch) {
    const resultsText = resultsMatch[1]
    // 각 행 파싱 (예: 1. workdate: 20260107 | tagsn: 100001 | total_val: 466300.0000\n)
    const rowPattern = /\d+\.\s*(.+?)(?=\s*\d+\.|\\n|$)/g
    let match
    while ((match = rowPattern.exec(resultsText)) !== null) {
      const rowData = match[1]
      const rowValues = parseRowData(rowData, columns)
      if (rowValues.length > 0) {
        rows.push(rowValues)
      }
    }
  }
  
  // 행이 없으면 다른 패턴 시도
  if (rows.length === 0 && rowCount > 0) {
    // 숫자. 형식의 모든 행 찾기
    const allRowsPattern = /(\d+)\.\s*([^0-9\n][^\n]*?)(?=\s*\d+\.\s*|\s*$)/g
    let match
    while ((match = allRowsPattern.exec(content)) !== null) {
      const rowData = match[2]
      const rowValues = parseRowData(rowData, columns)
      if (rowValues.length > 0) {
        rows.push(rowValues)
      }
    }
  }
  
  return {
    type: 'table',
    columns,
    rows,
    rowCount,
  }
}

/**
 * 행 데이터 파싱 (col1: val1 | col2: val2 형식)
 */
function parseRowData(rowData: string, columns: string[]): string[] {
  const values: string[] = new Array(columns.length).fill('')
  
  // | 로 분리된 컬럼:값 쌍 파싱
  const pairs = rowData.split('|').map(p => p.trim())
  
  for (const pair of pairs) {
    const colonIndex = pair.indexOf(':')
    if (colonIndex > 0) {
      const colName = pair.substring(0, colonIndex).trim()
      const value = pair.substring(colonIndex + 1).trim()
      
      const colIndex = columns.findIndex(c => 
        c.toLowerCase() === colName.toLowerCase()
      )
      if (colIndex >= 0) {
        values[colIndex] = value
      }
    }
  }
  
  // 적어도 하나의 값이 있는지 확인
  return values.some(v => v !== '') ? values : []
}

/**
 * SQL 문법 하이라이팅을 위한 토큰화
 */
export function tokenizeSql(sql: string): { type: string; value: string }[] {
  const tokens: { type: string; value: string }[] = []
  
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
    'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS',
    'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT',
    'ASC', 'DESC', 'BETWEEN', 'LIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'UNION', 'ALL', 'EXISTS', 'CAST', 'COALESCE', 'NULLIF',
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT',
    'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK',
    'TRUE', 'FALSE',
  ]
  
  const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi')
  const stringPattern = /'[^']*'/g
  const numberPattern = /\b\d+(\.\d+)?\b/g
  const commentPattern = /--[^\n]*/g
  const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g
  
  // 간단한 토큰화 (순서대로 처리)
  let remaining = sql
  let lastIndex = 0
  
  // 문자열, 숫자, 키워드 순서로 교체하면서 토큰 생성
  const allPatterns = [
    { pattern: stringPattern, type: 'string' },
    { pattern: commentPattern, type: 'comment' },
    { pattern: numberPattern, type: 'number' },
    { pattern: keywordPattern, type: 'keyword' },
  ]
  
  // 모든 매치를 수집하고 위치순으로 정렬
  const matches: { start: number; end: number; type: string; value: string }[] = []
  
  for (const { pattern, type } of allPatterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(sql)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        value: match[0],
      })
    }
  }
  
  // 위치순 정렬
  matches.sort((a, b) => a.start - b.start)
  
  // 중복 제거 (같은 위치에 여러 매치가 있으면 첫 번째만 사용)
  const usedRanges: { start: number; end: number }[] = []
  const filteredMatches = matches.filter(m => {
    const overlaps = usedRanges.some(r => 
      (m.start >= r.start && m.start < r.end) ||
      (m.end > r.start && m.end <= r.end)
    )
    if (!overlaps) {
      usedRanges.push({ start: m.start, end: m.end })
      return true
    }
    return false
  })
  
  // 토큰 생성
  for (const match of filteredMatches) {
    if (match.start > lastIndex) {
      tokens.push({ type: 'text', value: sql.substring(lastIndex, match.start) })
    }
    tokens.push({ type: match.type, value: match.value })
    lastIndex = match.end
  }
  
  if (lastIndex < sql.length) {
    tokens.push({ type: 'text', value: sql.substring(lastIndex) })
  }
  
  return tokens
}

/**
 * Tool input JSON 파싱
 */
export function parseToolInput(input: string): Record<string, unknown> | string {
  try {
    // Python dict 스타일을 JSON으로 변환
    const jsonStr = input
      .replace(/'/g, '"')
      .replace(/True/g, 'true')
      .replace(/False/g, 'false')
      .replace(/None/g, 'null')
    
    return JSON.parse(jsonStr)
  } catch {
    return input
  }
}

