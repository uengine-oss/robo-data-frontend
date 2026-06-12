<script setup lang="ts">
/**
 * ObjectTypeModeler.vue
 * ObjectType 기반 스키마 모델링 툴
 * - SchemaCanvas를 통째로 재사용
 * - 왼쪽 패널에 ObjectType 목록 표시
 * - ObjectType을 드래그하여 캔버스에 추가
 */
import { ref, computed, onMounted, provide, Teleport } from 'vue'
import { SchemaCanvas } from '@/features/schema'
import { useSchemaCanvasStore } from '@/features/schema/schemaCanvas'
import { useSessionStore } from '@/shared/stores/session'
import { IconPlus, IconSearch, IconRefresh, IconDatabase, IconTrash, IconAlertTriangle, IconEdit } from '@/shared/icons'
import CreateObjectTypeDialog from './CreateObjectTypeDialog.vue'
import { EditRelationshipDialog } from '@/features/schema'
import ObjectTypeEditDialog from './ObjectTypeEditDialog.vue'
import BehaviorDialog from './BehaviorDialog.vue'
import BehaviorExecuteDialog from './BehaviorExecuteDialog.vue'

// 스토어 사용
const canvasStore = useSchemaCanvasStore()
const sessionStore = useSessionStore()

// 상태
const searchQuery = ref('')
const showCreateDialog = ref(false)
const initialSqlForCreate = ref('')  // Text2SQL에서 전달받은 SQL
const initialQuestionForCreate = ref('')  // Text2SQL에서 전달받은 질문
const isLoading = ref(false)
const objectTypes = ref<any[]>([])

// 삭제 관련 상태
const showDeleteDialog = ref(false)
const deleteTarget = ref<any>(null)
const deleteConfirmName = ref('')
const isDeleting = ref(false)
const deleteError = ref<string | null>(null)

// 이름 변경 관련 상태 (기존 - 삭제 예정)
const showRenameDialog = ref(false)
const renameTarget = ref<any>(null)
const renameNewName = ref('')
const isRenaming = ref(false)
const renameError = ref<string | null>(null)

// ObjectType 편집 다이얼로그 상태
const showEditDialog = ref(false)
const editTarget = ref<any>(null)

// 관계 생성 다이얼로그 상태
const showRelationshipDialog = ref(false)
const relationshipSource = ref<{ sourceType: string; sourceColumn: string } | null>(null)

// 허공 드롭 시 연결된 ObjectType 생성 다이얼로그 상태
const showCreateWithRelationDialog = ref(false)
const pendingRelationSource = ref<{ sourceType: string; sourceColumn: string } | null>(null)

// Behavior 관련 상태
const showBehaviorDialog = ref(false)
const behaviorMode = ref<'create' | 'edit'>('create')
const behaviorObjectType = ref<string>('')
const behaviorObjectColumns = ref<string[]>([])
const behaviorRelatedTypes = ref<{ name: string; relationName?: string; columns?: string[] }[]>([])
const currentBehavior = ref<any>(null)
const isExecutingBehavior = ref(false)
const behaviorExecutionResult = ref<any>(null)

// Behavior 실행 다이얼로그 상태
const showBehaviorExecuteDialog = ref(false)
const executeObjectTypeName = ref('')
const executeBehaviorData = ref<Behavior | null>(null)
const executeQuery = ref('')

// Behavior 클릭 핸들러 제공 (TableNode에서 사용)
interface Behavior {
  name: string
  description?: string
  behaviorType: 'rest_api' | 'javascript' | 'python' | 'dmn'
  config: Record<string, any>
  inputFields?: string[]
  outputField?: string
}

function handleBehaviorClick(objectTypeName: string, behavior: Behavior) {
  console.log('[ObjectTypeModeler] Behavior 클릭:', objectTypeName, behavior.name)
  behaviorObjectType.value = objectTypeName
  currentBehavior.value = behavior
  
  // Behavior 실행 (샘플 데이터로 테스트 실행)
  executeBehavior(objectTypeName, behavior.name, {})
}

// Behavior 클릭 핸들러 제공
provide('onBehaviorClick', handleBehaviorClick)

// Behavior 편집 핸들러 (캔버스에서 더블클릭 시)
function handleBehaviorEdit(objectTypeName: string, columns: string[], behavior: Behavior) {
  console.log('[ObjectTypeModeler] Behavior 편집:', objectTypeName, behavior.name)
  openEditBehaviorDialog(objectTypeName, columns, behavior)
}

// Behavior 편집 핸들러 제공
provide('onBehaviorEdit', handleBehaviorEdit)

// Behavior 실행 핸들러 (캔버스에서 실행 버튼 클릭 시)
// 팝업 대신 하단 데이터 패널을 behavior 실행 모드로 열어서 인스턴스를 선택할 수 있게 함
function handleBehaviorRun(objectTypeName: string, behavior: Behavior, _query: string) {
  console.log('[ObjectTypeModeler] Behavior 실행 모드 시작:', objectTypeName, behavior.name)
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
    const relatedTypes: { name: string; relationName?: string; columns?: string[] }[] = []
    
    // objectTypes에서 해당 ObjectType 찾기
    const currentOT = objectTypes.value.find(ot => ot.name === objectTypeName)
    if (currentOT) {
      // edges에서 이 ObjectType과 연결된 다른 ObjectType 찾기
      const edges = canvasStore.edges
      const relatedEdges = edges.filter(e => e.source === objectTypeName || e.target === objectTypeName)
      
      for (const edge of relatedEdges) {
        const relatedName = edge.source === objectTypeName ? edge.target : edge.source
        const relatedOT = objectTypes.value.find(ot => ot.name === relatedName)
        if (relatedOT) {
          relatedTypes.push({
            name: relatedOT.name,
            relationName: edge.data?.name || edge.label,
            columns: relatedOT.columns?.map((c: any) => c.name || c) || []
          })
        }
      }
    }
    
    behaviorRelatedTypes.value = relatedTypes
  } catch (e) {
    console.warn('관계 정보 로드 실패:', e)
    behaviorRelatedTypes.value = []
  }
  
  showBehaviorDialog.value = true
}

// Behavior 편집 다이얼로그 열기
async function openEditBehaviorDialog(objectTypeName: string, columns: string[], behavior: Behavior) {
  behaviorMode.value = 'edit'
  behaviorObjectType.value = objectTypeName
  behaviorObjectColumns.value = columns
  currentBehavior.value = behavior
  
  // 관계 정보도 로드
  try {
    const relatedTypes: { name: string; relationName?: string; columns?: string[] }[] = []
    const edges = canvasStore.edges
    const relatedEdges = edges.filter(e => e.source === objectTypeName || e.target === objectTypeName)
    
    for (const edge of relatedEdges) {
      const relatedName = edge.source === objectTypeName ? edge.target : edge.source
      const relatedOT = objectTypes.value.find(ot => ot.name === relatedName)
      if (relatedOT) {
        relatedTypes.push({
          name: relatedOT.name,
          relationName: edge.data?.name || edge.label,
          columns: relatedOT.columns?.map((c: any) => c.name || c) || []
        })
      }
    }
    behaviorRelatedTypes.value = relatedTypes
  } catch (e) {
    behaviorRelatedTypes.value = []
  }
  
  showBehaviorDialog.value = true
}

// Behavior 저장 완료
function handleBehaviorSaved(_behavior: Behavior) {
  showBehaviorDialog.value = false
  loadObjectTypes()
}

// Behavior 삭제 완료
function handleBehaviorDeleted(behaviorName: string) {
  showBehaviorDialog.value = false
  loadObjectTypes()
  console.log('[ObjectTypeModeler] Behavior 삭제됨:', behaviorName)
}

// TableDetailPanel에서 Behavior 다이얼로그 열기 요청
function handleOpenBehaviorDialog(data: { mode: 'create' | 'edit', objectTypeName: string, columns: string[], behavior?: Behavior }) {
  if (data.mode === 'edit' && data.behavior) {
    openEditBehaviorDialog(data.objectTypeName, data.columns, data.behavior)
  } else {
    openAddBehaviorDialog(data.objectTypeName, data.columns)
  }
}

// Behavior 실행
async function executeBehavior(objectTypeName: string, behaviorName: string, instanceData: Record<string, any>) {
  isExecutingBehavior.value = true
  behaviorExecutionResult.value = null
  
  try {
    const response = await fetch(
      `/api/gateway/ontology/object-types/${encodeURIComponent(objectTypeName)}/behaviors/${encodeURIComponent(behaviorName)}/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectTypeName,
          behaviorName,
          instanceData
        })
      }
    )
    
    if (response.ok) {
      const result = await response.json()
      behaviorExecutionResult.value = result
      console.log('[ObjectTypeModeler] Behavior 실행 결과:', result)
    } else {
      const errData = await response.json()
      console.error('[ObjectTypeModeler] Behavior 실행 실패:', errData)
      behaviorExecutionResult.value = { success: false, error: errData.detail }
    }
  } catch (err) {
    console.error('[ObjectTypeModeler] Behavior 실행 오류:', err)
    behaviorExecutionResult.value = { success: false, error: String(err) }
  } finally {
    isExecutingBehavior.value = false
  }
}

// ObjectType 목록 로드
async function loadObjectTypes() {
  isLoading.value = true
  try {
    console.log('[ObjectTypeModeler] ObjectTypes 로드 시작...')
    const response = await fetch('/api/gateway/ontology/object-types')
    
    if (response.ok) {
      const data = await response.json()
      objectTypes.value = data.objectTypes || []
      console.log('[ObjectTypeModeler] 로드된 ObjectTypes:', objectTypes.value.length, '개')
    } else {
      console.error('[ObjectTypeModeler] API 응답 실패:', response.status)
    }
  } catch (err) {
    console.error('[ObjectTypeModeler] ObjectType 로드 실패:', err)
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
function handleObjectTypeCreated(newObjectType: any) {
  showCreateDialog.value = false
  loadObjectTypes()
}

// ObjectType 더블클릭 - 캔버스에 추가
function handleObjectTypeDoubleClick(ot: any) {
  console.log('[ObjectTypeModeler] ObjectType 더블클릭:', ot.name)
  addObjectTypeToCanvas(ot)
}

// ObjectType을 SchemaCanvas에 추가
function addObjectTypeToCanvas(ot: any) {
  console.log('[ObjectTypeModeler] ObjectType 추가:', ot.name)
  
  // Text2SqlTableInfo 형식으로 변환 - 기존 API와 동일한 형식 사용
  const tableInfo = {
    name: ot.name,
    schema: 'ObjectType',  // 기존 API에서 조회 가능하도록 schema 설정
    description: ot.description || '',
    column_count: ot.columns?.length || 0
  }
  
  // 컬럼 정보 변환
  const columns = (ot.columns || []).map((c: any) => ({
    name: c.name || c,
    dtype: c.type || 'string',
    description: c.description || '',
    nullable: true
  }))
  
  // Behavior 목록 준비
  const behaviors = (ot.behaviors || []).map((b: any) => ({
    name: b.name,
    description: b.description,
    behaviorType: b.behaviorType,
    config: b.config || {},
    inputFields: b.inputFields || [],
    outputField: b.outputField
  }))
  
  // 캔버스에 추가 (isObjectType, behaviors 포함)
  canvasStore.addTableToCanvas(tableInfo, undefined, {
    autoLoadRelated: false,
    isPrimary: true,
    columns: columns,
    isObjectType: true,
    behaviors: behaviors
  })
  console.log('[ObjectTypeModeler] ObjectType 캔버스에 추가됨:', ot.name, 'behaviors:', behaviors.length)
}

// 드래그 시작 핸들러
function onDragStart(event: DragEvent, ot: any) {
  // Text2SqlTableInfo 형식 + ObjectType 확장
  const columns = (ot.columns || []).map((c: any) => ({
    name: c.name || c,
    dtype: c.type || 'string',
    description: c.description || '',
    nullable: true
  }))
  
  const behaviors = (ot.behaviors || []).map((b: any) => ({
    name: b.name,
    description: b.description,
    behaviorType: b.behaviorType,
    config: b.config || {},
    inputFields: b.inputFields || [],
    outputField: b.outputField
  }))
  
  const dragData = {
    name: ot.name,
    schema: 'ObjectType',
    description: ot.description || '',
    column_count: ot.columns?.length || 0,
    columns: columns,
    isObjectType: true,
    behaviors: behaviors
  }
  
  event.dataTransfer?.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer!.effectAllowed = 'copy'
}

// 삭제 다이얼로그 열기
function openDeleteDialog(ot: any, event: Event) {
  event.stopPropagation()
  deleteTarget.value = ot
  deleteConfirmName.value = ''
  deleteError.value = null
  showDeleteDialog.value = true
}

// 삭제 다이얼로그 닫기
function closeDeleteDialog() {
  showDeleteDialog.value = false
  deleteTarget.value = null
  deleteConfirmName.value = ''
  deleteError.value = null
}

// ObjectType 삭제 실행
async function confirmDelete() {
  if (!deleteTarget.value) return
  
  if (deleteConfirmName.value !== deleteTarget.value.name) {
    deleteError.value = `'${deleteTarget.value.name}'을(를) 정확히 입력해주세요.`
    return
  }
  
  isDeleting.value = true
  deleteError.value = null
  
  try {
    const response = await fetch(`/api/gateway/ontology/object-types/${encodeURIComponent(deleteTarget.value.name)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmName: deleteConfirmName.value
      })
    })
    
    if (response.ok) {
      closeDeleteDialog()
      loadObjectTypes()
    } else {
      const errData = await response.json()
      deleteError.value = errData.detail || '삭제에 실패했습니다.'
    }
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : '삭제에 실패했습니다.'
  } finally {
    isDeleting.value = false
  }
}

// 허공 드롭 이벤트 핸들러 - 새 ObjectType 생성 또는 관계 설정
function handleEmptyDrop(data: { sourceType: string; sourceColumn: string }) {
  console.log('[ObjectTypeModeler] 허공 드롭:', data)
  
  // 관계 생성 다이얼로그 열기
  relationshipSource.value = data
  showRelationshipDialog.value = true
}

// 관계 생성 다이얼로그에서 새 ObjectType 생성 요청 시
function handleCreateNewObjectType() {
  // 현재 관계 소스 정보 저장
  if (relationshipSource.value) {
    pendingRelationSource.value = relationshipSource.value
  }
  showRelationshipDialog.value = false
  showCreateWithRelationDialog.value = true
}

// 관계 생성 완료 핸들러
function handleRelationshipCreated(relationship: any) {
  console.log('[ObjectTypeModeler] 관계 생성 완료:', relationship)
  showRelationshipDialog.value = false
  relationshipSource.value = null
  
  // 캔버스 새로고침 (관계선 업데이트)
  canvasStore.updateEdgesFromRelationships()
}

// 연결된 ObjectType 생성 완료 핸들러
function handleObjectTypeCreatedWithRelation(newObjectType: any) {
  showCreateWithRelationDialog.value = false
  loadObjectTypes()
  
  // 새로 생성된 ObjectType을 캔버스에 추가
  if (newObjectType) {
    addObjectTypeToCanvas(newObjectType)
    
    // 관계 생성 다이얼로그 열기 (소스 정보가 있으면)
    if (pendingRelationSource.value) {
      relationshipSource.value = pendingRelationSource.value
      // 타겟 타입을 새로 생성된 ObjectType으로 설정
      // CreateRelationshipDialog에서 처리할 수 있도록 약간의 딜레이 후 열기
      setTimeout(() => {
        showRelationshipDialog.value = true
      }, 500)
    }
  }
  
  pendingRelationSource.value = null
}

// 이름 변경 다이얼로그 열기 (기존 - 사용 안함)
function openRenameDialog(ot: any, event?: Event) {
  if (event) {
    event.stopPropagation()
  }
  renameTarget.value = ot
  renameNewName.value = ot.name
  renameError.value = null
  showRenameDialog.value = true
}

// ObjectType 편집 다이얼로그 열기
function openEditDialog(ot: any, event?: Event) {
  if (event) {
    event.stopPropagation()
  }
  editTarget.value = ot
  showEditDialog.value = true
}

// ObjectType 편집 완료
function handleEditSaved(updatedOt: any) {
  showEditDialog.value = false
  loadObjectTypes()
  // 캔버스도 새로고침
  canvasStore.loadAllTables()
}

// 이름 변경 다이얼로그 닫기
function closeRenameDialog() {
  showRenameDialog.value = false
  renameTarget.value = null
  renameNewName.value = ''
  renameError.value = null
}

// 이름 변경 실행
async function confirmRename() {
  if (!renameTarget.value || !renameNewName.value.trim()) {
    renameError.value = '새 이름을 입력해주세요.'
    return
  }
  
  const newName = renameNewName.value.replace(/\s+/g, '_')
  if (newName === renameTarget.value.name) {
    renameError.value = '기존 이름과 동일합니다.'
    return
  }
  
  isRenaming.value = true
  renameError.value = null
  
  try {
    const response = await fetch(`/api/gateway/ontology/object-types/${encodeURIComponent(renameTarget.value.name)}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newName: newName
      })
    })
    
    if (response.ok) {
      closeRenameDialog()
      loadObjectTypes()
      // 캔버스도 새로고침
      canvasStore.loadAllTables()
    } else {
      const errData = await response.json()
      renameError.value = errData.detail || '이름 변경에 실패했습니다.'
    }
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : '이름 변경에 실패했습니다.'
  } finally {
    isRenaming.value = false
  }
}

// 이름 입력 시 공백을 "_"로 자동 대체
function handleRenameInput(event: Event) {
  const input = event.target as HTMLInputElement
  renameNewName.value = input.value.replace(/\s+/g, '_')
}

onMounted(() => {
  console.log('[ObjectTypeModeler] 컴포넌트 마운트됨')
  loadObjectTypes()
  
  // Text2SQL에서 전달된 SQL이 있으면 ObjectType 생성 다이얼로그 열기
  const transferData = sessionStore.consumeOntologyTransferData()
  if (transferData) {
    console.log('[ObjectTypeModeler] Text2SQL에서 전달된 데이터:', transferData)
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
        <div v-if="isLoading" class="loading">로딩 중...</div>
        <div v-else-if="filteredObjectTypes.length === 0" class="empty">
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
          @dblclick="handleObjectTypeDoubleClick(ot)"
          :title="`${ot.name} - 더블클릭하여 캔버스에 추가`"
        >
          <div class="ot-icon">
            <IconDatabase :size="16" />
          </div>
          <div class="ot-info">
            <span class="ot-name">{{ ot.name }}</span>
            <span class="ot-columns">{{ ot.columns?.length || 0 }} 컬럼</span>
          </div>
          <div class="ot-behaviors" v-if="ot.behaviors?.length > 0">
            <span class="behavior-count">⚡{{ ot.behaviors.length }}</span>
          </div>
          <div class="ot-actions">
            <button 
              class="behavior-btn" 
              @click="(e) => { e.stopPropagation(); openAddBehaviorDialog(ot.name, ot.columns?.map((c: any) => c.name) || []) }"
              title="Behavior 추가"
            >
              ⚡
            </button>
            <button 
              class="edit-btn" 
              @click="(e) => openEditDialog(ot, e)"
              title="편집"
            >
              <IconEdit :size="14" />
            </button>
            <button 
              class="delete-btn" 
              @click="(e) => openDeleteDialog(ot, e)"
              title="삭제"
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
        <div class="delete-dialog">
          <div class="delete-dialog-header">
            <IconAlertTriangle :size="24" class="warning-icon" />
            <h3>ObjectType 삭제</h3>
          </div>
          
          <div class="delete-dialog-body">
            <p class="warning-text">
              <strong>{{ deleteTarget?.name }}</strong>을(를) 삭제하시겠습니까?
            </p>
            <p class="warning-desc">
              이 작업은 되돌릴 수 없습니다. ObjectType과 관련된 모든 데이터(컬럼, Materialized View)가 함께 삭제됩니다.
            </p>
            
            <div class="confirm-input">
              <label>삭제를 확인하려면 <strong>{{ deleteTarget?.name }}</strong>을(를) 입력하세요:</label>
              <input 
                v-model="deleteConfirmName" 
                type="text" 
                :placeholder="deleteTarget?.name"
                @keyup.enter="confirmDelete"
              />
            </div>
            
            <div v-if="deleteError" class="error-message">
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
              <span>{{ isDeleting ? '삭제 중...' : '삭제' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- 이름 변경 다이얼로그 -->
    <Teleport to="body">
      <div v-if="showRenameDialog" class="rename-dialog-overlay" @click.self="closeRenameDialog">
        <div class="rename-dialog">
          <div class="rename-dialog-header">
            <IconEdit :size="20" class="edit-icon" />
            <h3>ObjectType 이름 변경</h3>
          </div>
          
          <div class="rename-dialog-body">
            <p class="rename-hint">
              <strong>{{ renameTarget?.name }}</strong>의 이름을 변경합니다.
            </p>
            
            <div class="rename-input">
              <label>새 이름:</label>
              <input 
                :value="renameNewName"
                @input="handleRenameInput"
                type="text" 
                :placeholder="renameTarget?.name"
                @keyup.enter="confirmRename"
                autofocus
              />
              <span class="input-hint">공백은 자동으로 "_"로 변환됩니다</span>
            </div>
            
            <div v-if="renameError" class="error-message">
              {{ renameError }}
            </div>
          </div>
          
          <div class="rename-dialog-footer">
            <button class="cancel-btn" @click="closeRenameDialog" :disabled="isRenaming">
              취소
            </button>
            <button 
              class="confirm-rename-btn" 
              @click="confirmRename"
              :disabled="isRenaming || !renameNewName.trim() || renameNewName.replace(/\s+/g, '_') === renameTarget?.name"
            >
              <span v-if="isRenaming" class="spinner"></span>
              <IconEdit v-else :size="14" />
              <span>{{ isRenaming ? '변경 중...' : '변경' }}</span>
            </button>
          </div>
        </div>
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
      :behavior="currentBehavior"
      @close="showBehaviorDialog = false"
      @saved="handleBehaviorSaved"
      @deleted="handleBehaviorDeleted"
    />
    
    <!-- Behavior 실행 다이얼로그 -->
    <BehaviorExecuteDialog
      :visible="showBehaviorExecuteDialog"
      :object-type-name="executeObjectTypeName"
      :behavior="executeBehaviorData"
      :query="executeQuery"
      @close="showBehaviorExecuteDialog = false"
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
  display: flex;
  align-items: center;
  gap: 12px;
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
    flex: 1;
    
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
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
    
    .behavior-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: rgba(167, 139, 250, 0.1);
      border: none;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s;
      
      &:hover {
        background: rgba(167, 139, 250, 0.3);
      }
    }
  }
  
  &:hover .ot-actions {
    opacity: 1;
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
  z-index: 9999;
}

.delete-dialog {
  width: 90%;
  max-width: 480px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
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

// 이름 변경 다이얼로그
.rename-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.rename-dialog {
  width: 90%;
  max-width: 480px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.rename-dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  
  .edit-icon {
    color: #00d4aa;
  }
  
  h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
}

.rename-dialog-body {
  padding: 24px;
  
  .rename-hint {
    margin: 0 0 16px;
    font-size: 0.9rem;
    color: var(--color-text-light);
    
    strong {
      color: #00d4aa;
    }
  }
  
  .rename-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    label {
      font-size: 0.85rem;
      color: var(--color-text-light);
    }
    
    input {
      width: 100%;
      padding: 10px 14px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      color: var(--color-text-bright);
      font-size: 0.9rem;
      
      &:focus {
        outline: none;
        border-color: #00d4aa;
      }
    }
    
    .input-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  }
  
  .error-message {
    margin-top: 12px;
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #f87171;
    font-size: 0.9rem;
  }
}

.rename-dialog-footer {
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
  
  .confirm-rename-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, #00d4aa, #00a8cc);
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(0, 212, 170, 0.4);
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
</style>
