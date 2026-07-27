import type { SchemaListItem } from '../api/schema'

export interface OntologyLibraryEntry {
  id: string
  name: string
  domain?: string
  description?: string
  version?: number
  nodeCount: number
  updatedAt?: string
  hasSchemaJson: true
}

export interface OntologyLibraryProjection {
  entries: OntologyLibraryEntry[]
  excludedWithoutSchemaJson: number
  recentSchemaId: string | null
}

function updatedTimestamp(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

export function projectOntologyLibrary(
  schemas: SchemaListItem[],
  recentIds: string[],
): OntologyLibraryProjection {
  const validSchemas = schemas.filter(
    (schema): schema is SchemaListItem & { hasSchemaJson: true } =>
      schema.hasSchemaJson === true,
  )
  const normalizedRecentIds = [...new Set(recentIds)]
  const recentOrder = new Map(normalizedRecentIds.map((id, index) => [id, index]))
  const entries = validSchemas.map(schema => ({
    id: schema.id,
    name: schema.name,
    domain: schema.domain,
    description: schema.description,
    version: schema.version,
    nodeCount: schema.nodeCount ?? 0,
    updatedAt: schema.updatedAt,
    hasSchemaJson: true as const,
  }))

  entries.sort((left, right) => {
    const leftRecent = recentOrder.get(left.id)
    const rightRecent = recentOrder.get(right.id)
    if (leftRecent !== undefined && rightRecent !== undefined) {
      return leftRecent - rightRecent
    }
    if (leftRecent !== undefined) return -1
    if (rightRecent !== undefined) return 1
    return updatedTimestamp(right.updatedAt) - updatedTimestamp(left.updatedAt)
  })
  const entryIds = new Set(entries.map(schema => schema.id))

  return {
    entries,
    excludedWithoutSchemaJson: schemas.length - validSchemas.length,
    recentSchemaId: normalizedRecentIds.find(id => entryIds.has(id)) ?? null,
  }
}
