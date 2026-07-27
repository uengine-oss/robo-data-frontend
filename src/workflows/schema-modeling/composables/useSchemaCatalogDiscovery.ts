import { onScopeDispose, ref } from 'vue'
import {
  catalogSchemaApi,
  type CatalogSchemaRequestContext,
  type CatalogSemanticSearchResult,
  type RoboSchemaColumnInfo,
  type RoboSchemaTableInfo,
} from '@/domains/catalog'
import {
  isCatalogColumnLookupAmbiguous,
  normalizeTableIdentity,
  resolveRelationshipTable,
  resolveTableIdentity,
  tableIdentityKey,
  tableIdentityLabel,
  type SchemaTableIdentityInput,
} from '../model/tableIdentity'
import {
  projectSchemaCatalogColumns,
  projectSchemaCatalogTables,
  type SchemaColumnFailure,
  type SchemaModelingColumn,
  type SchemaModelingTable,
} from '../application/schemaCatalogDiscovery'

interface SchemaCatalogDiscoveryDependencies {
  getTables: (signal: AbortSignal) => Promise<RoboSchemaTableInfo[]>
  semanticSearch: (
    query: string,
    signal: AbortSignal,
  ) => Promise<CatalogSemanticSearchResult[]>
  getColumns: (
    tableName: string,
    schema: string,
    signal: AbortSignal,
  ) => Promise<RoboSchemaColumnInfo[]>
}

interface UseSchemaCatalogDiscoveryInput {
  context: (
    requireApiKey: boolean,
    signal: AbortSignal,
  ) => CatalogSchemaRequestContext
  dependencies?: Partial<SchemaCatalogDiscoveryDependencies>
}

interface InFlightColumnRequest {
  controller: AbortController
  promise: Promise<SchemaModelingColumn[]>
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

export function useSchemaCatalogDiscovery(input: UseSchemaCatalogDiscoveryInput) {
  const dependencies: SchemaCatalogDiscoveryDependencies = {
    getTables: signal => catalogSchemaApi.getTables(
      { limit: 1000 },
      input.context(false, signal),
    ),
    semanticSearch: (query, signal) => catalogSchemaApi.semanticSearch(
      query,
      { limit: 10 },
      input.context(true, signal),
    ),
    getColumns: (tableName, schema, signal) => catalogSchemaApi.getTableColumns(
      tableName,
      { schema },
      input.context(false, signal),
    ),
    ...input.dependencies,
  }

  const allTables = ref<SchemaModelingTable[]>([])
  const tableListLoading = ref(false)
  const tableListError = ref<string | null>(null)

  const semanticSearchLoading = ref(false)
  const semanticSearchResults = ref<CatalogSemanticSearchResult[]>([])
  const semanticSearchError = ref<string | null>(null)
  const failedSemanticQuery = ref<string | null>(null)

  const tableColumnsCache = ref<Record<string, SchemaModelingColumn[]>>({})
  const tableColumnErrors = ref<Record<string, string>>({})
  const lastTableColumnError = ref<SchemaColumnFailure | null>(null)

  let tableListSequence = 0
  let tableListController: AbortController | null = null
  let semanticSequence = 0
  let semanticController: AbortController | null = null
  const columnRequests = new Map<string, InFlightColumnRequest>()

  async function loadAllTables() {
    const sequence = ++tableListSequence
    tableListController?.abort()
    const controller = new AbortController()
    tableListController = controller
    tableListLoading.value = true
    tableListError.value = null
    try {
      const tables = await dependencies.getTables(controller.signal)
      if (sequence !== tableListSequence || controller.signal.aborted) return
      allTables.value = projectSchemaCatalogTables(tables)
    } catch (cause: unknown) {
      if (sequence !== tableListSequence || controller.signal.aborted || isAbortError(cause)) return
      tableListError.value = errorMessage(
        cause,
        '테이블 목록을 불러오지 못했습니다.',
      )
    } finally {
      if (sequence === tableListSequence) {
        tableListLoading.value = false
        tableListController = null
      }
    }
  }

  async function performSemanticSearch(query: string) {
    const target = query.trim()
    if (target.length < 2) {
      clearSemanticSearch()
      return
    }
    const sequence = ++semanticSequence
    semanticController?.abort()
    const controller = new AbortController()
    semanticController = controller
    semanticSearchLoading.value = true
    semanticSearchError.value = null
    failedSemanticQuery.value = null
    try {
      const results = await dependencies.semanticSearch(target, controller.signal)
      if (sequence !== semanticSequence || controller.signal.aborted) return
      semanticSearchResults.value = results
    } catch (cause: unknown) {
      if (sequence !== semanticSequence || controller.signal.aborted || isAbortError(cause)) return
      semanticSearchError.value = errorMessage(cause, '검색 실패')
      failedSemanticQuery.value = target
    } finally {
      if (sequence === semanticSequence) {
        semanticSearchLoading.value = false
        semanticController = null
      }
    }
  }

  async function retrySemanticSearch() {
    if (!failedSemanticQuery.value) return
    await performSemanticSearch(failedSemanticQuery.value)
  }

  function clearSemanticSearch() {
    semanticSequence += 1
    semanticController?.abort()
    semanticController = null
    semanticSearchLoading.value = false
    semanticSearchResults.value = []
    semanticSearchError.value = null
    failedSemanticQuery.value = null
  }

  function resolveColumnTableIdentity(
    tableName: string,
    schema: string,
    datasource: string,
  ): SchemaTableIdentityInput {
    const selector = normalizeTableIdentity({ name: tableName, schema, datasource })
    if (datasource) {
      const exact = resolveTableIdentity(allTables.value, selector)
      return exact.status === 'found' ? exact.value : selector
    }
    const byRelationshipIdentity = resolveRelationshipTable(
      allTables.value,
      tableName,
      schema,
    )
    if (byRelationshipIdentity.status === 'ambiguous') {
      throw new Error(
        `${tableIdentityLabel(selector, false)} 대상이 여러 데이터소스에 있어 구분할 수 없습니다.`,
      )
    }
    return byRelationshipIdentity.status === 'found'
      ? byRelationshipIdentity.value
      : selector
  }

  function getTableColumnsError(
    tableName: string,
    schema = '',
    datasource = '',
  ): string | null {
    try {
      const identity = resolveColumnTableIdentity(tableName, schema, datasource)
      return tableColumnErrors.value[tableIdentityKey(identity)] ?? null
    } catch (cause: unknown) {
      return errorMessage(cause, '테이블 identity를 구분할 수 없습니다.')
    }
  }

  function getCachedTableColumns(
    tableName: string,
    schema = '',
    datasource = '',
  ): SchemaModelingColumn[] {
    try {
      const identity = resolveColumnTableIdentity(tableName, schema, datasource)
      return tableColumnsCache.value[tableIdentityKey(identity)] || []
    } catch {
      return []
    }
  }

  function clearLastTableColumnError() {
    lastTableColumnError.value = null
  }

  function recordColumnFailure(
    identity: SchemaTableIdentityInput,
    message: string,
  ) {
    const normalized = normalizeTableIdentity(identity)
    const cacheKey = tableIdentityKey(normalized)
    tableColumnErrors.value[cacheKey] = message
    lastTableColumnError.value = {
      tableName: normalized.name,
      schema: normalized.schema,
      datasource: normalized.datasource,
      message,
    }
  }

  async function loadTableColumns(
    tableName: string,
    schema = '',
    datasource = '',
  ): Promise<SchemaModelingColumn[]> {
    let identity: SchemaTableIdentityInput
    try {
      identity = resolveColumnTableIdentity(tableName, schema, datasource)
    } catch (cause: unknown) {
      const requested = normalizeTableIdentity({ name: tableName, schema, datasource })
      recordColumnFailure(
        requested,
        errorMessage(cause, '테이블 identity를 구분할 수 없습니다.'),
      )
      throw cause
    }

    const normalized = normalizeTableIdentity(identity)
    const cacheKey = tableIdentityKey(normalized)
    if (Object.prototype.hasOwnProperty.call(tableColumnsCache.value, cacheKey)) {
      delete tableColumnErrors.value[cacheKey]
      return tableColumnsCache.value[cacheKey]
    }
    if (isCatalogColumnLookupAmbiguous(allTables.value, normalized)) {
      const message = `${tableIdentityLabel(normalized)} 컬럼은 Catalog API에서 구분할 수 없습니다.`
      recordColumnFailure(normalized, message)
      throw new Error(message)
    }

    const currentRequest = columnRequests.get(cacheKey)
    if (currentRequest) return currentRequest.promise

    const controller = new AbortController()
    const promise = (async () => {
      try {
        const response = await dependencies.getColumns(
          normalized.name,
          normalized.schema,
          controller.signal,
        )
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const columns = projectSchemaCatalogColumns(response)
        tableColumnsCache.value[cacheKey] = columns
        delete tableColumnErrors.value[cacheKey]
        if (
          lastTableColumnError.value
          && tableIdentityKey({
            name: lastTableColumnError.value.tableName,
            schema: lastTableColumnError.value.schema,
            datasource: lastTableColumnError.value.datasource,
          }) === cacheKey
        ) {
          lastTableColumnError.value = null
        }
        return columns
      } catch (cause: unknown) {
        if (!controller.signal.aborted && !isAbortError(cause)) {
          recordColumnFailure(
            normalized,
            errorMessage(cause, `${normalized.name} 컬럼을 불러오지 못했습니다.`),
          )
        }
        throw cause
      } finally {
        if (columnRequests.get(cacheKey)?.controller === controller) {
          columnRequests.delete(cacheKey)
        }
      }
    })()
    columnRequests.set(cacheKey, { controller, promise })
    return promise
  }

  function dispose() {
    tableListSequence += 1
    tableListController?.abort()
    tableListController = null
    tableListLoading.value = false
    semanticSequence += 1
    semanticController?.abort()
    semanticController = null
    semanticSearchLoading.value = false
    columnRequests.forEach(request => request.controller.abort())
    columnRequests.clear()
  }

  onScopeDispose(dispose)

  return {
    allTables,
    tableListLoading,
    tableListError,
    semanticSearchLoading,
    semanticSearchResults,
    semanticSearchError,
    failedSemanticQuery,
    tableColumnsCache,
    tableColumnErrors,
    lastTableColumnError,
    loadAllTables,
    performSemanticSearch,
    retrySemanticSearch,
    clearSemanticSearch,
    loadTableColumns,
    getCachedTableColumns,
    getTableColumnsError,
    clearLastTableColumnError,
    dispose,
  }
}
