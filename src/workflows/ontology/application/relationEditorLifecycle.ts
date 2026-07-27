import type { LocalGraphRelationship } from '../model/localGraphMutation'
import type { FieldMappingColumnState } from '../model/relationFieldMapping'

export interface OntologyRelationEditorNode {
  id: string
  dataSource?: string
  dataSourceSchema?: unknown
}

export interface OntologyRelationEditorForm {
  type: string
  description: string
  fromField: string
  toField: string
}

export interface OntologyRelationEditorTarget {
  id: string
  source: string
  target: string
}

export interface OntologyRelationColumnState extends FieldMappingColumnState {
  columns: string[]
}

export function normalizeRelationColumnNames(columns: unknown): string[] {
  if (!Array.isArray(columns)) return []
  return Array.from(new Set(columns
    .map(column => {
      if (typeof column === 'string') return column.trim()
      if (typeof column === 'object' && column !== null && 'name' in column) {
        return typeof column.name === 'string' ? column.name.trim() : ''
      }
      return ''
    })
    .filter((column): column is string => column.length > 0)))
}

export function readInlineRelationColumns(dataSourceSchema: unknown): string[] | null {
  if (
    typeof dataSourceSchema !== 'object'
    || dataSourceSchema === null
    || !('columns' in dataSourceSchema)
    || !Array.isArray(dataSourceSchema.columns)
  ) {
    return null
  }
  return normalizeRelationColumnNames(dataSourceSchema.columns)
}

export function resolveRelationEditorRelationship<
  TRelationship extends LocalGraphRelationship,
>(
  relationships: readonly TRelationship[],
  edgeId: string,
): TRelationship | null {
  const exact = relationships.find(relationship => relationship.id === edgeId)
  if (exact) return { ...exact }

  const composite = relationships.find(
    relationship =>
      `${relationship.source}-${relationship.type}-${relationship.target}` === edgeId,
  )
  return composite ? { ...composite } : null
}

export function createRelationEditorForm(
  relationship: LocalGraphRelationship,
): OntologyRelationEditorForm {
  return {
    type: relationship.type,
    description: relationship.description || '',
    fromField: relationship.fromField || '',
    toField: relationship.toField || '',
  }
}

function projectVerifiedField(
  field: string,
  state: OntologyRelationColumnState,
): string {
  if (state.status !== 'ready') return field
  return state.columns.includes(field) ? field : ''
}

export function projectRelationEditorFormAfterColumnLoad(
  form: OntologyRelationEditorForm,
  source: OntologyRelationColumnState,
  target: OntologyRelationColumnState,
): OntologyRelationEditorForm {
  return {
    ...form,
    fromField: projectVerifiedField(form.fromField, source),
    toField: projectVerifiedField(form.toField, target),
  }
}

export function relationEditorTarget(
  relationship: LocalGraphRelationship,
): OntologyRelationEditorTarget {
  return {
    id: relationship.id,
    source: relationship.source,
    target: relationship.target,
  }
}
