<template>
  <div class="schema-based-generator">
    <!-- 단계 1: 데이터 소스 선택 -->
    <div class="step-section" v-if="!selectedDatasource">
      <div class="step-header">
        <h4>📡 데이터 소스 선택</h4>
        <button
          type="button"
          class="refresh-btn"
          :disabled="loadingDatasources"
          @click="loadDatasources"
        >
          새로고침
        </button>
      </div>
      <div class="datasource-list">
        <div v-if="loadingDatasources && datasources.length === 0" class="loading-state" role="status">
          <div class="spinner"></div>
          <span>데이터 소스 로딩 중...</span>
        </div>
        <div v-if="datasourceError" class="catalog-error" role="alert">
          <span>{{ datasourceError }}</span>
          <button type="button" :disabled="loadingDatasources" @click="loadDatasources">
            다시 시도
          </button>
        </div>
        <button
          v-for="datasource in datasources"
          :key="datasource"
          type="button"
          class="datasource-item"
          :disabled="loadingDatasources"
          @click="selectDatasource(datasource)"
        >
          <span class="ds-icon">🗄️</span>
          <span class="ds-name">{{ datasource }}</span>
        </button>
        <div
          v-if="!loadingDatasources && !datasourceError && datasources.length === 0"
          class="empty-state"
          role="status"
        >
          사용 가능한 데이터 소스가 없습니다.
        </div>
      </div>
    </div>

    <!-- 단계 2: 스키마 선택 -->
    <div class="step-section" v-else-if="!selectedSchema">
      <div class="step-header">
        <button type="button" class="back-btn" @click="resetDatasourceSelection">← 뒤로</button>
        <h4>📂 스키마 선택 ({{ selectedDatasource }})</h4>
        <button
          type="button"
          class="refresh-btn"
          :disabled="loadingSchemas"
          @click="loadSchemas(selectedDatasource)"
        >
          새로고침
        </button>
      </div>
      <div class="schema-list">
        <div v-if="loadingSchemas && schemas.length === 0" class="loading-state" role="status">
          <div class="spinner"></div>
          <span>스키마 로딩 중...</span>
        </div>
        <div v-if="schemaError" class="catalog-error" role="alert">
          <span>{{ schemaError }}</span>
          <button type="button" :disabled="loadingSchemas" @click="loadSchemas(selectedDatasource)">
            다시 시도
          </button>
        </div>
        <button
          v-for="schemaName in schemas"
          :key="schemaName"
          type="button"
          class="schema-item"
          :disabled="loadingSchemas"
          @click="selectSchema(schemaName)"
        >
          <span class="schema-icon">📁</span>
          <span class="schema-name">{{ schemaName }}</span>
        </button>
        <div
          v-if="!loadingSchemas && !schemaError && schemas.length === 0"
          class="empty-state"
          role="status"
        >
          사용 가능한 스키마가 없습니다.
        </div>
      </div>
    </div>

    <!-- 단계 3: 생성 옵션 -->
    <div class="step-section" v-else>
      <div class="step-header">
        <button type="button" class="back-btn" @click="selectedSchema = ''">← 뒤로</button>
        <h4>⚙️ 온톨로지 생성 옵션</h4>
      </div>
      
      <div class="selected-info">
        <span class="info-badge">{{ selectedDatasource }}</span>
        <span class="info-separator">→</span>
        <span class="info-badge">{{ selectedSchema }}</span>
      </div>
      
      <div class="form-group">
        <label for="schema-ontology-name">온톨로지 이름</label>
        <input 
          id="schema-ontology-name"
          v-model="ontologyName" 
          :placeholder="autoName"
          class="form-input"
        />
      </div>
      
      <div class="form-group">
        <label for="schema-ontology-description">설명 (선택)</label>
        <textarea 
          id="schema-ontology-description"
          v-model="ontologyDescription" 
          placeholder="온톨로지에 대한 설명..."
          class="form-textarea"
        ></textarea>
      </div>
      
      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" v-model="inferCausalRelations" />
          인과관계 자동 추론
        </label>
      </div>
      
      <div class="form-group">
        <label for="schema-domain-context">도메인 힌트 (선택)</label>
        <input 
          id="schema-domain-context"
          v-model="domainContext" 
          placeholder="예: 제조업, 공급망 관리..."
          class="form-input"
        />
      </div>
      
      <div v-if="error" class="error-message" role="alert">
        {{ error }}
      </div>
      
      <div v-if="generationResult" class="success-message">
        ✅ 온톨로지 생성 완료
        <template v-if="generationResult.tablesProcessed !== undefined">
          · {{ generationResult.tablesProcessed }}개 테이블 처리
        </template>
      </div>
      
      <div class="action-buttons">
        <button type="button" class="cancel-btn" @click="$emit('cancel')">취소</button>
        <button 
          type="button"
          class="generate-btn" 
          @click="generateOntology"
          :disabled="isGenerating"
        >
          <span v-if="isGenerating">생성 중...</span>
          <span v-else>🚀 온톨로지 생성</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useOntologyStore } from '@/domains/ontology'
import type { OntologySchema } from '@/domains/ontology'
import {
  generateOntologyFromDatasource,
  loadOntologySourceDatasources,
  loadOntologySourceSchemas,
} from '../application/ontologyDataGateway'

const emit = defineEmits<{
  generated: [schema: OntologySchema]
  cancel: []
}>()
const store = useOntologyStore()

// 상태
const datasources = ref<string[]>([])
const schemas = ref<string[]>([])
const selectedDatasource = ref('')
const selectedSchema = ref('')
const ontologyName = ref('')
const ontologyDescription = ref('')
const inferCausalRelations = ref(true)
const domainContext = ref('')
const loadingDatasources = ref(false)
const loadingSchemas = ref(false)
const datasourceError = ref<string | null>(null)
const schemaError = ref<string | null>(null)
const isGenerating = ref(false)
const error = ref<string | null>(null)
const generationResult = ref<{
  tablesProcessed?: number
  relationshipsInferred?: number
} | null>(null)
let schemaRequestId = 0

const autoName = computed(() => 
  selectedSchema.value ? `${selectedSchema.value.charAt(0).toUpperCase() + selectedSchema.value.slice(1)} Ontology` : ''
)

// 데이터 소스 목록 로드
onMounted(async () => {
  await loadDatasources()
})

async function loadDatasources() {
  if (loadingDatasources.value) return
  loadingDatasources.value = true
  datasourceError.value = null
  try {
    datasources.value = [...await loadOntologySourceDatasources()]
  } catch (cause) {
    datasourceError.value = cause instanceof Error
      ? cause.message
      : '데이터 소스 로드 실패'
  } finally {
    loadingDatasources.value = false
  }
}

async function loadSchemas(datasource: string) {
  if (!datasource) return
  const requestId = ++schemaRequestId
  loadingSchemas.value = true
  schemaError.value = null
  try {
    const response = await loadOntologySourceSchemas(datasource)
    if (
      requestId !== schemaRequestId
      || datasource !== selectedDatasource.value
    ) return
    schemas.value = [...response]
  } catch (cause) {
    if (requestId !== schemaRequestId) return
    schemaError.value = cause instanceof Error
      ? cause.message
      : '스키마 로드 실패'
  } finally {
    if (requestId === schemaRequestId) {
      loadingSchemas.value = false
    }
  }
}

function selectDatasource(datasource: string) {
  schemaRequestId += 1
  selectedDatasource.value = datasource
  selectedSchema.value = ''
  schemas.value = []
  schemaError.value = null
  ontologyName.value = ''
  void loadSchemas(datasource)
}

function resetDatasourceSelection() {
  schemaRequestId += 1
  selectedDatasource.value = ''
  selectedSchema.value = ''
  schemas.value = []
  schemaError.value = null
  loadingSchemas.value = false
}

function selectSchema(schema: string) {
  selectedSchema.value = schema
}

async function generateOntology() {
  if (!selectedDatasource.value || !selectedSchema.value) return
  
  isGenerating.value = true
  error.value = null
  generationResult.value = null
  
  try {
    const requestBody = {
      schemaName: selectedSchema.value,
      dbName: selectedDatasource.value,
      ontologyName: ontologyName.value || autoName.value,
      ontologyDescription: ontologyDescription.value || undefined,
      inferCausalRelations: inferCausalRelations.value,
      domainContext: domainContext.value || undefined
    }
    
    const data = await generateOntologyFromDatasource(requestBody)

    if (!data.success) {
      throw new Error(data.error || '온톨로지 생성에 실패했습니다')
    }
    if (!data.schema) {
      throw new Error('온톨로지 생성 응답에 적용할 스키마가 없습니다')
    }
    
    generationResult.value = {
      tablesProcessed: data.tablesProcessed,
      relationshipsInferred: data.relationshipsInferred
    }
    
    // 스토어에 스키마 적용 및 부모에 전달
    store.applySchema(data.schema)
    emit('generated', data.schema)
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '온톨로지 생성 실패'
  } finally {
    isGenerating.value = false
  }
}
</script>

<style scoped>
.schema-based-generator {
  padding: 16px;
}

.step-section h4 {
  margin: 0 0 16px;
  color: var(--color-text);
  font-size: 1rem;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.step-header h4 {
  margin: 0;
  flex: 1;
}

.back-btn,
.refresh-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.85rem;
}

.back-btn:hover,
.refresh-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.refresh-btn:disabled,
.datasource-item:disabled,
.schema-item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.back-btn:focus-visible,
.refresh-btn:focus-visible,
.datasource-item:focus-visible,
.schema-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  color: var(--color-text-muted);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.datasource-list,
.schema-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.datasource-item,
.schema-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: inherit;
  font: inherit;
  text-align: left;
}

.datasource-item:hover:not(:disabled),
.schema-item:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.ds-icon,
.schema-icon {
  font-size: 1.2rem;
}

.ds-name,
.schema-name {
  flex: 1;
  font-weight: 500;
  color: var(--color-text);
}

.catalog-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
  font-size: 0.85rem;
}

.catalog-error span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.catalog-error button {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.empty-state {
  padding: 24px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  color: var(--color-text-muted);
  text-align: center;
}

.selected-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding: 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
}

.info-badge {
  padding: 4px 10px;
  background: var(--color-accent);
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  color: white;
}

.info-separator {
  color: var(--color-text-muted);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-light);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-bright);
  font-size: 0.9rem;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

.form-textarea {
  min-height: 80px;
  resize: vertical;
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-muted);
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.error-message {
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: var(--color-error);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.success-message {
  padding: 12px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 6px;
  color: var(--color-success);
  font-size: 0.85rem;
  margin-bottom: 16px;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.cancel-btn {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  cursor: pointer;
}

.generate-btn {
  padding: 10px 24px;
  background: var(--color-accent);
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.generate-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
