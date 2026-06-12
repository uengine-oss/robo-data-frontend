<script setup lang="ts">
/**
 * TestCaseModal.vue
 * 테스트 케이스 추가 모달
 */
import { ref, computed } from 'vue'
import { IconX, IconSearch, IconEdit } from '@/components/icons'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create', testCase: any): void
}>()

// 테스트 레벨 선택
type TestLevel = 'table' | 'column' | 'dimension'
const selectedLevel = ref<TestLevel>('table')

// 테이블 선택
const selectedTable = ref('')

// 테스트 유형
const testTypeSearch = ref('')
const selectedTestType = ref('')

// 테스트 유형 목록
const testTypes = ref([
  {
    id: 'table_column_count_between',
    name: 'Table Column Count To Be Between',
    description: 'This schema defines the test TableColumnCountToBeBetween. Test the number of columns to be between min max value.'
  },
  {
    id: 'table_column_count_equal',
    name: 'Table Column Count To Equal',
    description: 'This test defines the test TableColumnCountToEqual. Test the number of columns equal to a value.'
  },
  {
    id: 'table_column_name_exist',
    name: 'Table Column Name To Exist',
    description: 'This test defines the test TableColumnNameToExist. Test the table columns exists in the table.'
  },
  {
    id: 'table_column_names_match_set',
    name: 'Table Column Names To Match Set',
    description: 'This test defines the test TableColumnToMatchSet. Test the table columns match a set of values. Unordered by default.'
  },
  {
    id: 'custom_sql_query',
    name: 'Custom SQL Query',
    description: 'Test if a custom SQL returns 0 row or `COUNT(<x>) == 0`'
  }
])

// 태그 및 용어
const selectedTags = ref<string[]>([])
const selectedTerms = ref<string[]>([])

// 필터링된 테스트 유형
const filteredTestTypes = computed(() => {
  if (!testTypeSearch.value) return testTypes.value
  const query = testTypeSearch.value.toLowerCase()
  return testTypes.value.filter(t => 
    t.name.toLowerCase().includes(query) || 
    t.description.toLowerCase().includes(query)
  )
})

// 사용자 정의 쿼리 모드
const isCustomQuery = ref(false)

const toggleCustomQuery = () => {
  isCustomQuery.value = !isCustomQuery.value
  if (isCustomQuery.value) {
    selectedTestType.value = 'custom_sql_query'
  }
}

const handleCreate = () => {
  emit('create', {
    level: selectedLevel.value,
    table: selectedTable.value,
    testType: selectedTestType.value,
    tags: selectedTags.value,
    terms: selectedTerms.value
  })
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <!-- 헤더 -->
      <header class="modal-header">
        <h2>테스트 케이스 추가</h2>
        <button class="close-btn" @click="emit('close')">
          <IconX :size="20" />
        </button>
      </header>

      <div class="modal-body">
        <div class="form-content">
          <!-- 테스트 레벨 선택 -->
          <div class="form-section">
            <label class="section-label required">테스트를 수행할 요소를 선택하세요</label>
            <div class="level-options">
              <button 
                class="level-option" 
                :class="{ active: selectedLevel === 'table' }"
                @click="selectedLevel = 'table'"
              >
                <span class="level-icon">🏢</span>
                <div class="level-info">
                  <span class="level-name">테이블 레벨</span>
                  <span class="level-desc">테이블 에 적용된 테스트</span>
                </div>
              </button>
              
              <button 
                class="level-option" 
                :class="{ active: selectedLevel === 'column' }"
                @click="selectedLevel = 'column'"
              >
                <span class="level-icon">📊</span>
                <div class="level-info">
                  <span class="level-name">컬럼 레벨</span>
                  <span class="level-desc">열 에 적용된 테스트</span>
                </div>
              </button>
              
              <button 
                class="level-option beta" 
                :class="{ active: selectedLevel === 'dimension' }"
                @click="selectedLevel = 'dimension'"
              >
                <span class="beta-badge">베타</span>
                <span class="level-icon">📐</span>
                <div class="level-info">
                  <span class="level-name">Dimension Level</span>
                  <span class="level-desc">Column with dimension</span>
                </div>
              </button>
            </div>
          </div>

          <!-- 테이블 선택 -->
          <div class="form-section">
            <label class="section-label required">테이블 선택</label>
            <select v-model="selectedTable" class="form-select">
              <option value="">테이블 선택</option>
              <option value="customer_360">customer_360</option>
              <option value="orders">orders</option>
              <option value="products">products</option>
            </select>
          </div>

          <!-- 테스트 유형 선택 -->
          <div class="form-section">
            <div class="section-header">
              <label class="section-label required">테스트 유형 선택</label>
              <button class="custom-query-btn" @click="toggleCustomQuery">
                <IconEdit :size="14" />
                사용자 정의 쿼리
              </button>
            </div>
            
            <div class="test-type-search">
              <IconSearch :size="16" />
              <input 
                type="text" 
                v-model="testTypeSearch" 
                placeholder="테스트 유형 선택"
              />
            </div>
            
            <div class="test-type-list">
              <button
                v-for="type in filteredTestTypes"
                :key="type.id"
                class="test-type-item"
                :class="{ active: selectedTestType === type.id }"
                @click="selectedTestType = type.id"
              >
                <span class="test-type-name">{{ type.name }}</span>
                <span class="test-type-desc">{{ type.description }}</span>
              </button>
            </div>
          </div>

          <!-- 태그들 -->
          <div class="form-section">
            <label class="section-label">태그들</label>
            <select class="form-select">
              <option value="">태그들 선택</option>
            </select>
          </div>

          <!-- 용어들 -->
          <div class="form-section">
            <label class="section-label">용어들</label>
            <select class="form-select">
              <option value="">용어들 선택</option>
            </select>
          </div>
        </div>

        <!-- 가이드 패널 -->
        <aside class="guide-panel">
          <div class="guide-section">
            <h4>Test Type</h4>
            <p>Choose the type of test to apply based on your data quality requirements. Available test types depend on whether you selected table-level or column-level testing. Each test type has specific parameters and validation rules designed to check different aspects of data quality.</p>
            <p>Common test types include:</p>
            <ul>
              <li>Value validation tests</li>
              <li>Uniqueness checks</li>
              <li>Null checks</li>
              <li>Pattern matching</li>
              <li>Range validations</li>
              <li>Custom SQL queries</li>
            </ul>
          </div>
          
          <div class="guide-section">
            <h4>Name</h4>
            <p>Provide a unique name for your test case. The name should be descriptive and follow these guidelines:</p>
            <ul>
              <li>Must start with a letter</li>
              <li>Can contain letters, numbers, and underscores</li>
            </ul>
          </div>
        </aside>
      </div>

      <!-- 푸터 -->
      <footer class="modal-footer">
        <button class="btn btn--secondary" @click="emit('close')">취소</button>
        <button class="btn btn--primary" @click="handleCreate">생성</button>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

.modal {
  width: 95%;
  max-width: 1100px;
  max-height: 90vh;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  
  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-bright);
  }
}

.modal-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 320px;
  overflow: hidden;
}

.form-content {
  padding: var(--spacing-lg);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  
  &.required::after {
    content: ' *';
    color: var(--color-error);
  }
}

.level-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
}

.level-option {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  position: relative;
  
  &:hover {
    border-color: var(--color-accent);
    background: var(--color-bg-elevated);
  }
  
  &.active {
    border-color: var(--color-accent);
    background: rgba(34, 139, 230, 0.1);
    
    &::after {
      content: '✓';
      position: absolute;
      top: 8px;
      right: 8px;
      width: 20px;
      height: 20px;
      background: var(--color-accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
  }
  
  &.beta {
    .beta-badge {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--color-error);
      color: white;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-size: 10px;
      font-weight: 600;
    }
  }
}

.level-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.level-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.level-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent);
}

.level-desc {
  font-size: 12px;
  color: var(--color-text-light);
}

.form-select {
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.custom-query-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: var(--color-accent);
  font-size: 13px;
  cursor: pointer;
  
  &:hover {
    text-decoration: underline;
  }
}

.test-type-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  
  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-size: 14px;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
    }
  }
  
  svg {
    color: var(--color-text-muted);
  }
}

.test-type-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}

.test-type-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: var(--spacing-md);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
  
  &:last-child {
    border-bottom: none;
  }
  
  &:hover {
    background: var(--color-bg-elevated);
  }
  
  &.active {
    background: rgba(34, 139, 230, 0.1);
    
    .test-type-name {
      color: var(--color-accent);
    }
  }
}

.test-type-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.test-type-desc {
  font-size: 12px;
  color: var(--color-text-light);
}

.guide-panel {
  padding: var(--spacing-lg);
  background: var(--color-bg-tertiary);
  border-left: 1px solid var(--color-border);
  overflow-y: auto;
}

.guide-section {
  margin-bottom: var(--spacing-lg);
  padding-left: var(--spacing-md);
  border-left: 3px solid var(--color-accent);
  
  h4 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin-bottom: var(--spacing-sm);
  }
  
  p {
    font-size: 13px;
    color: var(--color-text-light);
    line-height: 1.6;
    margin-bottom: var(--spacing-sm);
  }
  
  ul {
    margin: 0;
    padding-left: var(--spacing-md);
    
    li {
      font-size: 13px;
      color: var(--color-text-light);
      line-height: 1.8;
    }
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>



