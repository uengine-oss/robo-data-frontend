import type {
  OlapCubeMetadata,
  OlapDesignerDimension,
  OlapDesignerMeasure,
} from '../model/contracts'

export interface CubeEditorDraft {
  cubeName: string
  factTable: string
  schema?: string
  includeIncompleteEntries?: boolean
  dimensions: OlapDesignerDimension[]
  measures: OlapDesignerMeasure[]
}

export function createCubeEditorDraft(
  cubeName: string,
  metadata: OlapCubeMetadata | null,
  idSeed = Date.now(),
): CubeEditorDraft {
  if (!metadata) {
    return { cubeName, factTable: '', dimensions: [], measures: [] }
  }

  return {
    cubeName,
    factTable: metadata.fact_table || '',
    dimensions: metadata.dimensions.map((dimension, dimensionIndex) => ({
      id: idSeed + dimensionIndex,
      name: dimension.name || '',
      table: dimension.table || '',
      foreignKey: dimension.foreign_key || '',
      levels: dimension.levels.map((level, levelIndex) => ({
        id: idSeed + dimensionIndex * 100 + levelIndex,
        name: level.name || '',
        column: level.column || '',
      })),
    })),
    measures: metadata.measures.map((measure, measureIndex) => ({
      id: idSeed + measureIndex,
      name: measure.name || '',
      column: measure.column || '',
      aggregator: measure.agg.toLowerCase(),
    })),
  }
}

function xmlAttribute(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function unqualifiedTableName(tableName: string): string {
  return tableName.split('.').pop() ?? tableName
}

export function generateMondrianSchemaXml(draft: CubeEditorDraft): string {
  const cubeName = xmlAttribute(draft.cubeName)
  const schema = xmlAttribute(draft.schema || 'dw')
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Schema name="${cubeName}Schema">`,
    `  <Cube name="${cubeName}">`,
    `    <Table name="${xmlAttribute(unqualifiedTableName(draft.factTable))}" schema="${schema}"/>`,
  ]

  for (const dimension of draft.dimensions) {
    if (!draft.includeIncompleteEntries && (!dimension.name || !dimension.table)) continue
    const foreignKey = draft.includeIncompleteEntries
      ? dimension.foreignKey
      : dimension.foreignKey || `${dimension.name.toLowerCase()}_id`
    lines.push(
      `    <Dimension name="${xmlAttribute(dimension.name)}" foreignKey="${xmlAttribute(foreignKey)}">`,
      '      <Hierarchy hasAll="true" primaryKey="id">',
      `        <Table name="${xmlAttribute(unqualifiedTableName(dimension.table))}" schema="${schema}"/>`,
    )
    for (const level of dimension.levels) {
      if (!draft.includeIncompleteEntries && (!level.name || !level.column)) continue
      lines.push(
        `        <Level name="${xmlAttribute(level.name)}" column="${xmlAttribute(level.column)}"/>`,
      )
    }
    lines.push('      </Hierarchy>', '    </Dimension>')
  }

  for (const measure of draft.measures) {
    if (!draft.includeIncompleteEntries && (!measure.name || !measure.column)) continue
    lines.push(
      `    <Measure name="${xmlAttribute(measure.name)}" column="${xmlAttribute(measure.column)}" aggregator="${xmlAttribute(measure.aggregator)}"/>`,
    )
  }

  lines.push('  </Cube>', '</Schema>')
  return lines.join('\n')
}
