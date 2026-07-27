export interface FileTypeResult {
  fileName: string
  fileType:
    | 'java'
    | 'oracle_sp'
    | 'oracle_ddl'
    | 'postgresql_sp'
    | 'postgresql_ddl'
    | 'python'
    | 'xml'
    | 'sql_generic'
    | 'unknown'
  confidence: number
  details: string
  suggestedStrategy: 'framework' | 'dbms'
  suggestedTarget: 'java' | 'oracle' | 'postgresql' | 'python'
}

export interface DetectTypesResponse {
  files: FileTypeResult[]
  summary: {
    total: number
    byType: Record<string, number>
    suggestedStrategy: 'framework' | 'dbms'
    suggestedTarget: 'java' | 'oracle' | 'postgresql' | 'python'
  }
}
