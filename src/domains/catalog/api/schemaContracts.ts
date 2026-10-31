export interface RoboSchemaTableInfo {
  name: string
  table_schema: string
  datasource: string
  logical_name?: string
  description: string
  summary?: string
  column_count: number
}

export interface RoboSchemaColumnInfo {
  name: string
  table_name: string
  data_type: string
  nullable: boolean
  logical_name?: string
  description: string
  summary?: string
}

export interface RoboSchemaRelationship {
  from_table: string
  from_schema: string
  from_column: string
  to_table: string
  to_schema: string
  to_column: string
  relationship_type: 'FK'
  description: string
  name?: string
}

export interface CatalogRelatedTablesResponse {
  base_table: string
  tables: Array<{ name: string; schema: string; description?: string }>
  relationships: Array<{
    from_table: string
    to_table: string
    type: 'FK'
    source?: 'analyzer' | 'catalog'
    column_pairs?: Array<{ source: string; target: string; name?: string }>
    name?: string
  }>
}

export interface CatalogTableReferencesResponse {
  references: Array<{
    procedure_name: string
    procedure_type: string
    start_line: number
    end_line?: number
    access_type: string
    statement_type?: string
    statement_line?: number
    evidence_line?: number
    file_path?: string
    code_text?: string
  }>
}

export interface CatalogProcedureStatementsResponse {
  statements: Array<{
    start_line: number
    end_line?: number
    statement_type: string
    summary?: string
    ai_description?: string
  }>
}

export interface CatalogSemanticSearchResult {
  name: string
  schema: string
  description: string
  similarity: number
}

export interface CatalogRelationshipCreateResponse {
  message: string
  created: true
}

export interface CatalogRelationshipDeleteResponse {
  message: string
  deleted: number
}

export interface CatalogDescriptionUpdateResponse {
  message: string
  updated: true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${context} 응답이 객체가 아닙니다.`)
  return value
}

function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context} 응답이 배열이 아닙니다.`)
  return value
}

function string(value: unknown, context: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`${context}가 문자열이 아닙니다.`)
  }
  return value
}

function optionalString(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return string(value, context)
}

function finiteNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context}가 숫자가 아닙니다.`)
  }
  return value
}

function optionalFiniteNumber(value: unknown, context: string): number | undefined {
  if (value === undefined || value === null) return undefined
  return finiteNumber(value, context)
}

/** 사람이 쓴 설명이 없으면 분석기가 코드에서 읽어 채운 설명(analyzed_description). */
function describedBy(item: Record<string, unknown>, context: string): string {
  const written = item.description == null ? '' : string(item.description, `${context}.description`)
  if (written.trim()) return written
  return optionalString(item.analyzed_description, `${context}.analyzed_description`) ?? ''
}

export function parseSchemaTables(value: unknown): RoboSchemaTableInfo[] {
  return array(value, 'Catalog schema tables').map((entry, index) => {
    const item = record(entry, `Catalog schema tables[${index}]`)
    return {
      name: string(item.name, `Catalog schema tables[${index}].name`, false),
      table_schema: string(item.table_schema, `Catalog schema tables[${index}].table_schema`),
      datasource: item.datasource === undefined || item.datasource === null
        ? ''
        : string(item.datasource, `Catalog schema tables[${index}].datasource`),
      logical_name: optionalString(item.logical_name, `Catalog schema tables[${index}].logical_name`),
      description: describedBy(item, `Catalog schema tables[${index}]`),
      summary: optionalString(item.summary, `Catalog schema tables[${index}].summary`),
      column_count: finiteNumber(item.column_count, `Catalog schema tables[${index}].column_count`),
    }
  })
}

export function parseSchemaColumns(value: unknown): RoboSchemaColumnInfo[] {
  return array(value, 'Catalog schema columns').map((entry, index) => {
    const item = record(entry, `Catalog schema columns[${index}]`)
    if (typeof item.nullable !== 'boolean') {
      throw new Error(`Catalog schema columns[${index}].nullable이 boolean이 아닙니다.`)
    }
    return {
      name: string(item.name, `Catalog schema columns[${index}].name`, false),
      table_name: string(item.table_name, `Catalog schema columns[${index}].table_name`, false),
      // 지금 카탈로그는 분석기 속성 이름 그대로 dtype 을 돌려준다
      data_type: string(item.data_type ?? item.dtype, `Catalog schema columns[${index}].data_type`),
      nullable: item.nullable,
      logical_name: optionalString(item.logical_name, `Catalog schema columns[${index}].logical_name`),
      description: describedBy(item, `Catalog schema columns[${index}]`),
      summary: optionalString(item.summary, `Catalog schema columns[${index}].summary`),
    }
  })
}

export function parseSchemaRelationships(value: unknown): RoboSchemaRelationship[] {
  return array(value, 'Catalog schema relationships').map((entry, index) => {
    const item = record(entry, `Catalog schema relationships[${index}]`)
    if (item.relationship_type !== 'FK') {
      throw new Error(`Catalog schema relationships[${index}].relationship_type가 FK가 아닙니다.`)
    }
    return {
      from_table: string(item.from_table, `Catalog schema relationships[${index}].from_table`, false),
      from_schema: string(item.from_schema, `Catalog schema relationships[${index}].from_schema`),
      from_column: string(item.from_column, `Catalog schema relationships[${index}].from_column`),
      to_table: string(item.to_table, `Catalog schema relationships[${index}].to_table`, false),
      to_schema: string(item.to_schema, `Catalog schema relationships[${index}].to_schema`),
      to_column: string(item.to_column, `Catalog schema relationships[${index}].to_column`),
      relationship_type: 'FK',
      description: string(item.description, `Catalog schema relationships[${index}].description`),
      name: optionalString(item.name, `Catalog schema relationships[${index}].name`),
    }
  })
}

function parseColumnPairs(value: unknown, context: string) {
  if (value === undefined || value === null) return undefined
  return array(value, context).map((entry, index) => {
    const pair = record(entry, `${context}[${index}]`)
    return {
      source: string(pair.source, `${context}[${index}].source`),
      target: string(pair.target, `${context}[${index}].target`),
      name: optionalString(pair.name, `${context}[${index}].name`),
    }
  })
}

export function parseRelatedTables(value: unknown): CatalogRelatedTablesResponse {
  const response = record(value, 'Catalog related tables')
  return {
    base_table: string(response.base_table, 'Catalog related tables.base_table', false),
    tables: array(response.tables, 'Catalog related tables.tables').map((entry, index) => {
      const table = record(entry, `Catalog related tables.tables[${index}]`)
      return {
        name: string(table.name, `Catalog related tables.tables[${index}].name`, false),
        schema: string(table.schema, `Catalog related tables.tables[${index}].schema`),
        description: optionalString(
          table.description,
          `Catalog related tables.tables[${index}].description`,
        ),
      }
    }),
    relationships: array(response.relationships, 'Catalog related tables.relationships').map(
      (entry, index) => {
        const relationship = record(entry, `Catalog related tables.relationships[${index}]`)
        const source = optionalString(
          relationship.source,
          `Catalog related tables.relationships[${index}].source`,
        )
        if (source && source !== 'analyzer' && source !== 'catalog') {
          throw new Error(`Catalog related tables.relationships[${index}].source가 올바르지 않습니다.`)
        }
        const relationshipType = string(
          relationship.type,
          `Catalog related tables.relationships[${index}].type`,
          false,
        )
        if (relationshipType !== 'FK') {
          throw new Error(`Catalog related tables.relationships[${index}].type은 FK여야 합니다.`)
        }
        return {
          from_table: string(
            relationship.from_table,
            `Catalog related tables.relationships[${index}].from_table`,
            false,
          ),
          to_table: string(
            relationship.to_table,
            `Catalog related tables.relationships[${index}].to_table`,
            false,
          ),
          type: relationshipType,
          source: source as CatalogRelatedTablesResponse['relationships'][number]['source'],
          column_pairs: parseColumnPairs(
            relationship.column_pairs,
            `Catalog related tables.relationships[${index}].column_pairs`,
          ),
          name: optionalString(
            relationship.name,
            `Catalog related tables.relationships[${index}].name`,
          ),
        }
      },
    ),
  }
}

function parseProcedureReference(entry: unknown, context: string) {
  const item = record(entry, context)
  return {
    procedure_name: string(item.procedure_name, `${context}.procedure_name`, false),
    procedure_type: string(item.procedure_type, `${context}.procedure_type`, false),
    start_line: finiteNumber(item.start_line, `${context}.start_line`),
    end_line: optionalFiniteNumber(item.end_line, `${context}.end_line`),
    access_type: string(item.access_type, `${context}.access_type`, false),
    statement_type: optionalString(item.statement_type, `${context}.statement_type`),
    statement_line: optionalFiniteNumber(item.statement_line, `${context}.statement_line`),
    evidence_line: optionalFiniteNumber(item.evidence_line, `${context}.evidence_line`),
    file_path: optionalString(item.file_path, `${context}.file_path`),
    code_text: optionalString(item.code_text, `${context}.code_text`),
  }
}

export function parseTableReferences(value: unknown): CatalogTableReferencesResponse {
  const response = record(value, 'Catalog table references')
  return {
    references: array(response.references, 'Catalog table references.references').map(
      (entry, index) => parseProcedureReference(entry, `Catalog table references.references[${index}]`),
    ),
  }
}

export function parseProcedureStatements(value: unknown): CatalogProcedureStatementsResponse {
  const response = record(value, 'Catalog procedure statements')
  return {
    statements: array(response.statements, 'Catalog procedure statements.statements').map(
      (entry, index) => {
        const item = record(entry, `Catalog procedure statements.statements[${index}]`)
        return {
          start_line: finiteNumber(
            item.start_line,
            `Catalog procedure statements.statements[${index}].start_line`,
          ),
          end_line: optionalFiniteNumber(
            item.end_line,
            `Catalog procedure statements.statements[${index}].end_line`,
          ),
          statement_type: string(
            item.statement_type,
            `Catalog procedure statements.statements[${index}].statement_type`,
            false,
          ),
          summary: optionalString(
            item.summary,
            `Catalog procedure statements.statements[${index}].summary`,
          ),
          ai_description: optionalString(
            item.ai_description,
            `Catalog procedure statements.statements[${index}].ai_description`,
          ),
        }
      },
    ),
  }
}

export function parseSemanticSearchResults(value: unknown): CatalogSemanticSearchResult[] {
  return array(value, 'Catalog semantic search').map((entry, index) => {
    const item = record(entry, `Catalog semantic search[${index}]`)
    return {
      name: string(item.name, `Catalog semantic search[${index}].name`, false),
      schema: string(item.schema, `Catalog semantic search[${index}].schema`),
      description: string(item.description, `Catalog semantic search[${index}].description`),
      similarity: finiteNumber(item.similarity, `Catalog semantic search[${index}].similarity`),
    }
  })
}

function mutationMessage(response: Record<string, unknown>, context: string): string {
  return string(response.message, `${context}.message`)
}

export function parseRelationshipCreate(value: unknown): CatalogRelationshipCreateResponse {
  const response = record(value, 'Catalog relationship create')
  if (response.created !== true) {
    throw new Error('Catalog relationship create.created가 true가 아닙니다.')
  }
  return { message: mutationMessage(response, 'Catalog relationship create'), created: true }
}

export function parseRelationshipDelete(value: unknown): CatalogRelationshipDeleteResponse {
  const response = record(value, 'Catalog relationship delete')
  const deleted = finiteNumber(response.deleted, 'Catalog relationship delete.deleted')
  if (!Number.isInteger(deleted) || deleted < 0) {
    throw new Error('Catalog relationship delete.deleted가 0 이상의 정수가 아닙니다.')
  }
  return { message: mutationMessage(response, 'Catalog relationship delete'), deleted }
}

export function parseDescriptionUpdate(value: unknown): CatalogDescriptionUpdateResponse {
  const response = record(value, 'Catalog description update')
  if (response.updated !== true) {
    throw new Error('Catalog description update.updated가 true가 아닙니다.')
  }
  return {
    message: mutationMessage(response, 'Catalog description update'),
    updated: true,
  }
}
