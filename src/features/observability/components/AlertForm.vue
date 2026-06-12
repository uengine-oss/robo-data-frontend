<script setup lang="ts">
/**
 * AlertForm.vue
 * 알림 생성/편집 폼
 */
import { ref } from 'vue'
import { IconPlus } from '@/components/icons'

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'save', data: any): void
}>()

// 폼 데이터
const alertName = ref('')
const alertDescription = ref('')
const sources = ref<string[]>([])
const filters = ref<any[]>([])
const triggers = ref<string[]>([])
const destinations = ref<any[]>([])

// 타임아웃 설정
const connectTimeout = ref(10)
const readTimeout = ref(12)

// 소스 추가
const addSource = () => {
  // 실제로는 모달을 열어 소스를 선택
  console.log('Add source')
}

// 필터 추가
const addFilter = () => {
  console.log('Add filter')
}

// 트리거 추가
const addTrigger = () => {
  console.log('Add trigger')
}

// 목적지 추가
const addDestination = () => {
  console.log('Add destination')
}

// 저장
const handleSave = () => {
  emit('save', {
    name: alertName.value,
    description: alertDescription.value,
    sources: sources.value,
    filters: filters.value,
    triggers: triggers.value,
    destinations: destinations.value,
    connectTimeout: connectTimeout.value,
    readTimeout: readTimeout.value
  })
}
</script>

<template>
  <div class="alert-form">
    <!-- 브레드크럼 -->
    <nav class="breadcrumb">
      <a href="#" @click.prevent="emit('cancel')">관찰 가능성</a>
      <span>/</span>
      <a href="#" @click.prevent="emit('cancel')">알림들</a>
      <span>/</span>
      <span class="current">알림 생성</span>
    </nav>

    <!-- 헤더 -->
    <header class="form-header">
      <h1>알림 추가</h1>
      <p>웹훅을 사용하여 시기적절한 알림으로 최신 정보를 유지하세요.</p>
    </header>

    <!-- 폼 본문 -->
    <div class="form-body">
      <!-- 이름 -->
      <div class="form-section">
        <label class="section-label required">이름</label>
        <input 
          type="text" 
          v-model="alertName" 
          placeholder="이름"
          class="form-input"
        />
      </div>

      <!-- 설명 -->
      <div class="form-section">
        <label class="section-label">설명</label>
        <div class="rich-editor">
          <div class="editor-toolbar">
            <button class="toolbar-btn" title="Bold"><b>B</b></button>
            <button class="toolbar-btn" title="Italic"><i>I</i></button>
            <button class="toolbar-btn" title="Strikethrough"><s>S</s></button>
            <span class="toolbar-divider"></span>
            <button class="toolbar-btn" title="Code">&lt;&gt;</button>
            <span class="toolbar-divider"></span>
            <button class="toolbar-btn" title="Bullet List">•</button>
            <button class="toolbar-btn" title="Numbered List">1.</button>
            <span class="toolbar-divider"></span>
            <button class="toolbar-btn" title="Link">🔗</button>
            <button class="toolbar-btn" title="Image">🖼</button>
            <button class="toolbar-btn" title="Code Block">&lt;/&gt;</button>
            <button class="toolbar-btn" title="Quote">"</button>
            <button class="toolbar-btn" title="Divider">—</button>
          </div>
          <textarea 
            v-model="alertDescription" 
            placeholder="알림에 대한 설명을 입력하세요..."
            class="editor-content"
          ></textarea>
        </div>
      </div>

      <!-- 소스 -->
      <div class="form-section card">
        <div class="section-header">
          <h3>소스</h3>
          <p class="section-desc">알림을 활성화할 소스를 지정하세요.</p>
        </div>
        <button class="btn btn--primary btn--sm" @click="addSource">
          <IconPlus :size="14" />
          소스 추가
        </button>
      </div>

      <!-- 필터들 -->
      <div class="form-section card">
        <div class="section-header">
          <h3>필터들</h3>
          <p class="section-desc">알림의 범위를 좁히기 위해 변경 이벤트를 지정하세요.</p>
        </div>
        <button class="btn btn--secondary btn--sm" @click="addFilter">
          <IconPlus :size="14" />
          필터 추가
        </button>
      </div>

      <!-- 트리거 -->
      <div class="form-section card">
        <div class="section-header">
          <h3>트리거</h3>
          <p class="section-desc">'스키마 변경' 또는 '테스트 실패'와 같은 중요한 트리거 이벤트를 선택하여 알림을 생성하세요.</p>
        </div>
        <button class="btn btn--secondary btn--sm" @click="addTrigger">
          <IconPlus :size="14" />
          트리거 추가
        </button>
      </div>

      <!-- 목적지 -->
      <div class="form-section card">
        <div class="section-header">
          <h3>목적지</h3>
          <p class="section-desc">Slack, MS Teams, 이메일로 알림을 보내거나 웹훅을 사용하세요.</p>
        </div>
        
        <div class="timeout-settings">
          <div class="timeout-row">
            <label>연결 시간 초과 (초)</label>
            <span>:</span>
            <input type="number" v-model="connectTimeout" class="timeout-input" />
          </div>
          <div class="timeout-row">
            <label>시간 초과 읽기 (초)</label>
            <span>:</span>
            <input type="number" v-model="readTimeout" class="timeout-input" />
          </div>
        </div>
        
        <div class="destination-actions">
          <button class="btn btn--primary btn--sm" @click="addDestination">
            <IconPlus :size="14" />
            목적지 추가
          </button>
          <button class="btn btn--secondary btn--sm">
            대상 테스트
          </button>
        </div>
      </div>
    </div>

    <!-- 푸터 -->
    <footer class="form-footer">
      <button class="btn btn--secondary" @click="emit('cancel')">취소</button>
      <button class="btn btn--primary" @click="handleSave">저장</button>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.alert-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  
  a {
    color: var(--color-text-light);
    text-decoration: none;
    
    &:hover {
      color: var(--color-accent);
    }
  }
  
  span {
    color: var(--color-text-muted);
  }
  
  .current {
    color: var(--color-text);
  }
}

.form-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  
  h1 {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin-bottom: 4px;
  }
  
  p {
    font-size: 14px;
    color: var(--color-text-light);
  }
}

.form-body {
  flex: 1;
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
  
  &.card {
    padding: var(--spacing-lg);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }
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

.section-header {
  margin-bottom: var(--spacing-md);
  
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin-bottom: 4px;
  }
  
  .section-desc {
    font-size: 13px;
    color: var(--color-text-light);
  }
}

.form-input {
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 14px;
  
  &::placeholder {
    color: var(--color-text-muted);
  }
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.rich-editor {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  font-size: 12px;
  cursor: pointer;
  
  &:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text);
  }
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
  margin: 0 4px;
}

.editor-content {
  width: 100%;
  min-height: 150px;
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border: none;
  color: var(--color-text);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  
  &::placeholder {
    color: var(--color-text-muted);
  }
  
  &:focus {
    outline: none;
  }
}

.timeout-settings {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.timeout-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  
  label {
    font-size: 13px;
    color: var(--color-text-light);
    min-width: 150px;
  }
  
  span {
    color: var(--color-text-muted);
  }
}

.timeout-input {
  flex: 1;
  padding: 8px 12px;
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

.destination-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}
</style>



