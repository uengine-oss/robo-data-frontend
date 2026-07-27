import { ref } from 'vue'

import { dataFabricApi } from '@/domains/data-fabric'
import { objectExplorerApi } from '@/domains/ontology'
import {
  buildTableDataQueryPlan,
  executeTableDataQueryPlan,
} from '../application/tableDataQuery'
import type { SchemaModelingTable } from '../application/schemaCatalogDiscovery'

export interface SchemaTableDataPanelState {
  isOpen: boolean
  tableName: string
  schema: string
  datasource: string
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executionTimeMs: number
  isLoading: boolean
  error: string | null
  limit: number
  executedSql?: string
  behaviorMode: boolean
  activeBehavior: {
    name: string
    objectTypeName: string
    behaviorType: string
  } | null
  isExecutingBehavior: boolean
}

function closedPanel(): SchemaTableDataPanelState {
  return {
    isOpen: false,
    tableName: '',
    schema: '',
    datasource: '',
    columns: [],
    rows: [],
    rowCount: 0,
    executionTimeMs: 0,
    isLoading: false,
    error: null,
    limit: 25,
    executedSql: '',
    behaviorMode: false,
    activeBehavior: null,
    isExecutingBehavior: false,
  }
}

interface SchemaTableDataPanelOptions {
  getTables: () => SchemaModelingTable[]
  beforeOpen: () => void
}

export function useSchemaTableDataPanel(options: SchemaTableDataPanelOptions) {
  const panel = ref<SchemaTableDataPanelState>(closedPanel())

  async function query(
    tableName: string,
    schema = 'public',
    limit = 25,
    datasource?: string,
  ): Promise<void> {
    options.beforeOpen()
    const planResult = await buildTableDataQueryPlan(
      { tableName, schema, limit, datasource, tables: options.getTables() },
      objectExplorerApi.getObjectType,
    )
    const { plan } = planResult

    if (!planResult.ok || !plan.datasource) {
      panel.value = {
        ...panel.value,
        isOpen: true,
        tableName,
        schema: plan.schema,
        datasource: plan.datasource,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        isLoading: false,
        error: planResult.ok
          ? '연결된 데이터소스가 없어 행 데이터를 조회할 수 없습니다. 분석으로 만들어진 테이블은 스키마·컬럼 설명만 제공되며, 실제 행은 데이터소스가 연결된 경우에만 조회됩니다.'
          : planResult.error,
        limit,
        executedSql: plan.primarySql,
      }
      return
    }

    panel.value = {
      ...panel.value,
      isOpen: true,
      tableName,
      schema: plan.schema,
      datasource: plan.datasource,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      isLoading: true,
      error: null,
      limit,
      executedSql: plan.primarySql,
    }

    const result = await executeTableDataQueryPlan(
      plan,
      dataFabricApi.query,
      sql => { panel.value.executedSql = sql },
    )
    if (result.ok) {
      panel.value.columns = result.columns
      panel.value.rows = result.rows
      panel.value.rowCount = result.rowCount
      panel.value.executionTimeMs = result.executionTimeMs
      panel.value.isLoading = false
      panel.value.error = null
      return
    }

    panel.value.executedSql = result.executedSql
    panel.value.error = result.error
    panel.value.isLoading = false
  }

  async function startBehaviorMode(
    objectTypeName: string,
    behaviorName: string,
    behaviorType: string,
  ): Promise<void> {
    panel.value.behaviorMode = true
    panel.value.activeBehavior = {
      name: behaviorName,
      objectTypeName,
      behaviorType,
    }
    panel.value.isExecutingBehavior = false
    await query(objectTypeName, 'ObjectType', panel.value.limit)
  }

  function cancelBehaviorMode(): void {
    panel.value.behaviorMode = false
    panel.value.activeBehavior = null
    panel.value.isExecutingBehavior = false
  }

  function close(): void {
    panel.value = closedPanel()
  }

  function changeLimit(limit: number): void {
    if (!panel.value.tableName) return
    void query(
      panel.value.tableName,
      panel.value.schema,
      limit,
      panel.value.datasource,
    )
  }

  return {
    panel,
    query,
    startBehaviorMode,
    cancelBehaviorMode,
    close,
    changeLimit,
  }
}
