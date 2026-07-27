import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dataFabricApi } from '../api/index.ts'
import type {
  ConnectionTestResult,
  DataSource,
  DataSourceCategory,
  DataSourceTable,
  DataSourceTypeConfig,
  HealthCheckResult,
  TestConnectionRequest,
} from '../api/contracts.ts'
import { getAllDataSourceTypes } from '../catalog/connectors.ts'

function messageOf(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) return fallback
  return typeof error.message === 'string' && error.message ? error.message : fallback
}

export const useDatasourcesStore = defineStore('datasources', () => {
  const datasources = ref<DataSource[]>([])
  const datasourceTypes = ref<DataSourceTypeConfig[]>([])
  const selectedDatasource = ref<DataSource | null>(null)
  const tables = ref<DataSourceTable[]>([])
  const isLoadingDatasources = ref(false)
  const datasourceListError = ref<string | null>(null)
  const isLoadingTables = ref(false)
  const tableListError = ref<string | null>(null)
  const isMutating = ref(false)
  const mutationError = ref<string | null>(null)
  let datasourceRequestGeneration = 0
  let tableRequestGeneration = 0

  const hasDatasources = computed(() => datasources.value.length > 0)
  const sortedDatasources = computed(() =>
    [...datasources.value].sort((a, b) => a.name.localeCompare(b.name))
  )

  const typesByCategory = computed(() => {
    const types = datasourceTypes.value.length > 0
      ? datasourceTypes.value
      : getAllDataSourceTypes()

    const grouped: Record<DataSourceCategory, DataSourceTypeConfig[]> = {
      database: [],
      nosql: [],
      datawarehouse: [],
      api: [],
      saas: [],
      file: [],
      streaming: [],
      analytics: [],
      vector: [],
      other: [],
    }

    types.forEach((type) => {
      const group = grouped[type.category] ?? grouped.other
      group.push(type)
    })
    return grouped
  })

  const categoryLabels: Record<DataSourceCategory, string> = {
    database: '관계형 데이터베이스',
    nosql: 'NoSQL 데이터베이스',
    datawarehouse: '데이터 웨어하우스',
    api: 'API / GraphQL',
    saas: 'SaaS 플랫폼',
    file: '파일 스토리지',
    streaming: '스트리밍 / 메시지 큐',
    analytics: '분석 / 검색',
    vector: '벡터 데이터베이스',
    other: '기타',
  }

  function fetchTypes() {
    datasourceTypes.value = getAllDataSourceTypes()
  }

  async function fetchDatasources() {
    const generation = ++datasourceRequestGeneration
    isLoadingDatasources.value = true
    datasourceListError.value = null
    try {
      const response = await dataFabricApi.list()
      if (generation !== datasourceRequestGeneration) return
      datasources.value = response.datasources
    } catch (cause: unknown) {
      if (generation !== datasourceRequestGeneration) return
      datasourceListError.value = messageOf(cause, 'Failed to fetch data sources')
    } finally {
      if (generation === datasourceRequestGeneration) {
        isLoadingDatasources.value = false
      }
    }
  }

  async function checkHealth(name: string): Promise<HealthCheckResult> {
    try {
      const result = await dataFabricApi.checkHealth(name)
      const datasource = datasources.value.find((item) => item.name === name)
      if (datasource) datasource.health = result
      return result
    } catch (cause: unknown) {
      return {
        name,
        status: 'unknown',
        message: messageOf(cause, 'Health check failed'),
        db_connected: false,
        mindsdb_connected: false,
      }
    }
  }

  async function checkAllHealth() {
    await Promise.all(datasources.value.map((datasource) => checkHealth(datasource.name)))
  }

  async function createDatasource(
    name: string,
    engine: string,
    parameters: Record<string, unknown>,
  ): Promise<DataSource | null> {
    isMutating.value = true
    mutationError.value = null
    try {
      const newDatasource = await dataFabricApi.create({ name, engine, parameters })
      datasources.value.push(newDatasource)
      return newDatasource
    } catch (cause: unknown) {
      mutationError.value = messageOf(cause, 'Failed to create data source')
      return null
    } finally {
      isMutating.value = false
    }
  }

  async function deleteDatasource(name: string): Promise<boolean> {
    isMutating.value = true
    mutationError.value = null
    try {
      await dataFabricApi.delete(name)
      datasources.value = datasources.value.filter((datasource) => datasource.name !== name)
      if (selectedDatasource.value?.name === name) {
        tableRequestGeneration += 1
        selectedDatasource.value = null
        tables.value = []
        tableListError.value = null
        isLoadingTables.value = false
      }
      return true
    } catch (cause: unknown) {
      mutationError.value = messageOf(cause, 'Failed to delete data source')
      return false
    } finally {
      isMutating.value = false
    }
  }

  async function fetchTables(datasourceName: string) {
    const generation = ++tableRequestGeneration
    isLoadingTables.value = true
    tableListError.value = null
    try {
      const response = await dataFabricApi.getTables(datasourceName)
      if (
        generation !== tableRequestGeneration
        || selectedDatasource.value?.name !== datasourceName
      ) return
      tables.value = response.tables
    } catch (cause: unknown) {
      if (
        generation !== tableRequestGeneration
        || selectedDatasource.value?.name !== datasourceName
      ) return
      tableListError.value = messageOf(cause, 'Failed to fetch tables')
    } finally {
      if (generation === tableRequestGeneration) {
        isLoadingTables.value = false
      }
    }
  }

  async function selectDatasource(datasource: DataSource) {
    selectedDatasource.value = datasource
    tables.value = []
    tableListError.value = null
    await fetchTables(datasource.name)
  }

  async function testConnection(name: string): Promise<ConnectionTestResult> {
    try {
      return await dataFabricApi.testConnection(name)
    } catch (cause: unknown) {
      return { success: false, message: messageOf(cause, 'Connection test failed') }
    }
  }

  async function testConnectionWithParams(params: TestConnectionRequest): Promise<ConnectionTestResult> {
    try {
      return await dataFabricApi.testConnectionWithParams(params)
    } catch (cause: unknown) {
      return { success: false, message: messageOf(cause, 'Connection test failed') }
    }
  }

  function clearMutationError() {
    mutationError.value = null
  }

  function getDefaultTypes(): DataSourceTypeConfig[] {
    return getAllDataSourceTypes()
  }

  return {
    datasources,
    datasourceTypes,
    selectedDatasource,
    tables,
    isLoadingDatasources,
    datasourceListError,
    isLoadingTables,
    tableListError,
    isMutating,
    mutationError,
    hasDatasources,
    sortedDatasources,
    typesByCategory,
    categoryLabels,
    fetchTypes,
    fetchDatasources,
    createDatasource,
    deleteDatasource,
    selectDatasource,
    fetchTables,
    testConnection,
    testConnectionWithParams,
    checkHealth,
    checkAllHealth,
    clearMutationError,
    getDefaultTypes,
    getAllDataSourceTypes,
  }
})
