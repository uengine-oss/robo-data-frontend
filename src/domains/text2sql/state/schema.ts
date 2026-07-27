/** Text2SQL schema metadata state. */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { text2sqlApi } from '../api/client.ts'
import { useDatasourcesStore } from '@/domains/data-fabric'
import type { Text2SqlColumnInfo, Text2SqlTableInfo } from '../model/react'

export const useText2SqlSchemaStore = defineStore('text2sql-schema', () => {
  // 상태
  const tables = ref<Text2SqlTableInfo[]>([])
  const selectedTable = ref<Text2SqlTableInfo | null>(null)
  const selectedTableColumns = ref<Text2SqlColumnInfo[]>([])
  const allColumnsMap = ref<Record<string, Text2SqlColumnInfo[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 테이블 목록 로드
  async function loadTables(search?: string, schema?: string) {
    loading.value = true
    error.value = null

    try {
      const datasourcesStore = useDatasourcesStore()
      const selectedDs = datasourcesStore.selectedDatasource
      if (!selectedDs?.name) {
        throw new Error('데이터소스를 선택해주세요')
      }
      tables.value = await text2sqlApi.getTables(selectedDs.name, search, schema)
    } catch (err: unknown) {
      // 에러 상태만 저장하고 다시 throw하지 않음 (조용히 처리)
      error.value = err instanceof Error ? err.message : 'Failed to load tables'
      // 빈 배열로 초기화하여 UI가 깨지지 않도록 함
      tables.value = []
    } finally {
      loading.value = false
    }
  }

  // 테이블 컬럼 로드
  async function loadTableColumns(tableName: string, schema: string = 'public') {
    loading.value = true
    error.value = null

    try {
      const datasourcesStore = useDatasourcesStore()
      const selectedDs = datasourcesStore.selectedDatasource
      if (!selectedDs?.name) {
        throw new Error('데이터소스를 선택해주세요')
      }
      selectedTableColumns.value = await text2sqlApi.getTableColumns(selectedDs.name, tableName, schema)
      allColumnsMap.value[tableName] = selectedTableColumns.value
      return selectedTableColumns.value
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load columns'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 모든 테이블의 컬럼 로드 (ERD용)
  async function loadAllColumns() {
    const datasourcesStore = useDatasourcesStore()
    const selectedDs = datasourcesStore.selectedDatasource
    if (!selectedDs?.name) {
      throw new Error('데이터소스를 선택해주세요')
    }
    const failedTables: string[] = []
    for (const table of tables.value) {
      try {
        const columns = await text2sqlApi.getTableColumns(selectedDs.name, table.name, table.schema)
        allColumnsMap.value[table.name] = columns
      } catch {
        failedTables.push(table.name)
      }
    }
    error.value = failedTables.length
      ? `일부 테이블의 컬럼을 불러오지 못했습니다: ${failedTables.join(', ')}`
      : null
  }

  // 테이블 선택
  function selectTable(table: Text2SqlTableInfo) {
    selectedTable.value = table
    loadTableColumns(table.name, table.schema)
  }

  // 테이블 컬럼 가져오기 (캐시된)
  function getTableColumns(tableName: string): Text2SqlColumnInfo[] {
    return allColumnsMap.value[tableName] || []
  }

  return {
    tables,
    selectedTable,
    selectedTableColumns,
    allColumnsMap,
    loading,
    error,
    loadTables,
    loadTableColumns,
    loadAllColumns,
    selectTable,
    getTableColumns
  }
})
