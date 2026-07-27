<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { computed, inject, ref } from 'vue'
import type { SchemaModelingColumn } from '../../application/schemaCatalogDiscovery'
import { useSchemaCanvasStore } from '../../state/schemaCanvas.ts'
import CloseButton from '../CloseButton.vue'
import type { OntologyBehavior } from '@/domains/ontology'
import type { TableNodeData } from '../../model/schemaCanvasNodeProjection'
import { useTableReferences } from '../../composables/useTableReferences'
import type { SchemaTableIdentityInput } from '../../model/tableIdentity'

const props = defineProps<{
  id: string
  data: TableNodeData
  selected?: boolean
}>()

// Inject handlers from parent
const onRemoveTable = inject<(table: SchemaTableIdentityInput) => void>('onRemoveTable')
const onLoadRelated = inject<(table: SchemaTableIdentityInput) => void>('onLoadRelated')

// 캔버스 스토어 (실시간 업데이트 감지용)
const canvasStore = useSchemaCanvasStore()

const isNodeUpdating = computed(() => canvasStore.updatedNodes.has(props.id))
const isNodeNewlyAdded = computed(() => canvasStore.newlyAddedTables.has(props.id))

// 컬럼이 업데이트 중인지 확인
function isColumnUpdating(colName: string): boolean {
  return canvasStore.updatedColumns.has(`${props.id}:${colName}`)
}

// 카드 제목 — 논리명 모드면 logical_name(analyzer spec 025, 짧은 도메인명), 없으면 물리명.
// 물리명 모드면 항상 물리명. (요약 analyzed_description 은 제목으로 쓰지 않음 = 부제/상세용)
const tableMeaning = computed(() => (props.data.analyzed_description || '').trim())
const cardTitle = computed(() =>
  canvasStore.showLogicalNames && props.data.logical_name
    ? props.data.logical_name
    : props.data.tableName
)

// 컬럼 1차/2차 라벨 — 논리명 모드면 description(컬럼 논리명), 물리명 모드면 name.
function colPrimary(col: SchemaModelingColumn): string {
  return canvasStore.showLogicalNames && col.description ? col.description : col.name
}
function colSecondary(col: SchemaModelingColumn): string {
  if (canvasStore.showLogicalNames) return col.name
  return col.description || ''
}

const {
  isLoadingReferences,
  referencesError,
  procedureReferences,
  frameworkReferences,
  showReferencesPopup,
  referencesPopupPosition,
  showColumnReferencesPopup,
  columnReferencesError,
  columnReferencesPopupPosition,
  isLoadingColumnReferences,
  columnReferences,
  columnFrameworkReferences,
  activeColumnName,
  openReferences,
  closeReferencesPopup,
  closeColumnReferencesPopup,
  loadColumnReferences,
  handleColumnSourceClick,
  handleProcedureClick,
  handleFrameworkClick,
  getAccessTypeLabel,
  getAccessTypeColor,
} = useTableReferences(
  () => ({ tableName: props.data.tableName, schema: props.data.schema }),
  canvasStore,
)

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

// 카드용 간단 타입 — 길이/정밀도 괄호 제거, 소문자(상세 길이는 상세패널에서). 예: VARCHAR(20)→varchar
function simpleType(dtype: string): string {
  return (dtype || '').replace(/\s*\(.*\)\s*/, '').toLowerCase()
}

function handleRemove(e: Event) {
  e.stopPropagation()
  onRemoveTable?.({
    name: props.data.tableName,
    schema: props.data.schema,
    datasource: props.data.datasource,
  })
}

function handleLoadRelated(e: Event) {
  e.stopPropagation()
  onLoadRelated?.({
    name: props.data.tableName,
    schema: props.data.schema,
    datasource: props.data.datasource,
  })
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

// Behavior 편집 핸들러
const onBehaviorEdit = inject<(objectTypeName: string, columns: string[], behavior: OntologyBehavior) => void>('onBehaviorEdit')
// Behavior 실행 핸들러
const onBehaviorRun = inject<(objectTypeName: string, behavior: OntologyBehavior, query: string) => void>('onBehaviorRun')

function handleBehaviorEdit(behavior: OntologyBehavior) {
  // 컬럼 이름 목록 추출
  const columns = (props.data.columns || []).map(c => c.name)
  onBehaviorEdit?.(props.data.tableName, columns, behavior)
}

function handleBehaviorRun(behavior: OntologyBehavior) {
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
      <div class="table-node__titles">
        <span class="table-node__name" :title="tableMeaning ? `${data.tableName} — ${tableMeaning}` : data.tableName">{{ cardTitle }}</span>
        <span class="table-node__meta-dim">{{ data.schema }} · {{ data.columnCount }}열</span>
      </div>
      <!-- 액션(hover 시 표시 — 평소엔 공간 차지 안 함) -->
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
      <!-- 코드 참조 — 맨 오른쪽 끝(항상 보임, 아이콘+글자로 명료) -->
      <button
        class="table-node__ref-btn"
        title="이 테이블을 읽고/쓰는 코드 참조"
        @click="openReferences"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <span>참조</span>
      </button>

      <!-- PK Target Handle Right -->
      <Handle 
        v-if="pkColumn"
        :id="`pk-${pkColumn.name}-right`"
        type="target"
        :position="Position.Right"
        class="table-node__pk-handle table-node__pk-handle--right"
      />
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
          <div v-else-if="columnReferencesError" class="references-popup__empty">
            <p>참조를 불러오지 못했습니다.</p>
            <button class="references-popup__retry" @click="loadColumnReferences(activeColumnName)">다시 시도</button>
          </div>
          <div v-else-if="columnReferences.length === 0 && columnFrameworkReferences.length === 0" class="references-popup__empty">
            참조 없음 — 이 컬럼을 읽고/쓰는 코드가 없습니다.
          </div>
          <template v-else>
            <!-- 프로시저 참조 -->
            <button
              v-for="ref in columnReferences"
              :key="`col-proc-${ref.procedure_name}-${ref.statement_line}`"
              type="button"
              class="references-popup__item"
              @click="handleProcedureClick(ref)"
            >
              <span class="references-popup__proc-name">
                <span class="references-popup__proc-type">{{ ref.procedure_type }}</span>
                {{ ref.procedure_name }}
              </span>
              <span class="references-popup__details">
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
              </span>
            </button>
            <!-- 프레임워크 참조 -->
            <button
              v-for="ref in columnFrameworkReferences"
              :key="`col-fw-${ref.source_name}-${ref.start_line}`"
              type="button"
              class="references-popup__item"
              @click="handleFrameworkClick(ref)"
            >
              <span class="references-popup__proc-name">
                <span class="references-popup__proc-type references-popup__proc-type--fw">{{ ref.source_type }}</span>
                {{ ref.source_name }}
                <span v-if="ref.module_name && ref.module_name !== ref.source_name" class="references-popup__module-name">
                  ({{ ref.module_name }})
                </span>
              </span>
              <span class="references-popup__details">
                <span
                  class="references-popup__access-type"
                  :style="{ color: getAccessTypeColor(ref.access_type) }"
                >
                  {{ getAccessTypeLabel(ref.access_type) }}
                </span>
              </span>
            </button>
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
          <div v-else-if="referencesError" class="references-popup__empty">
            <p>참조를 불러오지 못했습니다.</p>
            <button class="references-popup__retry" @click="openReferences($event)">다시 시도</button>
          </div>
          <div v-else-if="procedureReferences.length === 0 && frameworkReferences.length === 0" class="references-popup__empty">
            참조 없음 — 이 테이블을 읽고/쓰는 코드가 없습니다.
          </div>
          <template v-else>
            <!-- 프로시저 참조 -->
            <button
              v-for="ref in procedureReferences"
              :key="`proc-${ref.procedure_name}-${ref.statement_line}`"
              type="button"
              class="references-popup__item"
              @click="handleProcedureClick(ref)"
            >
              <span class="references-popup__proc-name">
                <span class="references-popup__proc-type">{{ ref.procedure_type }}</span>
                {{ ref.procedure_name }}
              </span>
              <span class="references-popup__details">
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
              </span>
            </button>
            <!-- 프레임워크 참조 -->
            <button
              v-for="ref in frameworkReferences"
              :key="`fw-${ref.source_name}-${ref.start_line}`"
              type="button"
              class="references-popup__item"
              @click="handleFrameworkClick(ref)"
            >
              <span class="references-popup__proc-name">
                <span class="references-popup__proc-type references-popup__proc-type--fw">{{ ref.source_type }}</span>
                {{ ref.source_name }}
                <span v-if="ref.module_name && ref.module_name !== ref.source_name" class="references-popup__module-name">
                  ({{ ref.module_name }})
                </span>
              </span>
              <span class="references-popup__details">
                <span
                  class="references-popup__access-type"
                  :style="{ color: getAccessTypeColor(ref.access_type) }"
                >
                  {{ getAccessTypeLabel(ref.access_type) }}
                </span>
                <span v-if="ref.evidence_line || ref.start_line" class="references-popup__line">
                  Line {{ ref.evidence_line || ref.start_line }}
                </span>
              </span>
            </button>
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
        
        <!-- 이름 | [PK·FK · *] 마커(타입 앞 딱붙임, 빈칸 없음) | 타입(맨 오른쪽). *가 타입 바로 앞 -->
        <div class="table-node__column-info">
          <button
            type="button"
            class="table-node__column-name nodrag"
            :title="colSecondary(col) || colPrimary(col)"
            :aria-label="`${colPrimary(col)} 컬럼의 코드 참조 보기`"
            @click.stop="handleColumnSourceClick($event, col.name)"
          >{{ colPrimary(col) }}</button>
          <span class="table-node__col-markers">
            <span v-if="isPrimaryKey(col.name)" class="table-node__col-tag table-node__col-tag--pk">PK</span>
            <span v-else-if="isForeignKey(col.name)" class="table-node__col-tag table-node__col-tag--fk">FK</span>
            <span v-if="!col.nullable" class="table-node__nn-star" title="NOT NULL — 필수 입력(비울 수 없음)">*</span>
          </span>
          <span class="table-node__column-type" :title="col.dtype">{{ simpleType(col.dtype) }}</span>
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
      <button
        v-if="hasMoreColumns" 
        type="button"
        class="table-node__toggle nodrag"
        :aria-expanded="isExpanded"
        :aria-label="isExpanded ? `${data.tableName} 컬럼 접기` : `${data.tableName} 나머지 컬럼 ${moreColumnsCount}개 펼치기`"
        @click="toggleExpand"
      >
        <span v-if="!isExpanded" class="table-node__toggle-icon">▼</span>
        <span v-else class="table-node__toggle-icon">▲</span>
        <span v-if="!isExpanded">+{{ moreColumnsCount }} more columns</span>
        <span v-else>접기</span>
      </button>
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
        >
          <button
            type="button"
            class="table-node__behavior-edit-btn nodrag"
            :title="behavior.description || `${behavior.name} 편집`"
            :aria-label="`${behavior.name} Behavior 편집`"
            @click.stop="handleBehaviorEdit(behavior)"
          >
            <span class="table-node__behavior-visibility">+</span>
            <span class="table-node__behavior-type">
              {{ behavior.behaviorType === 'rest_api' ? '🌐' : behavior.behaviorType === 'dmn' ? '📊' : behavior.behaviorType === 'python' ? '🐍' : '📜' }}
            </span>
            <span class="table-node__behavior-name">{{ behavior.name }}()</span>
            <span v-if="behavior.outputField" class="table-node__behavior-return">: {{ behavior.outputField }}</span>
          </button>
          <button
            type="button"
            class="table-node__behavior-run-btn nodrag"
            @click.stop="handleBehaviorRun(behavior)"
            :aria-label="`${behavior.name} Behavior 실행`"
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
    
  </div>
</template>

<style scoped>
.table-node {
  background: var(--color-bg-secondary, #2c2e33);
  border: 2px solid var(--color-border, #373a40);
  border-radius: 10px;
  /* 고정 폭 — 긴 이름은 ellipsis(…), vue-flow 내용맞춤 확장 방지(카드 균일폭) */
  width: 300px;
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

/* Primary table (직접 선택/드래그한 테이블) - 헤더는 그대로, 골드 링으로만 표시(과한 노랑 제거) */
.table-node.is-primary {
  border-color: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.45), 0 8px 24px rgba(0, 0, 0, 0.5);
}

/* Header — 차분한 다크 + accent (모던, 톡 튀는 파랑 제거) */
.table-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--color-bg-tertiary, #25262b);
  color: var(--color-text-bright, #e9ecef);
  border-bottom: 1px solid var(--color-border, #373a40);
  border-radius: 8px 8px 0 0;
  position: relative;
}

.table-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent, #4dabf7);
}

.table-node__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.table-node__name {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-node__meta-dim {
  font-size: 0.62rem;
  font-weight: 400;
  color: var(--color-text-muted, #868e96);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-node__actions {
  display: none;
  gap: 4px;
}

.table-node:hover .table-node__actions {
  display: flex;
}

.table-node__action-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: 4px;
  color: var(--color-text-light, #909296);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.table-node__action-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: var(--color-text-bright, #e9ecef);
}

.table-node__action-btn--remove:hover {
  background: rgba(255, 59, 48, 0.8);
}

.table-node__action-btn--query:hover {
  background: rgba(56, 189, 248, 0.25);
}

/* 코드 참조 — 우상단 끝, 아이콘+글자 pill(항상 보임·명료) */
.table-node__ref-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  height: 21px;
  padding: 0 8px;
  font-size: 0.64rem;
  font-weight: 600;
  color: var(--color-accent, #4dabf7);
  background: rgba(77, 171, 247, 0.14);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.table-node__ref-btn:hover {
  background: rgba(77, 171, 247, 0.26);
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

/* 프로시저 참조 팝업 */
.references-popup {
  position: fixed;
  z-index: 10000;
  width: min(400px, calc(100vw - 24px));
  min-width: min(280px, calc(100vw - 24px));
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

.references-popup__retry {
  margin-top: 8px;
  padding: 4px 12px;
  font-size: 0.75rem;
  color: var(--color-accent, #4dabf7);
  background: rgba(77, 171, 247, 0.12);
  border: 1px solid rgba(77, 171, 247, 0.35);
  border-radius: 4px;
  cursor: pointer;
}

.references-popup__retry:hover {
  background: rgba(77, 171, 247, 0.25);
}

.references-popup__item {
  display: block;
  width: 100%;
  padding: 10px 12px;
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  border-top: none;
  border-right: none;
  border-left: none;
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

.references-popup__item:focus-visible {
  outline: 2px solid var(--color-accent, #4dabf7);
  outline-offset: -2px;
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

/* Columns — 칸형(행마다 가로 구분선) */
.table-node__columns {
  padding: 0;
  background: var(--color-bg-secondary, #2c2e33);
}

.table-node__column {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  position: relative;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  transition: background 0.15s ease;
  cursor: default;
}

/* PK/FK는 우측 태그로만 표시 — 왼쪽 색띠·배경틴트(조잡·선택혼동) 제거 */
.table-node__column:hover,
.table-node__column.is-hovered {
  background: rgba(255, 255, 255, 0.03);
}

.table-node__column.is-fk {
  cursor: grab;
}

/* 이름(flex) | 마커(타입 앞 딱붙임) | 타입(맨 오른쪽 고정). 빈칸 없이 요소만 오른쪽에 모음 */
.table-node__column-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
}

.table-node__column-name {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  color: var(--color-text, #c1c2c5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.table-node__column-name:focus-visible {
  outline: 2px solid var(--color-accent, #4dabf7);
  outline-offset: 2px;
}

/* 마커 묶음 — PK/FK · NOT NULL(*)을 타입 바로 앞에 딱 붙임. 없으면 공간 차지 안 함 */
.table-node__col-markers {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.table-node__col-tag {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.table-node__col-tag--pk { color: #ffd43b; background: rgba(255, 212, 59, 0.14); }
.table-node__col-tag--fk { color: #4dabf7; background: rgba(77, 171, 247, 0.14); }

/* NOT NULL — 주황 별표(타입 바로 앞). '*' 글리프는 위로 떠 보이므로 시각 중심을 행 가운데로 내림 */
.table-node__nn-star {
  display: block;
  font-size: 0.95rem;
  line-height: 1;
  color: #f59e0b;
  /* '*' 글리프는 상단 치우침 → 시각 중심을 행 가운데로 내림 */
  transform: translateY(0.22em);
}

/* type — 간단타입(상세 길이는 상세패널), 맨 오른쪽 끝 고정폭. 세로 구분선 뒤 우측정렬·칸 전체높이 구분선 */
.table-node__column-type {
  flex-shrink: 0;
  width: 4.4rem;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-left: 0.55rem;
  border-left: 1px solid var(--color-border, #373a40);
  font-size: 0.64rem;
  color: var(--color-text-muted, #868e96);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Drag hint — 절대배치(세로 스택 행에 영향 X) */
.table-node__drag-hint {
  position: absolute;
  right: 14px;
  top: 6px;
  font-size: 0.8rem;
  color: var(--color-accent, #228be6);
  opacity: 0;
  transition: opacity 0.2s ease;
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
  width: 100%;
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
  border: 0;
  border-top: 1px dashed var(--color-border, #373a40);
  transition: all 0.2s ease;
  user-select: none;
}

.table-node__toggle:hover {
  background: rgba(77, 171, 247, 0.15);
  color: var(--color-accent-hover, #74c0fc);
}

.table-node__toggle:focus-visible {
  outline: 2px solid var(--color-accent, #4dabf7);
  outline-offset: -2px;
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
  padding: 3px 8px 3px 4px;
  font-size: 0.8rem;
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

.table-node__behavior-edit-btn {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 2px 8px;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.table-node__behavior-edit-btn:focus-visible,
.table-node__behavior-run-btn:focus-visible {
  outline: 2px solid var(--color-accent, #4dabf7);
  outline-offset: 1px;
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
  flex-shrink: 0;
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
