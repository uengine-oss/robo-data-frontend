<script setup lang="ts">
/**
 * GlossaryModal.vue
 * 용어집 생성/수정 모달
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { glossaryApi, type Glossary } from '@/services/api'
import { IconX } from '@/components/icons'

const props = defineProps<{
  glossary?: Glossary | null
}>()

const emit = defineEmits<{
  close: []
  saved: [glossary: Glossary]
}>()

const sessionStore = useSessionStore()

// 폼 데이터
const formData = ref({
  name: '',
  description: '',
  type: 'Business'
})

// 상태
const loading = ref(false)
const error = ref<string | null>(null)

// 편집 모드 여부
const isEditMode = computed(() => !!props.glossary)
const modalTitle = computed(() => isEditMode.value ? '용어집 수정' : '새 용어집 만들기')

// 유형 옵션
const typeOptions = [
  { value: 'Business', label: '비즈니스 용어집', color: '#3b82f6' },
  { value: 'Technical', label: '기술 용어집', color: '#8b5cf6' },
  { value: 'DataQuality', label: '데이터 품질 용어집', color: '#10b981' }
]

// 폼 초기화
const initForm = () => {
  if (props.glossary) {
    formData.value = {
      name: props.glossary.name,
      description: props.glossary.description || '',
      type: props.glossary.type || 'Business'
    }
  } else {
    formData.value = {
      name: '',
      description: '',
      type: 'Business'
    }
  }
}

// 저장
const save = async () => {
  if (!formData.value.name.trim()) {
    error.value = '용어집 이름을 입력해주세요.'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    const headers = sessionStore.getHeaders()
    
    if (isEditMode.value && props.glossary) {
      await glossaryApi.updateGlossary(headers, props.glossary.id, {
        name: formData.value.name,
        description: formData.value.description,
        type: formData.value.type
      })
      
      emit('saved', {
        ...props.glossary,
        name: formData.value.name,
        description: formData.value.description,
        type: formData.value.type
      })
    } else {
      const result = await glossaryApi.createGlossary(headers, {
        name: formData.value.name,
        description: formData.value.description,
        type: formData.value.type
      })
      
      emit('saved', {
        id: result.id,
        name: result.name,
        description: formData.value.description,
        type: formData.value.type,
        termCount: 0
      })
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '저장에 실패했습니다.'
  } finally {
    loading.value = false
  }
}

// 초기화
onMounted(() => {
  initForm()
})

watch(() => props.glossary, () => {
  initForm()
})
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-container">
      <header class="modal-header">
        <h2>{{ modalTitle }}</h2>
        <button class="btn-close" @click="emit('close')">
          <IconX :size="20" />
        </button>
      </header>
      
      <div class="modal-body">
        <div v-if="error" class="error-message">{{ error }}</div>
        
        <div class="form-group">
          <label for="name">용어집 이름 <span class="required">*</span></label>
          <input
            id="name"
            v-model="formData.name"
            type="text"
            placeholder="예: Business_Glossary, Technical_Glossary"
            autofocus
          />
        </div>
        
        <div class="form-group">
          <label for="type">유형</label>
          <div class="type-options">
            <label
              v-for="opt in typeOptions"
              :key="opt.value"
              class="type-option"
              :class="{ selected: formData.type === opt.value }"
            >
              <input
                type="radio"
                :value="opt.value"
                v-model="formData.type"
              />
              <span class="type-indicator" :style="{ background: opt.color }"></span>
              <span class="type-label">{{ opt.label }}</span>
            </label>
          </div>
        </div>
        
        <div class="form-group">
          <label for="description">설명</label>
          <textarea
            id="description"
            v-model="formData.description"
            placeholder="용어집에 대한 설명을 입력하세요..."
            rows="4"
          ></textarea>
        </div>
      </div>
      
      <footer class="modal-footer">
        <button class="btn-secondary" @click="emit('close')" :disabled="loading">
          취소
        </button>
        <button class="btn-primary" @click="save" :disabled="loading">
          {{ loading ? '저장 중...' : (isEditMode ? '수정' : '만들기') }}
        </button>
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-container {
  width: 480px;
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  
  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
}

.modal-body {
  padding: 24px;
}

.error-message {
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 20px;
  
  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: 8px;
  }
  
  .required {
    color: #ef4444;
  }
  
  input, textarea {
    width: 100%;
    padding: 10px 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 14px;
    color: var(--color-text);
    transition: border-color 0.15s ease;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    
    &::placeholder {
      color: var(--color-text-light);
    }
  }
  
  textarea {
    resize: vertical;
    min-height: 100px;
  }
}

.type-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  
  input {
    display: none;
  }
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-bg);
  }
}

.type-indicator {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.type-label {
  font-size: 14px;
  color: var(--color-text);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-bg-secondary);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-primary {
  padding: 10px 20px;
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>



