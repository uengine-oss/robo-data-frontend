import type {
  DirectSqlResponse,
} from '@/domains/text2sql'
import type {
  OntologyNodeDataResult,
} from '@/domains/ontology'
import type {
  OntologyDataSourceSchema,
} from '@/domains/ontology'
import { projectNodeData } from '../model/nodeDataProjection'

export interface OntologyNodeDataTargetInput {
  id: string
  name: string
  layer?: string
  label?: string
  unit?: string
  dataSource?: string
  dataSourceSchema?: OntologyDataSourceSchema
}

export interface OntologyNodeDataTarget {
  id: string
  name: string
  layer: string
  unit: string
  dataSource: string | null
  dataSourceSchema: OntologyDataSourceSchema | null
}

export interface Text2SqlNodeDataRequest {
  sql: string
  datasource: string
}

export function createOntologyNodeDataTarget(
  node: OntologyNodeDataTargetInput,
): OntologyNodeDataTarget {
  return {
    id: node.id,
    name: node.name,
    layer: node.layer || node.label || '',
    unit: node.unit || '',
    dataSource: node.dataSource || null,
    dataSourceSchema: node.dataSourceSchema
      ? {
          ...node.dataSourceSchema,
          columns: node.dataSourceSchema.columns
            ? [...node.dataSourceSchema.columns]
            : undefined,
        }
      : null,
  }
}

export function buildOntologyNodeDataQuery(
  filters: Record<string, unknown>,
  businessDayFilterEnabled: boolean,
  limit = 500,
): string {
  const params = new URLSearchParams({ limit: String(limit) })
  for (const [key, value] of Object.entries(filters)) {
    if (value === '' || value === null || value === undefined) continue
    params.append(`filter_${key}`, String(value))
  }
  if (businessDayFilterEnabled) {
    params.append('apply_business_day_filter', 'true')
  }
  return params.toString()
}

export function createUnavailableNodeDataResult(
  target: OntologyNodeDataTarget,
  message?: string,
): OntologyNodeDataResult {
  return {
    nodeId: target.id,
    nodeName: target.name,
    layer: target.layer,
    unit: target.unit,
    hasDataSource: false,
    dataSource: target.dataSource ?? undefined,
    columns: [],
    rows: [],
    rowCount: 0,
    timeColumns: [],
    numericColumns: [],
    message,
  }
}

function appendLimit(sql: string, limit: number): string {
  const normalized = sql.trim().replace(/;+\s*$/, '')
  return /\bLIMIT\b/i.test(normalized)
    ? normalized
    : `${normalized} LIMIT ${limit}`
}

export function buildText2SqlNodeDataRequest(
  target: OntologyNodeDataTarget,
  limit = 200,
): Text2SqlNodeDataRequest {
  if (!target.dataSource) {
    throw new Error('데이터소스 테이블 바인딩이 없습니다.')
  }

  const storedSql = target.dataSourceSchema?.sql?.trim()
  const tableName = target.dataSource.includes('.')
    ? target.dataSource
    : `\`${target.dataSource}\``
  const sql = appendLimit(
    storedSql || `SELECT * FROM ${tableName}`,
    limit,
  )
  const pathParts = target.dataSource.split('.').filter(Boolean)
  const datasource = target.dataSourceSchema?.datasource?.trim()
    || (pathParts.length === 3 ? pathParts[0] : '')
  if (!datasource) {
    throw new Error('원본 데이터를 조회할 실행 데이터소스가 없습니다.')
  }

  return { sql, datasource }
}

export function projectText2SqlNodeData(
  target: OntologyNodeDataTarget,
  response: DirectSqlResponse,
): OntologyNodeDataResult {
  const columns = response.columns.map(String)
  const projection = projectNodeData(columns, response.rows)
  return {
    nodeId: target.id,
    nodeName: target.name,
    layer: target.layer,
    unit: target.unit,
    hasDataSource: true,
    dataSource: target.dataSource ?? undefined,
    isObjectType: false,
    columns,
    rows: projection.rows,
    rowCount: projection.rows.length,
    timeColumns: projection.timeColumns,
    numericColumns: projection.numericColumns,
    chartRecommendation: projection.chartRecommendation,
  }
}
