<script setup lang="ts">
/**
 * OntologyWizard.vue
 * 온톨로지 생성 3단계 위저드
 * Step 1: 도메인 문서 입력 (PDF/텍스트)
 * Step 2: 스키마 생성 및 검토
 * Step 3: 데이터 소스 바인딩 및 모니터링 시작
 */
import { ref, computed, onMounted } from 'vue'
import { useOntologyStore } from '@/stores/ontology'
import { storeToRefs } from 'pinia'
import OntologyCanvas from './OntologyCanvas.vue'
import { IconUpload, IconRefresh, IconPlay, IconCheck } from '@/shared/icons'
import { ontologyApi, type SchemaListItem } from '@/services/api'

const emit = defineEmits<{
  (e: 'open-feedback'): void
  (e: 'schema-selected', schema: any): void
}>()

const store = useOntologyStore()
const { 
  wizard,
  schema, 
  error 
} = storeToRefs(store)

// 기존 스키마 목록
const existingSchemas = ref<SchemaListItem[]>([])
const isLoadingSchemas = ref(false)

// Step 1: 입력 데이터
const inputText = ref('')
const selectedFile = ref<File | null>(null)
const dragOver = ref(false)

// 기존 스키마 목록 로드
async function loadExistingSchemas() {
  isLoadingSchemas.value = true
  try {
    const response = await ontologyApi.listSchemas()
    existingSchemas.value = response.schemas || []
  } catch (err) {
    console.error('Failed to load schemas:', err)
    existingSchemas.value = []
  } finally {
    isLoadingSchemas.value = false
  }
}

// 기존 스키마 선택
async function selectExistingSchema(schemaItem: SchemaListItem) {
  try {
    const fullSchema = await ontologyApi.getSchemaById(schemaItem.id)
    store.applySchema(fullSchema)
    store.setWizardStep('binding')
    emit('schema-selected', fullSchema)
  } catch (err) {
    console.error('Failed to load schema:', err)
  }
}

onMounted(() => {
  loadExistingSchemas()
})

// 예제 텍스트
const exampleText = `스마트(AI)정수장 운영관리 도메인입니다. 정수장(Plant), 공정(ProcessUnit), 설비(Equipment), 센서(Sensor)가 있습니다. 정수장은 여러 공정을 가지고, 공정은 설비를 사용합니다. 설비에는 센서가 부착되어 있습니다.`

// 예제 사용
function useExample() {
  inputText.value = exampleText
}

// Step 3: MV 생성 확인
const mvConfirmed = ref(false)

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
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]
  }
}

// Step 1: 스키마 생성 시작
async function startGeneration() {
  if (!inputText.value.trim() && !selectedFile.value) return
  
  // GenerateSchemaRequest 형식으로 호출
  await store.generateSchema({
    inputType: selectedFile.value ? 'pdf' : 'text',
    text: inputText.value,
    pdfFile: selectedFile.value || undefined,
    domainHint: undefined
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

// Step 3: 데이터 바인딩 시작
async function startDataBinding() {
  // 각 노드에 대해 데이터 소스 검색 시도
  console.log('데이터 소스 자동 검색 시작...')
}

// Step 3: MV 생성 확인 후 모니터링 시작
async function startMonitoring() {
  if (!mvConfirmed.value) {
    // MV 생성 확인 다이얼로그
    if (confirm('Materialized View를 생성하시겠습니까?\n실시간 모니터링을 위해 필요합니다.')) {
      mvConfirmed.value = true
      // MV 생성 로직 (향후 구현)
    }
    return
  }
  
  // 모니터링 모드로 전환 (binding 유지)
  console.log('모니터링 시작')
}

// 단계 스킵 (개발/테스트용)
function skipToBinding() {
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
      <div v-if="existingSchemas.length > 0" class="existing-schemas-section">
        <div class="section-header">
          <h3>📚 저장된 온톨로지</h3>
          <span class="schema-count">{{ existingSchemas.length }}개</span>
        </div>
        <div class="schema-list">
          <div 
            v-for="schemaItem in existingSchemas" 
            :key="schemaItem.id"
            class="schema-card"
            @click="selectExistingSchema(schemaItem)"
          >
            <div class="schema-icon">🔮</div>
            <div class="schema-info">
              <span class="schema-name">{{ schemaItem.name }}</span>
              <span class="schema-meta">
                {{ schemaItem.nodeCount }}개 노드 · v{{ schemaItem.version }}
              </span>
            </div>
            <span class="schema-arrow">→</span>
          </div>
        </div>
        <div class="section-divider">
          <span>또는 새로 생성</span>
        </div>
      </div>
      
      <div v-else-if="isLoadingSchemas" class="loading-schemas">
        <span class="spinner"></span>
        <span>저장된 스키마 확인 중...</span>
      </div>
      
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
          @change="handleFileSelect"
          class="file-input"
        />
        
        <div v-if="selectedFile" class="file-preview">
          <span class="file-icon">📄</span>
          <span class="file-name">{{ selectedFile.name }}</span>
          <button class="remove-file" @click.stop="selectedFile = null">✕</button>
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
          placeholder="도메인에 대한 설명을 입력하세요..."
          rows="10"
        ></textarea>
        <div class="example-section">
          <button class="example-btn" @click="useExample">
            <span>💡</span> 예제 사용하기
          </button>
        </div>
      </div>
      
      <div class="step-actions">
        <button 
          class="btn btn-primary"
          :disabled="(!inputText.trim() && !selectedFile) || isGenerating"
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
    
    <!-- Step 3: 데이터 연결 -->
    <div v-if="currentStep === 'binding'" class="wizard-step step-bind">
      <div class="step-header">
        <h2>데이터 소스 연결</h2>
        <p>각 노드에 해당하는 실제 데이터 테이블을 매핑합니다</p>
      </div>
      
      <!-- 데이터 바인딩 진행 중 -->
      <div v-if="isGenerating" class="binding-progress">
        <div class="progress-animation">
          <div class="pulse-ring"></div>
          <span class="progress-icon">🔗</span>
        </div>
        <p class="progress-text">{{ generationProgress }}</p>
      </div>
      
      <!-- 바인딩 결과 -->
      <div v-else class="binding-result">
        <div class="binding-summary">
          <h3>데이터 소스 매핑 완료</h3>
          <p>{{ schema?.nodes?.filter(n => n.dataSource).length || 0 }}개 노드에 데이터 소스가 연결되었습니다.</p>
        </div>
        
        <div class="node-bindings">
          <div 
            v-for="node in schema?.nodes" 
            :key="node.id"
            class="binding-item"
          >
            <span class="node-label">{{ node.name }}</span>
            <span class="binding-arrow">→</span>
            <span 
              class="data-source"
              :class="{ 'no-source': !node.dataSource }"
            >
              {{ node.dataSource || '미연결' }}
            </span>
          </div>
        </div>
        
        <div class="mv-confirm">
          <label class="checkbox-label">
            <input type="checkbox" v-model="mvConfirmed" />
            <span>Materialized View 생성 및 실시간 모니터링 활성화</span>
          </label>
          <p class="mv-hint">
            CDC(Change Data Capture)를 통해 데이터 변경을 실시간으로 Neo4j에 반영합니다
          </p>
        </div>
        
        <div class="step-actions">
          <button class="btn btn-secondary" @click="startDataBinding">
            <IconRefresh :size="16" />
            데이터 소스 다시 검색
          </button>
          <button class="btn btn-primary" @click="startMonitoring">
            <IconPlay :size="16" />
            모니터링 시작
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
    
    &:hover {
      background: var(--color-bg-tertiary);
      border-color: var(--color-accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
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
    
    &:hover .schema-arrow {
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
.generation-progress,
.binding-progress {
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

// Step 3: 바인딩
.binding-summary {
  text-align: center;
  margin-bottom: 24px;
  
  h3 {
    margin: 0 0 8px 0;
    color: #34d399;
  }
  
  p {
    margin: 0;
    color: var(--color-text-muted);
  }
}

.node-bindings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: 10px;
  margin-bottom: 24px;
}

.binding-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  
  .node-label {
    font-weight: 500;
    color: var(--color-text);
    min-width: 150px;
  }
  
  .binding-arrow {
    color: var(--color-text-muted);
  }
  
  .data-source {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    color: #34d399;
    
    &.no-source {
      color: var(--color-warning);
      font-style: italic;
    }
  }
}

.mv-confirm {
  padding: 16px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    
    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--color-accent);
    }
    
    span {
      font-weight: 500;
      color: var(--color-text);
    }
  }
  
  .mv-hint {
    margin: 8px 0 0 28px;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
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
