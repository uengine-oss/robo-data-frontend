/**
 * schemaCanvas.ts
 * VueFlow 기반 스키마 캔버스 상태 관리
 *
 * 스키마·관계·설명 = robo-analyzer Neo4j(DDL 분석 결과).
 * 테이블의 실제 행 조회만 data-fabric(MindsDB → 대상 DB).
 */

import { logger } from '@/shared/utils/logger'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Edge, Node } from '@vue-flow/core'
import { catalogSchemaApi } from '@/domains/catalog'
import {
  objectExplorerApi,
  type OntologyBehavior,
} from '@/domains/ontology'
import { useRuntimeStore } from '@/shared/stores/runtime'
import { applyElkLayout } from '@/shared/utils/elkLayout'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import {
  mergeCatalogRelationships,
  projectRelationshipEdges,
  type CatalogRelationship,
  type RelationshipVisibility,
  type SchemaRelationship,
} from '../model/relationshipEdgeProjection'
import { useSchemaCanvasHighlights } from '../composables/useSchemaCanvasHighlights'
import {
  normalizeTableIdentity,
  resolveRelationshipTable,
  resolveTableIdentity,
  sameTableIdentity,
  tableIdentityKey,
  tableIdentityLabel,
  tableNodeId,
  type SchemaTableIdentityInput,
} from '../model/tableIdentity'
import {
  createClosedSourceCodePanel,
  createOpenSourceCodePanel,
  loadProcedureStatements,
  type SourceCodePanelState,
} from '../application/sourceCodePanel'
import {
  type SchemaModelingColumn,
  type SchemaModelingTable,
} from '../application/schemaCatalogDiscovery'
import { useSchemaCatalogDiscovery } from '../composables/useSchemaCatalogDiscovery'
import { useSchemaTableDataPanel } from '../composables/useSchemaTableDataPanel'
import {
  projectSchemaCanvasGridPosition,
  projectSchemaCanvasNode,
  type TableNodeData,
} from '../model/schemaCanvasNodeProjection'

export interface SchemaCanvasTableInfo extends SchemaModelingTable {
  isObjectType?: boolean
  behaviors?: OntologyBehavior[]
}

export const useSchemaCanvasStore = defineStore('schemaCanvas', () => {
  // Session stores
  const runtimeStore = useRuntimeStore()
  const managedTimeouts = useManagedTimeouts()

  function catalogContext(requireApiKey = false, signal?: AbortSignal) {
    return {
      headers: runtimeStore.getHeaders(),
      apiKey: requireApiKey ? runtimeStore.apiKey : undefined,
      signal,
    }
  }

  const {
    allTables,
    tableListLoading,
    tableListError,
    semanticSearchLoading: isSemanticSearching,
    semanticSearchResults,
    semanticSearchError,
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
  } = useSchemaCatalogDiscovery({
    context: (requireApiKey, signal) => catalogContext(requireApiKey, signal),
  })

  // Canvas state
  const nodes = ref<Node<TableNodeData>[]>([])
  const tableAddOperations = new Map<string, Promise<void>>()
  const edges = ref<Edge[]>([])

  // 노드가 변경될 때 엣지 자동 업데이트 (debounced)
  // debounced 엣지 업데이트 함수 (노드 이동 시 사용)
  function debouncedUpdateEdges() {
    managedTimeouts.schedule('schema-edge-update', () => {
      updateEdgesFromRelationships()
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

    // Relationships
    const userRelationships = ref<SchemaRelationship[]>([])

    // Catalog에서 가져온 FK 관계 (column_pairs 포함)
    const neo4jRelationships = ref<CatalogRelationship[]>([])

  // UI state
  const selectedNodeId = ref<string | null>(null)
  const selectedTable = ref<SchemaCanvasTableInfo | null>(null)
  const selectedTableColumns = ref<SchemaModelingColumn[]>([])
  const canvasLoading = ref(false)
  const loading = computed(() => tableListLoading.value || canvasLoading.value)
  const relationshipLoadError = ref<string | null>(null)
  const relatedTableLoadError = ref<{
    table: SchemaTableIdentityInput
    tableName: string
    message: string
  } | null>(null)
  const isDetailPanelOpen = ref(false)

  // 소스 코드 패널 상태
  const sourceCodePanel = ref<SourceCodePanelState>(createClosedSourceCodePanel())
  let sourceStatementRequestId = 0

  const {
    panel: tableDataPanel,
    query: queryTableData,
    startBehaviorMode,
    cancelBehaviorMode,
    close: closeTableDataPanel,
    changeLimit: changeTableDataLimit,
  } = useSchemaTableDataPanel({
    getTables: () => allTables.value,
    beforeOpen: () => {
      isDetailPanelOpen.value = false
      closeSourceCodePanel()
    },
  })

  // Search/filter
  const searchQuery = ref('')

  // FK 관계 유형별 표시 여부 (범례 체크박스용)
  // source: 'ddl' | 'code' | 'user' (procedure는 code로 통합)
  const fkVisibility = ref<RelationshipVisibility>({
    ddl: true,        // DDL에서 추출 (실선, 초록색)
    code: true,       // 코드 분석 (점선, 하늘색)
    user: true        // 사용자 추가 (실선, 주황색)
  })

  // FK 표시 토글 함수
  function toggleFkVisibility(source: 'ddl' | 'procedure' | 'code' | 'user') {
    // 'procedure'는 'code'와 동일 그룹으로 토글
    const key = source === 'procedure' ? 'code' : source
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

  const {
    updatedNodes,
    updatedColumns,
    newRelationships,
    newlyAddedTables,
    newlyAddedEdges,
    updatedNodeHighlights,
    updatedColumnHighlights,
    relationshipHighlights,
    addedTableHighlights,
    addedEdgeHighlights,
    clear: clearTransientHighlights,
    isTableNewlyAdded,
    isEdgeNewlyAdded,
    isNodeRecentlyUpdated,
    isColumnRecentlyUpdated,
  } = useSchemaCanvasHighlights()

  onScopeDispose(() => {
    sourceStatementRequestId += 1
    clearTransientHighlights()
  })

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
    const now = Date.now()

    const resolveEventTable = (): SchemaModelingTable | null => {
      const resolution = resolveRelationshipTable(allTables.value, tableName, event.schema)
      if (resolution.status === 'found') return resolution.value
      logger.warn(
        `[Canvas Update] ${tableName}${event.schema ? ` (${event.schema})` : ''} 테이블을 유일하게 식별할 수 없어 이벤트를 적용하지 않습니다.`,
      )
      return null
    }

    let eventTable = resolveEventTable()

    logger.debug(`[Canvas Update] ${updateType}: ${tableName}`, changes)

    // 새 테이블 추가 처리
    if (updateType === 'table_added') {
      // 테이블 목록 새로고침
      await loadAllTables()
      eventTable = resolveEventTable()
      if (!eventTable) return

      const existingNode = nodes.value.find(n => n.id === tableNodeId(eventTable!))

      if (!existingNode) {
        // 전체 보기 모드: 모든 새 테이블 자동 추가
        if (isFullViewMode.value) {
          await addTableToCanvasWithAnimation(eventTable)
        } else {
          // 부분 보기 모드: 현재 캔버스의 테이블과 FK 관계가 있는 테이블만 추가
          // 현재 캔버스에 있는 테이블들의 이름 목록
          const canvasTableNames = nodes.value
            .filter(n => n.type === 'tableNode')
            .map(n => n.data?.tableName)
            .filter(Boolean) as string[]

          // Neo4j 관계에서 현재 캔버스 테이블과 FK 관계가 있는지 확인
          const hasRelationWithCanvas = neo4jRelationships.value.some(rel => {
            if (rel.type !== 'FK') return false
            // 새 테이블이 from 또는 to 중 하나이고, 다른 쪽이 캔버스에 있는 경우
            if (rel.from_table === tableName && canvasTableNames.includes(rel.to_table)) return true
            if (rel.to_table === tableName && canvasTableNames.includes(rel.from_table)) return true
            return false
          })

          if (hasRelationWithCanvas) {
            await addTableToCanvasWithAnimation(eventTable)
          }
        }
      }
      return
    }

    if (!eventTable) return
    const nodeId = tableNodeId(eventTable)

    // 현재 캔버스에 없는 테이블 처리
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) {
        // 전체 테이블 보기 모드에서는 테이블 자동 추가
        if (isFullViewMode.value && (updateType === 'table_description' || updateType === 'column_description')) {
          await addTableToCanvasWithAnimation(eventTable)
          // 추가가 완료된 뒤 동일 이벤트를 새 노드에 즉시 적용
          await handleCanvasUpdate(event)
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
        updatedNodeHighlights.mark(nodeId, now)
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
        updatedColumnHighlights.mark(`${nodeId}:${field}`, now)
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
              data_type: (changes.data_type as string) || 'unknown',
              nullable: (changes.nullable as boolean) ?? true,
              description: (changes.description as string) || ''
            }
            node.data.columns.push(newColumn)
            node.data.columnCount = node.data.columns.length
          }
        }
        updatedColumnHighlights.mark(`${nodeId}:${field}`, now)
        break
      }

      case 'relationship_added': {
        // 새 관계 추가
        if (changes?.from_column && changes?.to_table && changes?.to_column) {
          const relKey = `${tableName}.${changes.from_column}->${changes.to_table}.${changes.to_column}`
          relationshipHighlights.mark(relKey, now)
          addedEdgeHighlights.mark(relKey, now)

          // 전체 보기 모드가 아닌 경우: 현재 캔버스에 있는 테이블과 FK 관계가 있는 테이블만 추가
          // 소스 테이블이 캔버스에 있으면 타겟 테이블도 추가
          const targetTable = changes.to_table as string
          const targetSchema = typeof changes.to_schema === 'string' ? changes.to_schema : undefined
          const targetResolution = resolveRelationshipTable(allTables.value, targetTable, targetSchema)
          const sourceNodeExists = nodes.value.some(n => n.id === nodeId)
          const targetNodeExists = targetResolution.status === 'found'
            && nodes.value.some(n => n.id === tableNodeId(targetResolution.value))

          if (sourceNodeExists && !targetNodeExists && targetResolution.status === 'found') {
            await addTableToCanvasWithAnimation(targetResolution.value)
          }
        }
        // Neo4j 관계 다시 로드
        await loadRelatedTablesFromNeo4j(eventTable)
        break
      }
    }

  }

  /**
   * 테이블을 캔버스에 애니메이션과 함께 추가
   */
  async function addTableToCanvasWithAnimation(table: SchemaModelingTable) {
    const nodeId = tableNodeId(table)

    // 이미 존재하면 무시
    if (nodes.value.some(n => n.id === nodeId)) {
      return
    }

    const now = Date.now()

    // 새 테이블 애니메이션 상태 설정
    addedTableHighlights.mark(nodeId, now)

    // 테이블 추가
    await addTableToCanvas(table, undefined, { autoLoadRelated: false, isPrimary: false })

  }

  /**
   * 전체 테이블 보기 모드 설정
   */
  function setFullViewMode(enabled: boolean) {
    isFullViewMode.value = enabled
    logger.debug(`[Canvas] 전체 테이블 보기 모드: ${enabled ? 'ON' : 'OFF'}`)
  }

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
    return nodes.value
      .filter(node => Boolean(node.data?.tableName))
      .map(node => tableIdentityKey({
        name: node.data!.tableName,
        schema: node.data!.schema,
        datasource: node.data!.datasource,
      }))
  })

  const tablesNotOnCanvas = computed(() => {
    const onCanvas = new Set(tablesOnCanvas.value)
    return filteredTables.value.filter(table => !onCanvas.has(tableIdentityKey(table)))
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

  // 스키마별 테이블 그룹화 (캔버스에 없는 테이블만)
  const tablesBySchema = computed(() => {
    const onCanvas = new Set(tablesOnCanvas.value)
    const grouped: Record<string, SchemaModelingTable[]> = {}

    filteredTables.value.forEach(table => {
      if (onCanvas.has(tableIdentityKey(table))) return

      const schema = table.schema || 'public'
      if (!grouped[schema]) {
        grouped[schema] = []
      }
      grouped[schema].push(table)
    })

    // 각 스키마 내 테이블 정렬
    Object.keys(grouped).forEach(schema => {
      grouped[schema].sort((a, b) => a.name.localeCompare(b.name))
    })

    return grouped
  })

  // 3레벨 그룹핑: datasource > schema > tables (단일 통합 트리 — 캔버스 여부는 is-on-canvas 로 표시)
  const tablesByDatasource = computed(() => {
    const grouped: Record<string, Record<string, SchemaModelingTable[]>> = {}

    filteredTables.value.forEach(table => {
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
  async function loadUserRelationships(): Promise<boolean> {
    relationshipLoadError.value = null
    try {
      const response = await catalogSchemaApi.getRelationships(catalogContext())
      const relationships: SchemaRelationship[] = (response.relationships || []).map(r => ({
        from_table: r.from_table,
        from_schema: r.from_schema,
        from_column: r.from_column,
        to_table: r.to_table,
        to_schema: r.to_schema,
        to_column: r.to_column,
        relationship_type: r.relationship_type,
        description: r.description,
        name: r.name  // 관계 이름
      }))

      userRelationships.value = relationships
      updateEdgesFromRelationships()
      return true
    } catch (error) {
      logger.error('Failed to load relationships:', error)
      relationshipLoadError.value = error instanceof Error
        ? error.message
        : '릴레이션 목록을 불러오지 못했습니다.'
      return false
    }
  }

  async function addTableToCanvas(
    table: SchemaModelingTable,
    position?: { x: number; y: number },
    options?: {
      autoLoadRelated?: boolean
      isPrimary?: boolean
      columns?: SchemaModelingColumn[]  // 컬럼을 직접 전달 (ObjectType용)
      isObjectType?: boolean  // ObjectType 여부
      behaviors?: OntologyBehavior[]  // Behavior 목록
      requireRelatedSuccess?: boolean
    }
  ) {
    const nodeId = tableNodeId(table)
    // Check if already on canvas
    if (nodes.value.some(node => node.id === nodeId)) {
      logger.debug(`[SchemaCanvas] 테이블 ${tableIdentityLabel(table)}은 이미 캔버스에 있습니다`)
      return
    }

    const inFlight = tableAddOperations.get(nodeId)
    if (inFlight) {
      await inFlight
      return
    }

    const operation = (async () => {
      logger.debug(`[SchemaCanvas] 📋 테이블 추가 중: ${table.name} (isPrimary: ${options?.isPrimary ?? true})`)

      // Load columns - 직접 전달된 컬럼이 있으면 사용, 없으면 DB에서 로드
      let columns: SchemaModelingColumn[]
      if (options?.columns) {
        columns = options.columns
        logger.debug(`[SchemaCanvas] 직접 전달된 컬럼 사용: ${columns.length}개`)
      } else {
        columns = await loadTableColumns(table.name, table.schema, table.datasource || '')
      }

      // Calculate position
      const pos = position || calculateNewNodePosition()

      // Create node - 직접 추가한 테이블은 isPrimary=true (기본값)
      const isPrimary = options?.isPrimary !== false

      const newNode: Node<TableNodeData> = projectSchemaCanvasNode(
        table,
        columns,
        pos,
        {
          isPrimary,
          isObjectType: options?.isObjectType,
          behaviors: options?.behaviors,
        },
      )

      nodes.value.push(newNode)
      logger.debug(`[SchemaCanvas] ✅ 테이블 ${table.name} 추가됨`)

      // Update edges for this table
      updateEdgesFromRelationships()

      // Auto-load related tables (default: true) - ObjectType은 스킵
      if (options?.autoLoadRelated !== false && !options?.columns) {
        await loadRelatedTablesFromNeo4j(table, {
          throwOnFailure: options?.requireRelatedSuccess === true,
        })
      }
    })()
    tableAddOperations.set(nodeId, operation)
    try {
      await operation
    } finally {
      if (tableAddOperations.get(nodeId) === operation) tableAddOperations.delete(nodeId)
    }
  }

  // Load related tables from Neo4j using Cypher query API
  async function loadRelatedTablesFromNeo4j(
    table: SchemaTableIdentityInput,
    options: { throwOnFailure?: boolean } = {},
  ) {
    relatedTableLoadError.value = null
    const identity = normalizeTableIdentity(table)
    const tableLabel = tableIdentityLabel(identity)
    try {
      const baseResolution = resolveRelationshipTable(allTables.value, identity.name)
      if (baseResolution.status === 'ambiguous') {
        throw new Error(
          `${identity.name} 테이블이 여러 데이터소스 또는 스키마에 있어 이름만 받는 관련 테이블 API의 결과를 안전하게 연결할 수 없습니다.`,
        )
      }
      if (baseResolution.status === 'found' && !sameTableIdentity(baseResolution.value, identity)) {
        throw new Error(`${tableLabel}과 Catalog 관련 테이블 API가 가리키는 테이블이 일치하지 않습니다.`)
      }

      logger.debug(`[SchemaCanvas] 🔍 Loading related tables for: ${tableLabel}`)

      // Neo4j API를 통해 연결된 테이블 조회
      const result = await catalogSchemaApi.getRelatedTables(identity.name, catalogContext())

      logger.debug(`[SchemaCanvas] API Response:`, result)

      const fkTableNames = new Set<string>()
      result.relationships.forEach(rel => {
        if (rel.from_table !== identity.name) fkTableNames.add(rel.from_table)
        if (rel.to_table !== identity.name) fkTableNames.add(rel.to_table)
      })

      logger.debug(`[SchemaCanvas] FK 관계 테이블: ${Array.from(fkTableNames).join(', ')}`)
      if (fkTableNames.size === 0) {
        logger.debug(`[SchemaCanvas] No FK relationships found for ${tableLabel}`)
        return true
      }

      // FK 관계가 있는 테이블만 캔버스에 추가
      let addedCount = 0
      const maxRelatedTables = 15

      for (const fkTableName of fkTableNames) {
        if (addedCount >= maxRelatedTables) break
        const apiTableInfo = result.tables.find(candidate => candidate.name === fkTableName)
        if (!apiTableInfo) continue
        const resolution = resolveRelationshipTable(
          allTables.value,
          apiTableInfo.name,
          apiTableInfo.schema,
        )
        if (resolution.status !== 'found') {
          logger.warn(
            `[SchemaCanvas] ${apiTableInfo.schema}.${apiTableInfo.name} 관련 테이블을 유일하게 식별할 수 없어 캔버스에 추가하지 않습니다.`,
          )
          continue
        }
        if (nodes.value.some(node => node.id === tableNodeId(resolution.value))) continue

        await addTableToCanvas(
          resolution.value,
          undefined,
          { autoLoadRelated: false, isPrimary: false },
        )
        addedCount++
      }

      // 같은 테이블 쌍에서도 Analyzer/Catalog 소유 FK를 각각 보존한다.
      neo4jRelationships.value = mergeCatalogRelationships(
        neo4jRelationships.value,
        result.relationships,
      )

      logger.debug(`[SchemaCanvas] ✅ Loaded ${addedCount} FK-related tables (${result.relationships.length} FK relationships) for ${tableLabel}`)

      // 엣지 업데이트 및 레이아웃 적용
      updateEdgesFromRelationships()

      if (addedCount > 0) {
        await applyAutoLayout()
      }
      return true
    } catch (error) {
      logger.error('[SchemaCanvas] Failed to load related tables via API:', error)
      relatedTableLoadError.value = {
        table: identity,
        tableName: tableLabel,
        message: error instanceof Error ? error.message : '관련 릴레이션을 불러오지 못했습니다.',
      }
      if (options.throwOnFailure) throw error
      return false
    }
  }

  function removeTableFromCanvas(table: SchemaTableIdentityInput) {
    const nodeId = tableNodeId(table)
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
        // ObjectType 등 allTables에 없는 경우 노드 데이터로 테이블 정보 생성
        table = {
          name: node.data.tableName,
          schema: node.data.schema || 'ObjectType',
          description: node.data.description || '',
          column_count: node.data.columns?.length || 0
        }
      }

      selectedTable.value = {
        ...table,
        isObjectType: node.data.isObjectType,
        behaviors: node.data.behaviors,
      }
      selectedTableColumns.value = node.data.columns || []

      // ObjectType인 경우: 최신 description을 API에서 다시 가져옴
      if (node.data.isObjectType && node.data.tableName) {
        try {
          const detail = await objectExplorerApi.getObjectType(node.data.tableName)
          if (detail.columns && detail.columns.length > 0) {
              // description 정보 병합 (기존 컬럼에 description 업데이트)
              const updatedColumns = (node.data.columns || []).map((col: SchemaModelingColumn) => {
                const apiCol = detail.columns?.find(c => c.name === col.name)
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
        } catch (e) {
          logger.warn('[SchemaCanvas] ObjectType description 업데이트 실패:', e)
        }
      }

      // 노드가 가진 정확한 identity로만 지연 조회한다. HTTP 성공의 빈 배열은
      // 실제 빈 결과이며 schema를 비운 이름 기반 재요청으로 바꾸지 않는다.
      if ((selectedTableColumns.value?.length || 0) === 0) {
        try {
          const loadedColumns = await loadTableColumns(
            node.data.tableName,
            node.data.schema || '',
            node.data.datasource || '',
          )
          if (loadedColumns.length > 0) {
            node.data.columns = loadedColumns
            node.data.columnCount = loadedColumns.length
            selectedTableColumns.value = loadedColumns
          }
        } catch (error) {
          logger.error(`[SchemaCanvas] ${node.data.tableName} 컬럼 조회 실패:`, error)
        }
      }
      isDetailPanelOpen.value = true
      // 하나만 열리게 — 상세 열 때 소스/데이터 패널 닫음
      closeSourceCodePanel()
      closeTableDataPanel()
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
    filePath: string,
    fileContent: string,
    highlightedLine: number,
    procedureName: string,
    startLine = 1,
    found = true
  ) {
    // 하나만 열리게 — 소스 패널 열 때 다른 우측/데이터 패널 닫음
    isDetailPanelOpen.value = false
    closeTableDataPanel()
    sourceStatementRequestId += 1
    sourceCodePanel.value = createOpenSourceCodePanel({
      fileName,
      filePath,
      fileContent,
      highlightedLine,
      procedureName,
      startLine,
      found,
    })

    if (sourceCodePanel.value.isLoadingStatements) await loadSourceStatements()
  }

  async function loadSourceStatements() {
    const panel = sourceCodePanel.value
    if (!panel.isOpen || panel.notFound || !panel.procedureName) return

    const requestId = ++sourceStatementRequestId
    const procedureName = panel.procedureName
    const filePath = panel.filePath
    panel.isLoadingStatements = true
    panel.statementError = null

    const result = await loadProcedureStatements(
      procedureName,
      filePath,
      (name, path) =>
        catalogSchemaApi.getProcedureStatements(name, path, catalogContext()),
    )

    const currentPanel = sourceCodePanel.value
    if (
      requestId !== sourceStatementRequestId
      || !currentPanel.isOpen
      || currentPanel.procedureName !== procedureName
      || currentPanel.filePath !== filePath
    ) return

    currentPanel.isLoadingStatements = false
    if (result.ok) {
      currentPanel.statements = result.statements
      currentPanel.statementError = null
      logger.debug('[openSourceCodePanel] Statement 설명 로드:', result.statements.length, '개')
      return
    }

    currentPanel.statements = []
    currentPanel.statementError = result.error
    logger.error('[openSourceCodePanel] Statement 설명 로드 실패:', result.error)
  }

  // 소스 코드 패널 닫기
  function closeSourceCodePanel() {
    sourceStatementRequestId += 1
    sourceCodePanel.value = createClosedSourceCodePanel()
  }

  // =========================================================================
  // 테이블 데이터 조회 패널
  // =========================================================================

  function updateEdgesFromRelationships() {
    edges.value = projectRelationshipEdges({
      nodes: nodes.value,
      userRelationships: userRelationships.value,
      catalogRelationships: neo4jRelationships.value,
      visibility: fkVisibility.value,
    })
  }

  function sameRelationship(
    left: Pick<SchemaRelationship, 'from_table' | 'from_schema' | 'from_column' | 'to_table' | 'to_schema' | 'to_column'>,
    right: Pick<SchemaRelationship, 'from_table' | 'from_schema' | 'from_column' | 'to_table' | 'to_schema' | 'to_column'>,
  ): boolean {
    return left.from_table === right.from_table
      && left.from_schema === right.from_schema
      && left.from_column === right.from_column
      && left.to_table === right.to_table
      && left.to_schema === right.to_schema
      && left.to_column === right.to_column
  }

  async function addRelationship(relationship: Omit<SchemaRelationship, 'relationship_type'>) {
    try {
      await catalogSchemaApi.addRelationship({
        ...relationship,
        relationship_type: 'FK'
      }, catalogContext())
      const committed: SchemaRelationship = {
        ...relationship,
        relationship_type: 'FK',
      }
      if (!userRelationships.value.some(candidate => sameRelationship(candidate, committed))) {
        userRelationships.value.push(committed)
        updateEdgesFromRelationships()
      }
      const refreshed = await loadUserRelationships()
      return {
        status: 'success' as const,
        refreshWarning: refreshed ? null : relationshipLoadError.value,
      }
    } catch (error) {
      logger.error('Failed to add relationship:', error)
      throw error
    }
  }

  type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:N'
  async function addRelationshipWithCardinality(
    relationship: Omit<SchemaRelationship, 'relationship_type'> & { cardinality: Cardinality },
  ) {
    try {
      const description = `[${relationship.cardinality}] ${relationship.description || ''}`.trim()

      const relData = {
        from_table: relationship.from_table,
        from_schema: relationship.from_schema,
        from_column: relationship.from_column,
        to_table: relationship.to_table,
        to_schema: relationship.to_schema,
        to_column: relationship.to_column,
        description,
        relationship_type: 'FK' as const,
      }

      await catalogSchemaApi.addRelationship(relData, catalogContext())
      const committed: SchemaRelationship = {
        from_table: relationship.from_table,
        from_schema: relationship.from_schema,
        from_column: relationship.from_column,
        to_table: relationship.to_table,
        to_schema: relationship.to_schema,
        to_column: relationship.to_column,
        description,
        relationship_type: 'FK',
      }
      if (!userRelationships.value.some(candidate => sameRelationship(candidate, committed))) {
        userRelationships.value.push(committed)
        updateEdgesFromRelationships()
      }
      const refreshed = await loadUserRelationships()
      return {
        status: 'success' as const,
        refreshWarning: refreshed ? null : relationshipLoadError.value,
      }
    } catch (error) {
      logger.error('Failed to add relationship:', error)
      throw error
    }
  }

  async function removeRelationship(
    relationship: Pick<
      SchemaRelationship,
      'from_table' | 'from_schema' | 'from_column' | 'to_table' | 'to_schema' | 'to_column'
    >,
  ) {
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

      const result = await catalogSchemaApi.deleteRelationship(params, catalogContext())
      logger.debug('[schemaCanvas.removeRelationship] 삭제 결과:', result)

      // 삭제된 개수가 0이면 에러
      if (result.deleted === 0) {
        throw new Error('삭제된 관계가 없습니다. 관계 정보를 확인해주세요.')
      }

      userRelationships.value = userRelationships.value.filter(
        candidate => !sameRelationship(candidate, relationship),
      )
      updateEdgesFromRelationships()
      const refreshed = await loadUserRelationships()
      return {
        status: 'success' as const,
        refreshWarning: refreshed ? null : relationshipLoadError.value,
      }
    } catch (error) {
      logger.error('Failed to remove relationship:', error)
      throw error
    }
  }

  async function updateTableDescription(
    tableIdentity: SchemaTableIdentityInput,
    description: string,
  ) {
    try {
      const identity = normalizeTableIdentity(tableIdentity)
      const resolution = resolveTableIdentity(allTables.value, identity)
      const table = resolution.status === 'found' ? resolution.value : null

      await catalogSchemaApi.updateTableDescription(
        identity.name,
        identity.schema,
        description,
        catalogContext(true),
      )

      // Update local data
      if (table) {
        table.description = description
      }

      const node = nodes.value.find(candidate => candidate.id === tableNodeId(identity))
      if (node && node.data) {
        node.data.description = description
      }
    } catch (error) {
      logger.error('Failed to update table description:', error)
      throw error
    }
  }

  async function updateColumnDescription(
    tableIdentity: SchemaTableIdentityInput,
    columnName: string,
    description: string,
  ) {
    try {
      const identity = normalizeTableIdentity(tableIdentity)

      await catalogSchemaApi.updateColumnDescription(
        identity.name,
        columnName,
        identity.schema,
        description,
        catalogContext(true),
      )

      // Update cache
      const cache = tableColumnsCache.value[tableIdentityKey(identity)]
      if (cache) {
        const col = cache.find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }

      // Update node
      const node = nodes.value.find(candidate => candidate.id === tableNodeId(identity))
      if (node && node.data) {
        const col = node.data.columns.find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }

      // Update selected table columns
      if (selectedTable.value && sameTableIdentity(selectedTable.value, identity)) {
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
    clearTransientHighlights()
    nodes.value = []
    edges.value = []
    neo4jRelationships.value = []
    selectedNodeId.value = null
    selectedTable.value = null
    isDetailPanelOpen.value = false
  }

  interface CanvasMutationSnapshot {
    nodes: Node<TableNodeData>[]
    edges: Edge[]
    neo4jRelationships: CatalogRelationship[]
    updatedNodes: Map<string, number>
    updatedColumns: Map<string, number>
    newRelationships: Map<string, number>
    newlyAddedTables: Map<string, number>
    newlyAddedEdges: Map<string, number>
    relatedTableLoadError: {
      table: SchemaTableIdentityInput
      tableName: string
      message: string
    } | null
  }

  function captureCanvasMutationSnapshot(): CanvasMutationSnapshot {
    return {
      nodes: [...nodes.value],
      edges: [...edges.value],
      neo4jRelationships: [...neo4jRelationships.value],
      updatedNodes: new Map(updatedNodes.value),
      updatedColumns: new Map(updatedColumns.value),
      newRelationships: new Map(newRelationships.value),
      newlyAddedTables: new Map(newlyAddedTables.value),
      newlyAddedEdges: new Map(newlyAddedEdges.value),
      relatedTableLoadError: relatedTableLoadError.value
        ? {
            ...relatedTableLoadError.value,
            table: { ...relatedTableLoadError.value.table },
          }
        : null,
    }
  }

  function restoreExpiringMap(
    current: Map<string, number>,
    snapshot: ReadonlyMap<string, number>,
    controller: { delete: (key: string) => void },
  ) {
    for (const key of current.keys()) {
      if (!snapshot.has(key)) controller.delete(key)
    }
    for (const [key, value] of snapshot) current.set(key, value)
  }

  function restoreCanvasMutationSnapshot(snapshot: CanvasMutationSnapshot) {
    nodes.value = snapshot.nodes
    edges.value = snapshot.edges
    neo4jRelationships.value = snapshot.neo4jRelationships
    restoreExpiringMap(updatedNodes.value, snapshot.updatedNodes, updatedNodeHighlights)
    restoreExpiringMap(updatedColumns.value, snapshot.updatedColumns, updatedColumnHighlights)
    restoreExpiringMap(newRelationships.value, snapshot.newRelationships, relationshipHighlights)
    restoreExpiringMap(newlyAddedTables.value, snapshot.newlyAddedTables, addedTableHighlights)
    restoreExpiringMap(newlyAddedEdges.value, snapshot.newlyAddedEdges, addedEdgeHighlights)
    relatedTableLoadError.value = snapshot.relatedTableLoadError
  }

  async function addTablesToCanvasAtomically(
    requestedTables: readonly SchemaModelingTable[],
  ): Promise<boolean> {
    if (canvasLoading.value || requestedTables.length === 0) return false

    const tables = requestedTables.map(table => ({ ...table }))
    const snapshot = captureCanvasMutationSnapshot()
    canvasLoading.value = true
    try {
      for (const table of tables) {
        await addTableToCanvas(table, undefined, { requireRelatedSuccess: true })
      }
      return true
    } catch (error) {
      restoreCanvasMutationSnapshot(snapshot)
      throw error
    } finally {
      canvasLoading.value = false
    }
  }

  /**
   * 모든 테이블을 캔버스에 추가하고 그리드 레이아웃으로 배치
   */
  async function addAllTablesToCanvas(
    requestedTables: readonly SchemaModelingTable[] = allTables.value,
  ): Promise<boolean> {
    if (canvasLoading.value || requestedTables.length === 0) return false

    const tables = requestedTables.map(table => ({ ...table }))
    canvasLoading.value = true
    try {
      const projectedNodes: Node<TableNodeData>[] = []
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i]
        const columns = await loadTableColumns(table.name, table.schema, table.datasource || '')
        projectedNodes.push(projectSchemaCanvasNode(
          table,
          columns,
          projectSchemaCanvasGridPosition(i, tables.length),
          { isPrimary: false },
        ))
      }

      clearTransientHighlights()
      nodes.value = projectedNodes
      edges.value = []
      updateEdgesFromRelationships()
      return true
    } finally {
      canvasLoading.value = false
    }
  }

  // Auto-load related tables (uses Neo4j relationship data)
  async function loadRelatedTables(table: SchemaTableIdentityInput) {
    return loadRelatedTablesFromNeo4j(table)
  }

  /** 자동 레이아웃 — ELK layered 알고리즘 (구현은 @/shared/utils/elkLayout) */
  async function applyAutoLayout() {
    await applyElkLayout(nodes.value, edges.value)
  }

  return {
    // State
    nodes,
    edges,
    allTables,
    tableColumnsCache,
    tableColumnErrors,
    userRelationships,
    selectedNodeId,
    selectedTable,
    selectedTableColumns,
    loading,
    tableListError,
    relationshipLoadError,
    relatedTableLoadError,
    lastTableColumnError,
    isDetailPanelOpen,
    searchQuery,
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
    tablesBySchema,
    tablesByDatasource,

    // Actions
    loadAllTables,
    loadTableColumns,
    getCachedTableColumns,
    getTableColumnsError,
    clearLastTableColumnError,
    loadUserRelationships,
    addTableToCanvas,
    removeTableFromCanvas,
    updateNodePosition,
    selectNode,
    clearSelection,
    closeDetailPanel,
    openSourceCodePanel,
    loadSourceStatements,
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
    updateTableDescription,
    updateColumnDescription,
    clearCanvas,
    loadRelatedTables,
    addTablesToCanvasAtomically,
    addAllTablesToCanvas,
    applyAutoLayout,
    toggleFkVisibility,  // FK 표시 토글 함수
    toggleLogicalNames,  // 논리명/물리명 전환 함수

    // 시멘틱 검색
    performSemanticSearch,
    retrySemanticSearch,
    clearSemanticSearch,

    // 실시간 캔버스 업데이트
    handleCanvasUpdate,
    isNodeRecentlyUpdated,
    isColumnRecentlyUpdated,
    updatedNodes,
    updatedColumns,
    newRelationships,

    // 전체 테이블 보기 모드
    isFullViewMode,
    setFullViewMode,
    isTableNewlyAdded,
    isEdgeNewlyAdded,
    newlyAddedTables,
    newlyAddedEdges,
    addTableToCanvasWithAnimation
  }
})
