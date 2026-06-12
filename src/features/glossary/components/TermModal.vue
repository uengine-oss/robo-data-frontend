<script setup lang="ts">
/**
 * TermModal.vue
 * 용어 생성/수정 모달
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { glossaryApi, type Term, type GlossaryDomain, type GlossaryOwner, type GlossaryTag } from '@/services/api'
import { IconX, IconPlus } from '@/shared/icons'

const props = defineProps<{
  glossaryId: string
  term?: Term | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const sessionStore = useSessionStore()

// 폼 데이터
const formData = ref({
  name: '',
  description: '',
  status: 'Draft',
  synonyms: [] as string[],
  domains: [] as string[],
  owners: [] as string[],
  reviewers: [] as string[],
  tags: [] as string[]
})

// 메타데이터
const availableDomains = ref<GlossaryDomain[]>([])
const availableOwners = ref<GlossaryOwner[]>([])
const availableTags = ref<GlossaryTag[]>([])

// 상태
const loading = ref(false)
const error = ref<string | null>(null)
const newSynonym = ref('')
const newDomain = ref('')
const newOwner = ref('')
const newReviewer = ref('')
const newTag = ref('')

// 편집 모드 여부
const isEditMode = computed(() => !!props.term)
const modalTitle = computed(() => isEditMode.value ? '용어 수정' : '새 용어 추가')

// 상태 옵션
const statusOptions = [
  { value: 'Draft', label: '초안' },
  { value: 'Pending', label: '검토중' },
  { value: 'Approved', label: '승인됨' },
  { value: 'Deprecated', label: '폐기됨' }
]

const extractNames = (items: unknown): string[] => {
  if (!Array.isArray(items)) return []

  return items.flatMap(item => {
    if (typeof item === 'string') {
      const value = item.trim()
      return value ? [value] : []
    }

    if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') {
      const value = item.name.trim()
      return value ? [value] : []
    }

    return []
  })
}

// 메타데이터 로드
const loadMetadata = async () => {
  try {
    const headers = sessionStore.getHeaders()
    const [domainsRes, ownersRes, tagsRes] = await Promise.all([
      glossaryApi.getDomains(headers),
      glossaryApi.getOwners(headers),
      glossaryApi.getTags(headers)
    ])
    availableDomains.value = domainsRes.domains
    availableOwners.value = ownersRes.owners
    availableTags.value = tagsRes.tags
  } catch (e) {
    console.error('메타데이터 로드 실패:', e)
  }
}

// 폼 초기화
const initForm = () => {
  if (props.term) {
    formData.value = {
      name: props.term.name,
      description: props.term.description || '',
      status: props.term.status,
      synonyms: [...(props.term.synonyms || [])],
      domains: extractNames(props.term.domains),
      owners: extractNames(props.term.owners),
      reviewers: extractNames(props.term.reviewers),
      tags: extractNames(props.term.tags)
    }
  } else {
    formData.value = {
      name: '',
      description: '',
      status: 'Draft',
      synonyms: [],
      domains: [],
      owners: [],
      reviewers: [],
      tags: []
    }
  }
}

// 동의어 추가
const addSynonym = () => {
  if (newSynonym.value.trim() && !formData.value.synonyms.includes(newSynonym.value.trim())) {
    formData.value.synonyms.push(newSynonym.value.trim())
    newSynonym.value = ''
  }
}

// 동의어 삭제
const removeSynonym = (index: number) => {
  formData.value.synonyms.splice(index, 1)
}

// 도메인 추가
const addDomain = () => {
  if (newDomain.value.trim() && !formData.value.domains.includes(newDomain.value.trim())) {
    formData.value.domains.push(newDomain.value.trim())
    newDomain.value = ''
  }
}

// 도메인 삭제
const removeDomain = (index: number) => {
  formData.value.domains.splice(index, 1)
}

// 소유자 추가
const addOwner = () => {
  if (newOwner.value.trim() && !formData.value.owners.includes(newOwner.value.trim())) {
    formData.value.owners.push(newOwner.value.trim())
    newOwner.value = ''
  }
}

// 소유자 삭제
const removeOwner = (index: number) => {
  formData.value.owners.splice(index, 1)
}

// 검토자 추가
const addReviewer = () => {
  if (newReviewer.value.trim() && !formData.value.reviewers.includes(newReviewer.value.trim())) {
    formData.value.reviewers.push(newReviewer.value.trim())
    newReviewer.value = ''
  }
}

// 검토자 삭제
const removeReviewer = (index: number) => {
  formData.value.reviewers.splice(index, 1)
}

// 태그 추가
const addTag = () => {
  if (newTag.value.trim() && !formData.value.tags.includes(newTag.value.trim())) {
    formData.value.tags.push(newTag.value.trim())
    newTag.value = ''
  }
}

// 태그 삭제
const removeTag = (index: number) => {
  formData.value.tags.splice(index, 1)
}

// 저장
const save = async () => {
  if (!formData.value.name.trim()) {
    error.value = '용어 이름을 입력해주세요.'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    const headers = sessionStore.getHeaders()
    
    if (isEditMode.value && props.term) {
      await glossaryApi.updateTerm(headers, props.glossaryId, props.term.id, {
        name: formData.value.name,
        description: formData.value.description,
        status: formData.value.status,
        synonyms: formData.value.synonyms,
        domains: formData.value.domains,
        owners: formData.value.owners,
        reviewers: formData.value.reviewers,
        tags: formData.value.tags
      })
    } else {
      await glossaryApi.createTerm(headers, props.glossaryId, {
        name: formData.value.name,
        description: formData.value.description,
        status: formData.value.status,
        synonyms: formData.value.synonyms,
        domains: formData.value.domains,
        owners: formData.value.owners,
        reviewers: formData.value.reviewers,
        tags: formData.value.tags
      })
    }
    
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '저장에 실패했습니다.'
  } finally {
    loading.value = false
  }
}

// 초기화
onMounted(() => {
  initForm()
  loadMetadata()
})

watch(() => props.term, () => {
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
        
        <!-- 기본 정보 -->
        <section class="form-section">
          <h3>기본 정보</h3>
          
          <div class="form-group">
            <label for="name">용어 이름 <span class="required">*</span></label>
            <input
              id="name"
              v-model="formData.name"
              type="text"
              placeholder="예: Customer, Order, Revenue"
              autofocus
            />
          </div>
          
          <div class="form-group">
            <label for="description">설명</label>
            <textarea
              id="description"
              v-model="formData.description"
              placeholder="용어에 대한 상세 설명을 입력하세요..."
              rows="4"
            ></textarea>
          </div>
          
          <div class="form-group">
            <label for="status">상태</label>
            <select id="status" v-model="formData.status">
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </section>
        
        <!-- 동의어 -->
        <section class="form-section">
          <h3>동의어</h3>
          
          <div class="tag-input-group">
            <input
              v-model="newSynonym"
              type="text"
              placeholder="동의어 입력 후 Enter"
              @keydown.enter.prevent="addSynonym"
            />
            <button class="btn-add" @click="addSynonym">
              <IconPlus :size="16" />
            </button>
          </div>
          
          <div class="tag-list">
            <span v-for="(synonym, idx) in formData.synonyms" :key="idx" class="tag">
              {{ synonym }}
              <button @click="removeSynonym(idx)">
                <IconX :size="12" />
              </button>
            </span>
            <span v-if="formData.synonyms.length === 0" class="no-items">동의어 없음</span>
          </div>
        </section>
        
        <!-- 도메인 -->
        <section class="form-section">
          <h3>도메인</h3>
          
          <div class="tag-input-group">
            <input
              v-model="newDomain"
              type="text"
              placeholder="도메인 입력 후 Enter"
              list="domain-list"
              @keydown.enter.prevent="addDomain"
            />
            <datalist id="domain-list">
              <option v-for="d in availableDomains" :key="d.id" :value="d.name" />
            </datalist>
            <button class="btn-add" @click="addDomain">
              <IconPlus :size="16" />
            </button>
          </div>
          
          <div class="tag-list">
            <span v-for="(domain, idx) in formData.domains" :key="idx" class="tag tag-domain">
              {{ domain }}
              <button @click="removeDomain(idx)">
                <IconX :size="12" />
              </button>
            </span>
            <span v-if="formData.domains.length === 0" class="no-items">도메인 없음</span>
          </div>
        </section>
        
        <!-- 소유자 -->
        <section class="form-section">
          <h3>소유자</h3>
          
          <div class="tag-input-group">
            <input
              v-model="newOwner"
              type="text"
              placeholder="소유자 이름 입력 후 Enter"
              list="owner-list"
              @keydown.enter.prevent="addOwner"
            />
            <datalist id="owner-list">
              <option v-for="o in availableOwners" :key="o.id" :value="o.name" />
            </datalist>
            <button class="btn-add" @click="addOwner">
              <IconPlus :size="16" />
            </button>
          </div>
          
          <div class="tag-list">
            <span v-for="(owner, idx) in formData.owners" :key="idx" class="tag tag-owner">
              {{ owner }}
              <button @click="removeOwner(idx)">
                <IconX :size="12" />
              </button>
            </span>
            <span v-if="formData.owners.length === 0" class="no-items">소유자 없음</span>
          </div>
        </section>
        
        <!-- 태그 -->
        <section class="form-section">
          <h3>검토자</h3>
          
          <div class="tag-input-group">
            <input
              v-model="newReviewer"
              type="text"
              placeholder="검토자 이름 입력 후 Enter"
              list="reviewer-list"
              @keydown.enter.prevent="addReviewer"
            />
            <datalist id="reviewer-list">
              <option v-for="o in availableOwners" :key="o.id" :value="o.name" />
            </datalist>
            <button class="btn-add" @click="addReviewer">
              <IconPlus :size="16" />
            </button>
          </div>
          
          <div class="tag-list">
            <span v-for="(reviewer, idx) in formData.reviewers" :key="idx" class="tag tag-owner">
              {{ reviewer }}
              <button @click="removeReviewer(idx)">
                <IconX :size="12" />
              </button>
            </span>
            <span v-if="formData.reviewers.length === 0" class="no-items">검토자 없음</span>
          </div>
        </section>
        
        <!-- 태그 -->
        <section class="form-section">
          <h3>태그</h3>
          
          <div class="tag-input-group">
            <input
              v-model="newTag"
              type="text"
              placeholder="태그 입력 후 Enter"
              list="tag-list"
              @keydown.enter.prevent="addTag"
            />
            <datalist id="tag-list">
              <option v-for="t in availableTags" :key="t.id" :value="t.name" />
            </datalist>
            <button class="btn-add" @click="addTag">
              <IconPlus :size="16" />
            </button>
          </div>
          
          <div class="tag-list">
            <span v-for="(tag, idx) in formData.tags" :key="idx" class="tag tag-color">
              {{ tag }}
              <button @click="removeTag(idx)">
                <IconX :size="12" />
              </button>
            </span>
            <span v-if="formData.tags.length === 0" class="no-items">태그 없음</span>
          </div>
        </section>
      </div>
      
      <footer class="modal-footer">
        <button class="btn-secondary" @click="emit('close')" :disabled="loading">
          취소
        </button>
        <button class="btn-primary" @click="save" :disabled="loading">
          {{ loading ? '저장 중...' : (isEditMode ? '수정' : '추가') }}
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
  width: 560px;
  max-height: 90vh;
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
  flex: 1;
  overflow-y: auto;
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

.form-section {
  margin-bottom: 24px;
  
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
}

.form-group {
  margin-bottom: 16px;
  
  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
    margin-bottom: 6px;
  }
  
  .required {
    color: #ef4444;
  }
  
  input, textarea, select {
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
  
  select {
    cursor: pointer;
  }
}

.tag-input-group {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  
  input {
    flex: 1;
    padding: 8px 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 13px;
    color: var(--color-text);
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.btn-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease;
  
  &:hover {
    background: var(--color-accent-hover);
  }
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-text);
  
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-light);
    cursor: pointer;
    padding: 0;
    
    &:hover {
      color: #ef4444;
    }
  }
  
  &.tag-domain {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }
  
  &.tag-owner {
    background: rgba(139, 92, 246, 0.15);
    color: #8b5cf6;
  }
  
  &.tag-color {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }
}

.no-items {
  font-size: 13px;
  color: var(--color-text-light);
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



