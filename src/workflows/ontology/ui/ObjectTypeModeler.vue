<script setup lang="ts">
/**
 * ObjectTypeModeler.vue
 * ObjectType 기반 스키마 모델링 툴
 * - SchemaCanvas를 통째로 재사용
 * - 왼쪽 패널에 ObjectType 목록 표시
 * - ObjectType을 드래그하여 캔버스에 추가
 */
import { ref, computed, onMounted, provide, Teleport } from 'vue'
import { SchemaCanvas, useSchemaCanvasStore } from '@/workflows/schema-modeling'
import { useFeatureNavigation } from '@/shared/navigation/featureNavigation'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { logger } from '@/shared/utils/logger'
import { IconPlus, IconSearch, IconRefresh, IconDatabase, IconTrash, IconAlertTriangle, IconEdit } from '@/shared/icons'
import {
  BehaviorDialog,
  ObjectTypeEditDialog,
} from '@/domains/ontology/ui/modeling'
import CreateObjectTypeDialog from './CreateObjectTypeDialog.vue'
import { EditRelationshipDialog } from '@/workflows/schema-modeling'
import {
  type ObjectTypeInfo,
  type OntologyBehavior,
} from '@/domains/ontology'
import {
  deleteOntologyObjectType,
  loadOntologyObjectTypes,
} from '../application/ontologyDataGateway'
import {
  collectRelatedObjectTypes,
  projectObjectTypeToCanvas,
} from '../model/objectTypeProjection'

// 스토어 사용
const canvasStore = useSchemaCanvasStore()
const featureNavigation = useFeatureNavigation()

// 상태
const searchQuery = ref('')
const showCreateDialog = ref(false)
const initialSqlForCreate = ref('')  // Text2SQL에서 전달받은 SQL
const initialQuestionForCreate = ref('')  // Text2SQL에서 전달받은 질문
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const objectTypes = ref<ObjectTypeInfo[]>([])
const timers = useManagedTimeouts()

// 삭제 관련 상태
const showDeleteDialog = ref(false)
const deleteTarget = ref<ObjectTypeInfo | null>(null)
const deleteConfirmName = ref('')
const isDeleting = ref(false)
const deleteError = ref<string | null>(null)
const deleteDialogRef = ref<HTMLElement | null>(null)
const deleteConfirmInputRef = ref<HTMLInputElement | null>(null)

useDialogFocusLifecycle({
  active: () => showDeleteDialog.value,
  dialog: deleteDialogRef,
  requestClose: closeDeleteDialog,
  initialFocus: () => deleteConfirmInputRef.value,
  canClose: () => !isDeleting.value,
})

// ObjectType 편집 다이얼로그 상태
const showEditDialog = ref(false)
const editTarget = ref<ObjectTypeInfo | null>(null)

// 관계 생성 다이얼로그 상태
const showRelationshipDialog = ref(false)
const relationshipSource = ref<{
  sourceType: string
  sourceColumn: string
  targetType?: string
  targetColumn?: string
} | null>(null)

// 허공 드롭 시 연결된 ObjectType 생성 다이얼로그 상태
const showCreateWithRelationDialog = ref(false)
const pendingRelationSource = ref<{ sourceType: string; sourceColumn: string } | null>(null)

// Behavior 관련 상태
const showBehaviorDialog = ref(false)
const behaviorMode = ref<'create' | 'edit'>('create')
const behaviorObjectType = ref<string>('')
const behaviorObjectColumns = ref<string[]>([])
const behaviorRelatedTypes = ref<{ name: string; relationName?: string; columns?: string[] }[]>([])
const currentBehavior = ref<OntologyBehavior | null>(null)
// Behavior 편집 핸들러 (캔버스에서 더블클릭 시)
function handleBehaviorEdit(objectTypeName: string, columns: string[], behavior: OntologyBehavior) {
  logger.debug('[ObjectTypeModeler] Behavior 편집:', objectTypeName, behavior.name)
  openEditBehaviorDialog(objectTypeName, columns, behavior)
}

// Behavior 편집 핸들러 제공
provide('onBehaviorEdit', handleBehaviorEdit)

// Behavior 실행 핸들러 (캔버스에서 실행 버튼 클릭 시)
// 팝업 대신 하단 데이터 패널을 behavior 실행 모드로 열어서 인스턴스를 선택할 수 있게 함
function handleBehaviorRun(objectTypeName: string, behavior: OntologyBehavior, _query: string) {
  logger.debug('[ObjectTypeModeler] Behavior 실행 모드 시작:', objectTypeName, behavior.name)
  // 스토어의 startBehaviorMode 호출 (하단 패널이 behavior 모드로 열림)
  canvasStore.startBehaviorMode(objectTypeName, behavior.name, behavior.behaviorType)
}

// Behavior 실행 핸들러 제공
provide('onBehaviorRun', handleBehaviorRun)

// Behavior 추가 다이얼로그 열기
async function openAddBehaviorDialog(objectTypeName: string, columns: string[]) {
  behaviorMode.value = 'create'
  behaviorObjectType.value = objectTypeName
  behaviorObjectColumns.value = columns
  currentBehavior.value = null

  // 관계된 ObjectType 정보 가져오기
  try {
    behaviorRelatedTypes.value = collectRelatedObjectTypes(
      objectTypeName,
      objectTypes.value,
      canvasStore.edges,
    )
  } catch (e) {
    logger.warn('관계 정보 로드 실패:', e)
    behaviorRelatedTypes.value = []
  }

  showBehaviorDialog.value = true
}

// Behavior 편집 다이얼로그 열기
async function openEditBehaviorDialog(objectTypeName: string, columns: string[], behavior: OntologyBehavior) {
  behaviorMode.value = 'edit'
  behaviorObjectType.value = objectTypeName
  behaviorObjectColumns.value = columns
  currentBehavior.value = behavior

  // 관계 정보도 로드
  try {
    behaviorRelatedTypes.value = collectRelatedObjectTypes(
      objectTypeName,
      objectTypes.value,
      canvasStore.edges,
    )
  } catch (e) {
    behaviorRelatedTypes.value = []
  }

  showBehaviorDialog.value = true
}

// Behavior 저장 완료
function handleBehaviorSaved(_behavior: OntologyBehavior) {
  showBehaviorDialog.value = false
  loadObjectTypes()
}

// Behavior 삭제 완료
function handleBehaviorDeleted(behaviorName: string) {
  showBehaviorDialog.value = false
  loadObjectTypes()
  logger.debug('[ObjectTypeModeler] Behavior 삭제됨:', behaviorName)
}

// TableDetailPanel에서 Behavior 다이얼로그 열기 요청
function handleOpenBehaviorDialog(data: { mode: 'create' | 'edit', objectTypeName: string, columns: string[], behavior?: OntologyBehavior }) {
  if (data.mode === 'edit' && data.behavior) {
    openEditBehaviorDialog(data.objectTypeName, data.columns, data.behavior)
  } else {
    openAddBehaviorDialog(data.objectTypeName, data.columns)
  }
}

// ObjectType 목록 로드
async function loadObjectTypes() {
  isLoading.value = true
  loadError.value = null
  try {
    logger.debug('[ObjectTypeModeler] ObjectTypes 로드 시작...')
    const data = await loadOntologyObjectTypes()
    objectTypes.value = data.objectTypes || []
    logger.debug('[ObjectTypeModeler] 로드된 ObjectTypes:', objectTypes.value.length, '개')
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'ObjectType 목록을 불러오지 못했습니다.'
    logger.error('[ObjectTypeModeler] ObjectType 로드 실패:', err)
  } finally {
    isLoading.value = false
  }
}

// 필터링된 ObjectType 목록
const filteredObjectTypes = computed(() => {
  if (!searchQuery.value) return objectTypes.value
  const query = searchQuery.value.toLowerCase()
  return objectTypes.value.filter(ot =>
    ot.name?.toLowerCase().includes(query) ||
    ot.description?.toLowerCase().includes(query)
  )
})

// 새 ObjectType 생성 다이얼로그 열기
function openCreateDialog() {
  showCreateDialog.value = true
}

// ObjectType 생성 완료 후
function handleObjectTypeCreated(_newObjectType: unknown) {
  showCreateDialog.value = false
  loadObjectTypes()
}

// ObjectType을 SchemaCanvas에 추가
function addObjectTypeToCanvas(ot: ObjectTypeInfo) {
  logger.debug('[ObjectTypeModeler] ObjectType 추가:', ot.name)
  const { tableInfo, columns, behaviors } = projectObjectTypeToCanvas(ot)

  // 캔버스에 추가 (isObjectType, behaviors 포함)
  canvasStore.addTableToCanvas(tableInfo, undefined, {
    autoLoadRelated: false,
    isPrimary: true,
    columns: columns,
    isObjectType: true,
    behaviors: behaviors
  })
  logger.debug('[ObjectTypeModeler] ObjectType 캔버스에 추가됨:', ot.name, 'behaviors:', behaviors.length)
}

// 드래그 시작 핸들러
function onDragStart(event: DragEvent, ot: ObjectTypeInfo) {
  const { dragData } = projectObjectTypeToCanvas(ot)
  event.dataTransfer?.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer!.effectAllowed = 'copy'
}

// 삭제 다이얼로그 열기
function openDeleteDialog(ot: ObjectTypeInfo) {
  deleteTarget.value = ot
  deleteConfirmName.value = ''
  deleteError.value = null
  showDeleteDialog.value = true
}

// 삭제 다이얼로그 닫기
function closeDeleteDialog() {
  if (isDeleting.value) return
  showDeleteDialog.value = false
  deleteTarget.value = null
  deleteConfirmName.value = ''
  deleteError.value = null
}

// ObjectType 삭제 실행
async function confirmDelete() {
  if (!deleteTarget.value) return

  const targetName = deleteTarget.value.name
  if (deleteConfirmName.value !== targetName) {
    deleteError.value = `'${targetName}'을(를) 정확히 입력해주세요.`
    return
  }

  isDeleting.value = true
  deleteError.value = null

  try {
    await deleteOntologyObjectType(targetName, deleteConfirmName.value)
    isDeleting.value = false
    closeDeleteDialog()
    loadObjectTypes()
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : '삭제에 실패했습니다.'
  } finally {
    isDeleting.value = false
  }
}

// 허공 드롭 이벤트 핸들러 - 새 ObjectType 생성 또는 관계 설정
function handleEmptyDrop(data: { sourceType: string; sourceColumn: string }) {
  logger.debug('[ObjectTypeModeler] 허공 드롭:', data)

  // 관계 생성 다이얼로그 열기
  relationshipSource.value = data
  showRelationshipDialog.value = true
}

// 관계 생성 완료 핸들러
function handleRelationshipCreated(relationship: unknown) {
  logger.debug('[ObjectTypeModeler] 관계 생성 완료:', relationship)
  showRelationshipDialog.value = false
  relationshipSource.value = null

  // 캔버스 새로고침 (관계선 업데이트)
  canvasStore.updateEdgesFromRelationships()
}

// 연결된 ObjectType 생성 완료 핸들러
function handleObjectTypeCreatedWithRelation(newObjectType: unknown) {
  showCreateWithRelationDialog.value = false
  loadObjectTypes()

  // 새로 생성된 ObjectType을 캔버스에 추가
  if (isObjectTypeInfo(newObjectType)) {
    addObjectTypeToCanvas(newObjectType)

    // 관계 생성 다이얼로그 열기 (소스 정보가 있으면)
    if (pendingRelationSource.value) {
      relationshipSource.value = pendingRelationSource.value
      // 타겟 타입을 새로 생성된 ObjectType으로 설정
      // CreateRelationshipDialog에서 처리할 수 있도록 약간의 딜레이 후 열기
      timers.schedule('open-relationship-after-create', () => {
        showRelationshipDialog.value = true
      }, 500)
    }
  }

  pendingRelationSource.value = null
}

function isObjectTypeInfo(value: unknown): value is ObjectTypeInfo {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && 'name' in value
    && typeof value.name === 'string'
    && 'columns' in value
    && Array.isArray(value.columns)
}

// ObjectType 편집 다이얼로그 열기
function openEditDialog(ot: ObjectTypeInfo) {
  editTarget.value = ot
  showEditDialog.value = true
}

// ObjectType 편집 완료
function handleEditSaved(_updatedOt: unknown) {
  showEditDialog.value = false
  loadObjectTypes()
  // 캔버스도 새로고침
  canvasStore.loadAllTables()
}

onMounted(() => {
  logger.debug('[ObjectTypeModeler] 컴포넌트 마운트됨')
  loadObjectTypes()

  // Text2SQL에서 전달된 SQL이 있으면 ObjectType 생성 다이얼로그 열기
  const transferData = featureNavigation.consume<{ question: string; sql: string }>('schema-modeling')
  if (transferData) {
    logger.debug('[ObjectTypeModeler] Text2SQL에서 전달된 데이터:', transferData)
    initialSqlForCreate.value = transferData.sql
    initialQuestionForCreate.value = transferData.question
    showCreateDialog.value = true
  }
})
</script>

<template>
  <div class="object-type-modeler">
    <!-- 왼쪽 패널: ObjectType 목록 -->
    <aside class="left-panel">
      <div class="panel-header">
        <h2>
          <IconDatabase :size="18" />
          ObjectTypes
        </h2>
        <button class="add-btn" @click="openCreateDialog" title="새 ObjectType 생성">
          <IconPlus :size="16" />
        </button>
      </div>

      <div class="search-box">
        <IconSearch :size="14" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ObjectType 검색..."
        />
      </div>

      <div class="object-type-list">
        <div v-if="loadError" class="load-error" role="alert">
          <IconAlertTriangle :size="18" aria-hidden="true" />
          <span>{{ loadError }}</span>
          <button type="button" @click="loadObjectTypes" :disabled="isLoading">다시 시도</button>
        </div>
        <div v-if="isLoading" class="loading">로딩 중...</div>
        <div v-else-if="filteredObjectTypes.length === 0 && !loadError" class="empty">
          <p>ObjectType이 없습니다</p>
          <button class="create-first-btn" @click="openCreateDialog">
            <IconPlus :size="14" />
            첫 ObjectType 생성
          </button>
        </div>
        <div
          v-else
          v-for="ot in filteredObjectTypes"
          :key="ot.id || ot.name"
          class="object-type-item"
          draggable="true"
          @dragstart="(e) => onDragStart(e, ot)"
          :title="`${ot.name} - 드래그로도 캔버스에 추가할 수 있습니다`"
        >
          <div class="ot-icon">
            <IconDatabase :size="16" />
          </div>
          <div class="ot-info">
            <span class="ot-name">{{ ot.name }}</span>
            <span class="ot-columns">{{ ot.columns?.length || 0 }} 컬럼</span>
          </div>
          <div class="ot-behaviors" v-if="ot.behaviors && ot.behaviors.length > 0">
            <span class="behavior-count">⚡{{ (ot.behaviors || []).length }}</span>
          </div>
          <div class="ot-actions">
            <button
              type="button"
              class="add-btn"
              :aria-label="`${ot.name} ObjectType 캔버스에 추가`"
              @click="addObjectTypeToCanvas(ot)"
            >
              <IconPlus :size="14" />
            </button>
            <button
              type="button"
              class="behavior-btn"
              :aria-label="`${ot.name} ObjectType Behavior 추가`"
              @click="openAddBehaviorDialog(ot.name, ot.columns.map(column => column.name))"
            >
              ⚡
            </button>
            <button
              type="button"
              class="edit-btn"
              :aria-label="`${ot.name} ObjectType 편집`"
              @click="openEditDialog(ot)"
            >
              <IconEdit :size="14" />
            </button>
            <button
              type="button"
              class="delete-btn"
              :aria-label="`${ot.name} ObjectType 삭제`"
              @click="openDeleteDialog(ot)"
            >
              <IconTrash :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div class="panel-footer">
        <button class="refresh-btn" @click="loadObjectTypes" :disabled="isLoading">
          <IconRefresh :size="14" :class="{ spinning: isLoading }" />
          새로고침
        </button>
      </div>
    </aside>

    <!-- 메인 캔버스: SchemaCanvas 통째로 재사용 (테이블 패널, 범례 숨김) -->
    <main class="canvas-wrapper">
      <SchemaCanvas
        :hide-table-panel="true"
        :hide-legend="true"
        @empty-drop="handleEmptyDrop"
        @open-behavior-dialog="handleOpenBehaviorDialog"
      />
    </main>

    <!-- ObjectType 생성 다이얼로그 -->
    <CreateObjectTypeDialog
      v-if="showCreateDialog"
      :initial-sql="initialSqlForCreate"
      :initial-question="initialQuestionForCreate"
      @close="showCreateDialog = false; initialSqlForCreate = ''; initialQuestionForCreate = ''"
      @created="handleObjectTypeCreated"
    />

    <!-- 삭제 확인 다이얼로그 -->
    <Teleport to="body">
      <div v-if="showDeleteDialog" class="delete-dialog-overlay" @click.self="closeDeleteDialog">
        <section
          ref="deleteDialogRef"
          class="delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="object-type-delete-title"
          aria-describedby="object-type-delete-description"
          :aria-busy="isDeleting"
          tabindex="-1"
        >
          <div class="delete-dialog-header">
            <IconAlertTriangle :size="24" class="warning-icon" />
            <h3 id="object-type-delete-title">ObjectType 삭제</h3>
          </div>

          <div class="delete-dialog-body">
            <p class="warning-text">
              <strong>{{ deleteTarget?.name }}</strong>을(를) 삭제하시겠습니까?
            </p>
            <p id="object-type-delete-description" class="warning-desc">
              이 작업은 되돌릴 수 없습니다. ObjectType과 관련된 모든 데이터(컬럼, Materialized View)가 함께 삭제됩니다.
            </p>

            <div class="confirm-input">
              <label for="object-type-delete-confirm">
                삭제를 확인하려면 <strong>{{ deleteTarget?.name }}</strong>을(를) 입력하세요:
              </label>
              <input
                id="object-type-delete-confirm"
                ref="deleteConfirmInputRef"
                v-model="deleteConfirmName"
                type="text"
                :placeholder="deleteTarget?.name"
                :disabled="isDeleting"
                @keyup.enter="confirmDelete"
              />
            </div>

            <div v-if="deleteError" class="error-message" role="alert">
              {{ deleteError }}
            </div>
          </div>

          <div class="delete-dialog-footer">
            <button class="cancel-btn" @click="closeDeleteDialog" :disabled="isDeleting">
              취소
            </button>
            <button
              class="confirm-delete-btn"
              @click="confirmDelete"
              :disabled="isDeleting || deleteConfirmName !== deleteTarget?.name"
            >
              <span v-if="isDeleting" class="spinner"></span>
              <IconTrash v-else :size="14" />
              <span>{{ isDeleting ? '삭제 중...' : deleteError ? '같은 삭제 다시 시도' : '삭제' }}</span>
            </button>
          </div>
        </section>
      </div>
    </Teleport>

    <!-- 관계 생성 다이얼로그 -->
    <EditRelationshipDialog
      v-if="showRelationshipDialog && relationshipSource"
      :visible="showRelationshipDialog"
      mode="create"
      :source-type="relationshipSource.sourceType"
      :source-column="relationshipSource.sourceColumn"
      :target-type="relationshipSource.targetType"
      :target-column="relationshipSource.targetColumn"
      @close="showRelationshipDialog = false; relationshipSource = null"
      @created="handleRelationshipCreated"
    />

    <!-- 연결된 ObjectType 생성 다이얼로그 -->
    <CreateObjectTypeDialog
      v-if="showCreateWithRelationDialog"
      @close="showCreateWithRelationDialog = false; pendingRelationSource = null"
      @created="handleObjectTypeCreatedWithRelation"
    />

    <!-- ObjectType 편집 다이얼로그 -->
    <ObjectTypeEditDialog
      v-if="editTarget"
      :visible="showEditDialog"
      :object-type="editTarget"
      @close="showEditDialog = false; editTarget = null"
      @saved="handleEditSaved"
    />

    <!-- Behavior 추가/편집 다이얼로그 -->
    <BehaviorDialog
      :visible="showBehaviorDialog"
      :mode="behaviorMode"
      :object-type-name="behaviorObjectType"
      :columns="behaviorObjectColumns"
      :related-object-types="behaviorRelatedTypes"
      :behavior="currentBehavior || undefined"
      @close="showBehaviorDialog = false"
      @saved="handleBehaviorSaved"
      @deleted="handleBehaviorDeleted"
    />

  </div>
</template>

<style scoped lang="scss">
.object-type-modeler {
  display: flex;
  height: 100%;
  background: var(--color-bg);
}

.left-panel {
  width: 280px;
  min-width: 250px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }

  .add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #00d4aa, #00a8cc);
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(0, 212, 170, 0.4);
    }
  }
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;

  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-size: 0.875rem;
    outline: none;

    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.object-type-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-muted);
  text-align: center;

  p {
    margin-bottom: 16px;
  }
}

.load-error {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 10px;
  align-items: start;
  padding: 12px;
  margin-bottom: 8px;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.22);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 8px;

  span {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.45;
  }

  button {
    grid-column: 2;
    justify-self: start;
    padding: 6px 10px;
    color: #fff;
    background: #dc2626;
    border: 0;
    border-radius: 6px;
    cursor: pointer;

    &:disabled {
      cursor: wait;
      opacity: 0.6;
    }
  }
}

.create-first-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #a78bfa, #7c3aed);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  cursor: pointer;

  &:hover {
    box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
  }
}

.object-type-item {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 8px;
  padding: 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: grab;
  transition: all 0.2s;

  &:hover {
    border-color: rgba(0, 212, 170, 0.5);
    background: var(--color-bg-secondary);
  }

  &:active {
    cursor: grabbing;
  }

  .ot-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: rgba(0, 212, 170, 0.1);
    border-radius: 8px;
    color: #00d4aa;
  }

  .ot-info {
    min-width: 0;

    .ot-name {
      display: block;
      font-weight: 500;
      color: var(--color-text-bright);
    }

    .ot-columns {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  }

  .ot-behaviors {
    .behavior-count {
      font-size: 0.7rem;
      color: #a78bfa;
      background: rgba(167, 139, 250, 0.15);
      padding: 2px 6px;
      border-radius: 10px;
    }
  }

  .ot-actions {
    grid-column: 2 / -1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;

    .add-btn,
    .behavior-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .add-btn {
      background: rgba(0, 212, 170, 0.12);
      color: #00d4aa;

      &:hover {
        background: rgba(0, 212, 170, 0.26);
      }
    }

    .behavior-btn {
      background: rgba(167, 139, 250, 0.1);
      font-size: 0.75rem;

      &:hover {
        background: rgba(167, 139, 250, 0.3);
      }
    }
  }
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);

  .refresh-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-light);
    font-size: 0.8rem;
    cursor: pointer;

    &:hover {
      background: var(--color-bg-tertiary);
    }

    .spinning {
      animation: spin 1s linear infinite;
    }
  }
}

.canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// 편집/삭제 버튼
.edit-btn, .delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 212, 170, 0.15);
    color: #00d4aa;
  }
}

.ot-actions button:focus-visible {
  outline: 2px solid #67e8f9;
  outline-offset: 1px;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

// 삭제 확인 다이얼로그
.delete-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 9999;
}

.delete-dialog {
  width: min(480px, 100%);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  outline: none;
}

.delete-dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);

  .warning-icon {
    color: #f87171;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
}

.delete-dialog-body {
  padding: 24px;
  overflow-y: auto;

  .warning-text {
    margin: 0 0 8px;
    font-size: 1rem;
    color: var(--color-text-bright);

    strong {
      color: #f87171;
    }
  }

  .warning-desc {
    margin: 0 0 20px;
    font-size: 0.9rem;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .confirm-input {
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 0.9rem;
      color: var(--color-text-light);

      strong {
        color: #f87171;
      }
    }

    input {
      width: 100%;
      padding: 12px 14px;
      background: var(--color-bg-tertiary);
      border: 2px solid var(--color-border);
      border-radius: 8px;
      color: var(--color-text-bright);
      font-size: 0.95rem;

      &:focus {
        outline: none;
        border-color: #f87171;
      }
    }
  }

  .error-message {
    margin-top: 12px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #f87171;
    font-size: 0.9rem;
  }
}

.delete-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);

  .cancel-btn {
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-light);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--color-bg-tertiary);
    }
  }

  .confirm-delete-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid transparent;
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

@media (max-width: 520px) {
  .delete-dialog-overlay {
    padding: 8px;
  }

  .delete-dialog {
    max-height: calc(100dvh - 16px);
  }

  .delete-dialog-header,
  .delete-dialog-body,
  .delete-dialog-footer {
    padding-right: 16px;
    padding-left: 16px;
  }

  .delete-dialog-footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }
}

</style>
