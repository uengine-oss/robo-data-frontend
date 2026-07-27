export interface ProcedureStatement {
  start_line: number
  end_line?: number
  statement_type: string
  summary?: string
  ai_description?: string
}

export interface SourceCodePanelState {
  isOpen: boolean
  fileName: string
  fileDirectory: string
  fileContent: string
  startLine: number
  highlightedLine: number
  procedureName: string
  statements: ProcedureStatement[]
  isLoadingStatements: boolean
  statementError: string | null
  notFound: boolean
  loadError: boolean
}

export interface OpenSourceCodePanelInput {
  fileName: string
  fileDirectory: string
  fileContent: string
  highlightedLine: number
  procedureName: string
  startLine?: number
  found?: boolean
  loadError?: boolean
}

export type ProcedureStatementsResult =
  | { ok: true; statements: ProcedureStatement[] }
  | { ok: false; error: string }

export function createClosedSourceCodePanel(): SourceCodePanelState {
  return {
    isOpen: false,
    fileName: '',
    fileDirectory: '',
    fileContent: '',
    startLine: 1,
    highlightedLine: 0,
    procedureName: '',
    statements: [],
    isLoadingStatements: false,
    statementError: null,
    notFound: false,
    loadError: false,
  }
}

export function createOpenSourceCodePanel({
  fileName,
  fileDirectory,
  fileContent,
  highlightedLine,
  procedureName,
  startLine = 1,
  found = true,
  loadError = false,
}: OpenSourceCodePanelInput): SourceCodePanelState {
  const sourceAvailable = found && !loadError
  return {
    isOpen: true,
    fileName,
    fileDirectory,
    fileContent: sourceAvailable ? fileContent : '',
    startLine,
    highlightedLine,
    procedureName,
    statements: [],
    isLoadingStatements: sourceAvailable && Boolean(procedureName),
    statementError: null,
    notFound: !found && !loadError,
    loadError,
  }
}

function isProcedureStatement(value: unknown): value is ProcedureStatement {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ProcedureStatement>
  return Number.isFinite(candidate.start_line)
    && typeof candidate.statement_type === 'string'
}

export async function loadProcedureStatements(
  procedureName: string,
  fileDirectory: string,
  getStatements: (
    procedureName: string,
    fileDirectory?: string,
  ) => Promise<{ statements: unknown }>,
): Promise<ProcedureStatementsResult> {
  if (!procedureName) return { ok: true, statements: [] }

  try {
    const response = await getStatements(procedureName, fileDirectory)
    if (!Array.isArray(response.statements) || !response.statements.every(isProcedureStatement)) {
      return { ok: false, error: 'Statement 설명 응답 형식이 올바르지 않습니다.' }
    }
    return { ok: true, statements: response.statements }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Statement 설명을 불러오지 못했습니다.',
    }
  }
}
