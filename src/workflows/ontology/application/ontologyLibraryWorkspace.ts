import type {
  OntologyLibraryEntry,
  OntologySchemaLifecycleError,
} from '@/domains/ontology'

export interface OntologyLibraryDeleteTarget {
  id: string
  name: string
}

export interface OntologyLibraryApplicationRetry<Schema> {
  schemaId: string
  schema: Schema
}

export function createOntologyLibraryDeleteTarget(
  schema: Pick<OntologyLibraryEntry, 'id' | 'name'>,
): OntologyLibraryDeleteTarget {
  return {
    id: schema.id,
    name: schema.name,
  }
}

export function projectRenamedOntologyLibraryEntries(
  entries: readonly OntologyLibraryEntry[],
  schemaId: string,
  name: string,
): OntologyLibraryEntry[] {
  return entries.map(entry =>
    entry.id === schemaId ? { ...entry, name } : { ...entry })
}

export function createOntologyLibraryApplicationRetry<Schema>(
  schemaId: string,
  schema: Schema,
): OntologyLibraryApplicationRetry<Schema> {
  return {
    schemaId,
    schema: structuredClone(schema),
  }
}

export function ontologyLibraryListFailureMessage(
  cause: unknown,
  retainedEntryCount: number,
): string {
  const message = cause instanceof Error && cause.message.trim()
    ? cause.message
    : '알 수 없는 오류'
  const retained = retainedEntryCount > 0
    ? ' 이전에 불러온 목록을 유지합니다.'
    : ''
  return `온톨로지 목록을 불러오지 못했습니다: ${message}${retained}`
}

export function ontologyLibraryLoadFailureMessage(
  applicationError: string | null,
  loadError: OntologySchemaLifecycleError | null,
): string | null {
  if (applicationError) {
    return `온톨로지 데이터를 화면에 적용하지 못했습니다: ${applicationError}`
  }
  if (!loadError) return null
  if (loadError.stage === 'detail' && loadError.activationCompleted) {
    return `서버 활성화는 완료됐지만 온톨로지 상세 데이터를 불러오지 못했습니다. 기존 화면을 유지합니다: ${loadError.message}`
  }
  return `온톨로지를 활성화하지 못했습니다. 기존 화면을 유지합니다: ${loadError.message}`
}
