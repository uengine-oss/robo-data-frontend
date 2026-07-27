import { ref } from 'vue'
import type {
  OntologyDataSourceCatalogResponse,
  OntologyDataSourceTable,
} from '../api/schema'

export interface OntologyDataSourceCatalogClient {
  getAvailableDataSources(): Promise<OntologyDataSourceCatalogResponse>
}

export type OntologyDataSourceCatalogResult =
  | { status: 'success'; value: OntologyDataSourceTable[] }
  | { status: 'failure'; error: string }
  | { status: 'ignored' }

function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : '알 수 없는 오류'
}

export function useOntologyDataSourceCatalog(
  client: OntologyDataSourceCatalogClient,
) {
  const tables = ref<OntologyDataSourceTable[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<OntologyDataSourceCatalogResult> {
    if (loading.value) return { status: 'ignored' }
    loading.value = true
    error.value = null
    try {
      const response = await client.getAvailableDataSources()
      tables.value = [...response.tables]
      return { status: 'success', value: tables.value }
    } catch (cause) {
      error.value = errorMessage(cause)
      return { status: 'failure', error: error.value }
    } finally {
      loading.value = false
    }
  }

  return {
    tables,
    loading,
    error,
    refresh,
  }
}
