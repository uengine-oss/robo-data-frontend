import type {
  EtlConfig,
  EtlMapping,
  OlapAiSuggestion,
  OlapDesignerDimension,
} from '../model/contracts'

export interface EtlConfigDraftInput {
  cubeName: string
  factTable: string
  dwSchema: string
  dimensions: OlapDesignerDimension[]
  suggestion: OlapAiSuggestion | null
}

function cleanSourceName(source: string): string {
  return source.replace(/^\./, '')
}

function splitMappingPath(path: string): { table: string; column: string } {
  const parts = cleanSourceName(path).split('.')
  return {
    table: parts.length >= 2 ? parts[0] : '',
    column: parts.length >= 2 ? parts.slice(1).join('.') : parts[0] || '',
  }
}

function splitDimensionMappingPath(path: string): { table: string; column: string } {
  const parts = path.split('.')
  return {
    table: parts[0] || '',
    column: parts.slice(1).join('.') || parts[0] || '',
  }
}

export function buildEtlConfig(input: EtlConfigDraftInput): EtlConfig {
  const suggestion: OlapAiSuggestion = input.suggestion || {}
  const allSourceTables = new Set<string>(suggestion.fact_sources || [])

  for (const sources of Object.values(suggestion.dimension_sources || {})) {
    for (const source of sources) {
      const cleaned = cleanSourceName(source)
      if (cleaned) allSourceTables.add(cleaned)
    }
  }
  for (const dimension of input.dimensions) {
    if (!dimension.sourceTable) continue
    const cleaned = cleanSourceName(dimension.sourceTable)
    if (cleaned) allSourceTables.add(cleaned)
  }

  const mappings: EtlMapping[] = []
  for (const mapping of suggestion.suggested_mappings || suggestion.fact_mappings || []) {
    const source = splitMappingPath(mapping.source || '')
    const target = splitMappingPath(mapping.target || '')
    if (!source.table || !source.column || !target.table || !target.column) continue
    mappings.push({
      source_table: source.table,
      source_column: source.column,
      target_table: target.table,
      target_column: target.column,
      transformation: mapping.transformation || '',
    })
  }

  for (const dimension of suggestion.dimensions || []) {
    const dimensionName = (dimension.name || '').replace(/[^a-zA-Z0-9_]/g, '') || 'dim_unknown'
    const sourceTable = dimension.source_table || ''
    const columnMappings = dimension.column_mappings || []
    if (columnMappings.length > 0) {
      for (const mapping of columnMappings) {
        const source = splitDimensionMappingPath(mapping.source || '')
        const target = splitDimensionMappingPath(mapping.target || '')
        mappings.push({
          source_table: source.table || sourceTable,
          source_column: source.column,
          target_table: target.table || dimensionName,
          target_column: target.column,
          transformation: mapping.transformation || '',
        })
      }
      continue
    }

    const sourceColumns = dimension.source_columns || []
    const targetColumns = dimension.target_columns || []
    sourceColumns.forEach((sourceColumn, index) => {
      const targetColumn = targetColumns[index] || sourceColumn
      if (!sourceColumn || !targetColumn) return
      mappings.push({
        source_table: sourceTable,
        source_column: sourceColumn,
        target_table: dimensionName,
        target_column: targetColumn,
        transformation: '',
      })
    })
  }

  if (mappings.length === 0) {
    for (const dimension of input.dimensions) {
      if (!dimension.sourceTable || !dimension.foreignKey) continue
      mappings.push({
        source_table: cleanSourceName(dimension.sourceTable),
        source_column: dimension.foreignKey,
        target_table: dimension.table.split('.').pop() || dimension.name,
        target_column: dimension.foreignKey,
        transformation: '',
      })
    }
  }

  return {
    cube_name: input.cubeName,
    fact_table: input.factTable,
    dimension_tables: input.dimensions.map(dimension => dimension.table).filter(Boolean),
    source_tables: Array.from(allSourceTables),
    mappings,
    dw_schema: input.dwSchema,
    sync_mode: suggestion.sync_strategy || 'full',
    incremental_column: suggestion.incremental_column || null,
  }
}
