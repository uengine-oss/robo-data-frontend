import { computed, onScopeDispose, ref } from 'vue'
import {
  text2sqlApi,
  type Text2SqlMetaObjectType,
  type Text2SqlTableInfo,
} from '@/domains/text2sql'

export const OBJECT_TYPE_SOURCE = '__ontology__'

export interface NodeDataSourceCatalogTable {
  name: string
  schema: string
  datasource: string
  executionDatasource: string
  fullName: string
  columnCount: number
  materializedView?: string
  sourceKind: 'table' | 'object-type'
}

export type NodeDataSourceCatalogStage =
  | 'datasources'
  | 'schemas'
  | 'tables'
  | 'object-types'

export interface NodeDataSourceCatalogError {
  stage: NodeDataSourceCatalogStage
  message: string
}

export type NodeDataSourceCatalogClient = Pick<
  typeof text2sqlApi,
  'getDatasources' | 'getDatasourceSchemas' | 'getSchemaTables' | 'getMetaObjectTypes'
>

const STAGE_LABELS: Record<NodeDataSourceCatalogStage, string> = {
  datasources: '데이터소스 목록',
  schemas: '스키마 목록',
  tables: '테이블 목록',
  'object-types': 'ObjectType 목록',
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return '알 수 없는 오류'
}

export function projectPhysicalCatalogTables(
  tables: Text2SqlTableInfo[],
  requestedDatasource: string,
): NodeDataSourceCatalogTable[] {
  return tables.map(table => {
    const schema = table.schema || 'public'
    const datasource = table.datasource || requestedDatasource
    const qualifiedName = datasource
      ? [datasource, schema, table.name]
      : schema !== 'public'
        ? [schema, table.name]
        : [table.name]

    return {
      name: table.name,
      schema,
      datasource,
      executionDatasource: requestedDatasource,
      fullName: qualifiedName.map(quoteIdentifier).join('.'),
      columnCount: table.column_count || 0,
      sourceKind: 'table',
    }
  })
}

export function projectObjectTypeCatalogTables(
  objectTypes: Text2SqlMetaObjectType[],
  executionDatasource: string,
): NodeDataSourceCatalogTable[] {
  return objectTypes.map(objectType => {
    const materializedView = objectType.materialized_view || objectType.name
    return {
      name: objectType.name,
      schema: objectType.schema || 'dw',
      datasource: executionDatasource,
      executionDatasource,
      fullName: quoteIdentifier(materializedView),
      columnCount: objectType.column_count || 0,
      materializedView,
      sourceKind: 'object-type',
    }
  })
}

export function useNodeDataSourceCatalog(
  client: NodeDataSourceCatalogClient = text2sqlApi,
) {
  const availableDatasources = ref<string[]>([])
  const availableSchemas = ref<string[]>([])
  const availableTables = ref<NodeDataSourceCatalogTable[]>([])
  const searchDatasource = ref('')
  const manualSource = ref('')
  const objectTypeDatasource = ref('')
  const selectedSchema = ref('')
  const tableSearchQuery = ref('')
  const loading = ref(false)
  const loadError = ref<NodeDataSourceCatalogError | null>(null)
  let requestGeneration = 0

  const filteredTables = computed(() => {
    const query = tableSearchQuery.value.trim().toLowerCase()
    if (!query) return availableTables.value
    return availableTables.value.filter(table =>
      table.name.toLowerCase().includes(query)
      || table.fullName.toLowerCase().includes(query)
      || table.datasource.toLowerCase().includes(query)
      || table.schema.toLowerCase().includes(query),
    )
  })

  function beginLoad(): number {
    requestGeneration += 1
    loading.value = true
    loadError.value = null
    return requestGeneration
  }

  function isCurrent(generation: number): boolean {
    return generation === requestGeneration
  }

  function fail(
    generation: number,
    stage: NodeDataSourceCatalogStage,
    error: unknown,
  ): void {
    if (!isCurrent(generation)) return
    loadError.value = {
      stage,
      message: `${STAGE_LABELS[stage]}을 불러오지 못했습니다: ${errorMessage(error)}`,
    }
  }

  function finish(generation: number): void {
    if (isCurrent(generation)) loading.value = false
  }

  async function loadDatasources(): Promise<void> {
    const generation = beginLoad()
    availableDatasources.value = []
    availableSchemas.value = []
    availableTables.value = []
    searchDatasource.value = ''
    manualSource.value = ''
    objectTypeDatasource.value = ''
    selectedSchema.value = ''

    try {
      const datasources = await client.getDatasources()
      if (!isCurrent(generation)) return
      availableDatasources.value = datasources
      if (datasources.length === 1) {
        const [datasource] = datasources
        searchDatasource.value = datasource
        manualSource.value = datasource
        objectTypeDatasource.value = datasource
        await loadSchemasForDatasource(datasource)
      }
    } catch (error) {
      fail(generation, 'datasources', error)
    } finally {
      finish(generation)
    }
  }

  async function loadSchemasForDatasource(source: string): Promise<void> {
    requestGeneration += 1
    manualSource.value = source
    selectedSchema.value = ''
    availableSchemas.value = []
    availableTables.value = []
    loadError.value = null

    if (!source) {
      loading.value = false
      return
    }

    if (source === OBJECT_TYPE_SOURCE) {
      if (!objectTypeDatasource.value && availableDatasources.value.length === 1) {
        objectTypeDatasource.value = availableDatasources.value[0]
      }
      if (objectTypeDatasource.value) {
        await loadObjectTypes(objectTypeDatasource.value)
      } else {
        loading.value = false
      }
      return
    }

    const generation = beginLoad()
    try {
      const schemas = await client.getDatasourceSchemas(source)
      if (isCurrent(generation)) availableSchemas.value = schemas
    } catch (error) {
      fail(generation, 'schemas', error)
    } finally {
      finish(generation)
    }
  }

  async function loadTablesForSchema(datasource: string, schema: string): Promise<void> {
    requestGeneration += 1
    selectedSchema.value = schema
    availableTables.value = []
    loadError.value = null
    if (!datasource || !schema || datasource === OBJECT_TYPE_SOURCE) {
      loading.value = false
      return
    }

    const generation = beginLoad()
    try {
      const tables = await client.getSchemaTables(datasource, schema, 500)
      if (isCurrent(generation)) {
        availableTables.value = projectPhysicalCatalogTables(tables, datasource)
      }
    } catch (error) {
      fail(generation, 'tables', error)
    } finally {
      finish(generation)
    }
  }

  async function loadObjectTypes(datasource: string): Promise<void> {
    requestGeneration += 1
    objectTypeDatasource.value = datasource
    availableTables.value = []
    loadError.value = null
    if (!datasource) {
      loading.value = false
      return
    }

    const generation = beginLoad()
    try {
      const objectTypes = await client.getMetaObjectTypes(datasource, 500)
      if (isCurrent(generation)) {
        availableTables.value = projectObjectTypeCatalogTables(objectTypes, datasource)
      }
    } catch (error) {
      fail(generation, 'object-types', error)
    } finally {
      finish(generation)
    }
  }

  async function retry(): Promise<void> {
    switch (loadError.value?.stage) {
      case 'datasources':
        await loadDatasources()
        break
      case 'schemas':
        await loadSchemasForDatasource(manualSource.value)
        break
      case 'tables':
        await loadTablesForSchema(manualSource.value, selectedSchema.value)
        break
      case 'object-types':
        await loadObjectTypes(objectTypeDatasource.value)
        break
    }
  }

  onScopeDispose(() => {
    requestGeneration += 1
  })

  return {
    availableDatasources,
    availableSchemas,
    availableTables,
    searchDatasource,
    manualSource,
    objectTypeDatasource,
    selectedSchema,
    tableSearchQuery,
    loading,
    loadError,
    filteredTables,
    loadDatasources,
    loadSchemasForDatasource,
    loadTablesForSchema,
    loadObjectTypes,
    retry,
  }
}
