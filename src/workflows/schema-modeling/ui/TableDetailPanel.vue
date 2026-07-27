<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useSchemaCanvasStore } from '../state/schemaCanvas.ts'
import type { SchemaModelingColumn } from '../application/schemaCatalogDiscovery'
import { IconEdit, IconTrash, IconPlus } from '@/shared/icons'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import CloseButton from './CloseButton.vue'
import { getDescriptionColor, getDescriptionSourceLabel } from '@/shared/utils/descriptionColor'
import TextViewer from '@/shared/components/TextViewer.vue'
import type { OntologyBehavior } from '@/domains/ontology'
import type { SchemaRelationship } from '../model/relationshipEdgeProjection'
import {
  sameTableIdentity,
  tableIdentityKey,
  tableIdentityLabel,
  tableNodeId,
} from '../model/tableIdentity'

const store = useSchemaCanvasStore()
const managedTimeouts = useManagedTimeouts()

const emit = defineEmits<{
  (e: 'openBehaviorDialog', data: { mode: 'create' | 'edit', objectTypeName: string, columns: string[], behavior?: OntologyBehavior }): void
}>()

// ObjectType 여부 확인
const isObjectType = computed(() => {
  const t = store.selectedTable
  return t?.isObjectType === true
})

// Behavior 목록
const behaviors = computed<OntologyBehavior[]>(() => {
  const t = store.selectedTable
  if (!t) return []
  return t.behaviors || []
})

// Behavior 추가 다이얼로그 열기
function openAddBehaviorDialog() {
  const t = store.selectedTable
  if (!t) return
  
  emit('openBehaviorDialog', {
    mode: 'create',
    objectTypeName: t.name,
    columns: store.selectedTableColumns.map(c => c.name)
  })
}

// Behavior 편집 다이얼로그 열기
function openEditBehaviorDialog(behavior: OntologyBehavior) {
  const t = store.selectedTable
  if (!t) return
  
  emit('openBehaviorDialog', {
    mode: 'edit',
    objectTypeName: t.name,
    columns: store.selectedTableColumns.map(c => c.name),
    behavior
  })
}

// Behavior 타입 아이콘
function getBehaviorTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    rest_api: '🌐',
    dmn: '📊',
    python: '🐍',
    javascript: '📜'
  }
  return icons[type] || '⚡'
}

// Behavior 타입 레이블
function getBehaviorTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    rest_api: 'REST API',
    dmn: 'DMN 규칙',
    python: 'Python',
    javascript: 'JavaScript'
  }
  return labels[type] || type
}

// Edit states
const isEditingDescription = ref(false)
const editingColumnName = ref<string | null>(null)

// 실시간 업데이트 애니메이션 상태
const isTableUpdating = ref(false)
const updatingColumnNames = ref<Set<string>>(new Set())

// Edit forms
const tableDescForm = reactive({
  description: ''
})

const columnDescForm = reactive({
  description: ''
})

// New relationship form
const showRelationshipForm = ref(false)
const newRelationship = reactive({
  from_column: '',
  to_table_key: '',
  to_column: '',
  description: ''
})

const tableSave = reactive({ pending: false, error: null as string | null })
const columnSave = reactive({
  pendingColumn: null as string | null,
  errorColumn: null as string | null,
  error: null as string | null,
})
const relationshipCreate = reactive({
  pending: false,
  error: null as string | null,
  refreshWarning: null as string | null,
})
const deleteTarget = ref<SchemaRelationship | null>(null)
const relationshipDelete = reactive({
  pending: false,
  error: null as string | null,
  refreshWarning: null as string | null,
})

// Computed
const table = computed(() => store.selectedTable)
const columns = computed(() => store.selectedTableColumns)
const isOpen = computed(() => store.isDetailPanelOpen)
const columnsError = computed(() => {
  const selected = table.value
  if (!selected) return null
  return store.getTableColumnsError(
    selected.name,
    selected.schema || '',
    selected.datasource || '',
  )
})

// 설명 표시 — 분석된 의미(AI)와 원본 설명 중복 제거.
const analyzedText = computed(() => (table.value?.analyzed_description || '').trim())
const rawText = computed(() => (table.value?.description || '').trim())
// 원본 설명은 "분석본과 다른 진짜 원본"일 때만 표시. 코드 도출(code/procedure)이면 원본=분석본 → 숨김.
const showRaw = computed(() => {
  if (!analyzedText.value) return true                 // 분석본 없으면 원본(편집)만 보여줌
  if (!rawText.value) return false
  if (analyzedText.value === rawText.value) return false
  const src = table.value?.description_source
  if (src === 'code' || src === 'procedure') return false
  return true
})

const availableTables = computed(() => {
  return store.allTables.filter(candidate =>
    !table.value || !sameTableIdentity(candidate, table.value),
  )
})

const selectedTargetTable = computed(() => {
  if (!newRelationship.to_table_key) return null
  return availableTables.value.find(
    candidate => tableIdentityKey(candidate) === newRelationship.to_table_key,
  ) || null
})

const duplicateTargetNames = computed(() => {
  const counts = new Map<string, number>()
  for (const candidate of availableTables.value) {
    counts.set(candidate.name, (counts.get(candidate.name) || 0) + 1)
  }
  return counts
})

function targetTableLabel(candidate: (typeof store.allTables)[number]): string {
  return (duplicateTargetNames.value.get(candidate.name) || 0) > 1
    ? tableIdentityLabel(candidate)
    : candidate.name
}

const targetTableColumns = computed(() => {
  const target = selectedTargetTable.value
  if (!target) return []
  return store.getCachedTableColumns(target.name, target.schema, target.datasource || '')
})

const targetTableColumnsError = computed(() => {
  const target = selectedTargetTable.value
  if (!target) return null
  return store.getTableColumnsError(
    target.name,
    target.schema || '',
    target.datasource || '',
  )
})

const tableRelationships = computed(() => {
  if (!table.value) return []
  return store.userRelationships.filter(
    relationship =>
      (
        relationship.from_table === table.value?.name
        && (relationship.from_schema || 'public') === (table.value?.schema || 'public')
      )
      || (
        relationship.to_table === table.value?.name
        && (relationship.to_schema || 'public') === (table.value?.schema || 'public')
      ),
  )
})

// Watchers
watch(() => store.selectedTable, (newTable) => {
  if (newTable) {
    tableDescForm.description = newTable.description || ''
  }
  isEditingDescription.value = false
  editingColumnName.value = null
  tableSave.error = null
  columnSave.error = null
  columnSave.errorColumn = null
  relationshipCreate.error = null
  deleteTarget.value = null
})

// 테이블 업데이트 감지 (실시간 애니메이션)
watch(
  () => {
    if (!table.value) return null
    const nodeId = tableNodeId(table.value)
    return store.updatedNodes.get(nodeId)
  },
  (newVal) => {
    if (newVal) {
      isTableUpdating.value = true
      managedTimeouts.schedule('table-update-highlight', () => {
        isTableUpdating.value = false
      }, 3000)
    }
  },
  { immediate: true }
)

// 컬럼 업데이트 감지 (실시간 애니메이션)
watch(
  () => Array.from(store.updatedColumns.entries()),
  (entries) => {
    if (!table.value) return
    const nodeId = tableNodeId(table.value)
    for (const [key, _] of entries) {
      if (key.startsWith(`${nodeId}:`)) {
        const colName = key.slice(nodeId.length + 1)
        updatingColumnNames.value.add(colName)
        managedTimeouts.schedule(`column-update-highlight:${colName}`, () => {
          updatingColumnNames.value.delete(colName)
        }, 3000)
      }
    }
  },
  { deep: true }
)

watch(() => newRelationship.to_table_key, async () => {
  const target = selectedTargetTable.value
  if (target && store.getCachedTableColumns(target.name, target.schema, target.datasource || '').length === 0) {
    try {
      await store.loadTableColumns(target.name, target.schema, target.datasource || '')
    } catch {
      // 오류 상태는 store가 보존하고 폼에서 재시도 가능하게 표시한다.
    }
  }
  newRelationship.to_column = ''
})

// Methods
function closePanel() {
  store.closeDetailPanel()
}

async function retrySelectedTableColumns(): Promise<void> {
  if (store.selectedNodeId) {
    await store.selectNode(store.selectedNodeId)
  }
}

async function retryTargetTableColumns(): Promise<void> {
  const target = selectedTargetTable.value
  if (!target) return
  try {
    await store.loadTableColumns(
      target.name,
      target.schema || '',
      target.datasource || '',
    )
  } catch {
    // 오류 상태는 store가 갱신한다.
  }
}

function startEditDescription() {
  tableDescForm.description = table.value?.description || ''
  tableSave.error = null
  isEditingDescription.value = true
}

function cancelEditDescription() {
  isEditingDescription.value = false
}

async function saveDescription() {
  if (!table.value || tableSave.pending) return
  const target = { ...table.value }
  tableSave.pending = true
  tableSave.error = null
  
  try {
    await store.updateTableDescription(target, tableDescForm.description)
    isEditingDescription.value = false
  } catch (error) {
    tableSave.error = error instanceof Error ? error.message : '테이블 설명 저장에 실패했습니다.'
  } finally {
    tableSave.pending = false
  }
}

function startEditColumn(columnName: string) {
  const col = columns.value.find(c => c.name === columnName)
  if (col) {
    columnDescForm.description = col.description || ''
    editingColumnName.value = columnName
    columnSave.error = null
    columnSave.errorColumn = null
  }
}

function cancelEditColumn() {
  editingColumnName.value = null
}

async function saveColumnDescription(columnName: string) {
  if (!table.value || columnSave.pendingColumn) return
  const target = { ...table.value }
  columnSave.pendingColumn = columnName
  columnSave.error = null
  columnSave.errorColumn = null
  
  try {
    await store.updateColumnDescription(target, columnName, columnDescForm.description)
    editingColumnName.value = null
  } catch (error) {
    columnSave.errorColumn = columnName
    columnSave.error = error instanceof Error ? error.message : '컬럼 설명 저장에 실패했습니다.'
  } finally {
    columnSave.pendingColumn = null
  }
}

function toggleRelationshipForm() {
  showRelationshipForm.value = !showRelationshipForm.value
  if (showRelationshipForm.value) {
    resetRelationshipForm()
  }
}

function resetRelationshipForm() {
  newRelationship.from_column = ''
  newRelationship.to_table_key = ''
  newRelationship.to_column = ''
  newRelationship.description = ''
}

async function addRelationship() {
  const target = selectedTargetTable.value
  if (
    !table.value
    || !target
    || relationshipCreate.pending
    || !newRelationship.from_column
    || !newRelationship.to_column
  ) {
    return
  }
  relationshipCreate.pending = true
  relationshipCreate.error = null
  relationshipCreate.refreshWarning = null
  
  try {
    const result = await store.addRelationship({
      from_table: table.value.name,
      from_schema: table.value.schema || 'public',
      from_column: newRelationship.from_column,
      to_table: target.name,
      to_schema: target.schema || 'public',
      to_column: newRelationship.to_column,
      description: newRelationship.description
    })
    relationshipCreate.refreshWarning = result.refreshWarning
    
    resetRelationshipForm()
    showRelationshipForm.value = false
  } catch (error) {
    relationshipCreate.error = error instanceof Error ? error.message : '릴레이션 추가에 실패했습니다.'
  } finally {
    relationshipCreate.pending = false
  }
}

function openRelationshipDelete(relationship: SchemaRelationship): void {
  deleteTarget.value = { ...relationship }
  relationshipDelete.error = null
  relationshipDelete.refreshWarning = null
}

function cancelRelationshipDelete(): void {
  if (relationshipDelete.pending) return
  deleteTarget.value = null
  relationshipDelete.error = null
}

async function confirmRelationshipDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target || relationshipDelete.pending) return
  relationshipDelete.pending = true
  relationshipDelete.error = null
  try {
    const result = await store.removeRelationship(target)
    relationshipDelete.refreshWarning = result.refreshWarning
    deleteTarget.value = null
  } catch (error) {
    relationshipDelete.error = error instanceof Error
      ? error.message
      : '릴레이션 삭제에 실패했습니다.'
  } finally {
    relationshipDelete.pending = false
  }
}

const deleteMessage = computed(() => {
  const target = deleteTarget.value
  if (!target) return ''
  return `${target.from_schema}.${target.from_table}.${target.from_column} →\n`
    + `${target.to_schema}.${target.to_table}.${target.to_column}\n관계를 삭제하시겠습니까?`
})

function getColumnIcon(col: SchemaModelingColumn): string {
  if (col.name.toLowerCase() === 'id') return '🔑'
  if (col.name.endsWith('_id')) return '🔗'
  return '📝'
}

// 컬럼이 업데이트 중인지 확인
function isColumnUpdating(colName: string): boolean {
  return updatingColumnNames.value.has(colName)
}

</script>

<template>
  <Transition name="slide">
    <div v-if="isOpen && table" class="detail-panel">
      <!-- Header -->
      <div class="detail-panel__header">
        <div class="detail-panel__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          <span>{{ table.name }}</span>
        </div>
        <CloseButton @click="closePanel" />
      </div>
      
      <!-- Content -->
      <div class="detail-panel__content">
        <!-- Table Info Section -->
        <section class="detail-section" :class="{ 'is-updating': isTableUpdating }">
          <div class="detail-section__header">
            <h3>테이블 정보</h3>
            <span class="detail-section__badge">{{ table.schema || 'public' }}</span>
            <span v-if="isTableUpdating" class="detail-section__update-badge">✨ 업데이트</span>
          </div>
          
          <!-- 분석된 의미 (AI 도출, 읽기 전용·깔끔) -->
          <div v-if="analyzedText" class="detail-field">
            <label>분석된 의미</label>
            <div class="detail-field__analyzed">
              <TextViewer :content="analyzedText" :max-height="160" />
            </div>
          </div>

          <!-- 설명 (원본 — 분석본과 다른 진짜 원본일 때만, 편집 가능) -->
          <div v-if="showRaw" class="detail-field" :class="{ 'is-updating': isTableUpdating }">
            <label>
              설명
              <span
                v-if="table.description_source"
                class="detail-field__source-badge"
                :style="{ background: getDescriptionColor(table.description_source) }"
              >
                {{ getDescriptionSourceLabel(table.description_source) }}
              </span>
            </label>
            <div v-if="isEditingDescription" class="detail-field__edit">
              <textarea 
                v-model="tableDescForm.description"
                aria-label="테이블 설명"
                placeholder="테이블 설명을 입력하세요..."
                rows="3"
                :disabled="tableSave.pending"
              ></textarea>
              <div v-if="tableSave.error" class="operation-error" role="alert">
                {{ tableSave.error }}
              </div>
              <div class="detail-field__actions">
                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  :disabled="tableSave.pending"
                  @click="saveDescription"
                >{{ tableSave.pending ? '저장 중…' : tableSave.error ? '다시 시도' : '저장' }}</button>
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  :disabled="tableSave.pending"
                  @click="cancelEditDescription"
                >취소</button>
              </div>
            </div>
            <div
              v-else
              class="detail-field__display"
            >
              <TextViewer
                :content="table.description"
                :max-height="180"
                placeholder="설명을 추가하려면 클릭하세요"
              />
              <IconEdit :size="14" class="detail-field__edit-icon" />
              <button
                type="button"
                class="detail-field__edit-hitbox"
                :aria-label="`${table.name} 테이블 설명 편집`"
                @click="startEditDescription"
              ></button>
            </div>
          </div>
        </section>
        
        <!-- Columns Section -->
        <section class="detail-section">
          <div class="detail-section__header">
            <h3>컬럼 ({{ columns.length }})</h3>
          </div>
          
          <div v-if="columnsError" class="resource-error">
            <span>컬럼을 불러오지 못했습니다: {{ columnsError }}</span>
            <button class="btn btn--secondary btn--xs" @click="retrySelectedTableColumns">다시 시도</button>
          </div>

          <div v-else class="columns-list">
            <div 
              v-for="col in columns" 
              :key="col.name"
              class="column-item"
              :class="{ 
                'is-pk': col.name.toLowerCase() === 'id',
                'is-fk': col.name.endsWith('_id') && col.name.toLowerCase() !== 'id',
                'is-updating': isColumnUpdating(col.name)
              }"
            >
              <div class="column-item__header">
                <span class="column-item__icon">{{ getColumnIcon(col) }}</span>
                <span class="column-item__name">{{ col.name }}</span>
                <!-- NOT NULL 고정 칸(빈칸도 유지) → 타입이 항상 맨 오른쪽 같은 위치. 카드와 일관 -->
                <span class="column-item__required">
                  <span v-if="!col.nullable" class="column-item__nn-badge">NOT NULL</span>
                </span>
                <span class="column-item__type">{{ col.dtype.toUpperCase() }}</span>
              </div>
              
              <div v-if="editingColumnName === col.name" class="column-item__edit">
                <textarea 
                  v-model="columnDescForm.description"
                  :aria-label="`${col.name} 컬럼 설명`"
                  placeholder="컬럼 설명..."
                  rows="2"
                  :disabled="columnSave.pendingColumn === col.name"
                ></textarea>
                <div
                  v-if="columnSave.errorColumn === col.name && columnSave.error"
                  class="operation-error"
                  role="alert"
                >{{ columnSave.error }}</div>
                <div class="column-item__actions">
                  <button
                    type="button"
                    class="btn btn--primary btn--xs"
                    :disabled="Boolean(columnSave.pendingColumn)"
                    @click="saveColumnDescription(col.name)"
                  >{{ columnSave.pendingColumn === col.name ? '저장 중…' : columnSave.errorColumn === col.name ? '다시 시도' : '저장' }}</button>
                  <button
                    type="button"
                    class="btn btn--secondary btn--xs"
                    :disabled="Boolean(columnSave.pendingColumn)"
                    @click="cancelEditColumn"
                  >취소</button>
                </div>
              </div>
              <div v-else class="column-item__desc">
                <span
                  v-if="col.description_source"
                  class="column-item__source-dot"
                  :style="{ background: getDescriptionColor(col.description_source) }"
                  :title="`출처: ${getDescriptionSourceLabel(col.description_source)}`"
                ></span>
                <TextViewer
                  :content="col.description"
                  :max-height="120"
                  placeholder="설명 추가..."
                  compact
                />
                <button
                  type="button"
                  class="column-item__desc-hitbox"
                  :aria-label="`${col.name} 컬럼 설명 편집`"
                  @click="startEditColumn(col.name)"
                ></button>
              </div>
            </div>
          </div>
        </section>
        
        <!-- Relationships Section -->
        <section class="detail-section">
          <div class="detail-section__header">
            <h3>릴레이션</h3>
            <button 
              class="btn btn--primary btn--sm"
              @click="toggleRelationshipForm"
            >
              <template v-if="showRelationshipForm">취소</template>
              <template v-else><IconPlus :size="12" /> 추가</template>
            </button>
          </div>
          
          <!-- Add Relationship Form -->
          <div v-if="showRelationshipForm" class="relationship-form">
            <div class="form-group">
              <label>From 컬럼</label>
              <select
                v-model="newRelationship.from_column"
                aria-label="출발 컬럼"
                :disabled="relationshipCreate.pending"
              >
                <option value="">선택하세요</option>
                <option v-for="col in columns" :key="col.name" :value="col.name">
                  {{ col.name }}
                </option>
              </select>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>To 테이블</label>
                <select v-model="newRelationship.to_table_key" aria-label="대상 테이블">
                  <option value="">선택하세요</option>
                  <option
                    v-for="t in availableTables"
                    :key="tableIdentityKey(t)"
                    :value="tableIdentityKey(t)"
                  >
                    {{ targetTableLabel(t) }}
                  </option>
                </select>
              </div>
              
              <div class="form-group">
                <label>To 컬럼</label>
                <select
                  v-model="newRelationship.to_column"
                  aria-label="대상 컬럼"
                  :disabled="!selectedTargetTable || relationshipCreate.pending"
                >
                  <option value="">선택하세요</option>
                  <option v-for="col in targetTableColumns" :key="col.name" :value="col.name">
                    {{ col.name }}
                  </option>
                </select>
                <div v-if="targetTableColumnsError" class="resource-error resource-error--compact">
                  <span>대상 컬럼 조회 실패</span>
                  <button type="button" class="btn btn--secondary btn--xs" @click="retryTargetTableColumns">다시 시도</button>
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label>설명 (선택)</label>
              <input 
                v-model="newRelationship.description"
                type="text"
                aria-label="릴레이션 설명"
                placeholder="릴레이션 설명..."
                :disabled="relationshipCreate.pending"
              />
            </div>

            <div v-if="relationshipCreate.error" class="operation-error" role="alert">
              {{ relationshipCreate.error }}
            </div>
            
            <button 
              type="button"
              class="btn btn--primary btn--block"
              @click="addRelationship"
              :disabled="relationshipCreate.pending || !newRelationship.from_column || !selectedTargetTable || !newRelationship.to_column"
            >
              {{ relationshipCreate.pending ? '추가 중…' : relationshipCreate.error ? '같은 입력으로 다시 시도' : '릴레이션 추가' }}
            </button>
          </div>

          <div v-if="relationshipCreate.refreshWarning" class="operation-warning" role="status">
            관계는 추가됐지만 목록을 새로고치지 못했습니다: {{ relationshipCreate.refreshWarning }}
          </div>
          <div v-if="relationshipDelete.refreshWarning" class="operation-warning" role="status">
            관계는 삭제됐지만 목록을 새로고치지 못했습니다: {{ relationshipDelete.refreshWarning }}
          </div>
          
          <!-- Existing Relationships -->
          <div v-if="store.relationshipLoadError" class="resource-error">
            <span>릴레이션을 불러오지 못했습니다: {{ store.relationshipLoadError }}</span>
            <button class="btn btn--secondary btn--xs" @click="store.loadUserRelationships">다시 시도</button>
          </div>

          <div class="relationships-list">
            <div 
              v-for="rel in tableRelationships" 
              :key="`${rel.from_schema}-${rel.from_table}-${rel.from_column}-${rel.to_schema}-${rel.to_table}-${rel.to_column}`"
              class="relationship-item"
            >
              <div class="relationship-item__info">
                <span class="relationship-item__from">{{ rel.from_table }}.{{ rel.from_column }}</span>
                <span class="relationship-item__arrow">→</span>
                <span class="relationship-item__to">{{ rel.to_table }}.{{ rel.to_column }}</span>
              </div>
              <button 
                class="relationship-item__remove"
                :aria-label="`${rel.from_table}.${rel.from_column}에서 ${rel.to_table}.${rel.to_column} 관계 삭제`"
                title="관계 삭제"
                @click="openRelationshipDelete(rel)"
              >
                <IconTrash :size="14" />
              </button>
            </div>
            
            <div v-if="!store.relationshipLoadError && tableRelationships.length === 0" class="empty-state">
              이 테이블과 연결된 릴레이션이 없습니다
            </div>
          </div>
        </section>
        
        <!-- Behaviors Section (ObjectType only) -->
        <section v-if="isObjectType" class="detail-section behaviors-section">
          <div class="detail-section__header">
            <h3>⚡ Behaviors ({{ behaviors.length }})</h3>
            <button 
              class="btn btn--primary btn--sm"
              @click="openAddBehaviorDialog"
            >
              <IconPlus :size="12" /> 추가
            </button>
          </div>
          
          <div class="behaviors-list">
             <div
               v-for="behavior in behaviors"
               :key="behavior.name"
               class="behavior-item"
             >
               <button
                 type="button"
                 class="behavior-item__edit-hitbox"
                 :aria-label="`${behavior.name} Behavior 편집`"
                 @click="openEditBehaviorDialog(behavior)"
               ></button>
               <div class="behavior-item__header">
                <span class="behavior-item__icon">{{ getBehaviorTypeIcon(behavior.behaviorType) }}</span>
                <span class="behavior-item__name">{{ behavior.name }}</span>
                <span class="behavior-item__type">{{ getBehaviorTypeLabel(behavior.behaviorType) }}</span>
              </div>
              <TextViewer
                v-if="behavior.description"
                class="behavior-item__desc"
                :content="behavior.description"
                :max-height="120"
                compact
              />
              <div v-if="behavior.inputFields && behavior.inputFields.length > 0" class="behavior-item__fields">
                입력: {{ behavior.inputFields.join(', ') }}
                <template v-if="behavior.outputField"> → {{ behavior.outputField }}</template>
              </div>
            </div>
            
            <div v-if="behaviors.length === 0" class="empty-state">
              <p>정의된 Behavior가 없습니다</p>
              <p class="empty-hint">Behavior를 추가하여 이 ObjectType의 동작을 정의하세요</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </Transition>

  <ActionDialog
    :open="Boolean(deleteTarget)"
    dialog-id="schema-relationship-delete"
    title="Catalog 관계 삭제"
    :message="deleteMessage"
    confirm-label="관계 삭제"
    pending-label="삭제 중…"
    :pending="relationshipDelete.pending"
    :error="relationshipDelete.error"
    @cancel="cancelRelationshipDelete"
    @confirm="confirmRelationshipDelete"
  />
</template>

<style scoped lang="scss">
.detail-panel {
  width: 380px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Header */
.detail-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.detail-panel__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-bright);
  
  svg {
    color: var(--color-accent);
  }
}

.detail-panel__close {
  background: none;
  border: none;
  color: var(--color-text-light);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg);
    color: var(--color-text-bright);
  }
}

/* Content */
.detail-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Sections */
.detail-section {
  margin-bottom: 24px;
}

.detail-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  
  h3 {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-light);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
}

.detail-section__badge {
  font-size: 0.7rem;
  padding: 2px 8px;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
}

/* Fields */
.detail-field {
  margin-bottom: 16px;
  
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }
}

/* 설명 출처 배지 — 라벨 행 오른쪽 끝으로 정렬(출처 표시 유지·위치 정리) */
.detail-field__source-badge {
  margin-left: auto;
  font-size: 0.55rem;
  font-weight: 600;
  color: #1a1b1e;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* 분석된 의미 — 읽기 전용 클린 블록(파란 좌측선 제거) */
.detail-field__analyzed {
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--color-text);

  :deep(.text-viewer__body) {
    white-space: normal;
    line-height: 1.5;
  }
}

/* 줄바꿈 — 한글은 어절 단위 보존(keep-all), 긴 영문/숫자 토큰만 강제 개행(anywhere) */
.detail-section :deep(.text-viewer__body),
.detail-field :deep(.text-viewer__body) {
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.detail-field__display {
  position: relative;
  padding: 10px 32px 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--color-text);

  &:hover {
    border-color: var(--color-accent);
  }

  .placeholder {
    color: var(--color-text-muted);
    font-style: italic;
  }

  :deep(.text-viewer__body) {
    white-space: normal;
    line-height: 1.5;
  }
}

.detail-field__edit-hitbox {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.detail-field__text {
  margin: 0;
  max-height: 180px;
  overflow-y: auto;
  white-space: normal;
  word-break: break-word;
  color: var(--color-text);
  font-size: 0.82rem;
  line-height: 1.5;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
  &::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }
}

.detail-field__edit-icon {
  position: absolute;
  top: 10px;
  right: 10px;
  color: var(--color-text-muted);
  opacity: 0.7;

  .detail-field__display:hover & {
    opacity: 1;
  }
}

.detail-field__edit {
  textarea {
    width: 100%;
    padding: 10px;
    background: var(--color-bg);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.875rem;
    resize: vertical;
    font-family: inherit;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.detail-field__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* Columns List — 각 컬럼 = 배경 있는 단일 카드(영역 구분 명확, 이중박스·색선은 폐기) */
.columns-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 360px;
  overflow-y: auto;
}

.column-item {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: 8px 11px;
  transition: background 0.15s;

  &:hover {
    background: var(--color-bg-secondary);
  }
}

.column-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.column-item__icon {
  font-size: 0.8rem;
}

.column-item__name {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-bright);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.column-item__type {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  background: var(--color-bg);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

/* NOT NULL 고정 슬롯 — 빈칸도 폭 유지해 타입이 항상 같은 위치(지그재그 방지) */
.column-item__required {
  flex: 0 0 4.6rem;
  display: flex;
  justify-content: flex-end;
}

/* NOT NULL 배지 — 주황(카드 별표와 색 일관) */
.column-item__nn-badge {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.13);
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

/* 컬럼 설명 출처 점 — 작게(출처 색만) */
.column-item__source-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}

/* 설명 — 박스 제거, 이름 아래 흐린 인라인 줄(아이콘 폭만큼 들여쓰기) */
.column-item__desc {
  display: flex;
  position: relative;
  align-items: flex-start;
  gap: 5px;
  margin-top: 2px;
  padding-left: 1.55rem;
  font-size: 0.73rem;
  line-height: 1.4;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover {
    color: var(--color-text-light);
  }

  .placeholder {
    font-style: italic;
    color: var(--color-text-muted);
  }

  :deep(.text-viewer__body) {
    white-space: normal;
    line-height: 1.4;
  }
}

.column-item__desc-hitbox {
  position: absolute;
  inset: -2px 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.column-item__edit {
  margin-top: 8px;
  
  textarea {
    width: 100%;
    padding: 8px;
    background: var(--color-bg);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 0.8rem;
    resize: none;
    font-family: inherit;
  }
}

.column-item__actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

/* Relationship Form */
.relationship-form {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 12px;
  
  label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-light);
    margin-bottom: 6px;
  }
  
  select,
  input {
    width: 100%;
    padding: 8px 10px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.85rem;
    
    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.form-row {
  display: flex;
  gap: 12px;
  
  .form-group {
    flex: 1;
  }
}

/* Relationships List */
.relationships-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resource-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px 12px;
  color: var(--color-error);
  font-size: 0.75rem;
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 35%, transparent);
  border-radius: var(--radius-md);
}

.resource-error--compact {
  margin: 6px 0 0;
  padding: 7px 8px;
}

.operation-error,
.operation-warning {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.operation-error {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 35%, transparent);
}

.operation-warning {
  margin-bottom: 10px;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.09);
  border: 1px solid rgba(245, 158, 11, 0.32);
}

.relationship-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.relationship-item__info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.relationship-item__from,
.relationship-item__to {
  color: var(--color-accent-light);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
}

.relationship-item__arrow {
  color: var(--color-text-muted);
}

.relationship-item__remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-error);
    color: white;
  }
}

@media (max-width: 640px) {
  .detail-panel {
    position: fixed;
    inset: 0;
    z-index: 900;
    width: 100%;
    height: 100dvh;
  }

  .detail-panel__header {
    padding: 12px 14px;
  }

  .detail-panel__content {
    padding: 12px;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .detail-field__actions,
  .column-item__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-style: italic;
}

/* =========================================
   실시간 업데이트 애니메이션
   ========================================= */

/* 섹션 업데이트 */
.detail-section.is-updating {
  animation: section-pulse 0.5s ease-in-out 3;
}

@keyframes section-pulse {
  0%, 100% { background: transparent; }
  50% { background: rgba(81, 207, 102, 0.1); }
}

/* 업데이트 배지 */
.detail-section__update-badge {
  font-size: 0.65rem;
  background: linear-gradient(135deg, #51cf66, #40c057);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: auto;
  animation: badge-pop 0.4s ease-out;
}

@keyframes badge-pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  70% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 필드 업데이트 */
.detail-field.is-updating .detail-field__display {
  background: rgba(81, 207, 102, 0.2);
  border-color: #51cf66;
  animation: field-highlight 0.5s ease-in-out 3;
}

@keyframes field-highlight {
  0%, 100% { border-color: #51cf66; }
  50% { border-color: #40c057; box-shadow: 0 0 8px rgba(81, 207, 102, 0.5); }
}

/* 컬럼 업데이트 */
.column-item.is-updating {
  background: rgba(81, 207, 102, 0.15) !important;
  border-color: #51cf66 !important;
  animation: column-update 0.5s ease-in-out 3;
}

.column-item.is-updating .column-item__desc {
  background: rgba(81, 207, 102, 0.3);
  color: #51cf66;
}

.column-item.is-updating::before {
  content: '✨';
  position: absolute;
  right: 10px;
  top: 10px;
  animation: sparkle 0.8s ease-in-out infinite;
}

@keyframes column-update {
  0%, 100% { 
    background: rgba(81, 207, 102, 0.15);
    transform: translateX(0);
  }
  25% { transform: translateX(2px); }
  50% { 
    background: rgba(81, 207, 102, 0.3);
    transform: translateX(-2px);
  }
  75% { transform: translateX(1px); }
}

@keyframes sparkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.2); }
}

/* 컬럼 아이템 position 추가 */
.column-item {
  position: relative;
}

/* Behaviors Section */
.behaviors-section {
  .detail-section__header h3 {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.behaviors-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.behavior-item {
  position: relative;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    border-color: var(--color-accent);
    background: rgba(0, 212, 170, 0.05);
  }
}

.behavior-item__edit-hitbox {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: inherit;
  cursor: pointer;
}

.behavior-item__edit-hitbox:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.behavior-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.behavior-item__icon {
  font-size: 1rem;
}

.behavior-item__name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.behavior-item__type {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  background: var(--color-bg);
  padding: 2px 8px;
  border-radius: 10px;
}

.behavior-item__desc {
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--color-text-light);
  line-height: 1.4;
}

.behavior-item__fields {
  margin-top: 6px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: monospace;
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: 4px;
}
</style>
