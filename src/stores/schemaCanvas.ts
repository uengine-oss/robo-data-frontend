/**
 * schemaCanvas.ts
 * VueFlow 기반 스키마 캔버스 상태 관리
 * 
 * 데이터 소스:
 * - 'robo': robo-analyzer Neo4j (DDL 분석 결과)
 * - 'text2sql': neo4j-text2sql (PostgreSQL 인제스천)
 */

import { logger } from '@/utils/logger'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { MarkerType } from '@vue-flow/core'
import type { Edge, Node } from '@vue-flow/core'
import { text2sqlApi, roboSchemaApi } from '@/services/api'
import type { Text2SqlTableInfo, Text2SqlColumnInfo } from '@/types'
import { useSessionStore } from './session'
import { useDatasourcesStore } from './datasources'
import { applyElkLayout } from '@/utils/elkLayout'

export type SchemaDataSource = 'robo' | 'text2sql'

export interface TableNodeData {
  tableName: string
  schema: string
  datasource?: string  // 데이터소스명 (예: robo_postgres)
  description?: string
  description_source?: 'ddl' | 'code' | 'user' | ''  // 설명 출처 (전략 무관 항상 3종)
  columns: Text2SqlColumnInfo[]
  columnCount: number
  isPrimary?: boolean  // 직접 선택/드래그한 테이블인지 여부
  isObjectType?: boolean  // ObjectType인지 여부
  behaviors?: any[]  // Behavior 목록
}

export interface RelationshipData {
  from_table: string
  from_schema: string
  from_column: string
  to_table: string
  to_schema: string
  to_column: string
  description?: string
  relationship_type: string
  name?: string  // 관계 이름 (Neo4j FK_TO_TABLE relation의 name 속성)
}

// FK·설명 출처는 전략 무관 항상 3종(ddl/code/user). 레거시 'procedure'는 code 로 통합한다.
function normalizeSource(raw: unknown): 'ddl' | 'code' | 'user' | undefined {
  if (raw === 'procedure' || raw === 'code') return 'code'
  if (raw === 'ddl' || raw === 'user') return raw
  return undefined
}

export const useSchemaCanvasStore = defineStore('schemaCanvas', () => {
  // Session stores
  const sessionStore = useSessionStore()
  
  // Data source selection
  const dataSource = ref<SchemaDataSource>('robo')
  
  // Canvas state
  const nodes = ref<Node<TableNodeData>[]>([])
  const edges = ref<Edge[]>([])
  
  // 노드가 변경될 때 엣지 자동 업데이트 (debounced)
  let edgeUpdateTimeout: ReturnType<typeof setTimeout> | null = null
  
  // debounced 엣지 업데이트 함수 (노드 이동 시 사용)
  function debouncedUpdateEdges() {
    if (edgeUpdateTimeout) {
      clearTimeout(edgeUpdateTimeout)
    }
    edgeUpdateTimeout = setTimeout(() => {
      updateEdgesFromRelationships()
      edgeUpdateTimeout = null
    }, 150)  // 노드 드래그 시 더 빠른 응답을 위해 150ms
  }
  
  watch(
    () => nodes.value.length,
    (newLen, oldLen) => {
      if (newLen !== oldLen && newLen > 0) {
        // 여러 테이블이 동시에 추가될 때 한 번만 호출하도록 debounce
        debouncedUpdateEdges()
      }
    }
  )
  
  // Table data
  const allTables = ref<Text2SqlTableInfo[]>([])
  const tableColumnsCache = ref<Record<string, Text2SqlColumnInfo[]>>({})
  
    // Relationships
    const userRelationships = ref<RelationshipData[]>([])
    
    // Neo4j에서 가져온 FK_TO_TABLE 관계 (column_pairs 포함)
    interface Neo4jRelationship {
      from_table: string
      to_table: string
      type: string
      source?: 'ddl' | 'code' | 'user'  // FK 관계 출처 (전략 무관 항상 3종)
      column_pairs: Array<{ source: string; target: string; name?: string }>  // 각 컬럼 페어별 관계 이름
      name?: string  // 관계 이름 (전체 관계에 대한 이름)
    }
    const neo4jRelationships = ref<Neo4jRelationship[]>([])
    
    // 관계 정보 업데이트 함수
    async function updateRelationshipInfo(
      sourceType: string,
      targetType: string,
      sourceColumn: string,
      targetColumn: string
    ) {
      try {
        const params = new URLSearchParams({
          sourceType,
          targetType,
          sourceColumn,
          targetColumn
        })
        
        const response = await fetch(`/api/gateway/ontology/relationships?${params}`)
        if (response.ok) {
          const updatedRel = await response.json()
          
          // neo4jRelationships에서 해당 관계 찾아서 업데이트
          const neo4jRel = neo4jRelationships.value.find(
            r => r.from_table === sourceType && 
                 r.to_table === targetType &&
                 r.column_pairs?.some(p => p.source === sourceColumn && p.target === targetColumn)
          )
          
          if (neo4jRel) {
            const pair = neo4jRel.column_pairs.find(
              p => p.source === sourceColumn && p.target === targetColumn
            )
            if (pair) {
              pair.name = updatedRel.name
            } else {
              // pair가 없으면 추가
              if (!neo4jRel.column_pairs) {
                neo4jRel.column_pairs = []
              }
              neo4jRel.column_pairs.push({
                source: sourceColumn,
                target: targetColumn,
                name: updatedRel.name
              })
            }
          } else {
            // neo4jRelationships에 없으면 새로 추가
            neo4jRelationships.value.push({
              from_table: sourceType,
              to_table: targetType,
              type: 'FK_TO_TABLE',
              source: 'user',
              column_pairs: [{
                source: sourceColumn,
                target: targetColumn,
                name: updatedRel.name
              }]
            })
          }
          
          // userRelationships에서도 업데이트
          const userRel = userRelationships.value.find(
            r => r.from_table === sourceType && 
                 r.to_table === targetType &&
                 r.from_column === sourceColumn &&
                 r.to_column === targetColumn
          )
          
          if (userRel) {
            userRel.name = updatedRel.name
            userRel.description = updatedRel.description || userRel.description
          }
          
          // 관련 테이블의 관계를 다시 로드하여 최신 정보 반영
          try {
            // sourceType과 targetType 모두에 대해 관계 다시 로드
            const sourceResult = await roboSchemaApi.getRelatedTables(sourceType)
            const targetResult = await roboSchemaApi.getRelatedTables(targetType)
            
            // 두 결과를 병합하여 neo4jRelationships 업데이트
            const allRels = [...sourceResult.relationships, ...targetResult.relationships]
            for (const rel of allRels) {
              if (rel.type === 'FK_TO_TABLE') {
                const existingIdx = neo4jRelationships.value.findIndex(
                  r => r.from_table === rel.from_table && 
                       r.to_table === rel.to_table && 
                       r.type === rel.type
                )
                
                if (existingIdx >= 0) {
                  // 기존 관계의 column_pairs 업데이트 (name 포함)
                  const existingRel = neo4jRelationships.value[existingIdx]
                  if (rel.column_pairs && rel.column_pairs.length > 0) {
                    // 각 column_pair를 업데이트하거나 추가
                    for (const newPair of rel.column_pairs) {
                      const existingPair = existingRel.column_pairs?.find(
                        p => p.source === newPair.source && p.target === newPair.target
                      )
                      if (existingPair) {
                        // 기존 pair 업데이트 (name 포함)
                        existingPair.name = newPair.name
                      } else {
                        // 새 pair 추가
                        if (!existingRel.column_pairs) {
                          existingRel.column_pairs = []
                        }
                        existingRel.column_pairs.push(newPair)
                      }
                    }
                  }
                } else {
                  // 새 관계 추가
                  neo4jRelationships.value.push({
                    from_table: rel.from_table,
                    to_table: rel.to_table,
                    type: rel.type,
                    source: normalizeSource(rel.source),
                    column_pairs: rel.column_pairs || []
                  })
                }
              }
            }
          } catch (reloadErr) {
            logger.warn('[SchemaCanvas] 관계 다시 로드 실패 (무시):', reloadErr)
          }
        }
      } catch (err) {
        logger.error('[SchemaCanvas] 관계 정보 업데이트 실패:', err)
      }
    }
  
  // UI state
  const selectedNodeId = ref<string | null>(null)
  const selectedTable = ref<Text2SqlTableInfo | null>(null)
  const selectedTableColumns = ref<Text2SqlColumnInfo[]>([])
  const loading = ref(false)
  const isDetailPanelOpen = ref(false)
  
  // Statement 설명 정보
  interface StatementInfo {
    start_line: number
    end_line?: number
    statement_type: string
    summary?: string
    ai_description?: string
  }
  
  // 소스 코드 패널 상태
  interface SourceCodePanelState {
    isOpen: boolean
    fileName: string
    fileDirectory: string
    fileContent: string
    highlightedLine: number
    procedureName: string
    statements: StatementInfo[]  // AI 설명 정보
    isLoadingStatements: boolean
  }
  const sourceCodePanel = ref<SourceCodePanelState>({
    isOpen: false,
    fileName: '',
    fileDirectory: '',
    fileContent: '',
    highlightedLine: 0,
    procedureName: '',
    statements: [],
    isLoadingStatements: false
  })
  
  // 테이블 데이터 조회 패널 상태
  interface TableDataPanelState {
    isOpen: boolean
    tableName: string
    schema: string
    datasource: string
    columns: string[]
    rows: any[][]
    rowCount: number
    executionTimeMs: number
    isLoading: boolean
    error: string | null
    limit: number
    executedSql?: string  // 실행된 SQL (UI에 표시용)
    // Behavior 실행 모드 관련
    behaviorMode: boolean
    activeBehavior: { name: string; objectTypeName: string; behaviorType: string } | null
    isExecutingBehavior: boolean
  }
  const tableDataPanel = ref<TableDataPanelState>({
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
    isExecutingBehavior: false
  })
  
  // Search/filter
  const searchQuery = ref('')
  
  // 시멘틱 검색 상태
  const isSemanticSearching = ref(false)
  const semanticSearchResults = ref<Array<{
    name: string
    schema: string
    description: string
    similarity: number
  }>>([])
  const semanticSearchError = ref<string | null>(null)
  
  // FK 관계 유형별 표시 여부 (범례 체크박스용)
  // source: 'ddl' | 'code' | 'user' (procedure는 code로 통합)
  const fkVisibility = ref({
    ddl: true,        // DDL에서 추출 (실선, 초록색)
    code: true,       // 코드 분석 (점선, 하늘색)
    user: true        // 사용자 추가 (실선, 주황색)
  } as Record<string, boolean>)
  
  // FK 표시 토글 함수
  function toggleFkVisibility(source: 'ddl' | 'code' | 'user') {
    const key = source
    if (!(key in fkVisibility.value)) {
      fkVisibility.value[key] = true
    }
    fkVisibility.value[key] = !fkVisibility.value[key]
    updateEdgesFromRelationships()
  }
  
  // 논리명/물리명 표시 전환 (기본: 논리명=description 우선)
  const showLogicalNames = ref(true)
  
  function toggleLogicalNames() {
    showLogicalNames.value = !showLogicalNames.value
  }
  
  // =========================================================================
  // 실시간 캔버스 업데이트 (인제스천 중 변경사항 반영)
  // =========================================================================
  
  // 전체 테이블 보기 모드 여부
  const isFullViewMode = ref(false)
  
  // 업데이트된 노드 추적 (애니메이션용) - { nodeId: timestamp }
  const updatedNodes = ref<Map<string, number>>(new Map())
  
  // 업데이트된 컬럼 추적 (애니메이션용) - { "tableName:columnName": timestamp }
  const updatedColumns = ref<Map<string, number>>(new Map())
  
  // 새로 추가된 관계 추적 (애니메이션용)
  const newRelationships = ref<Map<string, number>>(new Map())
  
  // 새로 추가된 테이블 추적 (애니메이션용)
  const newlyAddedTables = ref<Map<string, number>>(new Map())
  
  // 새로 추가된 엣지 추적 (애니메이션용)
  const newlyAddedEdges = ref<Map<string, number>>(new Map())
  
  /**
   * 캔버스 업데이트 이벤트 처리
   * 현재 캔버스에 표시된 테이블과 관련된 업데이트만 적용
   * 전체 테이블 보기 모드에서는 새 테이블/릴레이션도 자동 추가
   */
  async function handleCanvasUpdate(event: {
    updateType: string
    tableName: string
    schema?: string
    field?: string
    changes?: Record<string, unknown>
  }) {
    const { updateType, tableName, field, changes } = event
    const nodeId = `table-${tableName}`
    const now = Date.now()
    
    logger.debug(`[Canvas Update] ${updateType}: ${tableName}`, changes)
    
    // 새 테이블 추가 처리
    if (updateType === 'table_added') {
      // 테이블 목록 새로고침
      await loadAllTables()
      
      const existingNode = nodes.value.find(n => n.data?.tableName === tableName)
      
      if (!existingNode) {
        // 전체 보기 모드: 모든 새 테이블 자동 추가
        if (isFullViewMode.value) {
          const newTable = allTables.value.find(t => t.name === tableName)
          if (newTable) {
            await addTableToCanvasWithAnimation(newTable)
          }
        } else {
          // 부분 보기 모드: 현재 캔버스의 테이블과 FK 관계가 있는 테이블만 추가
          // 현재 캔버스에 있는 테이블들의 이름 목록
          const canvasTableNames = nodes.value
            .filter(n => n.type === 'tableNode')
            .map(n => n.data?.tableName)
            .filter(Boolean) as string[]
          
          // Neo4j 관계에서 현재 캔버스 테이블과 FK 관계가 있는지 확인
          const hasRelationWithCanvas = neo4jRelationships.value.some(rel => {
            if (rel.type !== 'FK_TO_TABLE') return false
            // 새 테이블이 from 또는 to 중 하나이고, 다른 쪽이 캔버스에 있는 경우
            if (rel.from_table === tableName && canvasTableNames.includes(rel.to_table)) return true
            if (rel.to_table === tableName && canvasTableNames.includes(rel.from_table)) return true
            return false
          })
          
          if (hasRelationWithCanvas) {
            const newTable = allTables.value.find(t => t.name === tableName)
            if (newTable) {
              await addTableToCanvasWithAnimation(newTable)
            }
          }
        }
      }
      return
    }
    
    // 현재 캔버스에 없는 테이블 처리
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) {
        // 전체 테이블 보기 모드에서는 테이블 자동 추가
        if (isFullViewMode.value && (updateType === 'table_description' || updateType === 'column_description')) {
          const tableInfo = allTables.value.find(t => t.name === tableName)
          if (tableInfo) {
            await addTableToCanvasWithAnimation(tableInfo)
            // 추가 후 다시 처리
            setTimeout(() => handleCanvasUpdate(event), 100)
          }
        }
      return
    }
    
    switch (updateType) {
      case 'table_description': {
        // 테이블 설명 업데이트
        if (node.data && changes?.description) {
          node.data.description = changes.description as string
        }
        // 업데이트 애니메이션 트리거
        updatedNodes.value.set(nodeId, now)
        break
      }
      
      case 'column_description': {
        // 컬럼 설명 업데이트
        if (node.data && field && changes?.description) {
          const column = node.data.columns.find(c => c.name === field)
          if (column) {
            column.description = changes.description as string
          }
        }
        // 업데이트 애니메이션 트리거
        updatedColumns.value.set(`${tableName}:${field}`, now)
        break
      }
      
      case 'column_added': {
        // 새 컬럼 추가
        if (node.data && field && changes) {
          const existingCol = node.data.columns.find(c => c.name === field)
          if (!existingCol) {
            const newColumn = {
              name: field,
              table_name: tableName,
              dtype: (changes.dtype as string) || 'unknown',
              nullable: (changes.nullable as boolean) ?? true,
              description: (changes.description as string) || ''
            }
            node.data.columns.push(newColumn)
            node.data.columnCount = node.data.columns.length
          }
        }
        updatedColumns.value.set(`${tableName}:${field}`, now)
        break
      }
      
      case 'relationship_added': {
        // 새 관계 추가
        if (changes?.from_column && changes?.to_table && changes?.to_column) {
          const relKey = `${tableName}.${changes.from_column}->${changes.to_table}.${changes.to_column}`
          newRelationships.value.set(relKey, now)
          newlyAddedEdges.value.set(relKey, now)
          
          // 엣지 애니메이션 타이머
          setTimeout(() => {
            newlyAddedEdges.value.delete(relKey)
          }, 5000)
          
          // 전체 보기 모드가 아닌 경우: 현재 캔버스에 있는 테이블과 FK 관계가 있는 테이블만 추가
          // 소스 테이블이 캔버스에 있으면 타겟 테이블도 추가
          const targetTable = changes.to_table as string
          const sourceNodeExists = nodes.value.some(n => n.data?.tableName === tableName)
          const targetNodeExists = nodes.value.some(n => n.data?.tableName === targetTable)
          
          if (sourceNodeExists && !targetNodeExists) {
            // 타겟 테이블을 찾아서 캔버스에 추가
            const targetTableInfo = allTables.value.find(t => t.name === targetTable)
            if (targetTableInfo) {
              await addTableToCanvasWithAnimation(targetTableInfo)
            }
          }
        }
        // Neo4j 관계 다시 로드
        await loadRelatedTablesFromNeo4j(tableName)
        break
      }
    }
    
    // 5초 후 애니메이션 상태 제거
    setTimeout(() => {
      if (updatedNodes.value.get(nodeId) === now) {
        updatedNodes.value.delete(nodeId)
      }
      if (field && updatedColumns.value.get(`${tableName}:${field}`) === now) {
        updatedColumns.value.delete(`${tableName}:${field}`)
      }
    }, 5000)
  }
  
  /**
   * 테이블을 캔버스에 애니메이션과 함께 추가
   */
  async function addTableToCanvasWithAnimation(table: Text2SqlTableInfo) {
    const nodeId = `table-${table.name}`
    
    // 이미 존재하면 무시
    if (nodes.value.some(n => n.id === nodeId)) {
      return
    }
    
    const now = Date.now()
    
    // 새 테이블 애니메이션 상태 설정
    newlyAddedTables.value.set(nodeId, now)
    
    // 테이블 추가
    await addTableToCanvas(table, undefined, { autoLoadRelated: false, isPrimary: false })
    
    // 5초 후 애니메이션 상태 제거
    setTimeout(() => {
      if (newlyAddedTables.value.get(nodeId) === now) {
        newlyAddedTables.value.delete(nodeId)
      }
    }, 5000)
  }
  
  /**
   * 전체 테이블 보기 모드 설정
   */
  function setFullViewMode(enabled: boolean) {
    isFullViewMode.value = enabled
    logger.debug(`[Canvas] 전체 테이블 보기 모드: ${enabled ? 'ON' : 'OFF'}`)
  }
  
  // Watch data source changes
  watch(dataSource, () => {
    // Clear canvas when data source changes
    clearCanvas()
    loadAllTables()
    loadUserRelationships()
  })
  
  // Computed
  const filteredTables = computed(() => {
    if (!searchQuery.value.trim()) return allTables.value
    const query = searchQuery.value.toLowerCase()
    return allTables.value.filter(t => 
      t.name.toLowerCase().includes(query) ||
      (t.description && t.description.toLowerCase().includes(query))
    )
  })
  
  const tablesOnCanvas = computed(() => {
    return nodes.value.map(n => n.data?.tableName).filter((name): name is string => !!name)
  })
  
  const tablesNotOnCanvas = computed(() => {
    const onCanvas = new Set(tablesOnCanvas.value)
    return filteredTables.value.filter(t => !onCanvas.has(t.name))
  })
  
  // 데이터소스 목록 (정렬됨)
  const datasources = computed(() => {
    const dsSet = new Set<string>()
    allTables.value.forEach(table => {
      dsSet.add(table.datasource || 'default')
    })
    return Array.from(dsSet).sort()
  })
  
  // 스키마 목록 (정렬됨)
  const schemas = computed(() => {
    const schemaSet = new Set<string>()
    allTables.value.forEach(table => {
      schemaSet.add(table.schema || 'public')
    })
    return Array.from(schemaSet).sort()
  })
  
  // 3레벨 그룹핑: datasource > schema > tables (캔버스에 없는 테이블만)
  const tablesByDatasource = computed(() => {
    const onCanvas = new Set(tablesOnCanvas.value)
    const grouped: Record<string, Record<string, Text2SqlTableInfo[]>> = {}
    
    filteredTables.value.forEach(table => {
      if (onCanvas.has(table.name)) return
      
      const ds = table.datasource || 'default'
      const schema = table.schema || 'public'
      
      if (!grouped[ds]) {
        grouped[ds] = {}
      }
      if (!grouped[ds][schema]) {
        grouped[ds][schema] = []
      }
      grouped[ds][schema].push(table)
    })
    
    // 각 스키마 내 테이블 정렬
    Object.keys(grouped).forEach(ds => {
      Object.keys(grouped[ds]).forEach(schema => {
        grouped[ds][schema].sort((a, b) => a.name.localeCompare(b.name))
      })
    })
    
    return grouped
  })
  
  // Actions
  async function loadAllTables() {
    loading.value = true
    try {
      if (dataSource.value === 'robo') {
        // Neo4j 직접 조회 (robo-analyzer)
        const tables = await roboSchemaApi.getTables({
          limit: 1000
        })
        allTables.value = tables.map(t => {
          const rawSource = (t as any).description_source as string | undefined

          return {
            name: t.name,
            schema: t.table_schema,  // Backend returns table_schema
            datasource: t.datasource || '',  // 데이터소스명 추가
            description: t.description || '',
            description_source: rawSource === '' ? '' : normalizeSource(rawSource),  // 출처 정규화(procedure→code)
            analyzed_description: t.analyzed_description,
            column_count: t.column_count
          }
        })
      } else {
        // PostgreSQL 인제스천 (text2sql)
        const datasourcesStore = useDatasourcesStore()
        let datasourceName = (datasourcesStore.selectedDatasource?.name || '').trim()

        if (!datasourceName) {
          if (datasourcesStore.datasources.length === 0) {
            await datasourcesStore.fetchDatasources()
          }
          datasourceName = (datasourcesStore.selectedDatasource?.name || datasourcesStore.datasources[0]?.name || '').trim()
        }

        if (!datasourceName) {
          allTables.value = []
          return
        }

        allTables.value = await text2sqlApi.getTables(datasourceName)
      }
    } catch (error) {
      logger.error('Failed to load tables:', error)
      allTables.value = []
    } finally {
      loading.value = false
    }
  }
  
  /**
   * 시멘틱 검색: 테이블 설명의 의미적 유사도 기반 검색
   */
  async function performSemanticSearch(query: string): Promise<void> {
    if (!query.trim() || query.length < 2) {
      semanticSearchResults.value = []
      return
    }
    
    // Neo4j 데이터 소스에서만 시멘틱 검색 가능
    if (dataSource.value !== 'robo') {
      return
    }
    
    isSemanticSearching.value = true
    semanticSearchError.value = null
    
    try {
      const results = await roboSchemaApi.semanticSearch(
        query,
        { limit: 10 }
      )
      
      semanticSearchResults.value = results
    } catch (error) {
      logger.error('[SemanticSearch] 실패:', error)
      semanticSearchError.value = error instanceof Error ? error.message : '검색 실패'
      semanticSearchResults.value = []
    } finally {
      isSemanticSearching.value = false
    }
  }
  
  /**
   * 시멘틱 검색 결과 초기화
   */
  function clearSemanticSearch(): void {
    semanticSearchResults.value = []
    semanticSearchError.value = null
    isSemanticSearching.value = false
  }
  
  function getTableColumnsCacheKey(tableName: string, schema?: string, datasource?: string): string {
    const ds = (datasource || '').trim()
    const sch = (schema || '').trim()
    return `${ds}::${sch}::${tableName}`
  }

  async function loadTableColumns(
    tableName: string,
    schema: string = '',
    datasource: string = ''
  ): Promise<Text2SqlColumnInfo[]> {
    const matchedTable = allTables.value.find(
      t =>
        t.name === tableName &&
        (!schema || (t.schema || 'public') === schema) &&
        (!datasource || (t.datasource || '') === datasource)
    ) || allTables.value.find(t => t.name === tableName)

    const resolvedSchema = (schema || matchedTable?.schema || 'public').trim()
    const resolvedDatasource = (datasource || matchedTable?.datasource || '').trim()
    const cacheKey = getTableColumnsCacheKey(tableName, resolvedSchema, resolvedDatasource)

    if (tableColumnsCache.value[cacheKey]) {
      return tableColumnsCache.value[cacheKey]
    }
    if (tableColumnsCache.value[tableName]) {
      return tableColumnsCache.value[tableName]
    }
    
    try {
      let columns: Text2SqlColumnInfo[]
      
      if (dataSource.value === 'robo') {
        const roboColumns = await roboSchemaApi.getTableColumns(tableName, {
          schema: resolvedSchema
        })
        columns = roboColumns.map(c => {
          const rawSource = (c as any).description_source as string | undefined

          return {
            name: c.name,
            table_name: c.table_name,
            dtype: c.dtype,
            nullable: c.nullable,
            description: c.description || '',
            description_source: rawSource === '' ? '' : normalizeSource(rawSource),  // 출처 정규화(procedure→code)
            analyzed_description: c.analyzed_description
          }
        })
      } else {
        if (!resolvedDatasource) {
          throw new Error(`Text2SQL 컬럼 조회에는 datasource가 필요합니다: ${tableName}`)
        }
        columns = await text2sqlApi.getTableColumns(resolvedDatasource, tableName, resolvedSchema || 'public')
      }
      
      // 빈 결과는 캐시하지 않음 — backend schema 매칭 실패 등 일시적 0건이
      // 캐시되면 이후 재조회해도 영원히 0개가 되어버려서 우측 패널에 "컬럼 (0)"
      // 으로 굳어버리는 문제 방지.
      if (columns.length > 0) {
        tableColumnsCache.value[cacheKey] = columns
        // Backward compatibility for legacy lookups by tableName
        tableColumnsCache.value[tableName] = columns
      } else {
        logger.warn(
          `[SchemaCanvas] loadTableColumns: 0 columns for ${tableName} (schema=${resolvedSchema}, ds=${resolvedDatasource}) — 캐시 안 함`,
        )
      }
      return columns
    } catch (error) {
      logger.error(`Failed to load columns for ${tableName}:`, error)
      return []
    }
  }
  
  async function loadUserRelationships() {
    try {
      let relationships: RelationshipData[]
      
      if (dataSource.value === 'robo') {
        const response = await roboSchemaApi.getRelationships()
        relationships = (response.relationships || []).map(r => ({
          from_table: r.from_table,
          from_schema: r.from_schema,
          from_column: r.from_column,
          to_table: r.to_table,
          to_schema: r.to_schema,
          to_column: r.to_column,
          relationship_type: r.relationship_type,
          description: r.description,
          name: (r as any).name  // 관계 이름
        }))
      } else {
        const response = await text2sqlApi.getUserRelationships()
        relationships = (response.relationships || []) as RelationshipData[]
      }
      
      userRelationships.value = relationships
      updateEdgesFromRelationships()
    } catch (error) {
      logger.error('Failed to load relationships:', error)
      userRelationships.value = []
    }
  }
  
  async function addTableToCanvas(
    table: Text2SqlTableInfo, 
    position?: { x: number; y: number },
    options?: { 
      autoLoadRelated?: boolean
      isPrimary?: boolean
      columns?: Text2SqlColumnInfo[]  // 컬럼을 직접 전달 (ObjectType용)
      isObjectType?: boolean  // ObjectType 여부
      behaviors?: any[]  // Behavior 목록
    }
  ) {
    // Check if already on canvas
    if (nodes.value.some(n => n.data?.tableName === table.name)) {
      logger.debug(`[SchemaCanvas] 테이블 ${table.name}은 이미 캔버스에 있습니다`)
      return
    }
    
    logger.debug(`[SchemaCanvas] 📋 테이블 추가 중: ${table.name} (isPrimary: ${options?.isPrimary ?? true})`)
    
    // Load columns - 직접 전달된 컬럼이 있으면 사용, 없으면 DB에서 로드
    let columns: Text2SqlColumnInfo[]
    if (options?.columns && options.columns.length > 0) {
      columns = options.columns
      logger.debug(`[SchemaCanvas] 직접 전달된 컬럼 사용: ${columns.length}개`)
    } else {
      columns = await loadTableColumns(table.name, table.schema, table.datasource || '')
    }
    
    // Calculate position
    const pos = position || calculateNewNodePosition()
    
    // Create node - 직접 추가한 테이블은 isPrimary=true (기본값)
    const isPrimary = options?.isPrimary !== false
    
    const newNode: Node<TableNodeData> = {
      id: `table-${table.name}`,
      type: 'tableNode',
      position: pos,
      data: {
        tableName: table.name,
        schema: table.schema || 'public',
        datasource: table.datasource || '',  // 데이터소스명 (멀티 데이터소스 지원)
        description: table.description || undefined,
        description_source: normalizeSource(table.description_source),
        columns: columns,
        columnCount: table.column_count || columns.length,
        isPrimary: isPrimary,  // 직접 선택한 테이블 표시
        isObjectType: options?.isObjectType || false,  // ObjectType 여부
        behaviors: options?.behaviors || []  // Behavior 목록
      }
    }
    
    nodes.value.push(newNode)
    logger.debug(`[SchemaCanvas] ✅ 테이블 ${table.name} 추가됨`)
    
    // Update edges for this table
    updateEdgesFromRelationships()
    
    // Auto-load related tables (default: true) - ObjectType은 스킵
    if (options?.autoLoadRelated !== false && !options?.columns) {
      await loadRelatedTablesFromNeo4j(table.name)
    }
  }
  
  // Load related tables from Neo4j using Cypher query API
  async function loadRelatedTablesFromNeo4j(tableName: string) {
    try {
      logger.debug(`[SchemaCanvas] 🔍 Loading related tables for: ${tableName}`)
      
      // Neo4j API를 통해 연결된 테이블 조회
      const result = await roboSchemaApi.getRelatedTables(tableName)
      
      logger.debug(`[SchemaCanvas] API Response:`, result)
      
      // FK 관계가 있는 테이블만 필터링 (CO_REFERENCED 제외)
      // CO_REFERENCED는 같은 프로시저에서 참조되는 테이블일 뿐, 실제 FK 관계가 아님
      const fkRelationships = result.relationships.filter(
        rel => rel.type === 'FK_TO_TABLE' || rel.type === 'REFERENCES'
      )
      
      // FK 관계에 있는 테이블 이름 추출
      const fkTableNames = new Set<string>()
      fkRelationships.forEach(rel => {
        if (rel.from_table !== tableName) fkTableNames.add(rel.from_table)
        if (rel.to_table !== tableName) fkTableNames.add(rel.to_table)
      })
      
      logger.debug(`[SchemaCanvas] FK 관계 테이블: ${Array.from(fkTableNames).join(', ')}`)
      logger.debug(`[SchemaCanvas] 제외된 CO_REFERENCED 테이블: ${
        result.tables
          .filter(t => !fkTableNames.has(t.name) && t.name !== tableName)
          .map(t => t.name)
          .join(', ') || '없음'
      }`)
      
      if (fkTableNames.size === 0) {
        logger.debug(`[SchemaCanvas] ⚠️ No FK-related tables found, trying fallback...`)
        // Fallback: FK 컬럼명 패턴 기반 추론
        await loadRelatedTablesByFKPattern(tableName)
        return
      }
      
      // FK 관계가 있는 테이블만 캔버스에 추가
      let addedCount = 0
      const maxRelatedTables = 15
      
      for (const fkTableName of fkTableNames) {
        if (addedCount >= maxRelatedTables) break
        if (nodes.value.some(n => n.data?.tableName === fkTableName)) continue
        
        // allTables에서 찾거나 API 결과에서 찾기
        let tableInfo = allTables.value.find(t => t.name === fkTableName)
        if (!tableInfo) {
          const apiTableInfo = result.tables.find(t => t.name === fkTableName)
          if (apiTableInfo) {
            tableInfo = {
              name: apiTableInfo.name,
              schema: apiTableInfo.schema || 'public',
              description: apiTableInfo.description || '',
              column_count: 0
            }
          }
        }
        
        if (tableInfo) {
          await addTableToCanvas(tableInfo, undefined, { autoLoadRelated: false, isPrimary: false })
          addedCount++
        }
      }
      
      // Neo4j 관계 저장 (모든 관계 - 엣지 표시에 사용)
      for (const rel of result.relationships) {
        const existingIdx = neo4jRelationships.value.findIndex(
          r => r.from_table === rel.from_table && r.to_table === rel.to_table && r.type === rel.type
        )
        if (existingIdx === -1) {
          neo4jRelationships.value.push({
            from_table: rel.from_table,
            to_table: rel.to_table,
            type: rel.type,
            source: normalizeSource(rel.source),  // 항상 3종(procedure→code)
            column_pairs: rel.column_pairs || []
          })
        }
      }
      
      logger.debug(`[SchemaCanvas] ✅ Loaded ${addedCount} FK-related tables (${fkRelationships.length} FK relationships) for ${tableName}`)
      
      // 엣지 업데이트 및 레이아웃 적용
      updateEdgesFromRelationships()
      
      if (addedCount > 0) {
        await applyAutoLayout()
      }
    } catch (error) {
      logger.error('[SchemaCanvas] Failed to load related tables via API:', error)
      // Fallback: FK 패턴 기반
      await loadRelatedTablesByFKPattern(tableName)
    }
  }
  
  // Fallback: FK 컬럼명 패턴 기반 관련 테이블 추론
  async function loadRelatedTablesByFKPattern(tableName: string) {
    const relatedTableNames = new Set<string>()
    
    // FK 컬럼명 패턴 (column ending with _id)
    const columns = tableColumnsCache.value[tableName] || []
    for (const col of columns) {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleTargets = [baseName, baseName + 's', baseName.replace(/s$/, '')]
        
        const relatedTable = allTables.value.find(t => 
          possibleTargets.includes(t.name.toLowerCase())
        )
        
        if (relatedTable) {
          relatedTableNames.add(relatedTable.name)
        }
      }
    }
    
    // 다른 테이블에서 이 테이블을 참조하는 경우
    for (const otherTable of allTables.value) {
      if (otherTable.name === tableName) continue
      
      const otherColumns = tableColumnsCache.value[otherTable.name]
      if (otherColumns) {
        for (const col of otherColumns) {
          if (col.name.endsWith('_id')) {
            const baseName = col.name.replace(/_id$/, '')
            if (tableName.toLowerCase().includes(baseName) || baseName.includes(tableName.toLowerCase())) {
              relatedTableNames.add(otherTable.name)
              break
            }
          }
        }
      }
    }
    
    // 캔버스에 추가
    let addedCount = 0
    for (const relatedName of relatedTableNames) {
      if (addedCount >= 10) break
      if (nodes.value.some(n => n.data?.tableName === relatedName)) continue
      
      const relatedTable = allTables.value.find(t => t.name === relatedName)
      if (relatedTable) {
        await addTableToCanvas(relatedTable, undefined, { autoLoadRelated: false, isPrimary: false })
        addedCount++
      }
    }
    
    if (addedCount > 0) {
      await applyAutoLayout()
    }
  }
  
  function removeTableFromCanvas(tableName: string) {
    const nodeId = `table-${tableName}`
    nodes.value = nodes.value.filter(n => n.id !== nodeId)
    edges.value = edges.value.filter(e => 
      e.source !== nodeId && e.target !== nodeId
    )
    
    if (selectedNodeId.value === nodeId) {
      selectedNodeId.value = null
      selectedTable.value = null
      isDetailPanelOpen.value = false
    }
  }
  
  function calculateNewNodePosition(): { x: number; y: number } {
    if (nodes.value.length === 0) {
      return { x: 100, y: 100 }
    }
    
    // Find rightmost position
    const maxX = Math.max(...nodes.value.map(n => n.position.x))
    const avgY = nodes.value.reduce((sum, n) => sum + n.position.y, 0) / nodes.value.length
    
    return { x: maxX + 320, y: avgY }
  }
  
  function updateNodePosition(nodeId: string, position: { x: number; y: number }) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) {
      node.position = position
    }
  }
  
  async function selectNode(nodeId: string) {
    selectedNodeId.value = nodeId
    
    const node = nodes.value.find(n => n.id === nodeId)
    if (node && node.data) {
      // allTables에서 찾거나, 없으면 노드 데이터로 직접 생성 (ObjectType 등)
      let table = allTables.value.find(
        t =>
          t.name === node.data!.tableName &&
          (t.schema || 'public') === (node.data!.schema || 'public') &&
          ((t.datasource || '') === (node.data!.datasource || ''))
      )
      if (!table) {
        table = allTables.value.find(t => t.name === node.data!.tableName)
      }
      
      if (!table) {
        // ObjectType 등 allTables에 없는 경우 노드 데이터로 테이블 정보 생성
        table = {
          name: node.data.tableName,
          schema: node.data.schema || 'ObjectType',
          description: node.data.description || '',
          column_count: node.data.columns?.length || 0
        }
      }
      
      selectedTable.value = table
      selectedTableColumns.value = node.data.columns || []
      
      // ObjectType인 경우: 최신 description을 API에서 다시 가져옴
      if (node.data.isObjectType && node.data.tableName) {
        try {
          const response = await fetch(`/api/gateway/ontology/object-types/${encodeURIComponent(node.data.tableName)}`)
          if (response.ok) {
            const detail = await response.json()
            if (detail.columns && detail.columns.length > 0) {
              // description 정보 병합 (기존 컬럼에 description 업데이트)
              const updatedColumns = (node.data.columns || []).map((col: Text2SqlColumnInfo) => {
                const apiCol = detail.columns.find((c: any) => c.name === col.name)
                if (apiCol?.description && !col.description) {
                  return { ...col, description: apiCol.description }
                }
                return col
              })
              node.data.columns = updatedColumns
              selectedTableColumns.value = updatedColumns
            }
            // 테이블 description도 업데이트
            if (detail.description && !node.data.description) {
              node.data.description = detail.description
              if (selectedTable.value) {
                selectedTable.value = { ...selectedTable.value, description: detail.description }
              }
            }
          }
        } catch (e) {
          logger.warn('[SchemaCanvas] ObjectType description 업데이트 실패:', e)
        }
      }
      
      // 상세 패널에서 컬럼 0개로 보이는 경우를 방지하기 위해 지연 로딩 보강.
      // 1차: 노드에 저장된 schema/datasource 로 시도
      // 2차: schema 를 비워 backend 의 이름/fqn 매칭 fallback 으로 시도
      if ((selectedTableColumns.value?.length || 0) === 0) {
        let loadedColumns = await loadTableColumns(
          node.data.tableName,
          node.data.schema || '',
          node.data.datasource || '',
        )
        if (loadedColumns.length === 0) {
          loadedColumns = await loadTableColumns(node.data.tableName, '', '')
        }
        if (loadedColumns.length > 0) {
          node.data.columns = loadedColumns
          node.data.columnCount = loadedColumns.length
          selectedTableColumns.value = loadedColumns
        } else {
          logger.warn(
            `[SchemaCanvas] selectNode: 컬럼 0개 — table=${node.data.tableName}, schema=${node.data.schema}`,
          )
        }
      }
      isDetailPanelOpen.value = true
    }
  }
  
  function clearSelection() {
    selectedNodeId.value = null
  }
  
  function closeDetailPanel() {
    isDetailPanelOpen.value = false
    selectedTable.value = null
    selectedNodeId.value = null
  }
  
  // 소스 코드 패널 열기
  async function openSourceCodePanel(
    fileName: string,
    fileDirectory: string,
    fileContent: string,
    highlightedLine: number,
    procedureName: string
  ) {
    // 먼저 패널 열기
    sourceCodePanel.value = {
      isOpen: true,
      fileName,
      fileDirectory,
      fileContent,
      highlightedLine,
      procedureName,
      statements: [],
      isLoadingStatements: true
    }
    
    // Statement 설명 로드
    try {
      const result = await roboSchemaApi.getProcedureStatements(
        procedureName,
        fileDirectory
      )
      sourceCodePanel.value.statements = result.statements
      logger.debug('[openSourceCodePanel] Statement 설명 로드:', result.statements.length, '개')
    } catch (error) {
      logger.error('[openSourceCodePanel] Statement 설명 로드 실패:', error)
      sourceCodePanel.value.statements = []
    } finally {
      sourceCodePanel.value.isLoadingStatements = false
    }
  }
  
  // 소스 코드 패널 닫기
  function closeSourceCodePanel() {
    sourceCodePanel.value = {
      isOpen: false,
      fileName: '',
      fileDirectory: '',
      fileContent: '',
      highlightedLine: 0,
      procedureName: '',
      statements: [],
      isLoadingStatements: false
    }
  }
  
  // =========================================================================
  // 테이블 데이터 조회 패널
  // =========================================================================
  
  const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '/api/gateway'
  const TEXT2SQL_API_BASE = import.meta.env.VITE_TEXT2SQL_API_URL || `${API_GATEWAY_URL}/text2sql`
  
  /**
   * Behavior 실행 모드 시작
   * 하단 데이터 패널을 behavior 실행 모드로 열고 데이터를 로드합니다.
   */
  async function startBehaviorMode(
    objectTypeName: string, 
    behaviorName: string, 
    behaviorType: string
  ) {
    // Behavior 모드 활성화
    tableDataPanel.value.behaviorMode = true
    tableDataPanel.value.activeBehavior = {
      name: behaviorName,
      objectTypeName: objectTypeName,
      behaviorType: behaviorType
    }
    tableDataPanel.value.isExecutingBehavior = false
    
    // ObjectType의 데이터 로드
    await queryTableData(objectTypeName, 'ObjectType', tableDataPanel.value.limit)
  }
  
  /**
   * Behavior 실행 모드 종료
   */
  function cancelBehaviorMode() {
    tableDataPanel.value.behaviorMode = false
    tableDataPanel.value.activeBehavior = null
    tableDataPanel.value.isExecutingBehavior = false
  }
  
  /**
   * 테이블 데이터 조회 패널 열기 및 데이터 로드
   * 
   * PostgreSQL 식별자 규칙:
   * - 따옴표 없음: 자동으로 소문자로 변환됨 (rwis.rditag_tb)
   * - 따옴표 있음: 대소문자 그대로 유지됨 ("RWIS"."RDITAG_TB")
   * 
   * 대문자로 생성된 테이블을 조회하려면 반드시 따옴표로 감싸야 함
   * 
   * 멀티 데이터소스 지원:
   * - SQL 쿼리가 datasource.schema.table 형식으로 생성됨
   * - 예: SELECT * FROM postgresql.`RWIS`.`RDISAUP_TB` LIMIT 25
   */
  async function queryTableData(tableName: string, schema: string = 'public', limit: number = 25, datasource?: string) {
    const schemaName = schema || 'public'
    const normalizedInputDatasource = (datasource || '').trim()
    const matchedTable = allTables.value.find(
      t => t.name === tableName && (t.schema || 'public') === schemaName
    )
    let resolvedDatasource = normalizedInputDatasource || (matchedTable?.datasource || '').trim()

    const extractDatasourceFromSql = (query: string): string => {
      const trimmedQuery = String(query || '').trim()
      if (!trimmedQuery) return ''

      const datasourcePatterns = [
        // MindsDB 래퍼 문법: SELECT * FROM datasource ( ... )
        /\bFROM\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s*\(/i,
        // FROM/JOIN datasource.schema.table 패턴
        /\b(?:FROM|JOIN)\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s*\.\s*[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?\s*\.\s*[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?/i
      ]

      for (const pattern of datasourcePatterns) {
        const match = trimmedQuery.match(pattern)
        if (match?.[1]) {
          return match[1].replace(/[`"]/g, '').trim()
        }
      }

      return ''
    }

    const withLimit = (rawSql: string, rowLimit: number): string => {
      const trimmed = String(rawSql || '').trim().replace(/;+\s*$/, '')
      if (!trimmed) return ''
      if (/\blimit\s+\d+\s*$/i.test(trimmed)) {
        return trimmed.replace(/\blimit\s+\d+\s*$/i, `LIMIT ${rowLimit}`)
      }
      return `${trimmed} LIMIT ${rowLimit}`
    }

    const executeDirectSqlStream = async (
      sqlToRun: string,
      ds: string
    ): Promise<
      | { ok: true; columns: string[]; rows: unknown[][]; rowCount: number; executionTimeMs: number }
      | { ok: false; error: string }
    > => {
      const response = await fetch(`${TEXT2SQL_API_BASE}/direct-sql/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sqlToRun,
          datasource: ds,
          max_sql_seconds: 30,
          format_with_ai: false
        })
      })

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` }
      }

      const reader = response.body?.getReader()
      if (!reader) return { ok: false, error: '스트림을 읽을 수 없습니다' }

      const decoder = new TextDecoder()
      let buffer = ''
      let latestError = ''
      type StreamResultPayload = {
        columns: string[]
        rows: unknown[][]
        rowCount: number
        executionTimeMs: number
      }
      let latestResult: StreamResultPayload | undefined

      const consumeLine = (line: string) => {
        try {
          const event = JSON.parse(line)
          switch (event.event) {
            case 'result':
              latestResult = {
                columns: event.columns || [],
                rows: event.rows || [],
                rowCount: Number(event.row_count || 0),
                executionTimeMs: Number(event.execution_time_ms || 0)
              }
              break
            case 'error':
              latestError = String(event.message || 'SQL 실행 오류')
              break
          }
        } catch {
          // JSON 파싱 실패 라인은 무시
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.trim()) consumeLine(line)
        }
      }

      if (buffer.trim()) {
        consumeLine(buffer.trim())
      }

      if (typeof latestResult !== 'undefined') {
        return {
          ok: true,
          columns: latestResult.columns,
          rows: latestResult.rows,
          rowCount: latestResult.rowCount,
          executionTimeMs: latestResult.executionTimeMs
        }
      }
      return { ok: false, error: latestError || 'SQL 실행 결과를 수신하지 못했습니다.' }
    }

    const candidateSqls: string[] = []
    let primarySql = ''

    // ObjectType인 경우 Neo4j에서 materializedView 또는 query 가져오기
    if (schemaName === 'ObjectType' || normalizedInputDatasource === 'ontology') {
      try {
        const response = await fetch(`${import.meta.env.VITE_GATEWAY_URL || ''}/api/gateway/ontology/object-types/${encodeURIComponent(tableName)}`)
        if (!response.ok) {
          throw new Error(`ObjectType '${tableName}' 정보를 조회할 수 없습니다.`)
        }
        const otData = await response.json()
        const otQuery = String(otData.query || '').trim()
        const otDatasource = [
          String(otData.datasource || '').trim(),
          String(otData.dataSource || '').trim(),
          extractDatasourceFromSql(otQuery)
        ].find(Boolean) || ''
        if (!resolvedDatasource && otDatasource) {
          resolvedDatasource = otDatasource
        }

        // MV 우선, 실패 시 원본 query로 자동 폴백
        if (otData.materializedView) {
          primarySql = `SELECT * FROM ${otData.materializedView} LIMIT ${limit}`
          candidateSqls.push(primarySql)
        }

        if (otQuery) {
          const fallbackSql = withLimit(otQuery, limit)
          if (fallbackSql && !candidateSqls.includes(fallbackSql)) {
            candidateSqls.push(fallbackSql)
          }
          if (!primarySql) {
            primarySql = fallbackSql
          }
        }

        if (!primarySql) {
          throw new Error(`ObjectType '${tableName}'에 조회 가능한 데이터가 없습니다.`)
        }
      } catch (error) {
        tableDataPanel.value = {
          ...tableDataPanel.value,
          isOpen: true,
          tableName,
          schema: schemaName,
          datasource: resolvedDatasource,
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          isLoading: false,
          error: error instanceof Error ? error.message : 'ObjectType 정보 조회 실패',
          limit,
          executedSql: ''
        }
        return
      }
    } else {
      // 일반 테이블 - 대문자가 포함된 경우 식별자 감싸기
      let fullTableName: string
      const hasUpperCase = (str: string) => /[A-Z]/.test(str)
      const quoteMysqlIdent = (str: string) => `\`${str.replace(/`/g, '``')}\``
      const needsSchemaQuoting = hasUpperCase(schemaName)
      const needsTableQuoting = hasUpperCase(tableName)

      if (resolvedDatasource) {
        const schemaIdent = needsSchemaQuoting ? quoteMysqlIdent(schemaName) : schemaName
        const tableIdent = needsTableQuoting ? quoteMysqlIdent(tableName) : tableName
        fullTableName = `${resolvedDatasource}.${schemaIdent}.${tableIdent}`
      } else {
        if (needsSchemaQuoting || needsTableQuoting) {
          fullTableName = `"${schemaName}"."${tableName}"`
        } else {
          fullTableName = `${schemaName}.${tableName}`
        }
      }
      primarySql = `SELECT * FROM ${fullTableName} LIMIT ${limit}`
      candidateSqls.push(primarySql)
    }

    if (!resolvedDatasource) {
      resolvedDatasource = extractDatasourceFromSql(primarySql)
    }

    if (!resolvedDatasource) {
      tableDataPanel.value = {
        ...tableDataPanel.value,
        isOpen: true,
        tableName,
        schema: schemaName,
        datasource: '',
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        isLoading: false,
        error: '데이터소스를 확인할 수 없습니다. 테이블의 datasource를 먼저 선택/확인해주세요.',
        limit,
        executedSql: primarySql
      }
      return
    }

    tableDataPanel.value = {
      ...tableDataPanel.value,
      isOpen: true,
      tableName,
      schema: schemaName,
      datasource: resolvedDatasource,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      isLoading: true,
      error: null,
      limit,
      executedSql: primarySql
    }

    let lastError = ''
    for (let i = 0; i < candidateSqls.length; i += 1) {
      const candidateSql = candidateSqls[i]
      tableDataPanel.value.executedSql = candidateSql
      const result = await executeDirectSqlStream(candidateSql, resolvedDatasource)
      if (result.ok) {
        tableDataPanel.value.columns = result.columns
        tableDataPanel.value.rows = result.rows
        tableDataPanel.value.rowCount = result.rowCount
        tableDataPanel.value.executionTimeMs = result.executionTimeMs
        tableDataPanel.value.isLoading = false
        tableDataPanel.value.error = null
        return
      }
      lastError = result.error
    }

    tableDataPanel.value.error = lastError || '알 수 없는 오류'
    tableDataPanel.value.isLoading = false
  }
  
  /**
   * 테이블 데이터 조회 패널 닫기
   */
  function closeTableDataPanel() {
    tableDataPanel.value = {
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
      isExecutingBehavior: false
    }
  }
  
  /**
   * 조회 결과 Limit 변경 후 재조회
   */
  function changeTableDataLimit(limit: number) {
    if (tableDataPanel.value.tableName) {
      queryTableData(
        tableDataPanel.value.tableName,
        tableDataPanel.value.schema,
        limit,
        tableDataPanel.value.datasource
      )
    }
  }
  
  function updateEdgesFromRelationships() {
    const newEdges: Edge[] = []
    const tableNamesOnCanvas = new Set(nodes.value.map(n => n.data?.tableName).filter(Boolean))
    
    // 노드 위치를 기반으로 핸들 위치 결정
    // 소스가 타겟의 왼쪽에 있으면: sourceHandle=right, targetHandle=left
    // 소스가 타겟의 오른쪽에 있으면: sourceHandle=left, targetHandle=right
    function getHandles(fromTable: string, toTable: string, fromColumn: string, toColumn: string) {
      const sourceNode = nodes.value.find(n => n.id === `table-${fromTable}`)
      const targetNode = nodes.value.find(n => n.id === `table-${toTable}`)
      
      if (!sourceNode || !targetNode) {
        // 기본값: 오른쪽에서 왼쪽으로
        return {
          sourceHandle: `fk-${fromColumn}-source`,
          targetHandle: `pk-${toColumn}`
        }
      }
      
      const sourceX = sourceNode.position?.x ?? 0
      const targetX = targetNode.position?.x ?? 0
      
      // 소스가 타겟의 왼쪽에 있는 경우
      if (sourceX < targetX) {
        return {
          sourceHandle: `fk-${fromColumn}-source`,  // 오른쪽 source
          targetHandle: `pk-${toColumn}`             // 왼쪽 target
        }
      } else {
        // 소스가 타겟의 오른쪽에 있는 경우
        return {
          sourceHandle: `fk-${fromColumn}-source-left`,  // 왼쪽 source
          targetHandle: `pk-${toColumn}-right`            // 오른쪽 target
        }
      }
    }
    
    // Parse cardinality from description or relationship_type
    interface CardinalityInfo {
      label: string
      color: string
      animated: boolean
      markerStart?: string
      markerEnd?: string
    }
    
    function getCardinalityInfo(rel: RelationshipData): CardinalityInfo {
      const desc = rel.description || ''
      const type = rel.relationship_type || ''
      
      // Check for cardinality markers
      // 1:1 - One to One (vertical bars on both ends)
      if (desc.includes('[1:1]') || type === 'ONE_TO_ONE') {
        return { 
          label: '1:1', 
          color: '#40c057', 
          animated: false,
          markerStart: 'url(#erd-one-green)',
          markerEnd: 'url(#erd-one-green)'
        }
      } 
      // 1:N - One to Many (vertical bar on source, crow's foot on target)
      else if (desc.includes('[1:N]') || type === 'ONE_TO_MANY') {
        return { 
          label: '1:N', 
          color: '#228be6', 
          animated: false,
          markerStart: 'url(#erd-one)',
          markerEnd: 'url(#crowfoot-many)'
        }
      } 
      // N:1 - Many to One (crow's foot on source, vertical bar on target)
      else if (desc.includes('[N:1]') || type === 'MANY_TO_ONE') {
        return { 
          label: 'N:1', 
          color: '#228be6', 
          animated: false,
          markerStart: 'url(#crowfoot-many)',
          markerEnd: 'url(#erd-one)'
        }
      } 
      // N:N - Many to Many (crow's foot on both ends)
      else if (desc.includes('[N:N]') || type === 'MANY_TO_MANY') {
        return { 
          label: 'N:N', 
          color: '#be4bdb', 
          animated: false,
          markerStart: 'url(#crowfoot-many-purple)',
          markerEnd: 'url(#crowfoot-many-purple)'
        }
      }
      
      // Default - FK relationship
      return { 
        label: `${rel.from_column} → ${rel.to_column}`, 
        color: '#228be6', 
        animated: true 
      }
    }
    
    // User-defined relationships (사용자 추가 FK - 주황색 실선)
    // fkVisibility.user가 false면 표시하지 않음
    if (fkVisibility.value.user) {
      userRelationships.value.forEach((rel) => {
        if (tableNamesOnCanvas.has(rel.from_table) && tableNamesOnCanvas.has(rel.to_table)) {
          const cardinalityInfo = getCardinalityInfo(rel)
          
          // 관계 이름 우선, 없으면 description, 마지막으로 기본 라벨
          let displayLabel = rel.name || rel.description || ''
          displayLabel = displayLabel.replace(/\[.*?\]\s*/, '') // Remove cardinality marker from display
          if (!displayLabel.trim()) {
            displayLabel = cardinalityInfo.label
          }
          
          // 사용자 추가 FK는 주황색 실선
          const handles = getHandles(rel.from_table, rel.to_table, rel.from_column, rel.to_column)
          const edge: Edge = {
            id: `rel-${rel.from_table}-${rel.from_column}-${rel.to_table}-${rel.to_column}`,
            source: `table-${rel.from_table}`,
            target: `table-${rel.to_table}`,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            type: 'default',  // 베지어 곡선
            animated: false,
            label: displayLabel,
            style: { stroke: '#f59e0b', strokeWidth: 2.5 },  // 주황색 실선
            labelStyle: { fill: '#e9ecef', fontSize: 11, fontWeight: 600 },
            labelBgStyle: { fill: '#1a1b26', fillOpacity: 0.9 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 20, height: 20 }
          }
          
          // Add markers if defined
          if (cardinalityInfo.markerStart) {
            edge.markerStart = cardinalityInfo.markerStart
          }
          if (cardinalityInfo.markerEnd) {
            edge.markerEnd = cardinalityInfo.markerEnd
          }
          
          newEdges.push(edge)
        }
      })
    }
    
    // Neo4j FK_TO_TABLE 관계 (column_pairs 기반)
    // source 속성에 따라 스타일 구분:
    // - 'ddl': 실선, 초록색
    // - 'user': 실선, 주황색
    // - 'code': 점선, 하늘색/푸른색
    neo4jRelationships.value.forEach((rel) => {
      if (tableNamesOnCanvas.has(rel.from_table) && tableNamesOnCanvas.has(rel.to_table)) {
        // source에 따른 스타일 결정
        const isCode = rel.source === 'code' || rel.type === 'CO_REFERENCED'
        const isUser = rel.source === 'user'
        
        // visibility 체크 - 해당 source 유형이 비활성화되어 있으면 스킵
        const sourceType = isCode ? 'code' : isUser ? 'user' : 'ddl'
        if (!fkVisibility.value[sourceType]) {
          return  // 이 관계는 표시하지 않음
        }

        // 색상: code=하늘색, ddl=초록, user=주황
        const strokeColor = isCode ? '#38bdf8' : isUser ? '#f59e0b' : '#22c55e'
        const strokeDasharray = isCode ? '6 3' : undefined  // 코드 분석만 점선
        
        // 각 컬럼 페어에 대해 별도의 엣지 생성
        // source와 target 컬럼이 모두 유효한 경우에만 엣지 생성
        if (rel.column_pairs && rel.column_pairs.length > 0) {
          rel.column_pairs.forEach((pair) => {
            // 빈 컬럼명은 건너뛰기 (유효하지 않은 관계)
            if (!pair.source || !pair.target || pair.source.trim() === '' || pair.target.trim() === '') {
              return  // 유효하지 않은 컬럼 페어 스킵
            }
            
            const edgeId = `neo4j-${rel.from_table}-${pair.source}-${rel.to_table}-${pair.target}`
            
            // 중복 체크
            if (!newEdges.some(e => e.id === edgeId)) {
              // 관계 이름 우선: pair.name > rel.name > 기본 라벨
              const relationshipName = pair.name || rel.name
              const edgeLabel = relationshipName || `${pair.source} → ${pair.target}`
              
              // 노드 위치 기반 핸들 선택
              const handles = getHandles(rel.from_table, rel.to_table, pair.source, pair.target)
              
              newEdges.push({
                id: edgeId,
                source: `table-${rel.from_table}`,
                target: `table-${rel.to_table}`,
                sourceHandle: handles.sourceHandle,
                targetHandle: handles.targetHandle,
                type: 'default',  // 베지어 곡선
                animated: false,
                label: edgeLabel,
                style: { stroke: strokeColor, strokeWidth: 2.5, strokeDasharray },
                labelStyle: { fill: '#e9ecef', fontSize: 10, fontWeight: 500 },
                labelBgStyle: { fill: '#1a1b26', fillOpacity: 0.9 },
                markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor, width: 20, height: 20 }
              })
            }
          })
        }
        // Note: column_pairs가 없거나 모두 유효하지 않은 경우 기본 엣지를 생성하지 않음
        // 테이블-테이블 간의 모호한 연결은 표시하지 않음
      }
    })
    
    // Note: Auto-detect FK 로직 제거됨
    // 정확한 FK 정보(DDL, 프로시저 분석, 사용자 추가)만 사용
    // 컬럼 이름 기반 추측은 부정확하고 테이블-테이블 간 연결만 생성하므로 제거
    
    edges.value = newEdges
  }
  
  async function addRelationship(relationship: Omit<RelationshipData, 'relationship_type'>) {
    try {
      if (dataSource.value === 'robo') {
        await roboSchemaApi.addRelationship({
          ...relationship,
          relationship_type: 'FK_TO_TABLE'
        })
      } else {
        await text2sqlApi.addRelationship({
          ...relationship,
          relationship_type: 'FK_TO_TABLE'
        })
      }
      await loadUserRelationships()
    } catch (error) {
      logger.error('Failed to add relationship:', error)
      throw error
    }
  }
  
  type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:N'
  type MatchStrategy = 'EXACT_MATCH' | 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  
  async function addRelationshipWithCardinality(relationship: Omit<RelationshipData, 'relationship_type'> & { cardinality: Cardinality; matchStrategy?: MatchStrategy }) {
    try {
      // Map cardinality to relationship type
      let relationshipType = 'FK_TO_TABLE'
      switch (relationship.cardinality) {
        case '1:1':
          relationshipType = 'ONE_TO_ONE'
          break
        case '1:N':
          relationshipType = 'ONE_TO_MANY'
          break
        case 'N:1':
          relationshipType = 'MANY_TO_ONE'
          break
        case 'N:N':
          relationshipType = 'MANY_TO_MANY'
          break
      }
      
      const relData = {
        from_table: relationship.from_table,
        from_schema: relationship.from_schema,
        from_column: relationship.from_column,
        to_table: relationship.to_table,
        to_schema: relationship.to_schema,
        to_column: relationship.to_column,
        description: relationship.description,
        relationship_type: relationshipType,
        match_strategy: relationship.matchStrategy || 'EXACT_MATCH'  // Correlation 전략 추가
      }
      
      if (dataSource.value === 'robo') {
        await roboSchemaApi.addRelationship(relData)
      } else {
        await text2sqlApi.addRelationship(relData)
      }
      await loadUserRelationships()
    } catch (error) {
      logger.error('Failed to add relationship:', error)
      throw error
    }
  }
  
  // 삭제는 from/to 식별자만으로 충분(relationship_type 불필요) — 호출부가 그걸 생략할 수 있게 Omit.
  async function removeRelationship(relationship: Omit<RelationshipData, 'relationship_type'>) {
    try {
      const params = {
        from_table: relationship.from_table,
        from_column: relationship.from_column,
        to_table: relationship.to_table,
        to_column: relationship.to_column,
        from_schema: relationship.from_schema,
        to_schema: relationship.to_schema
      }
      
      logger.debug('[schemaCanvas.removeRelationship] 삭제 요청:', params)
      
      if (dataSource.value === 'robo') {
        const result = await roboSchemaApi.deleteRelationship(params)
        logger.debug('[schemaCanvas.removeRelationship] 삭제 결과:', result)
        
        // 삭제된 개수가 0이면 에러
        if (result.deleted === 0) {
          throw new Error('삭제된 관계가 없습니다. 관계 정보를 확인해주세요.')
        }
      } else {
        await text2sqlApi.removeRelationship(params)
      }
      
      await loadUserRelationships()
      return { success: true }
    } catch (error) {
      logger.error('Failed to remove relationship:', error)
      throw error
    }
  }
  
  async function updateTableDescription(tableName: string, description: string) {
    try {
      // 테이블의 실제 스키마 찾기
      const table = allTables.value.find(t => t.name === tableName)
      const schema = table?.schema || selectedTable.value?.schema || 'public'
      
      // 세션 헤더 전달하여 robo-analyzer API 호출
      const headers = sessionStore.getHeaders()
      await text2sqlApi.updateTableDescription(tableName, schema, description, headers)
      
      // Update local data
      if (table) {
        table.description = description
      }
      
      const node = nodes.value.find(n => n.data?.tableName === tableName)
      if (node && node.data) {
        node.data.description = description
      }
    } catch (error) {
      logger.error('Failed to update table description:', error)
      throw error
    }
  }
  
  async function updateColumnDescription(tableName: string, columnName: string, description: string) {
    try {
      // 테이블의 실제 스키마 찾기
      const table = allTables.value.find(t => t.name === tableName)
      const schema = table?.schema || selectedTable.value?.schema || 'public'
      
      // 세션 헤더 전달하여 robo-analyzer API 호출
      const headers = sessionStore.getHeaders()
      await text2sqlApi.updateColumnDescription(tableName, columnName, schema, description, headers)
      
      // Update cache
      if (tableColumnsCache.value[tableName]) {
        const col = tableColumnsCache.value[tableName].find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }
      
      // Update node
      const node = nodes.value.find(n => n.data?.tableName === tableName)
      if (node && node.data) {
        const col = node.data.columns.find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }
      
      // Update selected table columns
      if (selectedTable.value?.name === tableName) {
        const col = selectedTableColumns.value.find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }
    } catch (error) {
      logger.error('Failed to update column description:', error)
      throw error
    }
  }
  
  function clearCanvas() {
    nodes.value = []
    edges.value = []
    neo4jRelationships.value = []
    selectedNodeId.value = null
    selectedTable.value = null
    isDetailPanelOpen.value = false
  }
  
  /**
   * 모든 테이블을 캔버스에 추가하고 그리드 레이아웃으로 배치
   */
  async function addAllTablesToCanvas() {
    loading.value = true
    try {
      // 기존 노드 초기화
      nodes.value = []
      edges.value = []
      
      const tables = allTables.value
      if (tables.length === 0) return
      
      // 그리드 레이아웃 계산
      const NODE_WIDTH = 280
      const NODE_HEIGHT = 200
      const GAP_X = 50
      const GAP_Y = 50
      const COLS = Math.ceil(Math.sqrt(tables.length))
      
      // 모든 테이블 추가
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i]
        const col = i % COLS
        const row = Math.floor(i / COLS)
        
        const position = {
          x: 50 + col * (NODE_WIDTH + GAP_X),
          y: 50 + row * (NODE_HEIGHT + GAP_Y)
        }
        
        // Load columns
        const columns = await loadTableColumns(table.name, table.schema, table.datasource || '')
        
        const newNode: Node<TableNodeData> = {
          id: `table-${table.name}`,
          type: 'tableNode',
          position,
          data: {
            tableName: table.name,
            schema: table.schema || 'public',
            description: table.description,
            columns: columns,
            columnCount: table.column_count
          }
        }
        
        nodes.value.push(newNode)
      }
      
      // 관계 업데이트
      updateEdgesFromRelationships()
    } finally {
      loading.value = false
    }
  }
  
  // Auto-load related tables (uses Neo4j relationship data)
  async function loadRelatedTables(tableName: string) {
    await loadRelatedTablesFromNeo4j(tableName)
  }
  
  /** 자동 레이아웃 — ELK layered 알고리즘 (구현은 @/utils/elkLayout) */
  async function applyAutoLayout() {
    await applyElkLayout(nodes.value, edges.value)
  }
  
  // Set data source
  function setDataSource(source: SchemaDataSource) {
    dataSource.value = source
  }
  
  return {
    // State
    nodes,
    edges,
    allTables,
    tableColumnsCache,
    userRelationships,
    selectedNodeId,
    selectedTable,
    selectedTableColumns,
    loading,
    isDetailPanelOpen,
    searchQuery,
    dataSource,
    fkVisibility,  // FK 관계 유형별 표시 상태
    showLogicalNames,  // 논리명/물리명 전환
    sourceCodePanel,  // 소스 코드 패널 상태
    tableDataPanel,   // 테이블 데이터 조회 패널 상태
    
    // 시멘틱 검색 상태
    isSemanticSearching,
    semanticSearchResults,
    semanticSearchError,
    
    // Computed
    filteredTables,
    tablesOnCanvas,
    tablesNotOnCanvas,
    datasources,
    schemas,
    tablesByDatasource,
    
    // Actions
    loadAllTables,
    loadTableColumns,
    loadUserRelationships,
    addTableToCanvas,
    removeTableFromCanvas,
    updateNodePosition,
    selectNode,
    clearSelection,
    closeDetailPanel,
    openSourceCodePanel,
    closeSourceCodePanel,
    queryTableData,
    startBehaviorMode,
    cancelBehaviorMode,
    closeTableDataPanel,
    changeTableDataLimit,
    updateEdgesFromRelationships,
    debouncedUpdateEdges,
    addRelationship,
    addRelationshipWithCardinality,
    removeRelationship,
    updateRelationshipInfo,
    updateTableDescription,
    updateColumnDescription,
    clearCanvas,
    loadRelatedTables,
    setDataSource,
    addAllTablesToCanvas,
    applyAutoLayout,
    toggleFkVisibility,  // FK 표시 토글 함수
    toggleLogicalNames,  // 논리명/물리명 전환 함수
    
    // 시멘틱 검색
    performSemanticSearch,
    clearSemanticSearch,
    
    // 실시간 캔버스 업데이트
    handleCanvasUpdate,
    updatedNodes,
    updatedColumns,
    newRelationships,
    
    // 전체 테이블 보기 모드
    isFullViewMode,
    setFullViewMode,
    newlyAddedTables,
    newlyAddedEdges,
    addTableToCanvasWithAnimation
  }
})

