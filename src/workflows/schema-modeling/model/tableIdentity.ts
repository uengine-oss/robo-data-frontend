export interface SchemaTableIdentity {
  name: string
  schema: string
  datasource: string
}

export interface SchemaTableIdentityInput {
  name: string
  schema?: string
  datasource?: string
}

export type TableIdentityResolution<T> =
  | { status: 'found'; value: T }
  | { status: 'missing' }
  | { status: 'ambiguous'; candidates: T[] }

export function normalizeTableIdentity(table: SchemaTableIdentityInput): SchemaTableIdentity {
  return {
    name: String(table.name || '').trim(),
    schema: String(table.schema || 'public').trim() || 'public',
    datasource: String(table.datasource || '').trim(),
  }
}

export function tableIdentityKey(table: SchemaTableIdentityInput): string {
  const identity = normalizeTableIdentity(table)
  return JSON.stringify([identity.datasource, identity.schema, identity.name])
}

export function tableNodeId(table: SchemaTableIdentityInput): string {
  return `table-${encodeURIComponent(tableIdentityKey(table))}`
}

export function sameTableIdentity(
  left: SchemaTableIdentityInput,
  right: SchemaTableIdentityInput,
): boolean {
  return tableIdentityKey(left) === tableIdentityKey(right)
}

export function resolveTableIdentity<T extends SchemaTableIdentityInput>(
  tables: readonly T[],
  selector: SchemaTableIdentityInput,
): TableIdentityResolution<T> {
  const identity = normalizeTableIdentity(selector)
  const candidates = tables.filter(table => {
    const candidate = normalizeTableIdentity(table)
    return candidate.name === identity.name
      && candidate.schema === identity.schema
      && candidate.datasource === identity.datasource
  })
  if (candidates.length === 1) return { status: 'found', value: candidates[0] }
  if (candidates.length === 0) return { status: 'missing' }
  return { status: 'ambiguous', candidates }
}

export function resolveRelationshipTable<T extends SchemaTableIdentityInput>(
  tables: readonly T[],
  tableName: string,
  schema?: string,
): TableIdentityResolution<T> {
  const normalizedName = tableName.trim()
  const normalizedSchema = String(schema || '').trim()
  const candidates = tables.filter(table => {
    const identity = normalizeTableIdentity(table)
    return identity.name === normalizedName
      && (!normalizedSchema || identity.schema === normalizedSchema)
  })
  if (candidates.length === 1) return { status: 'found', value: candidates[0] }
  if (candidates.length === 0) return { status: 'missing' }
  return { status: 'ambiguous', candidates }
}

/**
 * Catalog의 column endpoint는 schema가 비어 있거나 `public`이면 schema를 무시하고
 * name/FQN으로 조회한다. 이 경우 같은 이름이 둘 이상이면 프론트가 정답을 판정할 수 없다.
 * non-public schema도 datasource를 받지 않으므로 같은 schema/name이 여러 datasource에
 * 걸쳐 존재하면 똑같이 모호하다.
 */
export function isCatalogColumnLookupAmbiguous(
  tables: readonly SchemaTableIdentityInput[],
  table: SchemaTableIdentityInput,
): boolean {
  const identity = normalizeTableIdentity(table)
  const candidates = tables.filter(candidate => {
    const normalized = normalizeTableIdentity(candidate)
    if (normalized.name !== identity.name) return false
    return identity.schema === 'public' || normalized.schema === identity.schema
  })
  return new Set(candidates.map(tableIdentityKey)).size > 1
}

export function tableIdentityLabel(
  table: SchemaTableIdentityInput,
  includeDatasource = true,
): string {
  const identity = normalizeTableIdentity(table)
  const qualifiedName = `${identity.schema}.${identity.name}`
  return includeDatasource && identity.datasource
    ? `${identity.datasource} / ${qualifiedName}`
    : qualifiedName
}
