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
  filePath: string
  fileContent: string
  startLine: number
  highlightedLine: number
  procedureName: string
  statements: ProcedureStatement[]
  isLoadingStatements: boolean
  statementError: string | null
  notFound: boolean
}

export interface OpenSourceCodePanelInput {
  fileName: string
  filePath: string
  fileContent: string
  highlightedLine: number
  procedureName: string
  startLine?: number
  found?: boolean
}

export type ProcedureStatementsResult =
  | { ok: true; statements: ProcedureStatement[] }
  | { ok: false; error: string }

export function createClosedSourceCodePanel(): SourceCodePanelState {
  return {
    isOpen: false,
    fileName: '',
    filePath: '',
    fileContent: '',
    startLine: 1,
    highlightedLine: 0,
    procedureName: '',
    statements: [],
    isLoadingStatements: false,
    statementError: null,
    notFound: false,
  }
}

export function createOpenSourceCodePanel({
  fileName,
  filePath,
  fileContent,
  highlightedLine,
  procedureName,
  startLine = 1,
  found = true,
}: OpenSourceCodePanelInput): SourceCodePanelState {
  return {
    isOpen: true,
    fileName,
    filePath,
    fileContent: found ? fileContent : '',
    startLine,
    highlightedLine,
    procedureName,
    statements: [],
    isLoadingStatements: found && Boolean(procedureName),
    statementError: null,
    notFound: !found,
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
  filePath: string,
  getStatements: (
    procedureName: string,
    filePath?: string,
  ) => Promise<{ statements: unknown }>,
): Promise<ProcedureStatementsResult> {
  if (!procedureName) return { ok: true, statements: [] }

  try {
    const response = await getStatements(procedureName, filePath)
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
