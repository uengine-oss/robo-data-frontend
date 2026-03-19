<script setup lang="ts">
/**
 * GlossaryTab.vue
 * 비즈니스 용어집 관리 탭
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { glossaryApi, type Glossary, type Term } from '@/services/api'
import { IconPlus, IconSearch, IconEdit, IconTrash, IconCheck, IconChevronDown, IconBook } from '@/components/icons'
import TermModal from './TermModal.vue'
import GlossaryModal from './GlossaryModal.vue'

const sessionStore = useSessionStore()

// 상태
const loading = ref(false)
const error = ref<string | null>(null)
const glossaries = ref<Glossary[]>([])
const selectedGlossary = ref<Glossary | null>(null)
const terms = ref<Term[]>([])
const searchQuery = ref('')
const statusFilter = ref<string>('')
const showAllTerms = ref(false)

// 모달 상태
const showTermModal = ref(false)
const showGlossaryModal = ref(false)
const editingTerm = ref<Term | null>(null)
const editingGlossary = ref<Glossary | null>(null)

// 필터된 용어 목록
const filteredTerms = computed(() => {
  let result = terms.value
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(term => 
      term.name.toLowerCase().includes(query) ||
      term.description.toLowerCase().includes(query)
    )
  }
  
  if (statusFilter.value) {
    result = result.filter(term => term.status === statusFilter.value)
  }
  
  return result
})

// 용어집 목록 로드
const loadGlossaries = async () => {
  loading.value = true
  error.value = null
  
  try {
    const headers = sessionStore.getHeaders()
    const result = await glossaryApi.getGlossaries(headers)
    glossaries.value = result.glossaries
    
    // 첫 번째 용어집 자동 선택
    if (glossaries.value.length > 0 && !selectedGlossary.value) {
      selectGlossary(glossaries.value[0])
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '용어집 목록을 불러오는 데 실패했습니다.'
  } finally {
    loading.value = false
  }
}

// 용어 목록 로드
const loadTerms = async () => {
  if (!selectedGlossary.value) return
  const glossaryId = selectedGlossary.value.id
  
  loading.value = true
  error.value = null
  
  try {
    const headers = sessionStore.getHeaders()
    const result = await glossaryApi.getTerms(headers, glossaryId)
    if (selectedGlossary.value?.id === glossaryId) {
      terms.value = result.terms
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '용어 목록을 불러오는 데 실패했습니다.'
  } finally {
    if (selectedGlossary.value?.id === glossaryId) {
      loading.value = false
    }
  }
}

// 용어집 선택
const selectGlossary = (glossary: Glossary) => {
  selectedGlossary.value = glossary
}

// 용어집 생성/수정 모달 열기
const openGlossaryModal = (glossary?: Glossary) => {
  editingGlossary.value = glossary || null
  showGlossaryModal.value = true
}

// 용어집 저장 후 처리
const handleGlossarySaved = async (glossary: Glossary) => {
  showGlossaryModal.value = false
  editingGlossary.value = null
  await loadGlossaries()
  
  // 새로 생성된 경우 해당 용어집 선택
  if (glossary.id) {
    const found = glossaries.value.find(g => g.id === glossary.id)
    if (found) {
      selectGlossary(found)
    }
  }
}

// 용어집 삭제
const deleteGlossary = async (glossary: Glossary) => {
  if (!confirm(`'${glossary.name}' 용어집을 삭제하시겠습니까?\n포함된 모든 용어도 함께 삭제됩니다.`)) return
  
  try {
    const headers = sessionStore.getHeaders()
    await glossaryApi.deleteGlossary(headers, glossary.id)
    
    if (selectedGlossary.value?.id === glossary.id) {
      selectedGlossary.value = null
      terms.value = []
    }
    
    await loadGlossaries()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '용어집 삭제에 실패했습니다.'
  }
}

// 용어 생성/수정 모달 열기
const openTermModal = async (term?: Term) => {
  if (!selectedGlossary.value) return

  if (!term) {
    editingTerm.value = null
    showTermModal.value = true
    return
  }

  loading.value = true
  error.value = null

  try {
    const headers = sessionStore.getHeaders()
    editingTerm.value = await glossaryApi.getTerm(headers, selectedGlossary.value.id, term.id)
    showTermModal.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '용어 상세 정보를 불러오는 데 실패했습니다.'
  } finally {
    loading.value = false
  }
}

// 용어 저장 후 처리
const handleTermSaved = async () => {
  showTermModal.value = false
  editingTerm.value = null
  await loadTerms()
  await loadGlossaries()  // termCount 업데이트
}

// 용어 삭제
const deleteTerm = async (term: Term) => {
  if (!selectedGlossary.value) return
  if (!confirm(`'${term.name}' 용어를 삭제하시겠습니까?`)) return
  
  try {
    const headers = sessionStore.getHeaders()
    await glossaryApi.deleteTerm(headers, selectedGlossary.value.id, term.id)
    await loadTerms()
    await loadGlossaries()  // termCount 업데이트
  } catch (e) {
    error.value = e instanceof Error ? e.message : '용어 삭제에 실패했습니다.'
  }
}

// 상태 배지 스타일
const getStatusClass = (status: string) => {
  switch (status) {
    case 'Approved': return 'status-approved'
    case 'Pending': return 'status-pending'
    case 'Deprecated': return 'status-deprecated'
    default: return 'status-draft'
  }
}

// 상태 라벨
const getStatusLabel = (status: string) => {
  switch (status) {
    case 'Approved': return '승인됨'
    case 'Pending': return '검토중'
    case 'Deprecated': return '폐기됨'
    default: return '초안'
  }
}

// 용어집 유형 아이콘 배경색
const getGlossaryTypeColor = (type: string) => {
  switch (type) {
    case 'Business': return '#3b82f6'
    case 'Technical': return '#8b5cf6'
    case 'DataQuality': return '#10b981'
    default: return '#6b7280'
  }
}

// 초기 로드
onMounted(() => {
  loadGlossaries()
})

// 용어집 변경 시 용어 목록 다시 로드
watch(selectedGlossary, () => {
  if (selectedGlossary.value) {
    loadTerms()
  }
})
</script>

<template>
  <div class="glossary-tab">
    <!-- 왼쪽: 용어집 목록 -->
    <aside class="glossary-sidebar">
      <div class="sidebar-header">
        <h3>용어</h3>
        <button class="btn-icon" @click="openGlossaryModal()" title="새 용어집">
          <IconPlus :size="18" />
        </button>
      </div>
      
      <div class="glossary-list">
        <button
          v-for="glossary in glossaries"
          :key="glossary.id"
          class="glossary-item"
          :class="{ active: selectedGlossary?.id === glossary.id }"
          @click="selectGlossary(glossary)"
        >
          <span class="glossary-icon" :style="{ background: getGlossaryTypeColor(glossary.type) }">
            <IconBook :size="14" color="#fff" />
          </span>
          <span class="glossary-name">{{ glossary.name }}</span>
          <span class="glossary-count">{{ glossary.termCount }}</span>
        </button>
        
        <div v-if="glossaries.length === 0 && !loading" class="empty-state">
          <p>용어집이 없습니다.</p>
          <button class="btn-primary" @click="openGlossaryModal()">
            <IconPlus :size="16" />
            첫 용어집 만들기
          </button>
        </div>
      </div>
    </aside>
    
    <!-- 메인: 용어 목록 -->
    <main class="glossary-main">
      <template v-if="selectedGlossary">
        <!-- 용어집 헤더 -->
        <header class="main-header">
          <div class="header-info">
            <div class="breadcrumb">
              <span class="breadcrumb-item">Glossaries</span>
            </div>
            <h1>{{ selectedGlossary.name }}</h1>
            <p class="description">{{ selectedGlossary.description || 'Central repository for business terms, definitions, and KPIs' }}</p>
          </div>
          <div class="header-actions">
            <button class="btn-icon" @click="openGlossaryModal(selectedGlossary)" title="용어집 수정">
              <IconEdit :size="18" />
            </button>
            <button class="btn-icon btn-danger" @click="deleteGlossary(selectedGlossary)" title="용어집 삭제">
              <IconTrash :size="18" />
            </button>
          </div>
        </header>
        
        <!-- 탭 -->
        <div class="tabs">
          <button class="tab active">
            용어들 <span class="tab-count">{{ terms.length }}</span>
          </button>
          <button class="tab">
            활동 피드 및 작업 <span class="tab-count">0</span>
          </button>
        </div>
        
        <!-- 검색 및 필터 -->
        <div class="toolbar">
          <div class="search-box">
            <IconSearch :size="16" />
            <input 
              v-model="searchQuery"
              type="text" 
              placeholder="용어들 검색"
            />
          </div>
          
          <div class="filters">
            <div class="filter-dropdown">
              <select v-model="statusFilter">
                <option value="">현황</option>
                <option value="Draft">초안</option>
                <option value="Pending">검토중</option>
                <option value="Approved">승인됨</option>
                <option value="Deprecated">폐기됨</option>
              </select>
              <IconChevronDown :size="14" />
            </div>
            
            <button class="btn-text" @click="showAllTerms = !showAllTerms">
              {{ showAllTerms ? '접기' : '모두 펼치기' }}
            </button>
            
            <button class="btn-primary" @click="openTermModal()">
              <IconPlus :size="16" />
              사용자 지정
            </button>
          </div>
        </div>
        
        <!-- 용어 테이블 -->
        <div class="terms-table-container">
          <table class="terms-table">
            <thead>
              <tr>
                <th class="col-drag"></th>
                <th class="col-name">용어들</th>
                <th class="col-desc">설명</th>
                <th class="col-status">현황</th>
                <th class="col-owners">소유자들</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="term in filteredTerms" 
                :key="term.id"
                class="term-row"
                @click="openTermModal(term)"
              >
                <td class="col-drag">
                  <span class="drag-handle">⋮⋮</span>
                </td>
                <td class="col-name">
                  <a class="term-link">{{ term.name }}</a>
                </td>
                <td class="col-desc">
                  <div class="term-description">
                    {{ term.description || '-' }}
                    <button v-if="term.description && term.description.length > 50" class="btn-more">
                      더 보기
                    </button>
                  </div>
                </td>
                <td class="col-status">
                  <span class="status-badge" :class="getStatusClass(term.status)">
                    <IconCheck v-if="term.status === 'Approved'" :size="12" />
                    {{ getStatusLabel(term.status) }}
                  </span>
                </td>
                <td class="col-owners">
                  <div class="owners-list">
                    <template v-if="term.owners && term.owners.length > 0">
                      <span 
                        v-for="owner in term.owners.slice(0, 2)" 
                        :key="owner.id"
                        class="owner-avatar"
                        :title="owner.name"
                      >
                        {{ owner.name.charAt(0).toUpperCase() }}
                      </span>
                      <span v-if="term.owners.length > 2" class="owner-more">
                        +{{ term.owners.length - 2 }}
                      </span>
                    </template>
                    <span v-else class="no-owners">소유자들 없음</span>
                  </div>
                </td>
                <td class="col-actions" @click.stop>
                  <button class="btn-icon btn-sm" @click.stop="openTermModal(term)" title="수정">
                    <IconEdit :size="14" />
                  </button>
                  <button class="btn-icon btn-sm btn-danger" @click.stop="deleteTerm(term)" title="삭제">
                    <IconTrash :size="14" />
                  </button>
                </td>
              </tr>
              
              <tr v-if="filteredTerms.length === 0">
                <td colspan="6" class="empty-row">
                  <div class="empty-terms">
                    <p v-if="searchQuery || statusFilter">검색 결과가 없습니다.</p>
                    <p v-else>등록된 용어가 없습니다.</p>
                    <button v-if="!searchQuery && !statusFilter" class="btn-primary" @click="openTermModal()">
                      <IconPlus :size="16" />
                      첫 용어 추가
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      
      <!-- 용어집 선택 안됨 -->
      <div v-else class="no-selection">
        <IconBook :size="48" color="var(--color-text-light)" />
        <h2>용어집을 선택하세요</h2>
        <p>왼쪽 목록에서 용어집을 선택하거나 새로 만들어보세요.</p>
        <button class="btn-primary" @click="openGlossaryModal()">
          <IconPlus :size="16" />
          새 용어집 만들기
        </button>
      </div>
    </main>
    
    <!-- 오른쪽: 메타데이터 패널 -->
    <aside v-if="selectedGlossary" class="metadata-panel">
      <section class="meta-section">
        <h4>도메인들</h4>
        <p class="meta-empty">도메인들 없음</p>
      </section>
      
      <section class="meta-section">
        <h4>
          소유자들
          <button class="btn-icon btn-sm">
            <IconPlus :size="14" />
          </button>
        </h4>
        <p class="meta-empty">소유자들 없음</p>
      </section>
      
      <section class="meta-section">
        <h4>검토자들</h4>
        <p class="meta-empty">검토자들 없음</p>
      </section>
      
      <section class="meta-section">
        <h4>
          태그들
          <button class="btn-icon btn-sm">
            <IconPlus :size="14" />
          </button>
        </h4>
        <p class="meta-empty">태그들 없음</p>
      </section>
    </aside>
    
    <!-- 에러 메시지 -->
    <div v-if="error" class="error-toast">
      {{ error }}
      <button @click="error = null">&times;</button>
    </div>
    
    <!-- 모달 -->
    <TermModal
      v-if="showTermModal && selectedGlossary"
      :glossary-id="selectedGlossary.id"
      :term="editingTerm"
      @close="showTermModal = false; editingTerm = null"
      @saved="handleTermSaved"
    />
    
    <GlossaryModal
      v-if="showGlossaryModal"
      :glossary="editingGlossary"
      @close="showGlossaryModal = false; editingGlossary = null"
      @saved="handleGlossarySaved"
    />
  </div>
</template>

<style lang="scss" scoped>
.glossary-tab {
  display: flex;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

// 사이드바
.glossary-sidebar {
  width: 260px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }
}

.glossary-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.glossary-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  &.active {
    background: var(--color-accent-bg);
    
    .glossary-name {
      color: var(--color-accent);
      font-weight: 600;
    }
  }
}

.glossary-icon {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.glossary-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.glossary-count {
  font-size: 12px;
  color: var(--color-text-light);
  background: var(--color-bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
}

// 메인 영역
.glossary-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.main-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
}

.header-info {
  flex: 1;
}

.breadcrumb {
  font-size: 12px;
  color: var(--color-text-light);
  margin-bottom: 8px;
}

.main-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.description {
  font-size: 14px;
  color: var(--color-text-light);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

// 탭
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
}

.tab {
  padding: 12px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 14px;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    color: var(--color-text);
  }
  
  &.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
    font-weight: 500;
  }
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  margin-left: 6px;
}

// 툴바
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  gap: 16px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  min-width: 240px;
  
  input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-size: 13px;
    color: var(--color-text);
    
    &::placeholder {
      color: var(--color-text-light);
    }
  }
}

.filters {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-dropdown {
  position: relative;
  
  select {
    appearance: none;
    padding: 8px 32px 8px 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 13px;
    color: var(--color-text);
    cursor: pointer;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
  
  svg {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--color-text-light);
  }
}

// 테이블
.terms-table-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.terms-table {
  width: 100%;
  border-collapse: collapse;
  
  th, td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  
  th {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-light);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--color-bg-secondary);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  
  .col-drag {
    width: 32px;
    padding: 12px 8px;
  }
  
  .col-name {
    width: 180px;
  }
  
  .col-desc {
    min-width: 200px;
  }
  
  .col-status {
    width: 120px;
  }
  
  .col-owners {
    width: 140px;
  }
  
  .col-actions {
    width: 80px;
    text-align: right;
  }
}

.term-row {
  cursor: pointer;
  transition: background 0.15s ease;
  
  &:hover {
    background: var(--color-bg-secondary);
  }
}

.drag-handle {
  color: var(--color-text-light);
  cursor: grab;
  font-size: 12px;
  letter-spacing: -2px;
}

.term-link {
  color: var(--color-accent);
  font-weight: 500;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
}

.term-description {
  font-size: 13px;
  color: var(--color-text-light);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.btn-more {
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-left: 4px;
  
  &:hover {
    text-decoration: underline;
  }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  
  &.status-approved {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }
  
  &.status-pending {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }
  
  &.status-deprecated {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
  
  &.status-draft {
    background: var(--color-bg-tertiary);
    color: var(--color-text-light);
  }
}

.owners-list {
  display: flex;
  align-items: center;
  gap: 4px;
}

.owner-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.owner-more {
  font-size: 12px;
  color: var(--color-text-light);
  margin-left: 4px;
}

.no-owners {
  font-size: 13px;
  color: var(--color-text-light);
}

.empty-row {
  text-align: center;
  padding: 48px 16px !important;
}

.empty-terms {
  color: var(--color-text-light);
  
  p {
    margin: 0 0 16px;
  }
}

// 메타데이터 패널
.metadata-panel {
  width: 280px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  padding: 24px;
  overflow-y: auto;
}

.meta-section {
  margin-bottom: 24px;
  
  h4 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
}

.meta-empty {
  font-size: 13px;
  color: var(--color-text-light);
  margin: 0;
}

// 빈 상태
.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-light);
  
  p {
    margin: 0 0 16px;
  }
}

.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-light);
  gap: 16px;
  
  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }
  
  p {
    margin: 0;
  }
}

// 에러 토스트
.error-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #ef4444;
  color: #fff;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  
  button {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    opacity: 0.8;
    
    &:hover {
      opacity: 1;
    }
  }
}

// 버튼
.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
  
  &.btn-sm {
    width: 28px;
    height: 28px;
  }
  
  &.btn-danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
}

.btn-text {
  background: none;
  border: none;
  color: var(--color-text-light);
  font-size: 13px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-accent-hover);
  }
}
</style>



