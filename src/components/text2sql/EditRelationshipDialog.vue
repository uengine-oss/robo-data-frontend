<script setup lang="ts">
/**
 * EditRelationshipDialog.vue
 * 관계(릴레이션) 생성/편집 다이얼로그
 * - 관계 생성 (mode='create')
 * - 관계 편집 (mode='edit'): 관계 이름 변경, matchStrategy, cardinality 설정 변경, 관계 삭제
 */
import { ref, computed, onMounted, watch } from 'vue'
import { Teleport } from 'vue'
import { IconX, IconCheck, IconLink, IconTrash, IconAlertTriangle } from '@/components/icons'

const props = defineProps<{
  visible: boolean
  mode?: 'create' | 'edit'  // 생성/편집 모드
  sourceType: string
  sourceColumn?: string  // create 모드에서 필요
  targetType?: string  // create 모드에서 선택 가능, edit 모드에서 필수
  targetColumn?: string  // create 모드에서 선택 가능, edit 모드에서 필수
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
  (e: 'created', relationship: any): void  // create 모드에서 발생
  (e: 'deleted'): void
}>()

// 상태
const mode = computed(() => props.mode || 'edit')
const relationshipName = ref('')
const selectedTargetType = ref(props.targetType || '')
const selectedSourceColumn = ref(props.sourceColumn || '')
const selectedTargetColumn = ref(props.targetColumn || '')
const selectedMatchStrategy = ref('EXACT_MATCH')
const selectedCardinality = ref('ONE_TO_MANY')
const description = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const isCreating = ref(false)
const isDeleting = ref(false)
const error = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const deleteConfirmText = ref('')

// ObjectType 목록 (create 모드용)
const objectTypes = ref<any[]>([])
const sourceColumns = ref<string[]>([])
const targetColumns = ref<string[]>([])
const isLoadingTypes = ref(false)
const isLoadingColumns = ref(false)

// matchStrategy 옵션
const matchStrategyOptions = [
  { value: 'EXACT_MATCH', label: '정확히 일치 (=)', description: 'target.col = source.col' },
  { value: 'CONTAINS', label: '포함 (CONTAINS)', description: 'target.col LIKE %source.col%' },
  { value: 'STARTS_WITH', label: '시작 (STARTS_WITH)', description: 'target.col LIKE source.col%' },
  { value: 'ENDS_WITH', label: '끝 (ENDS_WITH)', description: 'target.col LIKE %source.col' }
]

// cardinality 옵션
const cardinalityOptions = [
  { value: 'ONE_TO_ONE', label: '1:1' },
  { value: 'ONE_TO_MANY', label: '1:N' },
  { value: 'MANY_TO_ONE', label: 'N:1' },
  { value: 'MANY_TO_MANY', label: 'N:N' }
]

// ObjectType 목록 로드 (create 모드용)
async function loadObjectTypes() {
  isLoadingTypes.value = true
  try {
    const response = await fetch('/api/gateway/ontology/object-types')
    if (response.ok) {
      const data = await response.json()
      objectTypes.value = data.objectTypes || []
    }
  } catch (err) {
    console.error('ObjectType 목록 로드 실패:', err)
  } finally {
    isLoadingTypes.value = false
  }
}

// 소스 ObjectType의 컬럼 로드 (create 모드용)
async function loadSourceColumns() {
  if (!props.sourceType) return
  
  try {
    const response = await fetch(`/api/gateway/ontology/object-types/${encodeURIComponent(props.sourceType)}`)
    if (response.ok) {
      const data = await response.json()
      sourceColumns.value = (data.columns || []).map((c: any) => c.name)
      
      // 전달받은 sourceColumn이 있으면 선택
      if (props.sourceColumn && sourceColumns.value.includes(props.sourceColumn)) {
        selectedSourceColumn.value = props.sourceColumn
      } else if (sourceColumns.value.length > 0) {
        selectedSourceColumn.value = sourceColumns.value[0]
      }
    }
  } catch (err) {
    console.error('소스 컬럼 로드 실패:', err)
  }
}

// 타겟 ObjectType의 컬럼 로드 (create 모드용)
async function loadTargetColumns() {
  if (!selectedTargetType.value) {
    targetColumns.value = []
    return
  }
  
  isLoadingColumns.value = true
  try {
    const response = await fetch(`/api/gateway/ontology/object-types/${encodeURIComponent(selectedTargetType.value)}`)
    if (response.ok) {
      const data = await response.json()
      targetColumns.value = (data.columns || []).map((c: any) => c.name)
      
      // 전달받은 targetColumn이 있으면 선택
      if (props.targetColumn && targetColumns.value.includes(props.targetColumn)) {
        selectedTargetColumn.value = props.targetColumn
      } else if (targetColumns.value.length > 0 && !selectedTargetColumn.value) {
        selectedTargetColumn.value = targetColumns.value[0]
      }
    }
  } catch (err) {
    console.error('타겟 컬럼 로드 실패:', err)
  } finally {
    isLoadingColumns.value = false
  }
}

// 관계 정보 로드 (edit 모드용)
async function loadRelationship() {
  if (!props.visible || mode.value === 'create') return
  if (!props.targetType || !props.targetColumn) return
  
  isLoading.value = true
  error.value = null
  
  try {
    const params = new URLSearchParams({
      sourceType: props.sourceType,
      targetType: props.targetType,
      sourceColumn: props.sourceColumn || '',
      targetColumn: props.targetColumn
    })
    
    const response = await fetch(`/api/gateway/ontology/relationships?${params}`)
    
    if (response.ok) {
      const data = await response.json()
      relationshipName.value = data.name || `${props.sourceType}.${props.sourceColumn} → ${props.targetType}.${props.targetColumn}`
      selectedMatchStrategy.value = data.matchStrategy || 'EXACT_MATCH'
      selectedCardinality.value = data.cardinality || 'ONE_TO_MANY'
      description.value = data.description || ''
    } else if (response.status === 404) {
      // 관계가 없으면 기본값 사용
      relationshipName.value = `${props.sourceType}.${props.sourceColumn} → ${props.targetType}.${props.targetColumn}`
    } else {
      const errData = await response.json()
      throw new Error(errData.detail || '관계 정보를 불러올 수 없습니다.')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '관계 정보를 불러올 수 없습니다.'
  } finally {
    isLoading.value = false
  }
}

// 관계 생성 (create 모드용)
async function createRelationship() {
  if (!selectedTargetType.value || !selectedSourceColumn.value || !selectedTargetColumn.value) {
    error.value = '모든 필드를 입력해주세요.'
    return
  }
  
  isCreating.value = true
  error.value = null
  
  try {
    const response = await fetch('/api/gateway/ontology/relationships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType: props.sourceType,
        targetType: selectedTargetType.value,
        sourceColumn: selectedSourceColumn.value,
        targetColumn: selectedTargetColumn.value,
        matchStrategy: selectedMatchStrategy.value,
        cardinality: selectedCardinality.value,
        name: relationshipName.value || undefined,
        description: description.value || undefined
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      emit('created', result.relationship)
    } else {
      const errData = await response.json()
      throw new Error(errData.detail || '관계 생성에 실패했습니다.')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '관계 생성에 실패했습니다.'
  } finally {
    isCreating.value = false
  }
}

// 관계 저장 (edit 모드용)
async function saveRelationship() {
  if (!props.targetType || !props.targetColumn) return
  
  isSaving.value = true
  error.value = null
  
  try {
    const params = new URLSearchParams({
      sourceType: props.sourceType,
      targetType: props.targetType,
      sourceColumn: props.sourceColumn || '',
      targetColumn: props.targetColumn
    })
    
    const response = await fetch(`/api/gateway/ontology/relationships?${params}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: relationshipName.value || undefined,
        matchStrategy: selectedMatchStrategy.value,
        cardinality: selectedCardinality.value,
        description: description.value || undefined
      })
    })
    
    if (response.ok) {
      emit('updated')
    } else {
      const errData = await response.json()
      throw new Error(errData.detail || '관계 저장에 실패했습니다.')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '관계 저장에 실패했습니다.'
  } finally {
    isSaving.value = false
  }
}

// 관계 삭제 (edit 모드용)
async function deleteRelationship() {
  if (!props.targetType || !props.targetColumn) return
  
  if (deleteConfirmText.value !== '삭제') {
    error.value = '확인을 위해 "삭제"를 입력해주세요.'
    return
  }
  
  isDeleting.value = true
  error.value = null
  
  try {
    const params = new URLSearchParams({
      sourceType: props.sourceType,
      targetType: props.targetType,
      sourceColumn: props.sourceColumn || '',
      targetColumn: props.targetColumn
    })
    
    const response = await fetch(`/api/gateway/ontology/relationships?${params}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      emit('deleted')
    } else {
      const errData = await response.json()
      throw new Error(errData.detail || '관계 삭제에 실패했습니다.')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '관계 삭제에 실패했습니다.'
  } finally {
    isDeleting.value = false
  }
}

// 관계명 미리보기 (create 모드용)
const relationshipNamePreview = computed(() => {
  if (mode.value === 'create' && selectedSourceColumn.value && selectedTargetColumn.value && selectedTargetType.value) {
    return `${props.sourceType}.${selectedSourceColumn.value} → ${selectedTargetType.value}.${selectedTargetColumn.value}`
  }
  return ''
})

// 관계 이름 입력 핸들러 (create 모드에서 자동 채우기)
function handleRelationshipNameInput() {
  if (mode.value === 'create' && !relationshipName.value && relationshipNamePreview.value) {
    relationshipName.value = relationshipNamePreview.value
  }
}

// 타겟 ObjectType 변경 시 컬럼 다시 로드 (create 모드용)
watch(selectedTargetType, () => {
  if (mode.value === 'create') {
    selectedTargetColumn.value = ''
    loadTargetColumns()
  }
})

// 다이얼로그가 열릴 때마다 데이터 로드
watch(() => props.visible, (visible) => {
  if (visible) {
    // 상태 초기화 (이전 값 제거)
    relationshipName.value = ''
    selectedMatchStrategy.value = 'EXACT_MATCH'
    selectedCardinality.value = 'ONE_TO_MANY'
    description.value = ''
    error.value = null
    showDeleteConfirm.value = false
    deleteConfirmText.value = ''
    
    if (mode.value === 'create') {
      selectedTargetType.value = props.targetType || ''
      selectedSourceColumn.value = props.sourceColumn || ''
      selectedTargetColumn.value = props.targetColumn || ''
      loadObjectTypes()
      loadSourceColumns()
      if (props.targetType) {
        loadTargetColumns()
      }
    } else {
      // edit 모드: API에서 현재 관계 정보 로드
      loadRelationship()
    }
  }
})

onMounted(() => {
  if (props.visible) {
    if (mode.value === 'create') {
      loadObjectTypes()
      loadSourceColumns()
      if (props.targetType) {
        selectedTargetType.value = props.targetType
        loadTargetColumns()
      }
    } else {
      loadRelationship()
    }
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="$emit('close')">
      <div class="dialog-container">
        <!-- 헤더 -->
        <div class="dialog-header">
          <div class="header-title">
            <IconLink :size="20" class="header-icon" />
            <h2>{{ mode === 'create' ? '관계 생성' : '관계 편집' }}</h2>
          </div>
          <button class="close-btn" @click="$emit('close')">
            <IconX :size="18" />
          </button>
        </div>
        
        <!-- 본문 -->
        <div class="dialog-body">
          <div v-if="isLoading" class="loading">
            관계 정보를 불러오는 중...
          </div>
          
          <div v-else>
            <!-- Create 모드: ObjectType 및 컬럼 선택 -->
            <template v-if="mode === 'create'">
              <!-- 소스 ObjectType (읽기 전용) -->
              <div class="form-section">
                <h3>소스 ObjectType</h3>
                <div class="readonly-field">
                  <span class="type-badge source">{{ sourceType }}</span>
                </div>
                
                <div class="form-row">
                  <label>소스 컬럼</label>
                  <select v-model="selectedSourceColumn">
                    <option value="" disabled>컬럼 선택...</option>
                    <option v-for="col in sourceColumns" :key="col" :value="col">
                      {{ col }}
                    </option>
                  </select>
                </div>
              </div>
              
              <!-- 화살표 -->
              <div class="arrow-section">
                <span class="arrow">→</span>
              </div>
              
              <!-- 타겟 ObjectType -->
              <div class="form-section">
                <h3>타겟 ObjectType</h3>
                <div class="form-row">
                  <label>ObjectType</label>
                  <select v-model="selectedTargetType" :disabled="isLoadingTypes">
                    <option value="" disabled>선택...</option>
                    <option 
                      v-for="ot in objectTypes" 
                      :key="ot.name" 
                      :value="ot.name"
                      :disabled="ot.name === sourceType"
                    >
                      {{ ot.name }} ({{ ot.columns?.length || 0 }} 컬럼)
                    </option>
                  </select>
                </div>
                
                <div class="form-row">
                  <label>타겟 컬럼</label>
                  <select 
                    v-model="selectedTargetColumn" 
                    :disabled="!selectedTargetType || isLoadingColumns"
                  >
                    <option value="" disabled>컬럼 선택...</option>
                    <option v-for="col in targetColumns" :key="col" :value="col">
                      {{ col }}
                    </option>
                  </select>
                </div>
              </div>
            </template>
            
            <!-- Edit 모드: 관계 정보 표시 -->
            <template v-else>
              <!-- 관계 정보 -->
              <div class="form-section">
                <h3>관계 정보</h3>
                <div class="relationship-info">
                  <div class="info-row">
                    <span class="info-label">소스:</span>
                    <code>{{ sourceType }}.{{ sourceColumn || props.sourceColumn }}</code>
                  </div>
                  <div class="info-row">
                    <span class="info-label">타겟:</span>
                    <code>{{ targetType }}.{{ targetColumn || props.targetColumn }}</code>
                  </div>
                </div>
              </div>
            </template>
            
            <!-- 관계 이름 -->
            <div class="form-section">
              <h3>관계 이름</h3>
              <div class="form-row">
                <input 
                  v-model="relationshipName"
                  type="text"
                  :placeholder="mode === 'create' ? relationshipNamePreview : '관계 이름을 입력하세요'"
                  @input="handleRelationshipNameInput"
                />
                <span class="input-hint">의미 있는 이름을 부여할 수 있습니다</span>
              </div>
            </div>
            
            <!-- 관계명 미리보기 (create 모드) -->
            <div v-if="mode === 'create' && relationshipNamePreview" class="preview-section">
              <span class="preview-label">관계명:</span>
              <code class="preview-name">{{ relationshipNamePreview }}</code>
            </div>
            
            <!-- Correlation 전략 -->
            <div class="form-section strategy-section">
              <h3>Correlation 전략</h3>
              <div class="strategy-options">
                <label 
                  v-for="opt in matchStrategyOptions" 
                  :key="opt.value"
                  class="strategy-option"
                  :class="{ selected: selectedMatchStrategy === opt.value }"
                >
                  <input 
                    type="radio" 
                    :value="opt.value" 
                    v-model="selectedMatchStrategy"
                  />
                  <div class="option-content">
                    <span class="option-label">{{ opt.label }}</span>
                    <span class="option-desc">{{ opt.description }}</span>
                  </div>
                </label>
              </div>
            </div>
            
            <!-- Cardinality -->
            <div class="form-section">
              <h3>관계 유형</h3>
              <div class="cardinality-options">
                <label 
                  v-for="opt in cardinalityOptions" 
                  :key="opt.value"
                  class="cardinality-option"
                  :class="{ selected: selectedCardinality === opt.value }"
                >
                  <input 
                    type="radio" 
                    :value="opt.value" 
                    v-model="selectedCardinality"
                  />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
            </div>
            
            <!-- 설명 -->
            <div class="form-section">
              <h3>설명</h3>
              <div class="form-row">
                <textarea 
                  v-model="description"
                  rows="3"
                  placeholder="관계에 대한 설명을 입력하세요 (선택)"
                ></textarea>
              </div>
            </div>
            
            <!-- 삭제 섹션 (edit 모드만) -->
            <div v-if="mode === 'edit'" class="form-section danger-section">
              <h3>위험한 작업</h3>
              <button 
                class="delete-section-btn"
                @click="showDeleteConfirm = !showDeleteConfirm"
              >
                <IconTrash :size="16" />
                <span>관계 삭제</span>
              </button>
              
              <div v-if="showDeleteConfirm" class="delete-confirm">
                <p class="warning-text">
                  이 관계를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </p>
                <div class="confirm-input">
                  <label>확인을 위해 <strong>"삭제"</strong>를 입력하세요:</label>
                  <input 
                    v-model="deleteConfirmText"
                    type="text"
                    placeholder="삭제"
                    @keyup.enter="deleteRelationship"
                  />
                </div>
                <button 
                  class="confirm-delete-btn"
                  @click="deleteRelationship"
                  :disabled="isDeleting || deleteConfirmText !== '삭제'"
                >
                  <span v-if="isDeleting" class="spinner"></span>
                  <IconTrash v-else :size="14" />
                  <span>{{ isDeleting ? '삭제 중...' : '삭제' }}</span>
                </button>
              </div>
            </div>
            
            <!-- 에러 메시지 -->
            <div v-if="error" class="error-message">
              <IconAlertTriangle :size="16" />
              {{ error }}
            </div>
          </div>
        </div>
        
        <!-- 푸터 -->
        <div class="dialog-footer">
          <button class="cancel-btn" @click="$emit('close')">취소</button>
          <button 
            v-if="mode === 'create'"
            class="save-btn"
            @click="createRelationship"
            :disabled="isCreating || !selectedTargetType || !selectedSourceColumn || !selectedTargetColumn"
          >
            <span v-if="isCreating" class="spinner"></span>
            <IconCheck v-else :size="16" />
            <span>{{ isCreating ? '생성 중...' : '관계 생성' }}</span>
          </button>
          <button 
            v-else
            class="save-btn"
            @click="saveRelationship"
            :disabled="isSaving || isLoading"
          >
            <span v-if="isSaving" class="spinner"></span>
            <IconCheck v-else :size="16" />
            <span>{{ isSaving ? '저장 중...' : '저장' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.dialog-overlay {
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

.dialog-container {
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .header-icon {
      color: #00d4aa;
    }
    
    h2 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-bright);
    }
  }
  
  .close-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
    }
  }
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted);
}

.form-section {
  margin-bottom: 24px;
  
  h3 {
    margin: 0 0 12px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
}

.relationship-info {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  
  .info-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    
    &:last-child {
      margin-bottom: 0;
    }
    
    .info-label {
      font-size: 0.85rem;
      color: var(--color-text-muted);
      min-width: 60px;
    }
    
    code {
      padding: 4px 8px;
      background: var(--color-bg-secondary);
      border-radius: 4px;
      font-size: 0.85rem;
      color: #00d4aa;
    }
  }
}

.form-row {
  margin-bottom: 12px;
  
  input, textarea {
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
  
  textarea {
    resize: vertical;
    font-family: inherit;
  }
  
  .input-hint {
    display: block;
    margin-top: 4px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  
  select {
    width: 100%;
    padding: 10px 14px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-bright);
    font-size: 0.9rem;
    cursor: pointer;
    
    &:focus {
      outline: none;
      border-color: #00d4aa;
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

.readonly-field {
  margin-bottom: 12px;
}

.type-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 500;
  
  &.source {
    background: rgba(0, 212, 170, 0.15);
    color: #00d4aa;
    border: 1px solid rgba(0, 212, 170, 0.3);
  }
}

.arrow-section {
  display: flex;
  justify-content: center;
  margin: 16px 0;
  
  .arrow {
    font-size: 1.5rem;
    color: var(--color-text-muted);
  }
}

.preview-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 212, 170, 0.1);
  border: 1px solid rgba(0, 212, 170, 0.3);
  border-radius: 8px;
  margin-bottom: 16px;
  
  .preview-label {
    font-size: 0.85rem;
    color: var(--color-text-light);
  }
  
  .preview-name {
    font-family: 'Fira Code', monospace;
    font-size: 0.9rem;
    color: #00d4aa;
  }
}

.strategy-section {
  background: var(--color-bg-tertiary);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.strategy-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    border-color: rgba(0, 212, 170, 0.5);
  }
  
  &.selected {
    border-color: #00d4aa;
    background: rgba(0, 212, 170, 0.1);
  }
  
  input[type="radio"] {
    margin-top: 2px;
    accent-color: #00d4aa;
  }
  
  .option-content {
    flex: 1;
    
    .option-label {
      display: block;
      font-weight: 500;
      color: var(--color-text-bright);
      margin-bottom: 2px;
    }
    
    .option-desc {
      display: block;
      font-size: 0.8rem;
      color: var(--color-text-muted);
      font-family: 'Fira Code', monospace;
    }
  }
}

.cardinality-options {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.cardinality-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    border-color: rgba(167, 139, 250, 0.5);
  }
  
  &.selected {
    border-color: #a78bfa;
    background: rgba(167, 139, 250, 0.1);
  }
  
  input[type="radio"] {
    accent-color: #a78bfa;
  }
  
  span {
    font-weight: 500;
    color: var(--color-text-bright);
  }
}

.danger-section {
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 12px;
  padding: 16px;
  
  h3 {
    color: #f87171;
  }
}

.delete-section-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  cursor: pointer;
  font-size: 0.9rem;
  
  &:hover {
    background: rgba(239, 68, 68, 0.1);
  }
}

.delete-confirm {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(239, 68, 68, 0.2);
  
  .warning-text {
    margin: 0 0 12px;
    font-size: 0.9rem;
    color: var(--color-text-light);
  }
  
  .confirm-input {
    margin-bottom: 12px;
    
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.85rem;
      color: var(--color-text-muted);
      
      strong {
        color: #f87171;
      }
    }
    
    input {
      width: 100%;
      padding: 10px 14px;
      background: var(--color-bg-tertiary);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: var(--color-text-bright);
      font-size: 0.9rem;
      
      &:focus {
        outline: none;
        border-color: #f87171;
      }
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

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 0.9rem;
}

.dialog-footer {
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
    
    &:hover {
      background: var(--color-bg-tertiary);
    }
  }
  
  .save-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
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
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
