<script setup lang="ts">
import { logger } from '@/shared/utils/logger'
import { Handle, Position } from '@vue-flow/core'
import { computed, inject, ref, watch } from 'vue'
import type { Text2SqlColumnInfo } from '@/shared/types'
import { useSchemaCanvasStore } from '@/features/schema/schemaCanvas'
import { roboSchemaApi } from '@/features/schema/api'
import { getDescriptionColor, getDescriptionSourceLabel } from '@/shared/utils/descriptionColor'
import CloseButton from '@/features/schema/components/CloseButton.vue'

interface Behavior {
  name: string
  description?: string
  behaviorType: 'rest_api' | 'javascript' | 'python' | 'dmn'
  config: Record<string, any>
  inputFields?: string[]
  outputField?: string
}

interface TableNodeData {
  tableName: string
  schema: string
  datasource?: string  // 데이터소스명 (예: robo_postgres)
  description?: string
  description_source?: 'ddl' | 'procedure' | 'code' | 'user' | ''  // 설명 출처
  columns: Text2SqlColumnInfo[]
  columnCount: number
  isPrimary?: boolean  // 직접 선택/드래그한 테이블인지 여부
  isObjectType?: boolean  // ObjectType인지 여부
  behaviors?: Behavior[]  // Behavior 목록
}

// 프로시저 참조 정보 타입
interface ProcedureReference {
  procedure_name: string
  procedure_type: string
  start_line: number
  access_type: string
  statement_type?: string
  statement_line?: number
  file_name?: string
  file_directory?: string
  file_path?: string   // 절대 파일 경로 (catalog p.file_path, 코드뷰 소스 서빙용 spec 043)
}

// 프레임워크 참조 정보 타입
interface FrameworkReference {
  source_name: string
  source_type: string  // "FUNCTION" | "MODULE"
  access_type: string  // "READS" | "WRITES" | "REFER_TO"
  start_line?: number  // 함수/모듈 시작 라인
  file_name?: string
  file_path?: string   // 전체 소스 경로 (예: "swing_system/src/core/db_engine.c")
  file_directory?: string
  module_name?: string
}

const props = defineProps<{
  id: string
  data: TableNodeData
  selected?: boolean
}>()

// Inject handlers from parent
const onRemoveTable = inject<(tableName: string) => void>('onRemoveTable')
const onLoadRelated = inject<(tableName: string) => void>('onLoadRelated')

// 캔버스 스토어 (실시간 업데이트 감지용)
const canvasStore = useSchemaCanvasStore()

// 노드 업데이트 애니메이션 상태
const isNodeUpdating = ref(false)
const isNodeNewlyAdded = ref(false)
const updatingColumns = ref<Set<string>>(new Set())

// 새로 추가된 테이블 감지
watch(
  () => canvasStore.newlyAddedTables.get(props.id),
  (newVal) => {
    if (newVal) {
      isNodeNewlyAdded.value = true
      setTimeout(() => {
        isNodeNewlyAdded.value = false
      }, 5000)
    }
  },
  { immediate: true }
)

// 노드 업데이트 감지
watch(
  () => canvasStore.updatedNodes.get(props.id),
  (newVal) => {
    if (newVal) {
      isNodeUpdating.value = true
      setTimeout(() => {
        isNodeUpdating.value = false
      }, 3000)
    }
  },
  { immediate: true }
)

// 컬럼 업데이트 감지
watch(
  () => Array.from(canvasStore.updatedColumns.entries()),
  (entries) => {
    const tableName = props.data.tableName
    for (const [key, _] of entries) {
      if (key.startsWith(`${tableName}:`)) {
        const colName = key.split(':')[1]
        updatingColumns.value.add(colName)
        setTimeout(() => {
          updatingColumns.value.delete(colName)
        }, 3000)
      }
    }
  },
  { deep: true }
)

// 컬럼이 업데이트 중인지 확인
function isColumnUpdating(colName: string): boolean {
  return updatingColumns.value.has(colName)
}

// 설명 텍스트 잘라내기 (최대 20자)
function truncateDescription(desc: string, maxLen = 20): string {
  if (!desc) return ''
  return desc.length > maxLen ? desc.substring(0, maxLen) + '...' : desc
}

// 코드 분석 출처 여부 판별 (procedure와 code는 동일 취급)
function isCodeSource(source?: string): boolean {
  return source === 'procedure' || source === 'code'
}
// 설명 출처별 색/라벨은 @/shared/utils/descriptionColor 에서 import

// 호버 시 출처 칩 표시 상태
const isDescriptionHovered = ref(false)
const isLoadingReferences = ref(false)
const procedureReferences = ref<ProcedureReference[]>([])
const frameworkReferences = ref<FrameworkReference[]>([])
const showReferencesPopup = ref(false)
const referencesPopupPosition = ref({ x: 0, y: 0 })

// 컬럼 참조 팝업 상태
const showColumnReferencesPopup = ref(false)
const columnReferencesPopupPosition = ref({ x: 0, y: 0 })
const isLoadingColumnReferences = ref(false)
const columnReferences = ref<ProcedureReference[]>([])
const columnFrameworkReferences = ref<FrameworkReference[]>([])
const activeColumnName = ref<string>('')

// 참조 정보 로드 (프로시저 + 프레임워크)
async function loadProcedureReferences() {
  isLoadingReferences.value = true
  try {
    const result = await roboSchemaApi.getTableReferences(
      props.data.tableName,
      { schema: props.data.schema }
    )
    procedureReferences.value = result.references || []
    frameworkReferences.value = result.framework_references || []
  } catch (error) {
    logger.error('Failed to load procedure references:', error)
    procedureReferences.value = []
    frameworkReferences.value = []
  } finally {
    isLoadingReferences.value = false
  }
}

// 출처 칩 클릭 시 팝업 표시
function handleSourceChipClick(event: MouseEvent) {
  
  // 팝업 위치 설정
  referencesPopupPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  
  // 참조 정보 로드 및 팝업 표시
  loadProcedureReferences()
  showReferencesPopup.value = true
  event.stopPropagation()
}

// 팝업 닫기
function closeReferencesPopup() {
  showReferencesPopup.value = false
}

// 컬럼 참조 팝업 닫기
function closeColumnReferencesPopup() {
  showColumnReferencesPopup.value = false
  activeColumnName.value = ''
}

// 컬럼 참조 정보 로드
async function loadColumnReferences(columnName: string) {
  isLoadingColumnReferences.value = true
  try {
    const result = await roboSchemaApi.getTableReferences(
      props.data.tableName,
      { schema: props.data.schema, columnName }
    )
    columnReferences.value = result.references || []
    columnFrameworkReferences.value = result.framework_references || []
  } catch (error) {
    logger.error('Failed to load column references:', error)
    columnReferences.value = []
    columnFrameworkReferences.value = []
  } finally {
    isLoadingColumnReferences.value = false
  }
}

// 컬럼 설명 (procedure 출처) 클릭 시 팝업 표시
function handleColumnSourceClick(event: MouseEvent, columnName: string) {
  // 팝업 위치 설정
  columnReferencesPopupPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  
  activeColumnName.value = columnName
  
  // 참조 정보 로드 및 팝업 표시
  loadColumnReferences(columnName)
  showColumnReferencesPopup.value = true
  event.stopPropagation()
}

// 참조(프로시저/프레임워크) 클릭 → analyzer 가 디스크에서 읽어 주는 원본 소스를 우측
// 코드 패널에 표시 (spec 043). 브라우저 업로드(uploadedFiles) 의존 폐기 — 데스크톱(폴더
// 선택)·영속 그래프에서도 동작. 못 읽으면 가짜 코드 대신 정직한 빈 상태(found=false).
async function openSourceFromReference(
  filePath: string | undefined,
  fileName: string,
  lineNumber: number,
  symbolName: string
) {
  // 참조 선택 시 팝업 닫음 — 소스 패널과 겹치지 않게(하나만)
  closeReferencesPopup()
  closeColumnReferencesPopup()
  const src = filePath
    ? await roboSchemaApi.getSourceContent(filePath, { startLine: 1, endLine: 0 })
    : null
  const content = src?.found ? src.content : ''
  canvasStore.openSourceCodePanel(
    fileName || filePath?.split(/[\\/]/).pop() || symbolName,
    filePath || '',
    content,
    lineNumber,
    symbolName,
    !!content
  )
}

function handleProcedureClick(procRef: ProcedureReference) {
  const lineNumber = procRef.statement_line || procRef.start_line || 1
  // 절대 file_path 우선(catalog p.file_path), 없으면 디렉토리 폴백
  openSourceFromReference(procRef.file_path || procRef.file_directory, procRef.file_name || '', lineNumber, procRef.procedure_name)
}

function handleFrameworkClick(fwRef: FrameworkReference) {
  const lineNumber = fwRef.start_line || 1
  openSourceFromReference(fwRef.file_path || fwRef.file_directory, fwRef.file_name || '', lineNumber, fwRef.source_name)
}

// 접근 유형 레이블
function getAccessTypeLabel(accessType: string): string {
  const labels: Record<string, string> = {
    'FROM': '읽기',
    'READS': '읽기',
    'WRITES': '쓰기',
    'REFER_TO': '참조'
  }
  return labels[accessType] || accessType
}

// 접근 유형 색상
function getAccessTypeColor(accessType: string): string {
  if (accessType === 'WRITES') return '#f59e0b'
  if (accessType === 'REFER_TO') return '#a78bfa'
  return '#38bdf8'
}

// Hover state for showing handles
const hoveredColumn = ref<string | null>(null)

// 접기/펼치기 상태
const isExpanded = ref(false)

// 기본 표시 개수
const DEFAULT_DISPLAY_COUNT = 8

// 표시할 컬럼 목록
const displayColumns = computed(() => {
  const columns = props.data.columns || []
  if (isExpanded.value) {
    return columns  // 전체 표시
  }
  return columns.slice(0, DEFAULT_DISPLAY_COUNT)
})

const hasMoreColumns = computed(() => {
  return (props.data.columns?.length || 0) > DEFAULT_DISPLAY_COUNT
})

const moreColumnsCount = computed(() => {
  return (props.data.columns?.length || 0) - DEFAULT_DISPLAY_COUNT
})

// 접기/펼치기 토글
function toggleExpand(e: Event) {
  e.stopPropagation()
  isExpanded.value = !isExpanded.value
}

// Primary key column (typically 'id')
const pkColumn = computed(() => {
  return props.data.columns?.find(c => c.name.toLowerCase() === 'id')
})

function isPrimaryKey(colName: string): boolean {
  return colName.toLowerCase() === 'id'
}

function isForeignKey(colName: string): boolean {
  return colName.endsWith('_id') && colName.toLowerCase() !== 'id'
}

function getColumnTypeShort(dtype: string): string {
  const type = dtype.toLowerCase()
  if (type.includes('varchar') || type.includes('text') || type.includes('char')) return 'str'
  if (type.includes('int') || type.includes('serial')) return 'int'
  if (type.includes('decimal') || type.includes('numeric') || type.includes('float') || type.includes('double')) return 'num'
  if (type.includes('bool')) return 'bool'
  if (type.includes('timestamp') || type.includes('datetime')) return 'ts'
  if (type.includes('date')) return 'date'
  if (type.includes('time')) return 'time'
  if (type.includes('json')) return 'json'
  if (type.includes('uuid')) return 'uuid'
  return type.substring(0, 4)
}

function handleRemove(e: Event) {
  e.stopPropagation()
  onRemoveTable?.(props.data.tableName)
}

function handleLoadRelated(e: Event) {
  e.stopPropagation()
  onLoadRelated?.(props.data.tableName)
}

function handleQueryData(e: Event) {
  e.stopPropagation()
  // 테이블 데이터 조회 패널 열기 (멀티 데이터소스 지원)
  canvasStore.queryTableData(
    props.data.tableName, 
    props.data.schema || 'public', 
    25,  // 기본 limit
    props.data.datasource  // 데이터소스 전달
  )
}

// Behavior 클릭 핸들러
const onBehaviorClick = inject<(objectTypeName: string, behavior: Behavior) => void>('onBehaviorClick')
// Behavior 편집 핸들러 (더블클릭)
const onBehaviorEdit = inject<(objectTypeName: string, columns: string[], behavior: Behavior) => void>('onBehaviorEdit')
// Behavior 실행 핸들러
const onBehaviorRun = inject<(objectTypeName: string, behavior: Behavior, query: string) => void>('onBehaviorRun')

// Behavior hover 상태
const hoveredBehavior = ref<string | null>(null)

function handleBehaviorClick(behavior: Behavior) {
  onBehaviorClick?.(props.data.tableName, behavior)
}

function handleBehaviorDoubleClick(behavior: Behavior) {
  // 컬럼 이름 목록 추출
  const columns = (props.data.columns || []).map(c => c.name)
  onBehaviorEdit?.(props.data.tableName, columns, behavior)
}

function handleBehaviorRun(behavior: Behavior) {
  // ObjectType의 query를 사용하여 인스턴스 검색
  const query = props.data.query || ''
  onBehaviorRun?.(props.data.tableName, behavior, query)
}

function onColumnMouseEnter(colName: string) {
  hoveredColumn.value = colName
}

function onColumnMouseLeave() {
  hoveredColumn.value = null
}
</script>

<template>
  <div 
    class="table-node"
    :class="{ 
      'is-selected': selected, 
      'is-primary': data.isPrimary,
      'is-updating': isNodeUpdating,
      'is-newly-added': isNodeNewlyAdded
    }"
  >
    <!-- Header with PK Target Handle -->
    <div class="table-node__header">
      <!-- PK Target Handle - for receiving FK connections -->
      <Handle 
        v-if="pkColumn"
        :id="`pk-${pkColumn.name}`"
        type="target"
        :position="Position.Left"
        class="table-node__pk-handle table-node__pk-handle--left"
      />
      
      <div class="table-node__icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
      </div>
      <!-- 논리명 모드: description을 타이틀로, 물리명 모드: tableName을 타이틀로 -->
      <span 
        class="table-node__name"
        :title="canvasStore.showLogicalNames && data.description ? `테이블명: ${data.tableName}` : (data.description || data.tableName)"
      >
        {{ canvasStore.showLogicalNames && data.description ? truncateDescription(data.description, 30) : data.tableName }}
      </span>
      <div class="table-node__actions">
        <button 
          class="table-node__action-btn table-node__action-btn--query" 
          @click="handleQueryData"
          title="테이블 데이터 조회"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        <button 
          class="table-node__action-btn" 
          @click="handleLoadRelated"
          title="관련 테이블 로드"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </button>
        <button 
          class="table-node__action-btn table-node__action-btn--remove" 
          @click="handleRemove"
          title="캔버스에서 제거"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <!-- PK Target Handle Right -->
      <Handle 
        v-if="pkColumn"
        :id="`pk-${pkColumn.name}-right`"
        type="target"
        :position="Position.Right"
        class="table-node__pk-handle table-node__pk-handle--right"
      />
    </div>
    
    <!-- Description / 테이블명 서브라인 - 스위치에 따라 전환 -->
    <div 
      v-if="data.description" 
      class="table-node__description"
      :style="{ color: canvasStore.showLogicalNames ? 'var(--color-text-muted, #5c5f66)' : getDescriptionColor(data.description_source) }"
      :title="canvasStore.showLogicalNames 
        ? `테이블명: ${data.tableName}` 
        : `${data.description} ${data.description_source ? `[출처: ${getDescriptionSourceLabel(data.description_source)}]` : ''}`"
      @mouseenter="isDescriptionHovered = true"
      @mouseleave="isDescriptionHovered = false"
    >
      <!-- 출처 배지 (물리명 모드에서만) -->
      <span 
        v-if="!canvasStore.showLogicalNames && data.description_source" 
        class="table-node__description-badge"
        :class="{ 
          'is-clickable': isCodeSource(data.description_source),
          'is-hovered': isDescriptionHovered && isCodeSource(data.description_source)
        }"
        :style="{ background: getDescriptionColor(data.description_source) }"
        @click="handleSourceChipClick"
      >
        {{ getDescriptionSourceLabel(data.description_source) }}
        <span v-if="isCodeSource(data.description_source) && isDescriptionHovered" class="table-node__source-hint">
          📍
        </span>
      </span>
      {{ canvasStore.showLogicalNames ? data.tableName : data.description }}
    </div>
    
    <!-- 컬럼 참조 팝업 (프로시저 + 프레임워크) -->
    <Teleport to="body">
      <div
        v-if="showColumnReferencesPopup"
        class="references-popup"
        :style="{ left: `${columnReferencesPopupPosition.x}px`, top: `${columnReferencesPopupPosition.y}px` }"
      >
        <div class="references-popup__header references-popup__header--column">
          <span>🔍 {{ activeColumnName }} 컬럼 참조</span>
          <CloseButton light @click="closeColumnReferencesPopup" />
        </div>
        <div class="references-popup__content">
          <div v-if="isLoadingColumnReferences" class="references-popup__loading">
            로딩 중...
          </div>
          <div v-else-if="columnReferences.length === 0 && columnFrameworkReferences.length === 0" class="references-popup__empty">
            참조 정보를 찾을 수 없습니다.
          </div>
          <template v-else>
            <!-- 프로시저 참조 -->
            <div
              v-for="ref in columnReferences"
              :key="`col-proc-${ref.procedure_name}-${ref.statement_line}`"
              class="references-popup__item"
              @click="handleProcedureClick(ref)"
            >
              <div class="references-popup__proc-name">
                <span class="references-popup__proc-type">{{ ref.procedure_type }}</span>
                {{ ref.procedure_name }}
              </div>
              <div class="references-popup__details">
                <span
                  class="references-popup__access-type"
                  :style="{ color: getAccessTypeColor(ref.access_type) }"
                >
                  {{ getAccessTypeLabel(ref.access_type) }}
                </span>
                <span v-if="ref.statement_type" class="references-popup__stmt-type">
                  {{ ref.statement_type }}
                </span>
                <span v-if="ref.statement_line" class="references-popup__line">
                  Line {{ ref.statement_line }}
                </span>
              </div>
            </div>
            <!-- 프레임워크 참조 -->
            <div
              v-for="ref in columnFrameworkReferences"
              :key="`col-fw-${ref.source_name}-${ref.start_line}`"
              class="references-popup__item"
            >
              <div class="references-popup__proc-name">
                <span class="references-popup__proc-type references-popup__proc-type--fw">{{ ref.source_type }}</span>
                {{ ref.source_name }}
                <span v-if="ref.module_name && ref.module_name !== ref.source_name" class="references-popup__module-name">
                  ({{ ref.module_name }})
                </span>
              </div>
              <div class="references-popup__details">
                <span
                  class="references-popup__access-type"
                  :style="{ color: getAccessTypeColor(ref.access_type) }"
                >
                  {{ getAccessTypeLabel(ref.access_type) }}
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 참조 팝업 (프로시저 + 프레임워크) -->
    <Teleport to="body">
      <div
        v-if="showReferencesPopup"
        class="references-popup"
        :style="{ left: `${referencesPopupPosition.x}px`, top: `${referencesPopupPosition.y}px` }"
      >
        <div class="references-popup__header">
          <span>📍 테이블 참조</span>
          <CloseButton light @click="closeReferencesPopup" />
        </div>
        <div class="references-popup__content">
          <div v-if="isLoadingReferences" class="references-popup__loading">
            로딩 중...
          </div>
          <div v-else-if="procedureReferences.length === 0 && frameworkReferences.length === 0" class="references-popup__empty">
            참조 정보를 찾을 수 없습니다.
          </div>
          <template v-else>
            <!-- 프로시저 참조 -->
            <div
              v-for="ref in procedureReferences"
              :key="`proc-${ref.procedure_name}-${ref.statement_line}`"
              class="references-popup__item"
              @click="handleProcedureClick(ref)"
            >
              <div class="references-popup__proc-name">
                <span class="references-popup__proc-type">{{ ref.procedure_type }}</span>
                {{ ref.procedure_name }}
              </div>
              <div class="references-popup__details">
                <span
                  class="references-popup__access-type"
                  :style="{ color: getAccessTypeColor(ref.access_type) }"
                >
                  {{ getAccessTypeLabel(ref.access_type) }}
                </span>
                <span v-if="ref.statement_type" class="references-popup__stmt-type">
                  {{ ref.statement_type }}
                </span>
                <span v-if="ref.statement_line" class="references-popup__line">
                  Line {{ ref.statement_line }}
                </span>
              </div>
            </div>
            <!-- 프레임워크 참조 -->
            <div
              v-for="ref in frameworkReferences"
              :key="`fw-${ref.source_name}-${ref.start_line}`"
              class="references-popup__item"
              @click="handleFrameworkClick(ref)"
            >
              <div class="references-popup__proc-name">
                <span class="references-popup__proc-type references-popup__proc-type--fw">{{ ref.source_type }}</span>
                {{ ref.source_name }}
                <span v-if="ref.module_name && ref.module_name !== ref.source_name" class="references-popup__module-name">
                  ({{ ref.module_name }})
                </span>
              </div>
              <div class="references-popup__details">
                <span
                  class="references-popup__access-type"
                  :style="{ color: getAccessTypeColor(ref.access_type) }"
                >
                  {{ getAccessTypeLabel(ref.access_type) }}
                </span>
                <span v-if="ref.start_line" class="references-popup__line">
                  Line {{ ref.start_line }}
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Columns -->
    <div class="table-node__columns">
      <div 
        v-for="col in displayColumns" 
        :key="col.name"
        class="table-node__column"
        :class="{
          'is-pk': isPrimaryKey(col.name),
          'is-fk': isForeignKey(col.name),
          'is-hovered': hoveredColumn === col.name,
          'is-updating': isColumnUpdating(col.name)
        }"
        @mouseenter="onColumnMouseEnter(col.name)"
        @mouseleave="onColumnMouseLeave"
      >
        <!-- Left Handles -->
        <Handle 
          :id="`pk-${col.name}`"
          type="target"
          :position="Position.Left"
          class="table-node__target-handle table-node__target-handle--left"
        />
        <Handle 
          :id="`fk-${col.name}-source-left`"
          type="source"
          :position="Position.Left"
          class="table-node__source-handle table-node__source-handle--left"
          :class="{ 'is-fk': isForeignKey(col.name) }"
        />
        
        <!-- Right Handles -->
        <Handle 
          :id="`pk-${col.name}-right`"
          type="target"
          :position="Position.Right"
          class="table-node__target-handle table-node__target-handle--right"
        />
        <Handle 
          :id="`fk-${col.name}-source`"
          type="source"
          :position="Position.Right"
          class="table-node__source-handle table-node__source-handle--right"
          :class="{ 'is-fk': isForeignKey(col.name), 'is-hovered': hoveredColumn === col.name }"
        />
        
        <div class="table-node__column-info">
          <span class="table-node__column-icon">
            <template v-if="isPrimaryKey(col.name)">🔑</template>
            <template v-else-if="isForeignKey(col.name)">🔗</template>
            <template v-else>•</template>
          </span>
          <!-- 논리명 모드: description 우선 표시, 물리명 모드: name 표시 -->
          <span 
            class="table-node__column-name"
            :title="canvasStore.showLogicalNames && col.description ? `컬럼명: ${col.name}` : (col.description || col.name)"
          >
            {{ canvasStore.showLogicalNames && col.description ? truncateDescription(col.description, 28) : col.name }}
          </span>
          <span class="table-node__column-type">{{ getColumnTypeShort(col.dtype) }}</span>
          <span v-if="!col.nullable" class="table-node__column-required">*</span>
        </div>
        
        <!-- 논리명 모드: 실제 컬럼명을 서브라인으로 / 물리명 모드: description을 서브라인으로 -->
        <div 
          v-if="col.description" 
          class="table-node__column-desc"
          :class="{ 
            'is-updating': isColumnUpdating(col.name),
            'is-clickable': isCodeSource(col.description_source)
          }"
          :style="{ color: getDescriptionColor(col.description_source) }"
          :title="canvasStore.showLogicalNames 
            ? `${col.name} ${col.description_source ? `[출처: ${getDescriptionSourceLabel(col.description_source)}]` : ''}`
            : `${col.description} ${col.description_source ? `[출처: ${getDescriptionSourceLabel(col.description_source)}]` : ''}`"
          @click="isCodeSource(col.description_source) ? handleColumnSourceClick($event, col.name) : null"
        >
          <span v-if="col.description_source" class="table-node__desc-source-dot" :style="{ background: getDescriptionColor(col.description_source) }"></span>
          {{ canvasStore.showLogicalNames ? col.name : truncateDescription(col.description) }}
          <span v-if="isCodeSource(col.description_source)" class="table-node__column-link-icon">🔍</span>
        </div>
        
        <!-- Drag hint for FK columns -->
        <span 
          v-if="isForeignKey(col.name)" 
          class="table-node__drag-hint"
          :class="{ 'is-visible': hoveredColumn === col.name }"
        >
          ➜
        </span>
      </div>
      
      <!-- 접기/펼치기 버튼 -->
      <div 
        v-if="hasMoreColumns" 
        class="table-node__toggle"
        @click="toggleExpand"
      >
        <span v-if="!isExpanded" class="table-node__toggle-icon">▼</span>
        <span v-else class="table-node__toggle-icon">▲</span>
        <span v-if="!isExpanded">+{{ moreColumnsCount }} more columns</span>
        <span v-else>접기</span>
      </div>
    </div>
    
    <!-- Behaviors Section (ObjectType인 경우만 - 클래스 다이어그램 스타일) -->
    <div v-if="data.isObjectType" class="table-node__behaviors-section">
      <div class="table-node__behaviors-divider">
        <span class="divider-label">Methods</span>
      </div>
      <div class="table-node__behaviors-list">
        <div 
          v-for="behavior in (data.behaviors || [])" 
          :key="behavior.name"
          class="table-node__behavior-item"
          :title="behavior.description || behavior.name + ' (더블클릭하여 편집)'"
          @dblclick.stop="handleBehaviorDoubleClick(behavior)"
          @mouseenter="hoveredBehavior = behavior.name"
          @mouseleave="hoveredBehavior = null"
        >
          <span class="table-node__behavior-visibility">+</span>
          <span class="table-node__behavior-type">
            {{ behavior.behaviorType === 'rest_api' ? '🌐' : behavior.behaviorType === 'dmn' ? '📊' : behavior.behaviorType === 'python' ? '🐍' : '📜' }}
          </span>
          <span class="table-node__behavior-name">{{ behavior.name }}()</span>
          <span v-if="behavior.outputField" class="table-node__behavior-return">: {{ behavior.outputField }}</span>
          <!-- 실행 버튼 (hover 시) -->
          <button 
            v-if="hoveredBehavior === behavior.name"
            class="table-node__behavior-run-btn"
            @click.stop="handleBehaviorRun(behavior)"
            title="인스턴스를 선택하여 실행"
          >
            ▶ 실행
          </button>
        </div>
        <div v-if="!data.behaviors || data.behaviors.length === 0" class="table-node__no-behaviors">
          <span class="no-behaviors-hint">+ behavior 추가...</span>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="table-node__footer">
      <span class="table-node__schema">{{ data.schema }}</span>
      <span class="table-node__count">{{ data.columnCount }} cols</span>
    </div>
  </div>
</template>

<style scoped>
.table-node {
  background: var(--color-bg-secondary, #2c2e33);
  border: 2px solid var(--color-border, #373a40);
  border-radius: 10px;
  min-width: 240px;
  max-width: 300px;
  font-family: var(--font-main, 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
  position: relative;
}

.table-node:hover {
  border-color: var(--color-accent, #4dabf7);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.table-node.is-selected {
  border-color: var(--color-accent, #228be6);
  box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.3), 0 8px 24px rgba(0, 0, 0, 0.5);
}

/* Primary table (직접 선택/드래그한 테이블) - 노란색 테두리 */
.table-node.is-primary {
  border-color: #fbbf24;
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.35), 0 8px 24px rgba(0, 0, 0, 0.5);
}

.table-node.is-primary .table-node__header {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border-bottom-color: #d97706;
}

.table-node.is-primary .table-node__header .table-node__name {
  color: #1a1b1e;
}

.table-node.is-primary .table-node__header .table-node__icon {
  color: #1a1b1e;
}

/* Header */
.table-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #339af0 0%, #228be6 100%);
  color: white;
  border-radius: 8px 8px 0 0;
  position: relative;
}

.table-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
}

.table-node__name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-node__actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.table-node:hover .table-node__actions {
  opacity: 1;
}

.table-node__action-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background 0.15s ease;
}

.table-node__action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.table-node__action-btn--remove:hover {
  background: rgba(255, 59, 48, 0.8);
}

.table-node__action-btn--query:hover {
  background: rgba(56, 189, 248, 0.8);
}

/* PK Handle in Header - 받기용 */
.table-node__pk-handle {
  width: 14px !important;
  height: 14px !important;
  background: #ffd43b !important;
  border: 2px solid #fff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
  cursor: crosshair !important;
  z-index: 10 !important;
  transition: all 0.2s ease !important;
}

.table-node__pk-handle:hover {
  transform: scale(1.4) !important;
  background: #40c057 !important;
  box-shadow: 0 0 12px rgba(64, 192, 87, 0.8) !important;
}

.table-node__pk-handle--left {
  left: -7px !important;
}

.table-node__pk-handle--right {
  right: -7px !important;
}

/* Description - 한 줄로 제한, 넘치면 ... */
.table-node__description {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 0.75rem;
  /* color는 인라인 스타일로 출처에 따라 동적 적용 */
  border-bottom: 1px solid var(--color-border, #373a40);
  background: var(--color-bg-tertiary, #25262b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 설명 출처 배지 */
.table-node__description-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.55rem;
  font-weight: 600;
  color: #1a1b1e;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  transition: all 0.2s ease;
}

.table-node__description-badge.is-clickable {
  cursor: pointer;
}

.table-node__description-badge.is-clickable:hover,
.table-node__description-badge.is-hovered {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.5);
}

.table-node__source-hint {
  font-size: 0.7rem;
  animation: hint-pulse 1s ease-in-out infinite;
}

@keyframes hint-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 프로시저 참조 팝업 */
.references-popup {
  position: fixed;
  z-index: 10000;
  min-width: 280px;
  max-width: 400px;
  background: var(--color-bg-secondary, #2c2e33);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  transform: translate(-50%, 10px);
}

.references-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
}

.references-popup__header--column {
  background: linear-gradient(135deg, #a78bfa, #8b5cf6);
}

.references-popup__content {
  max-height: 300px;
  overflow-y: auto;
}

.references-popup__loading,
.references-popup__empty {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted, #909296);
  font-size: 0.8rem;
}

.references-popup__item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border, #373a40);
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.references-popup__item:last-child {
  border-bottom: none;
}

.references-popup__item:hover {
  background: var(--color-bg-tertiary, #25262b);
}

.references-popup__proc-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text, #c1c2c5);
}

.references-popup__proc-type {
  font-size: 0.65rem;
  font-weight: 600;
  color: #a855f7;
  background: rgba(168, 85, 247, 0.15);
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
}

.references-popup__proc-type--fw {
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
}

.references-popup__module-name {
  font-size: 0.7rem;
  color: #94a3b8;
  margin-left: 4px;
}

.references-popup__details {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.7rem;
}

.references-popup__access-type {
  font-weight: 600;
}

.references-popup__stmt-type {
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 4px;
  border-radius: 2px;
  color: var(--color-text-muted, #909296);
}

.references-popup__line {
  color: var(--color-text-muted, #5c5f66);
}

/* Columns */
.table-node__columns {
  padding: 6px 0;
  background: var(--color-bg-secondary, #2c2e33);
}

.table-node__column {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  position: relative;
  transition: all 0.15s ease;
  cursor: default;
}

.table-node__column:hover,
.table-node__column.is-hovered {
  background: var(--color-bg-tertiary, #373a40);
}

.table-node__column.is-pk {
  background: rgba(255, 212, 59, 0.15);
  border-left: 3px solid #ffd43b;
}

.table-node__column.is-fk {
  background: rgba(34, 139, 230, 0.12);
  border-left: 3px solid #228be6;
  cursor: grab;
}

.table-node__column.is-fk:hover {
  background: rgba(34, 139, 230, 0.25);
}

.table-node__column-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.table-node__column-icon {
  font-size: 0.7rem;
  width: 16px;
  text-align: center;
}

.table-node__column.is-pk .table-node__column-icon {
  color: #ffd43b;
}

.table-node__column.is-fk .table-node__column-icon {
  color: #228be6;
}

.table-node__column-name {
  flex: 1;
  font-size: 0.8rem;
  color: var(--color-text, #c1c2c5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-node__column-type {
  font-size: 0.7rem;
  color: var(--color-text-muted, #5c5f66);
  background: var(--color-bg-tertiary, #25262b);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.table-node__column-required {
  color: #ff6b6b;
  font-weight: bold;
  font-size: 0.75rem;
}

/* 컬럼 설명 표시 */
.table-node__column-desc {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  margin-left: 22px;
  font-size: 0.65rem;
  /* color는 인라인 스타일로 출처에 따라 동적 적용 */
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  transition: all 0.3s ease;
}

/* 컬럼 설명 출처 점 */
.table-node__desc-source-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.table-node__column-desc.is-updating {
  background: rgba(81, 207, 102, 0.25);
  color: #51cf66;
  animation: desc-highlight 0.5s ease-in-out 3;
}

.table-node__column-desc.is-clickable {
  cursor: pointer;
  
  &:hover {
    background: rgba(56, 189, 248, 0.2);
    transform: scale(1.02);
  }
}

.table-node__column-link-icon {
  font-size: 0.6rem;
  margin-left: 2px;
  opacity: 0.7;
}

@keyframes desc-highlight {
  0%, 100% { background: rgba(81, 207, 102, 0.25); }
  50% { background: rgba(81, 207, 102, 0.5); }
}

/* Target Handle (left) - 각 컬럼에서 연결을 받음 */
.table-node__target-handle {
  width: 10px !important;
  height: 10px !important;
  background: #40c057 !important;
  border: 2px solid #fff !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
  cursor: crosshair !important;
  z-index: 10 !important;
  transition: all 0.2s ease !important;
  opacity: 0.6;
}

.table-node__target-handle:hover {
  transform: scale(1.3) !important;
  opacity: 1;
  background: #51cf66 !important;
  box-shadow: 0 0 10px rgba(64, 192, 87, 0.7) !important;
}

.table-node__target-handle--left {
  left: -5px !important;
}

.table-node__target-handle--right {
  right: -5px !important;
}

/* Source Handle - 관계 시작점 */
.table-node__source-handle {
  width: 10px !important;
  height: 10px !important;
  background: #868e96 !important;
  border: 2px solid #fff !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
  cursor: grab !important;
  z-index: 10 !important;
  transition: all 0.2s ease !important;
  opacity: 0.4;
}

.table-node__source-handle.is-fk {
  background: #228be6 !important;
  opacity: 0.8;
}

.table-node__source-handle.is-hovered,
.table-node__column:hover .table-node__source-handle {
  opacity: 1;
  transform: scale(1.2) !important;
}

.table-node__source-handle:hover {
  transform: scale(1.4) !important;
  background: #40c057 !important;
  box-shadow: 0 0 12px rgba(64, 192, 87, 0.8) !important;
  cursor: grabbing !important;
}

.table-node__source-handle--right {
  right: -5px !important;
}

.table-node__source-handle--left {
  left: -5px !important;
}

/* Drag hint */
.table-node__drag-hint {
  font-size: 0.85rem;
  color: var(--color-accent, #228be6);
  opacity: 0;
  transition: opacity 0.2s ease;
  margin-left: 4px;
}

.table-node__drag-hint.is-visible {
  opacity: 1;
  animation: pulse-arrow 1s ease-in-out infinite;
}

@keyframes pulse-arrow {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(4px); }
}

/* 접기/펼치기 토글 버튼 */
.table-node__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--color-accent, #4dabf7);
  text-align: center;
  cursor: pointer;
  background: var(--color-bg-tertiary, #25262b);
  border-top: 1px dashed var(--color-border, #373a40);
  transition: all 0.2s ease;
  user-select: none;
}

.table-node__toggle:hover {
  background: rgba(77, 171, 247, 0.15);
  color: var(--color-accent-hover, #74c0fc);
}

.table-node__toggle-icon {
  font-size: 0.65rem;
  transition: transform 0.2s ease;
}

.table-node__toggle:hover .table-node__toggle-icon {
  transform: scale(1.2);
}

/* Footer */
.table-node__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--color-bg-tertiary, #25262b);
  border-radius: 0 0 8px 8px;
  border-top: 1px solid var(--color-border, #373a40);
}

.table-node__schema {
  font-size: 0.65rem;
  color: var(--color-text-muted, #5c5f66);
  background: var(--color-bg, #373a40);
  padding: 2px 6px;
  border-radius: 3px;
}

.table-node__count {
  font-size: 0.65rem;
  color: var(--color-text-light, #909296);
}

/* =========================================
   실시간 업데이트 애니메이션
   ========================================= */

/* 새로 추가된 테이블 애니메이션 */
.table-node.is-newly-added {
  animation: table-appear 0.8s ease-out forwards;
  border-color: #339af0 !important;
  box-shadow: 
    0 0 0 4px rgba(51, 154, 240, 0.4),
    0 0 30px rgba(51, 154, 240, 0.3),
    0 12px 30px rgba(0, 0, 0, 0.5) !important;
}

.table-node.is-newly-added::before {
  content: '🆕 NEW';
  position: absolute;
  top: -12px;
  left: 10px;
  background: linear-gradient(135deg, #339af0, #228be6);
  color: white;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  z-index: 100;
  animation: badge-float 2s ease-in-out infinite;
  box-shadow: 0 2px 10px rgba(51, 154, 240, 0.5);
}

.table-node.is-newly-added .table-node__header {
  background: linear-gradient(135deg, #339af0 0%, #228be6 100%);
  animation: header-glow 1s ease-in-out infinite alternate;
}

@keyframes table-appear {
  0% {
    opacity: 0;
    transform: scale(0.5) translateY(-20px);
  }
  60% {
    opacity: 1;
    transform: scale(1.05) translateY(5px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes badge-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@keyframes header-glow {
  0% {
    box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.1);
  }
  100% {
    box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.2);
  }
}

/* 노드 업데이트 애니메이션 */
.table-node.is-updating {
  animation: node-update-pulse 0.8s ease-in-out 3;
  border-color: #51cf66 !important;
  box-shadow: 
    0 0 0 3px rgba(81, 207, 102, 0.4),
    0 0 20px rgba(81, 207, 102, 0.3),
    0 8px 24px rgba(0, 0, 0, 0.5) !important;
}

.table-node.is-updating .table-node__header {
  background: linear-gradient(135deg, #51cf66 0%, #40c057 100%);
  animation: header-flash 0.8s ease-in-out 3;
}

@keyframes node-update-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}

@keyframes header-flash {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

/* 컬럼 업데이트 애니메이션 */
.table-node__column.is-updating {
  animation: column-update-highlight 0.6s ease-in-out 3;
  background: rgba(81, 207, 102, 0.3) !important;
  border-left: 3px solid #51cf66 !important;
}

.table-node__column.is-updating .table-node__column-name {
  color: #51cf66 !important;
  font-weight: 600;
}

@keyframes column-update-highlight {
  0%, 100% {
    background: rgba(81, 207, 102, 0.3);
  }
  50% {
    background: rgba(81, 207, 102, 0.5);
  }
}

/* 업데이트 배지 (선택적) */
.table-node.is-updating::before {
  content: '✨ 업데이트';
  position: absolute;
  top: -10px;
  right: 10px;
  background: linear-gradient(135deg, #51cf66, #40c057);
  color: white;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  z-index: 100;
  animation: badge-bounce 0.5s ease-out;
  box-shadow: 0 2px 8px rgba(81, 207, 102, 0.4);
}

@keyframes badge-bounce {
  0% {
    transform: translateY(-10px) scale(0.8);
    opacity: 0;
  }
  50% {
    transform: translateY(2px) scale(1.05);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* Description 업데이트 효과 */
.table-node.is-updating .table-node__description {
  background: rgba(81, 207, 102, 0.2);
  border-left: 3px solid #51cf66;
  animation: desc-pulse 0.8s ease-in-out 3;
}

@keyframes desc-pulse {
  0%, 100% {
    padding-left: 12px;
  }
  50% {
    padding-left: 16px;
  }
}

/* Behaviors Section - 클래스 다이어그램 스타일 */
.table-node__behaviors-section {
  border-top: 2px solid var(--color-border, #555);
}

.table-node__behaviors-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  background: rgba(167, 139, 250, 0.08);
  border-bottom: 1px dashed rgba(167, 139, 250, 0.3);
}

.table-node__behaviors-divider .divider-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: #a78bfa;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.table-node__behaviors-list {
  padding: 6px 0;
  background: rgba(167, 139, 250, 0.03);
}

.table-node__behavior-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.table-node__behavior-item:hover {
  background: rgba(167, 139, 250, 0.15);
}

.table-node__behavior-visibility {
  color: #51cf66;
  font-weight: bold;
  font-size: 0.75rem;
  width: 12px;
}

.table-node__behavior-type {
  font-size: 0.7rem;
}

.table-node__behavior-name {
  color: #a78bfa;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 0.8rem;
}

.table-node__behavior-return {
  color: #4dabf7;
  font-size: 0.7rem;
  font-family: 'Fira Code', monospace;
}

.table-node__behavior-run-btn {
  margin-left: auto;
  padding: 2px 8px;
  font-size: 0.65rem;
  background: linear-gradient(135deg, #51cf66, #37b24d);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
  
  &:hover {
    background: linear-gradient(135deg, #40c057, #2f9e44);
    transform: scale(1.05);
  }
}

.table-node__no-behaviors {
  padding: 6px 12px;
  text-align: center;
}

.no-behaviors-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted, #868e96);
  font-style: italic;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.no-behaviors-hint:hover {
  opacity: 1;
  color: #a78bfa;
}
</style>
