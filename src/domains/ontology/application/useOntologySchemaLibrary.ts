import { ref } from 'vue'
import type { SchemaListResponse } from '../api/schema'
import { projectOntologyLibrary, type OntologyLibraryEntry } from '../model/schemaLibrary'

export interface OntologySchemaLibraryClient {
  listSchemas(): Promise<SchemaListResponse>
}

export type OntologySchemaLibraryRefreshResult =
  | { status: 'success'; value: OntologyLibraryEntry[] }
  | { status: 'failure'; error: string }
  | { status: 'ignored' }

function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : '알 수 없는 오류'
}

export function useOntologySchemaLibrary(client: OntologySchemaLibraryClient) {
  const schemas = ref<OntologyLibraryEntry[]>([])
  const activeSchemaId = ref<string | null>(null)
  const excludedWithoutSchemaJson = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<OntologySchemaLibraryRefreshResult> {
    if (loading.value) return { status: 'ignored' }

    loading.value = true
    error.value = null
    try {
      const response = await client.listSchemas()
      const projection = projectOntologyLibrary(response.schemas, [])
      schemas.value = projection.entries
      excludedWithoutSchemaJson.value = projection.excludedWithoutSchemaJson
      activeSchemaId.value = response.activeSchemaId
        && projection.entries.some(schema => schema.id === response.activeSchemaId)
        ? response.activeSchemaId
        : null
      return { status: 'success', value: projection.entries }
    } catch (cause) {
      error.value = errorMessage(cause)
      return { status: 'failure', error: error.value }
    } finally {
      loading.value = false
    }
  }

  function removeSchema(schemaId: string) {
    schemas.value = schemas.value.filter(schema => schema.id !== schemaId)
    if (activeSchemaId.value === schemaId) activeSchemaId.value = null
  }

  function setActiveSchemaId(schemaId: string | null) {
    activeSchemaId.value = schemaId
  }

  return {
    schemas,
    activeSchemaId,
    excludedWithoutSchemaJson,
    loading,
    error,
    refresh,
    removeSchema,
    setActiveSchemaId,
  }
}
