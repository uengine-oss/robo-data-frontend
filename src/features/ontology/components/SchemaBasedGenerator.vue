<template>
  <div class="schema-based-generator">
    <!-- 단계 1: 데이터 소스 선택 -->
    <div class="step-section" v-if="!selectedDatasource">
      <h4>📡 데이터 소스 선택</h4>
      <div class="datasource-list">
        <div v-if="loadingDatasources" class="loading-state">
          <div class="spinner"></div>
          <span>데이터 소스 로딩 중...</span>
        </div>
        <div 
          v-else
          v-for="ds in datasources" 
          :key="ds.name"
          class="datasource-item"
          @click="selectDatasource(ds.name)"
        >
          <span class="ds-icon">🗄️</span>
          <span class="ds-name">{{ ds.name }}</span>
          <span class="ds-type">{{ ds.type || 'Database' }}</span>
        </div>
      </div>
    </div>

    <!-- 단계 2: 스키마 선택 -->
    <div class="step-section" v-else-if="!selectedSchema">
      <div class="step-header">
        <button class="back-btn" @click="selectedDatasource = ''">← 뒤로</button>
        <h4>📂 스키마 선택 ({{ selectedDatasource }})</h4>
      </div>
      <div class="schema-list">
        <div v-if="loadingSchemas" class="loading-state">
          <div class="spinner"></div>
          <span>스키마 로딩 중...</span>
        </div>
        <div 
          v-else
          v-for="schema in schemas" 
          :key="schema.name"
          class="schema-item"
          @click="selectSchema(schema.name)"
        >
          <span class="schema-icon">📁</span>
          <span class="schema-name">{{ schema.name }}</span>
          <span class="table-count">{{ schema.tableCount || 0 }}개 테이블</span>
        </div>
      </div>
    </div>

    <!-- 단계 3: 생성 옵션 -->
    <div class="step-section" v-else>
      <div class="step-header">
        <button class="back-btn" @click="selectedSchema = ''">← 뒤로</button>
        <h4>⚙️ 온톨로지 생성 옵션</h4>
      </div>
      
      <div class="selected-info">
        <span class="info-badge">{{ selectedDatasource }}</span>
        <span class="info-separator">→</span>
        <span class="info-badge">{{ selectedSchema }}</span>
      </div>
      
      <div class="form-group">
        <label>온톨로지 이름</label>
        <input 
          v-model="ontologyName" 
          :placeholder="autoName"
          class="form-input"
        />
      </div>
      
      <div class="form-group">
        <label>설명 (선택)</label>
        <textarea 
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
        <label>도메인 힌트 (선택)</label>
        <input 
          v-model="domainContext" 
          placeholder="예: 제조업, 공급망 관리..."
          class="form-input"
        />
      </div>
      
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      
      <div v-if="generationResult" class="success-message">
        ✅ {{ generationResult.tablesProcessed }}개 테이블에서 온톨로지 생성 완료
      </div>
      
      <div class="action-buttons">
        <button class="cancel-btn" @click="$emit('cancel')">취소</button>
        <button 
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
import { ref, computed, onMounted, watch } from 'vue'
import { useOntologyStore } from '@/features/ontology/ontology'
import { text2sqlApi } from '@/features/text2sql/api'
import { objectExplorerApi } from '@/features/object-explorer/api'

const emit = defineEmits(['generated', 'cancel'])
const store = useOntologyStore()

// 상태
const datasources = ref<Array<{ name: string; type?: string }>>([])
const schemas = ref<Array<{ name: string; tableCount?: number }>>([])
const selectedDatasource = ref('')
const selectedSchema = ref('')
const ontologyName = ref('')
const ontologyDescription = ref('')
const inferCausalRelations = ref(true)
const domainContext = ref('')
const loadingDatasources = ref(false)
const loadingSchemas = ref(false)
const isGenerating = ref(false)
const error = ref<string | null>(null)
const generationResult = ref<{ tablesProcessed: number; relationshipsInferred: number } | null>(null)

const autoName = computed(() => 
  selectedSchema.value ? `${selectedSchema.value.charAt(0).toUpperCase() + selectedSchema.value.slice(1)} Ontology` : ''
)

// 데이터 소스 목록 로드
onMounted(async () => {
  await loadDatasources()
})

async function loadDatasources() {
  loadingDatasources.value = true
  try {
    const data = await text2sqlApi.getDatasources()
    // API가 문자열 배열을 반환하므로 객체 배열로 변환
    if (Array.isArray(data)) {
      datasources.value = data.map((ds: string | { name: string }) =>
        typeof ds === 'string' ? { name: ds, type: 'Database' } : ds
      )
    } else {
      datasources.value = data
    }
  } catch (err) {
    console.error('데이터 소스 로드 실패:', err)
  } finally {
    loadingDatasources.value = false
  }
}

// 데이터 소스 선택 시 스키마 로드
watch(selectedDatasource, async (ds) => {
  if (!ds) {
    schemas.value = []
    return
  }
  
  loadingSchemas.value = true
  try {
    const data = await text2sqlApi.getDatasourceSchemas(ds)
    // API가 문자열 배열을 반환하므로 객체 배열로 변환
    if (Array.isArray(data)) {
      schemas.value = data.map((s: string | { name: string }) =>
        typeof s === 'string' ? { name: s } : s
      )
    } else {
      schemas.value = data
    }
  } catch (err) {
    console.error('스키마 로드 실패:', err)
  } finally {
    loadingSchemas.value = false
  }
})

function selectDatasource(ds: string) {
  selectedDatasource.value = ds
  ontologyName.value = ''
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
    
    const data = await objectExplorerApi.generateFromSchema(requestBody)

    if (!data.success) {
      throw new Error(data.error || '온톨로지 생성에 실패했습니다')
    }
    
    generationResult.value = {
      tablesProcessed: data.tablesProcessed,
      relationshipsInferred: data.relationshipsInferred
    }
    
    // 스토어에 스키마 적용 및 부모에 전달
    if (data.schema) {
      store.applySchema(data.schema)
      emit('generated', data.schema)
    }
    
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
}

.back-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.85rem;
}

.back-btn:hover {
  background: var(--color-bg-hover);
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
}

.datasource-item:hover,
.schema-item:hover {
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

.ds-type,
.table-count {
  font-size: 0.8rem;
  color: var(--color-text-muted);
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
