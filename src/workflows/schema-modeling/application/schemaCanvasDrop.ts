import {
  parseOntologyBehaviorList,
  type OntologyBehavior,
} from '@/domains/ontology'
import type {
  SchemaModelingColumn,
  SchemaModelingTable,
} from './schemaCatalogDiscovery'

export interface SchemaCanvasDropOptions {
  autoLoadRelated: false
  isPrimary: true
  columns: SchemaModelingColumn[]
  isObjectType: true
  behaviors: OntologyBehavior[]
}

export interface SchemaCanvasDropTarget {
  table: SchemaModelingTable
  options?: SchemaCanvasDropOptions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredIdentity(
  value: unknown,
  contract: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${contract}가 비어 있거나 문자열이 아닙니다.`)
  }
  return value.trim()
}

function optionalString(
  value: unknown,
  contract: string,
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${contract}가 문자열이 아닙니다.`)
  }
  return value
}

function parseColumnCount(
  value: unknown,
  contract: string,
): number {
  if (value === undefined) return 0
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
  ) {
    throw new Error(`${contract}가 0 이상의 유한한 숫자가 아닙니다.`)
  }
  return value
}

function parseDescriptionSource(
  value: unknown,
): SchemaModelingTable['description_source'] {
  if (value === undefined) return undefined
  if (
    value === ''
    || value === 'ddl'
    || value === 'procedure'
    || value === 'user'
    || value === 'code'
  ) {
    return value
  }
  throw new Error('드래그 테이블 description_source가 올바르지 않습니다.')
}

function parseTable(
  value: unknown,
  defaultSchema = 'public',
): SchemaModelingTable {
  if (!isRecord(value)) {
    throw new Error('드래그 테이블 구조가 객체가 아닙니다.')
  }

  return {
    name: requiredIdentity(value.name, '드래그 테이블 name'),
    schema: value.schema === undefined
      ? defaultSchema
      : requiredIdentity(value.schema, '드래그 테이블 schema'),
    datasource: optionalString(
      value.datasource,
      '드래그 테이블 datasource',
    ),
    logical_name: optionalString(
      value.logical_name,
      '드래그 테이블 logical_name',
    ),
    description: optionalString(
      value.description,
      '드래그 테이블 description',
    ) ?? '',
    description_source: parseDescriptionSource(value.description_source),
    analyzed_description: optionalString(
      value.analyzed_description,
      '드래그 테이블 analyzed_description',
    ),
    column_count: parseColumnCount(
      value.column_count,
      '드래그 테이블 column_count',
    ),
  }
}

function parseObjectTypeColumns(
  value: unknown,
  tableName: string,
): SchemaModelingColumn[] {
  if (!Array.isArray(value)) {
    throw new Error('ObjectType 드래그 columns가 배열이 아닙니다.')
  }

  return value.map((item, index) => {
    const contract = `ObjectType 드래그 columns[${index}]`
    if (!isRecord(item)) {
      throw new Error(`${contract} 구조가 객체가 아닙니다.`)
    }
    if (item.nullable !== undefined && typeof item.nullable !== 'boolean') {
      throw new Error(`${contract}.nullable이 boolean이 아닙니다.`)
    }

    return {
      name: requiredIdentity(item.name, `${contract}.name`),
      table_name: item.table_name === undefined
        ? tableName
        : requiredIdentity(item.table_name, `${contract}.table_name`),
      dtype: optionalString(item.dtype, `${contract}.dtype`) || 'string',
      nullable: item.nullable ?? true,
      logical_name: optionalString(
        item.logical_name,
        `${contract}.logical_name`,
      ),
      description: optionalString(
        item.description,
        `${contract}.description`,
      ) ?? '',
      description_source: parseDescriptionSource(item.description_source),
      analyzed_description: optionalString(
        item.analyzed_description,
        `${contract}.analyzed_description`,
      ),
    }
  })
}

function isObjectTypePayload(value: Record<string, unknown>): boolean {
  return (
    value._isObjectType === true
    || value.isObjectType === true
    || value.schema === 'ObjectType'
  )
}

function parseDropValue(value: unknown): SchemaCanvasDropTarget {
  if (!isRecord(value)) {
    throw new Error('드래그 데이터가 객체가 아닙니다.')
  }

  const candidate = value.table === undefined ? value : value.table
  if (!isRecord(candidate)) {
    throw new Error('드래그 데이터의 table 구조가 객체가 아닙니다.')
  }

  if (!isObjectTypePayload(candidate)) {
    return { table: parseTable(candidate) }
  }

  const table = parseTable(candidate, 'ObjectType')
  const columnValue = candidate._columns ?? candidate.columns ?? []
  const behaviorValue = candidate.behaviors ?? []

  return {
    table: {
      ...table,
      schema: 'ObjectType',
    },
    options: {
      autoLoadRelated: false,
      isPrimary: true,
      columns: parseObjectTypeColumns(columnValue, table.name),
      isObjectType: true,
      behaviors: parseOntologyBehaviorList(
        behaviorValue,
        'ObjectType 드래그 behaviors',
      ),
    },
  }
}

export function parseSchemaCanvasDropPayload(
  serialized: string,
): SchemaCanvasDropTarget {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('드래그 데이터가 올바른 JSON이 아닙니다.')
  }
  return parseDropValue(value)
}

export function cloneSchemaCanvasDropTarget(
  target: SchemaCanvasDropTarget,
): SchemaCanvasDropTarget {
  return {
    table: {
      ...target.table,
    },
    options: target.options
      ? {
          ...target.options,
          columns: target.options.columns.map(column => ({ ...column })),
          behaviors: target.options.behaviors.map(behavior => ({
            ...behavior,
            config: behavior.config
              ? {
                  ...behavior.config,
                  parameters: behavior.config.parameters
                    ? { ...behavior.config.parameters }
                    : undefined,
                }
              : undefined,
            inputFields: behavior.inputFields
              ? [...behavior.inputFields]
              : undefined,
          })),
        }
      : undefined,
  }
}
