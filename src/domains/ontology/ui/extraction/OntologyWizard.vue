<script setup lang="ts">
/**
 * OntologyWizard.vue
 * 온톨로지 생성 3단계 위저드
 * Step 1: 도메인 문서 입력 (PDF/텍스트)
 * Step 2: 스키마 생성 및 검토
 * Step 3: 확정 뒤 canvas/InstancePanel의 명시적 데이터 연결 화면으로 전환
 */
import { ref, computed, onMounted } from 'vue'
import { useOntologyStore } from '../../state/extraction'
import { storeToRefs } from 'pinia'
import OntologyCanvas from './OntologyCanvas.vue'
import { IconUpload, IconRefresh, IconCheck } from '@/shared/icons'
import type { OntologySchema } from '../../model/schema'
import { useOntologySchemaLibrary } from '../../application/useOntologySchemaLibrary'
import { useOntologySchemaLifecycle } from '../../application/useOntologySchemaLifecycle'
import {
  ontologySchemaLibraryClient,
  ontologySchemaLifecycleClient,
} from '../../application/schemaClients'

const emit = defineEmits<{
  (e: 'open-feedback'): void
}>()

const store = useOntologyStore()
const { 
  wizard,
  schema, 
  error 
} = storeToRefs(store)

const schemaLibrary = useOntologySchemaLibrary(ontologySchemaLibraryClient)
const {
  schemas: existingSchemas,
  activeSchemaId,
  excludedWithoutSchemaJson,
  loading: isLoadingSchemas,
  error: schemaLibraryError,
} = schemaLibrary
const schemaLifecycle = useOntologySchemaLifecycle<OntologySchema>(
  ontologySchemaLifecycleClient,
)
const {
  loadPendingId,
  loadError: schemaSelectionError,
  isBusy: schemaMutationPending,
} = schemaLifecycle
const schemaLibraryBusy = computed(() =>
  isLoadingSchemas.value || schemaMutationPending.value,
)
const schemaLibraryErrorMessage = computed(() => {
  if (!schemaLibraryError.value) return null
  const retained = existingSchemas.value.length > 0 ? ' 이전 목록을 유지합니다.' : ''
  return `저장된 온톨로지를 불러오지 못했습니다: ${schemaLibraryError.value}${retained}`
})
const schemaSelectionErrorMessage = computed(() => {
  const failure = schemaSelectionError.value
  if (!failure) return null
  if (failure.stage === 'detail' && failure.activationCompleted) {
    return `서버 활성화는 완료됐지만 상세 데이터를 불러오지 못했습니다. 기존 화면을 유지합니다: ${failure.message}`
  }
  return `온톨로지를 활성화하지 못했습니다. 기존 화면을 유지합니다: ${failure.message}`
})

// Step 1: 입력 데이터
const inputText = ref('')
const selectedFile = ref<File | null>(null)
const dragOver = ref(false)

// 기존 스키마 목록 로드
async function loadExistingSchemas() {
  await schemaLibrary.refresh()
}

// 기존 스키마 선택
async function selectExistingSchema(schemaId: string) {
  if (schemaLibraryBusy.value) return
  const result = schemaSelectionError.value?.schemaId === schemaId
    ? await schemaLifecycle.retryLoad()
    : await schemaLifecycle.loadSchema(schemaId)
  if (result.status !== 'success') return

  schemaLibrary.setActiveSchemaId(schemaId)
  store.applySchema(result.value)
  store.setWizardStep('binding')
}

onMounted(() => {
  loadExistingSchemas()
})

// 예제 텍스트
const exampleText = `스마트(AI)정수장 운영관리 도메인입니다. 정수장(Plant), 공정(ProcessUnit), 설비(Equipment), 센서(Sensor)가 있습니다. 정수장은 여러 공정을 가지고, 공정은 설비를 사용합니다. 설비에는 센서가 부착되어 있습니다.`

// 예제 사용
function useExample() {
  if (schemaLibraryBusy.value) return
  inputText.value = exampleText
}

// 현재 단계
const currentStep = computed(() => wizard.value.step)

// 생성 중 상태
const isGenerating = computed(() => wizard.value.isGenerating)

// 진행 상황 메시지
const generationProgress = computed(() => wizard.value.progressMessage)

// 현재 단계 번호
const stepNumber = computed(() => {
  switch (currentStep.value) {
    case 'input': return 1
    case 'review': return 2
    case 'binding': return 3
    default: return 1
  }
})

// 파일 드롭 핸들러
function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  if (schemaLibraryBusy.value) return
  
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      selectedFile.value = file
    } else {
      // 텍스트 파일이면 내용 읽기
      const reader = new FileReader()
      reader.onload = (e) => {
        inputText.value = e.target?.result as string || ''
      }
      reader.readAsText(file)
    }
  }
}

// 파일 선택 핸들러
function handleFileSelect(event: Event) {
  if (schemaLibraryBusy.value) return
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]
  }
}

// Step 1: 스키마 생성 시작
async function startGeneration() {
  if (schemaLibraryBusy.value || (!inputText.value.trim() && !selectedFile.value)) return
  
  const pdfContent = selectedFile.value
    ? await readFileAsBase64(selectedFile.value)
    : undefined

  // GenerateSchemaRequest 형식으로 호출
  await store.generateSchema({
    inputType: selectedFile.value ? 'pdf' : 'text',
    text: inputText.value,
    pdfContent,
    domainHint: undefined
  })
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('PDF 파일을 읽지 못했습니다.'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('PDF 파일 형식이 올바르지 않습니다.'))
        return
      }
      resolve(result.split(',', 2)[1] ?? '')
    }
    reader.readAsDataURL(file)
  })
}

// Step 2: 스키마 수정 요청
function requestFeedback() {
  emit('open-feedback')
}

// Step 2: 스키마 확정
function confirmSchema() {
  store.setWizardStep('binding')
}

</script>

<template>
  <div class="ontology-wizard">
    <!-- 진행 표시줄 -->
    <div class="wizard-progress">
      <div class="progress-steps">
        <div 
          v-for="step in 3" 
          :key="step" 
          :class="['progress-step', { 
            active: stepNumber === step, 
            completed: stepNumber > step 
          }]"
        >
          <div class="step-number">
            <IconCheck v-if="stepNumber > step" :size="14" />
            <span v-else>{{ step }}</span>
          </div>
          <div class="step-label">
            {{ step === 1 ? '도메인 입력' : step === 2 ? '스키마 검토' : '데이터 연결' }}
          </div>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${(stepNumber - 1) * 50}%` }"></div>
      </div>
    </div>
    
    <!-- Step 1: 도메인 입력 -->
    <div v-if="currentStep === 'input'" class="wizard-step step-input">
      <!-- 기존 스키마 목록 -->
      <section
        class="existing-schemas-section"
        aria-labelledby="existing-schemas-title"
        :aria-busy="schemaLibraryBusy"
      >
        <div class="section-header">
          <h3 id="existing-schemas-title">📚 저장된 온톨로지</h3>
          <span class="schema-count">{{ existingSchemas.length }}개</span>
          <button
            type="button"
            class="schema-refresh-btn"
            :disabled="schemaLibraryBusy"
            aria-label="저장된 온톨로지 새로고침"
            @click="loadExistingSchemas"
          >
            <IconRefresh :size="15" :class="{ spinning: isLoadingSchemas }" />
          </button>
        </div>
        <div
          v-if="schemaLibraryErrorMessage"
          class="schema-library-state error list-error"
          role="alert"
          aria-live="assertive"
        >
          <span>{{ schemaLibraryErrorMessage }}</span>
          <button type="button" :disabled="schemaLibraryBusy" @click="loadExistingSchemas">
            다시 시도
          </button>
        </div>
        <div
          v-if="schemaSelectionErrorMessage"
          class="schema-library-state error selection-error"
          role="alert"
          aria-live="assertive"
        >
          <span>{{ schemaSelectionErrorMessage }}</span>
          <button
            type="button"
            :disabled="schemaLibraryBusy"
            @click="schemaSelectionError && selectExistingSchema(schemaSelectionError.schemaId)"
          >
            다시 시도
          </button>
        </div>
        <div
          v-if="excludedWithoutSchemaJson > 0"
          class="schema-library-state warning"
          role="status"
          aria-live="polite"
        >
          상세 데이터가 없는 온톨로지 {{ excludedWithoutSchemaJson }}개는 목록에서 제외했습니다.
        </div>
        <div v-if="isLoadingSchemas && existingSchemas.length === 0" class="loading-schemas" role="status">
          <span class="spinner"></span>
          <span>저장된 스키마 확인 중...</span>
        </div>
        <div v-else-if="existingSchemas.length > 0" class="schema-list">
          <button
            v-for="schemaItem in existingSchemas" 
            :key="schemaItem.id"
            type="button"
            class="schema-card"
            :disabled="schemaLibraryBusy"
            :aria-current="schemaItem.id === activeSchemaId ? 'true' : undefined"
            :aria-busy="loadPendingId === schemaItem.id"
            @click="selectExistingSchema(schemaItem.id)"
          >
            <div class="schema-icon">🔮</div>
            <div class="schema-info">
              <span class="schema-name">{{ schemaItem.name }}</span>
              <span class="schema-meta">
                {{ schemaItem.nodeCount }}개 노드<template v-if="schemaItem.version !== undefined"> · v{{ schemaItem.version }}</template>
              </span>
            </div>
            <span class="schema-arrow">→</span>
          </button>
        </div>
        <p
          v-else-if="!isLoadingSchemas && !schemaLibraryErrorMessage"
          class="schema-library-empty"
          role="status"
        >
          저장된 온톨로지가 없습니다
        </p>
        <div class="section-divider">
          <span>또는 새로 생성</span>
        </div>
      </section>
      
      <div class="step-header">
        <h2>도메인 문서 입력</h2>
        <p>PDF 파일을 업로드하거나 도메인에 대한 설명을 직접 입력하세요</p>
      </div>
      
      <!-- 파일 드롭존 -->
      <div 
        class="drop-zone"
        :class="{ 'drag-over': dragOver, 'has-file': selectedFile }"
        @drop="handleDrop"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
      >
        <input 
          type="file" 
          accept=".pdf,.txt,.md" 
          :disabled="schemaLibraryBusy"
          @change="handleFileSelect"
          class="file-input"
        />
        
        <div v-if="selectedFile" class="file-preview">
          <span class="file-icon">📄</span>
          <span class="file-name">{{ selectedFile.name }}</span>
          <button type="button" class="remove-file" :disabled="schemaLibraryBusy" @click.stop="selectedFile = null">✕</button>
        </div>
        
        <div v-else class="drop-hint">
          <IconUpload :size="40" />
          <span>PDF 파일을 드래그하거나 클릭하여 업로드</span>
        </div>
      </div>
      
      <div class="input-divider">
        <span>또는</span>
      </div>
      
      <!-- 텍스트 입력 -->
      <div class="text-input-area">
        <textarea
          v-model="inputText"
          :disabled="schemaLibraryBusy"
          placeholder="도메인에 대한 설명을 입력하세요..."
          rows="10"
        ></textarea>
        <div class="example-section">
          <button type="button" class="example-btn" :disabled="schemaLibraryBusy" @click="useExample">
            <span>💡</span> 예제 사용하기
          </button>
        </div>
      </div>
      
      <div class="step-actions">
        <button 
          class="btn btn-primary"
          :disabled="schemaLibraryBusy || (!inputText.trim() && !selectedFile) || isGenerating"
          @click="startGeneration"
        >
          <span v-if="isGenerating" class="spinner"></span>
          <span v-else>🔮</span>
          {{ isGenerating ? '스키마 생성 중...' : '온톨로지 스키마 생성' }}
        </button>
      </div>
    </div>
    
    <!-- Step 2: 스키마 검토 -->
    <div v-if="currentStep === 'review'" class="wizard-step step-generate">
      <div class="step-header">
        <h2>생성된 온톨로지 검토</h2>
        <p>LLM이 생성한 온톨로지를 검토하고 필요시 수정하세요</p>
      </div>
      
      <!-- 생성 진행 중 -->
      <div v-if="isGenerating" class="generation-progress">
        <div class="progress-animation">
          <div class="pulse-ring"></div>
          <span class="progress-icon">🔮</span>
        </div>
        <p class="progress-text">{{ generationProgress }}</p>
      </div>
      
      <!-- 에러 표시 -->
      <div v-else-if="error" class="generation-error">
        <span class="error-icon">⚠️</span>
        <p>{{ error }}</p>
        <button class="btn btn-secondary" @click="store.setWizardStep('input')">
          <IconRefresh :size="16" />
          다시 시도
        </button>
      </div>
      
      <!-- 스키마 미리보기 -->
      <div v-else-if="schema" class="schema-preview">
        <div class="preview-stats">
          <div class="stat-item">
            <span class="stat-value">{{ schema.nodes?.length || 0 }}</span>
            <span class="stat-label">노드</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ schema.relationships?.length || 0 }}</span>
            <span class="stat-label">관계</span>
          </div>
        </div>
        
        <div class="preview-canvas">
          <OntologyCanvas :schema="schema" />
        </div>
        
        <div class="step-actions">
          <button class="btn btn-secondary" @click="requestFeedback">
            💬 스키마 수정
          </button>
          <button class="btn btn-primary" @click="confirmSchema">
            <IconCheck :size="16" />
            스키마 확정
          </button>
        </div>
      </div>
    </div>
    
  </div>
</template>

<style scoped lang="scss">
.ontology-wizard {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  overflow-y: auto;
}

// 진행 표시줄
.wizard-progress {
  margin-bottom: 32px;
}

.progress-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
  
  .step-number {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-bg-tertiary);
    border: 2px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-weight: 600;
    transition: all 0.3s ease;
  }
  
  .step-label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-align: center;
  }
  
  &.active {
    .step-number {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: white;
    }
    
    .step-label {
      color: var(--color-text);
      font-weight: 500;
    }
  }
  
  &.completed {
    .step-number {
      background: #34d399;
      border-color: #34d399;
      color: white;
    }
    
    .step-label {
      color: #34d399;
    }
  }
}

.progress-bar {
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #34d399, var(--color-accent));
    transition: width 0.5s ease;
  }
}

// 기존 스키마 목록 섹션
.existing-schemas-section {
  margin-bottom: 32px;
  
  .section-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 16px;
    
    h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-bright);
    }
    
    .schema-count {
      font-size: 0.8rem;
      padding: 4px 10px;
      background: var(--color-bg-tertiary);
      border-radius: 12px;
      color: var(--color-text-muted);
    }

    .schema-refresh-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg-tertiary);
      color: var(--color-text);
      cursor: pointer;

      &:hover:not(:disabled) {
        color: var(--color-accent);
        border-color: var(--color-accent);
      }

      &:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
      }

      &:disabled {
        opacity: 0.55;
        cursor: wait;
      }

      .spinning {
        animation: spin 0.8s linear infinite;
      }
    }
  }
  
  .schema-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    max-width: 800px;
    margin: 0 auto;
  }
  
  .schema-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 220px;
    color: inherit;
    font: inherit;
    text-align: left;
    
    &:hover:not(:disabled) {
      background: var(--color-bg-tertiary);
      border-color: var(--color-accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 3px;
      border-color: var(--color-accent);
    }

    &:disabled {
      opacity: 0.62;
      cursor: wait;
      transform: none;
    }
    
    .schema-icon {
      font-size: 1.5rem;
    }
    
    .schema-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      
      .schema-name {
        font-weight: 600;
        color: var(--color-text-bright);
        font-size: 0.95rem;
      }
      
      .schema-meta {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
    }
    
    .schema-arrow {
      color: var(--color-text-muted);
      font-size: 1.2rem;
      transition: transform 0.2s;
    }
    
    &:hover:not(:disabled) .schema-arrow {
      transform: translateX(4px);
      color: var(--color-accent);
    }
  }
  
  .section-divider {
    display: flex;
    align-items: center;
    margin: 24px 0;
    
    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border);
    }
    
    span {
      padding: 0 16px;
      color: var(--color-text-muted);
      font-size: 0.85rem;
    }
  }
}

.schema-library-state {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: min(800px, 100%);
  margin: 0 auto 14px;
  padding: 12px 14px;
  border: 1px solid;
  border-radius: 10px;
  font-size: 0.84rem;
  line-height: 1.45;

  > span {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  &.error {
    border-color: color-mix(in srgb, var(--color-error) 58%, var(--color-border));
    background: color-mix(in srgb, var(--color-error) 12%, var(--color-bg-secondary));
    color: var(--color-error);
  }

  &.warning {
    border-color: color-mix(in srgb, var(--color-warning) 55%, var(--color-border));
    background: color-mix(in srgb, var(--color-warning) 12%, var(--color-bg-secondary));
    color: var(--color-warning);
  }

  button {
    flex: 0 0 auto;
    padding: 6px 10px;
    border: 1px solid currentColor;
    border-radius: 7px;
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }

    &:disabled {
      opacity: 0.55;
      cursor: wait;
    }
  }
}

.schema-library-empty {
  margin: 0 auto;
  padding: 14px;
  color: var(--color-text-muted);
  text-align: center;
}

.loading-schemas {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: var(--color-text-muted);
  
  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

// 위저드 스텝 공통
.wizard-step {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.step-header {
  text-align: center;
  margin-bottom: 32px;
  
  h2 {
    margin: 0 0 8px 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
  
  p {
    margin: 0;
    color: var(--color-text-muted);
  }
}

.step-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

// 버튼 스타일
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-primary {
  background: linear-gradient(135deg, var(--color-accent), #7c3aed);
  color: white;
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(34, 139, 230, 0.4);
  }
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  
  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
    border-color: var(--color-accent);
  }
}

// Step 1: 입력
.drop-zone {
  position: relative;
  padding: 40px;
  border: 2px dashed var(--color-border);
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover,
  &.drag-over {
    border-color: var(--color-accent);
    background: rgba(34, 139, 230, 0.05);
  }
  
  &.has-file {
    border-style: solid;
    border-color: #34d399;
    background: rgba(52, 211, 153, 0.05);
  }
  
  .file-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
  
  svg {
    opacity: 0.5;
  }
}

.file-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  
  .file-icon {
    font-size: 24px;
  }
  
  .file-name {
    font-weight: 500;
    color: var(--color-text);
  }
  
  .remove-file {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: var(--color-error);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
}

.input-divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 24px 0;
  
  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
  
  span {
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }
}

.text-input-area {
  textarea {
    width: 100%;
    padding: 16px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 0.95rem;
    font-family: inherit;
    resize: vertical;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
  
  .example-section {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
  }
  
  .example-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    border: none;
    border-radius: 8px;
    color: #1a1a2e;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
    }
  }
}

// Step 2: 생성
.generation-progress {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.progress-animation {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  .pulse-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border: 3px solid var(--color-accent);
    border-radius: 50%;
    animation: pulse 1.5s ease-out infinite;
  }
  
  .progress-icon {
    font-size: 32px;
    z-index: 1;
  }
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.progress-text {
  color: var(--color-text-light);
  font-size: 1rem;
}

.generation-error {
  text-align: center;
  padding: 32px;
  
  .error-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 16px;
  }
  
  p {
    color: var(--color-error);
    margin-bottom: 24px;
  }
}

.schema-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-stats {
  display: flex;
  justify-content: center;
  gap: 32px;
  
  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-accent);
    }
    
    .stat-label {
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }
  }
}

.preview-canvas {
  flex: 1;
  min-height: 400px;
  height: 400px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

// 스피너
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
