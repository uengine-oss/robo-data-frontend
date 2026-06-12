<script setup lang="ts">
/**
 * BehaviorDialog.vue
 * ObjectType의 Behavior(행위/메서드) 추가/편집 다이얼로그
 */
import { ref, computed, watch, onMounted } from 'vue'
import { Teleport } from 'vue'
import { IconX, IconCheck, IconPlay } from '@/shared/icons'
import DmnEditor from './DmnEditor.vue'

interface BehaviorConfig {
  endpoint?: string
  method?: string
  parameters?: Record<string, any>
  code?: string
}

interface Behavior {
  name: string
  description?: string
  behaviorType: 'rest_api' | 'javascript' | 'python' | 'dmn'
  config: BehaviorConfig
  inputFields?: string[]
  outputField?: string
}

interface RelatedObjectType {
  name: string
  relationName?: string
  columns?: string[]
}

const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  objectTypeName: string
  columns: string[]  // ObjectType의 컬럼 목록
  relatedObjectTypes?: RelatedObjectType[]  // 관계된 child ObjectType들
  behavior?: Behavior  // 편집 시 기존 behavior
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', behavior: Behavior): void
  (e: 'deleted', behaviorName: string): void
}>()

// 상태
const behaviorName = ref('')
const description = ref('')
const behaviorType = ref<'rest_api' | 'javascript' | 'python' | 'dmn'>('rest_api')
const endpoint = ref('')
const httpMethod = ref('POST')
const pythonCode = ref('')
const javascriptCode = ref('')
const dmnXml = ref('')  // DMN XML
const inputFields = ref<string[]>([])
const outputField = ref('')
const isSaving = ref(false)
const isTesting = ref(false)
const isGeneratingCode = ref(false)
const isDeleting = ref(false)
const showDeleteConfirm = ref(false)
const error = ref<string | null>(null)
const testResult = ref<any>(null)

// DMN 편집기 ref
const dmnEditorRef = ref<InstanceType<typeof DmnEditor> | null>(null)

// Behavior 타입 옵션
const behaviorTypes = [
  { value: 'rest_api', label: 'REST API 호출', icon: '🌐' },
  { value: 'dmn', label: 'DMN 규칙', icon: '📊' },
  { value: 'python', label: 'Python 코드', icon: '🐍' },
  { value: 'javascript', label: 'JavaScript 코드', icon: '📜' }
]

// 입력 컬럼 (DMN 편집기에 전달)
const inputColumnsForDmn = computed(() => {
  return inputFields.value.map(name => ({
    name,
    type: 'string'  // 기본 타입
  }))
})

// 초기화
function resetForm() {
  behaviorName.value = ''
  description.value = ''
  behaviorType.value = 'rest_api'
  endpoint.value = ''
  httpMethod.value = 'POST'
  pythonCode.value = ''
  javascriptCode.value = ''
  dmnXml.value = ''
  inputFields.value = []
  outputField.value = ''
  error.value = null
  testResult.value = null
}

// props.visible 변경 시 초기화
watch(() => props.visible, (visible) => {
  if (visible) {
    if (props.mode === 'edit' && props.behavior) {
      // 편집 모드: 기존 값 로드
      behaviorName.value = props.behavior.name
      description.value = props.behavior.description || ''
      behaviorType.value = props.behavior.behaviorType
      inputFields.value = props.behavior.inputFields || []
      outputField.value = props.behavior.outputField || ''
      
      const config = props.behavior.config || {}
      endpoint.value = config.endpoint || ''
      httpMethod.value = config.method || 'POST'
      pythonCode.value = config.code || ''
      javascriptCode.value = config.code || ''
      dmnXml.value = config.dmnXml || ''
    } else {
      // 생성 모드: 초기화
      resetForm()
    }
  }
})

// 입력 필드 토글
function toggleInputField(field: string) {
  const idx = inputFields.value.indexOf(field)
  if (idx === -1) {
    inputFields.value.push(field)
  } else {
    inputFields.value.splice(idx, 1)
  }
}

// AI로 Python 코드 생성
async function generatePythonCode() {
  if (!description.value.trim()) {
    error.value = '코드 생성을 위해 설명을 먼저 입력해주세요'
    return
  }
  
  isGeneratingCode.value = true
  error.value = null
  
  try {
    // 컨텍스트 구성
    const fieldsInfo = props.columns.map(col => `  - ${col}`).join('\n')
    
    let relatedInfo = ''
    if (props.relatedObjectTypes && props.relatedObjectTypes.length > 0) {
      relatedInfo = '\n\n## 관계된 Child ObjectType들:\n'
      for (const rel of props.relatedObjectTypes) {
        relatedInfo += `\n### ${rel.name}${rel.relationName ? ` (관계명: ${rel.relationName})` : ''}\n`
        if (rel.columns && rel.columns.length > 0) {
          relatedInfo += '필드:\n' + rel.columns.map(c => `  - ${c}`).join('\n')
        }
      }
    }
    
    const prompt = `당신은 Python 코드 생성 전문가입니다. 다음 ObjectType과 설명을 기반으로 Python 코드를 생성해주세요.

## ObjectType: ${props.objectTypeName}

## 필드 목록:
${fieldsInfo}
${relatedInfo}

## Behavior 설명:
${description.value}

## 요구사항:
1. 'data' 변수에 현재 인스턴스 데이터가 dict 형태로 전달됩니다
2. 관계된 child 데이터가 있다면 data['children'] 또는 data['관계명'] 형태로 접근 가능합니다
3. 최종 결과는 'result' 변수에 저장해야 합니다
4. result는 dict 또는 list 형태로 반환해야 합니다
5. 주석으로 로직을 설명해주세요

Python 코드만 출력하세요 (마크다운 코드블록 없이):
`

    const response = await fetch('/api/gateway/ontology/generate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        language: 'python'
      })
    })
    
    if (!response.ok) {
      // 직접 OpenAI 호출 시도
      const openaiResponse = await fetch('/api/gateway/text2sql/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        })
      })
      
      if (!openaiResponse.ok) {
        throw new Error('코드 생성 API 호출 실패')
      }
      
      const data = await openaiResponse.json()
      let code = data.content || data.result || data.response || ''
      
      // 마크다운 코드블록 제거
      code = code.replace(/^```python\n?/i, '').replace(/\n?```$/i, '').trim()
      pythonCode.value = code
    } else {
      const data = await response.json()
      let code = data.code || data.result || ''
      code = code.replace(/^```python\n?/i, '').replace(/\n?```$/i, '').trim()
      pythonCode.value = code
    }
    
    // Python 타입으로 전환
    behaviorType.value = 'python'
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '코드 생성 실패'
  } finally {
    isGeneratingCode.value = false
  }
}

// Behavior 저장
async function saveBehavior() {
  if (!behaviorName.value.trim()) {
    error.value = 'Behavior 이름을 입력해주세요'
    return
  }
  
  // config 구성
  let config: BehaviorConfig = {}
  
  if (behaviorType.value === 'rest_api') {
    if (!endpoint.value.trim()) {
      error.value = 'API 엔드포인트를 입력해주세요'
      return
    }
    config = {
      endpoint: endpoint.value,
      method: httpMethod.value
    }
  } else if (behaviorType.value === 'dmn') {
    // DMN 편집기에서 XML 가져오기
    if (dmnEditorRef.value) {
      const xml = await dmnEditorRef.value.exportXml()
      if (xml) {
        dmnXml.value = xml
      }
    }
    if (!dmnXml.value.trim()) {
      error.value = 'DMN 규칙을 정의해주세요'
      return
    }
    config = { dmnXml: dmnXml.value }
  } else if (behaviorType.value === 'python') {
    if (!pythonCode.value.trim()) {
      error.value = 'Python 코드를 입력해주세요'
      return
    }
    config = { code: pythonCode.value }
  } else if (behaviorType.value === 'javascript') {
    if (!javascriptCode.value.trim()) {
      error.value = 'JavaScript 코드를 입력해주세요'
      return
    }
    config = { code: javascriptCode.value }
  }
  
  const behavior: Behavior = {
    name: behaviorName.value.trim().replace(/\s+/g, '_'),
    description: description.value || undefined,
    behaviorType: behaviorType.value,
    config,
    inputFields: inputFields.value.length > 0 ? inputFields.value : undefined,
    outputField: outputField.value || undefined
  }
  
  isSaving.value = true
  error.value = null
  
  try {
    const url = props.mode === 'edit'
      ? `/api/gateway/ontology/object-types/${encodeURIComponent(props.objectTypeName)}/behaviors/${encodeURIComponent(props.behavior?.name || '')}`
      : `/api/gateway/ontology/object-types/${encodeURIComponent(props.objectTypeName)}/behaviors`
    
    const method = props.mode === 'edit' ? 'PATCH' : 'POST'
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(behavior)
    })
    
    if (!response.ok) {
      const errData = await response.json()
      throw new Error(errData.detail || 'Behavior 저장 실패')
    }
    
    emit('saved', behavior)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Behavior 저장 실패'
  } finally {
    isSaving.value = false
  }
}

// Behavior 삭제
async function deleteBehavior() {
  if (!props.behavior?.name) return
  
  isDeleting.value = true
  error.value = null
  
  try {
    const url = `/api/gateway/ontology/object-types/${encodeURIComponent(props.objectTypeName)}/behaviors/${encodeURIComponent(props.behavior.name)}`
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) {
      const errData = await response.json()
      throw new Error(errData.detail || 'Behavior 삭제 실패')
    }
    
    emit('deleted', props.behavior.name)
    showDeleteConfirm.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Behavior 삭제 실패'
  } finally {
    isDeleting.value = false
  }
}

// Behavior 테스트 (샘플 데이터로)
async function testBehavior() {
  if (behaviorType.value !== 'rest_api' || !endpoint.value) {
    error.value = 'REST API 타입만 테스트할 수 있습니다'
    return
  }
  
  isTesting.value = true
  testResult.value = null
  error.value = null
  
  try {
    // 샘플 테스트 데이터 생성
    const sampleData: Record<string, any> = {}
    inputFields.value.forEach(field => {
      sampleData[field] = `sample_${field}`
    })
    
    const response = await fetch(endpoint.value, {
      method: httpMethod.value,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        behavior_name: behaviorName.value,
        instance_data: sampleData
      })
    })
    
    const data = await response.json()
    testResult.value = data
    
    if (!response.ok) {
      error.value = `테스트 실패: ${data.detail || response.statusText}`
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '테스트 실패'
  } finally {
    isTesting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="$emit('close')">
      <div class="dialog-container">
        <!-- 헤더 -->
        <div class="dialog-header">
          <div class="header-title">
            <span class="dialog-icon">⚡</span>
            <h2>{{ mode === 'create' ? 'Behavior 추가' : 'Behavior 편집' }}</h2>
          </div>
          <button class="close-btn" @click="$emit('close')">
            <IconX :size="18" />
          </button>
        </div>
        
        <!-- 본문 -->
        <div class="dialog-body">
          <!-- 기본 정보 -->
          <div class="form-section">
            <h3>기본 정보</h3>
            
            <div class="form-row">
              <label>이름 <span class="required">*</span></label>
              <input 
                v-model="behaviorName" 
                type="text" 
                placeholder="예: calculateRisk, predict, transform..."
                :disabled="mode === 'edit'"
              />
            </div>
            
            <div class="form-row">
              <label>설명</label>
              <textarea 
                v-model="description" 
                placeholder="이 Behavior가 하는 일을 설명해주세요... (AI 코드 생성 시 이 설명을 기반으로 코드가 생성됩니다)"
                rows="3"
              ></textarea>
            </div>
            
            <!-- AI 코드 생성 버튼 -->
            <div class="generate-code-row">
              <button 
                class="generate-btn"
                :disabled="!description.trim() || isGeneratingCode"
                @click="generatePythonCode"
              >
                <span v-if="isGeneratingCode" class="loading-spinner"></span>
                <span v-else>✨</span>
                {{ isGeneratingCode ? 'AI 코드 생성 중...' : 'AI로 Python 코드 생성' }}
              </button>
              <span class="generate-hint">설명을 입력하고 버튼을 클릭하면 Python 코드가 자동 생성됩니다</span>
            </div>
          </div>
          
          <!-- Behavior 타입 선택 -->
          <div class="form-section">
            <h3>실행 방식</h3>
            
            <div class="type-options">
              <div 
                v-for="type in behaviorTypes" 
                :key="type.value"
                class="type-option"
                :class="{ selected: behaviorType === type.value }"
                @click="behaviorType = type.value as any"
              >
                <span class="type-icon">{{ type.icon }}</span>
                <span class="type-label">{{ type.label }}</span>
              </div>
            </div>
          </div>
          
          <!-- REST API 설정 -->
          <div v-if="behaviorType === 'rest_api'" class="form-section">
            <h3>REST API 설정</h3>
            
            <div class="form-row">
              <label>엔드포인트 URL <span class="required">*</span></label>
              <input 
                v-model="endpoint" 
                type="text" 
                placeholder="http://localhost:8003/execute-behavior"
              />
            </div>
            
            <div class="form-row">
              <label>HTTP 메서드</label>
              <select v-model="httpMethod">
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </div>
          
          <!-- Python 코드 -->
          <div v-if="behaviorType === 'python'" class="form-section">
            <h3>Python 코드</h3>
            <p class="section-hint">
              <code>data</code> 변수에 인스턴스 데이터가 전달됩니다. 결과는 <code>result</code> 변수에 저장하세요.
            </p>
            
            <textarea 
              v-model="pythonCode" 
              class="code-editor"
              placeholder="# 예시:
# age = data.get('age', 0)
# risk = 'HIGH' if age > 60 else 'LOW'
# result = {'risk_level': risk}"
              rows="10"
            ></textarea>
          </div>
          
          <!-- DMN 규칙 편집기 -->
          <div v-if="behaviorType === 'dmn'" class="form-section dmn-section">
            <h3>DMN 규칙 편집기</h3>
            <p class="section-hint">
              Decision Table을 사용하여 규칙을 정의하세요. 입력 필드를 먼저 선택한 후 편집하면 자동으로 컬럼이 추가됩니다.
            </p>
            
            <div class="dmn-editor-wrapper">
              <DmnEditor
                ref="dmnEditorRef"
                v-model="dmnXml"
                :input-columns="inputColumnsForDmn"
                :output-column="outputField"
                @change="(xml: string) => dmnXml = xml"
              />
            </div>
          </div>
          
          <!-- JavaScript 코드 -->
          <div v-if="behaviorType === 'javascript'" class="form-section">
            <h3>JavaScript 코드</h3>
            <p class="section-hint">
              <code>data</code> 변수에 인스턴스 데이터가 전달됩니다. 결과를 <code>return</code> 하세요.
            </p>
            
            <textarea 
              v-model="javascriptCode" 
              class="code-editor"
              placeholder="// 예시:
// const age = data.age || 0;
// const risk = age > 60 ? 'HIGH' : 'LOW';
// return { risk_level: risk };"
              rows="10"
            ></textarea>
          </div>
          
          <!-- 입출력 필드 설정 -->
          <div class="form-section">
            <h3>입출력 필드</h3>
            
            <div class="io-fields">
              <!-- 입력 필드 선택 -->
              <div class="io-group">
                <label>입력 필드 (인스턴스 데이터)</label>
                <div class="field-chips">
                  <div 
                    v-for="col in columns" 
                    :key="col"
                    class="field-chip"
                    :class="{ selected: inputFields.includes(col) }"
                    @click="toggleInputField(col)"
                  >
                    {{ col }}
                  </div>
                </div>
              </div>
              
              <!-- 출력 필드 -->
              <div class="io-group">
                <label>출력 필드 (결과 저장)</label>
                <select v-model="outputField">
                  <option value="">-- 선택 (새 필드 생성 가능) --</option>
                  <option v-for="col in columns" :key="col" :value="col">{{ col }}</option>
                </select>
                <input 
                  v-if="outputField === ''" 
                  v-model="outputField" 
                  type="text" 
                  placeholder="새 필드명 입력..."
                  class="new-field-input"
                />
              </div>
            </div>
          </div>
          
          <!-- 테스트 결과 -->
          <div v-if="testResult" class="form-section">
            <h3>테스트 결과</h3>
            <pre class="test-result">{{ JSON.stringify(testResult, null, 2) }}</pre>
          </div>
          
          <!-- 에러 메시지 -->
          <div v-if="error" class="error-message">
            {{ error }}
          </div>
        </div>
        
        <!-- 푸터 -->
        <div class="dialog-footer">
          <button 
            v-if="behaviorType === 'rest_api'"
            class="test-btn" 
            @click="testBehavior"
            :disabled="isTesting || !endpoint"
          >
            <IconPlay :size="14" />
            <span>{{ isTesting ? '테스트 중...' : '테스트' }}</span>
          </button>
          
          <!-- 삭제 버튼 (편집 모드에서만) -->
          <button 
            v-if="mode === 'edit'"
            class="delete-btn"
            @click="showDeleteConfirm = true"
            :disabled="isDeleting"
          >
            🗑️ 삭제
          </button>
          
          <div class="spacer"></div>
          
          <button class="cancel-btn" @click="$emit('close')">
            취소
          </button>
          <button 
            class="save-btn" 
            @click="saveBehavior"
            :disabled="isSaving || !behaviorName"
          >
            <span v-if="isSaving" class="spinner"></span>
            <IconCheck v-else :size="16" />
            <span>{{ isSaving ? '저장 중...' : '저장' }}</span>
          </button>
        </div>
        
        <!-- 삭제 확인 모달 -->
        <Transition name="fade">
          <div v-if="showDeleteConfirm" class="delete-confirm-overlay" @click.self="showDeleteConfirm = false">
            <div class="delete-confirm-modal">
              <div class="delete-confirm-icon">⚠️</div>
              <h3>Behavior 삭제</h3>
              <p>
                <strong>{{ behaviorName }}</strong> Behavior를 삭제하시겠습니까?
              </p>
              <p class="delete-warning">이 작업은 되돌릴 수 없습니다.</p>
              <div class="delete-confirm-actions">
                <button 
                  class="cancel-btn" 
                  @click="showDeleteConfirm = false"
                  :disabled="isDeleting"
                >
                  취소
                </button>
                <button 
                  class="confirm-delete-btn" 
                  @click="deleteBehavior"
                  :disabled="isDeleting"
                >
                  {{ isDeleting ? '삭제 중...' : '삭제' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
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
  max-width: 700px;
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
    
    .dialog-icon {
      font-size: 1.5rem;
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

.form-section {
  margin-bottom: 24px;
  
  h3 {
    margin: 0 0 12px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
  
  .section-hint {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    
    code {
      background: var(--color-bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      color: #00d4aa;
    }
  }
}

.form-row {
  margin-bottom: 12px;
  
  label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.85rem;
    color: var(--color-text-light);
    
    .required {
      color: #f87171;
    }
  }
  
  input, textarea, select {
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
    
    &:disabled {
      opacity: 0.6;
    }
  }
  
  textarea {
    resize: vertical;
  }
}

.generate-code-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  
  .generate-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    
    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .loading-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
  
  .generate-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.type-options {
  display: flex;
  gap: 12px;
}

.type-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &.selected {
    border-color: #00d4aa;
    background: rgba(0, 212, 170, 0.1);
  }
  
  .type-icon {
    font-size: 1.5rem;
  }
  
  .type-label {
    font-size: 0.85rem;
    color: var(--color-text-light);
  }
}

.code-editor {
  width: 100%;
  padding: 14px;
  background: #1a1a2e;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
  color: #00d4aa;
  resize: vertical;
  min-height: 150px;
}

// DMN 편집기 섹션
.dmn-section {
  .dmn-editor-wrapper {
    width: 100%;
    height: 450px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
}

.io-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.io-group {
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.85rem;
    color: var(--color-text-light);
  }
  
  .new-field-input {
    margin-top: 8px;
  }
}

.field-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-chip {
  padding: 6px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  font-size: 0.85rem;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &.selected {
    background: rgba(167, 139, 250, 0.2);
    border-color: #a78bfa;
    color: #a78bfa;
  }
}

.test-result {
  padding: 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: 'Fira Code', monospace;
  font-size: 0.8rem;
  color: #00d4aa;
  overflow-x: auto;
  max-height: 200px;
}

.error-message {
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 0.9rem;
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  
  .spacer {
    flex: 1;
  }
  
  .test-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: rgba(167, 139, 250, 0.2);
    border: 1px solid #a78bfa;
    border-radius: 8px;
    color: #a78bfa;
    cursor: pointer;
    
    &:hover:not(:disabled) {
      background: rgba(167, 139, 250, 0.3);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  
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
    
    &:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(0, 212, 170, 0.4);
    }
    
    &:disabled {
      opacity: 0.6;
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
  
  .delete-btn {
    padding: 8px 16px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid #ef4444;
    border-radius: 8px;
    color: #ef4444;
    cursor: pointer;
    
    &:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.2);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// 삭제 확인 모달
.delete-confirm-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.delete-confirm-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  text-align: center;
  
  .delete-confirm-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
  }
  
  h3 {
    margin: 0 0 12px;
    color: #ef4444;
  }
  
  p {
    margin: 8px 0;
    color: var(--color-text-light);
    
    strong {
      color: var(--color-text-bright);
    }
  }
  
  .delete-warning {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
}

.delete-confirm-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
  
  .confirm-delete-btn {
    padding: 10px 24px;
    background: #ef4444;
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    
    &:hover:not(:disabled) {
      background: #dc2626;
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
