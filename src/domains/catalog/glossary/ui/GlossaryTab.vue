<script setup lang="ts">
/**
 * GlossaryTab.vue
 * 비즈니스 용어집 관리 탭
 */
import { ref, computed, nextTick, onMounted, shallowRef } from 'vue'
import { useRuntimeStore } from '@/shared/stores/runtime'
import type { Glossary, Term } from '../api.ts'
import { useGlossaryCatalog } from '../application/useGlossaryCatalog'
import { IconPlus, IconSearch, IconEdit, IconTrash, IconCheck, IconChevronDown, IconBook } from '@/shared/icons'
import TermModal from './TermModal.vue'
import GlossaryModal from './GlossaryModal.vue'
import TermBulkUploadModal from './TermBulkUploadModal.vue'
import GlossaryActionDialog from './GlossaryActionDialog.vue'
import { buildMetadataSections, type MetadataSectionKey } from './glossaryMetadataPanel'

const runtimeStore = useRuntimeStore()
const {
  loading,
  metadataLoading,
  error,
  glossaries,
  selectedGlossary,
  terms,
  selectedTerm,
  retryAction,
  clearError: clearOperationError,
  loadGlossaries,
  loadTerms,
  selectGlossary,
  selectTerm,
  loadTermForEdit,
  deleteGlossary,
  deleteTerm,
} = useGlossaryCatalog({
  getHeaders: () => runtimeStore.getHeaders(),
})

// 상태
const searchQuery = ref('')
const statusFilter = ref<string>('')
const showAllTerms = ref(false)
const expandedTermIds = ref<Set<string>>(new Set())
type DeleteTarget =
  | { kind: 'glossary'; glossary: Glossary }
  | { kind: 'term'; glossaryId: string; term: Term }
const deleteTarget = ref<DeleteTarget | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const deleteTrigger = shallowRef<HTMLElement | null>(null)
const mainRef = ref<HTMLElement>()

// 모달 상태
const showTermModal = ref(false)
const showGlossaryModal = ref(false)
const showBulkUploadModal = ref(false)
const editingTerm = ref<Term | null>(null)
const editingGlossary = ref<Glossary | null>(null)

const metadataSectionTitles: Record<MetadataSectionKey, string> = {
  domains: '도메인들',
  owners: '소유자들',
  reviewers: '검토자들',
  tags: '태그들'
}

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

const metadataSections = computed(() => buildMetadataSections(selectedTerm.value))
const deleteDialogDetails = computed(() => {
  const target = deleteTarget.value
  if (target?.kind === 'glossary') {
    return {
      title: '용어집 삭제',
      message: `'${target.glossary.name}' 용어집과 포함된 모든 용어를 삭제하시겠습니까?`,
      confirmLabel: '용어집 삭제',
    }
  }
  return {
    title: '용어 삭제',
    message: target ? `'${target.term.name}' 용어를 삭제하시겠습니까?` : '',
    confirmLabel: '용어 삭제',
  }
})


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

function rememberDeleteTrigger(event: Event) {
  deleteTrigger.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

function requestGlossaryDelete(glossary: Glossary, event: Event) {
  rememberDeleteTrigger(event)
  deleteError.value = null
  deleteTarget.value = { kind: 'glossary', glossary }
}

// 용어 생성/수정 모달 열기
const openTermModal = async (term?: Term) => {
  if (!selectedGlossary.value) return

  if (!term) {
    editingTerm.value = null
    showTermModal.value = true
    return
  }

  const detail = await loadTermForEdit(term)
  if (detail) {
    editingTerm.value = detail
    showTermModal.value = true
  }
}

const openMetadataEditor = (sectionKey: MetadataSectionKey) => {
  if (!selectedTerm.value) {
    error.value = `${metadataSectionTitles[sectionKey]} 편집을 위해 먼저 용어를 선택해주세요.`
    retryAction.value = null
    return
  }

  openTermModal(selectedTerm.value)
}

// 용어 저장 후 처리
const handleTermSaved = async () => {
  showTermModal.value = false
  editingTerm.value = null
  await loadTerms()
  await loadGlossaries()  // termCount 업데이트
}

const handleBulkImported = async () => {
  await loadTerms()
  await loadGlossaries()
}

function requestTermDelete(term: Term, event: Event) {
  if (!selectedGlossary.value) return
  rememberDeleteTrigger(event)
  deleteError.value = null
  deleteTarget.value = {
    kind: 'term',
    glossaryId: selectedGlossary.value.id,
    term,
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleting.value = true
  deleteError.value = null

  try {
    if (target.kind === 'glossary') {
      await deleteGlossary(target.glossary.id)
      deleteTarget.value = null
    } else {
      await deleteTerm(target.glossaryId, target.term.id)
      deleteTarget.value = null
    }
    deleteTrigger.value = null
    await nextTick()
    mainRef.value?.focus()
  } catch (e) {
    deleteError.value = e instanceof Error
      ? e.message
      : target.kind === 'glossary'
        ? '용어집 삭제에 실패했습니다.'
        : '용어 삭제에 실패했습니다.'
  } finally {
    deleting.value = false
  }
}

function cancelDelete() {
  if (deleting.value) return
  deleteTarget.value = null
  deleteError.value = null
  nextTick(() => deleteTrigger.value?.focus())
}

async function retryLastOperation() {
  const action = retryAction.value
  if (!action) return
  if (action.kind === 'glossaries') {
    await loadGlossaries()
  } else if (action.kind === 'terms') {
    await loadTerms()
  } else if (action.kind === 'selectTerm') {
    await selectTerm(action.term)
  } else {
    await openTermModal(action.term)
  }
}

function isTermDescriptionExpanded(termId: string): boolean {
  return showAllTerms.value || expandedTermIds.value.has(termId)
}

function toggleTermDescription(termId: string) {
  const next = new Set(expandedTermIds.value)
  if (next.has(termId)) next.delete(termId)
  else next.add(termId)
  expandedTermIds.value = next
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
        
        <div v-if="glossaries.length === 0 && !loading && !error" class="empty-state">
          <p>용어집이 없습니다.</p>
          <button class="btn-primary" @click="openGlossaryModal()">
            <IconPlus :size="16" />
            첫 용어집 만들기
          </button>
        </div>
      </div>
    </aside>
    
    <!-- 메인: 용어 목록 -->
    <main ref="mainRef" class="glossary-main" tabindex="-1">
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
            <button
              class="btn-icon btn-danger"
              title="용어집 삭제"
              @click="requestGlossaryDelete(selectedGlossary, $event)"
            >
              <IconTrash :size="18" />
            </button>
          </div>
        </header>
        
        <!-- 탭 -->
        <div class="tabs">
          <button class="tab active">
            용어들 <span class="tab-count">{{ terms.length }}</span>
          </button>
          <button class="tab" type="button" disabled title="활동 피드는 아직 제공되지 않습니다.">
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
            
            <button
              class="btn-text"
              type="button"
              :aria-expanded="showAllTerms"
              @click="showAllTerms = !showAllTerms"
            >
              {{ showAllTerms ? '접기' : '모두 펼치기' }}
            </button>
            
            <button class="btn-primary" @click="openTermModal()">
              <IconPlus :size="16" />
              사용자 지정
            </button>

            <button class="btn-secondary" @click="showBulkUploadModal = true">
              일괄 업로드
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
                :class="{ active: selectedTerm?.id === term.id }"
                :aria-selected="selectedTerm?.id === term.id"
                tabindex="0"
                @click="selectTerm(term)"
                @keydown.enter.prevent="selectTerm(term)"
                @keydown.space.prevent="selectTerm(term)"
              >
                <td class="col-drag">
                  <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                </td>
                <td class="col-name">
                  <span class="term-link">{{ term.name }}</span>
                </td>
                <td class="col-desc">
                  <div
                    class="term-description"
                    :class="{ expanded: isTermDescriptionExpanded(term.id) }"
                  >
                    {{ term.description || '-' }}
                    <button
                      v-if="term.description && term.description.length > 50"
                      class="btn-more"
                      type="button"
                      :aria-expanded="isTermDescriptionExpanded(term.id)"
                      @click.stop="toggleTermDescription(term.id)"
                    >
                      {{ isTermDescriptionExpanded(term.id) ? '접기' : '더 보기' }}
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
                  <button
                    class="btn-icon btn-sm btn-danger"
                    title="삭제"
                    @click.stop="requestTermDelete(term, $event)"
                  >
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
      <template v-if="selectedTerm">
        <header class="metadata-header">
          <p class="metadata-label">선택된 용어</p>
          <div class="metadata-title-row">
            <h3>{{ selectedTerm.name }}</h3>
            <button class="btn-icon btn-sm" @click="openTermModal(selectedTerm)" title="용어 수정">
              <IconEdit :size="14" />
            </button>
          </div>
          <p class="metadata-description">
            {{ selectedTerm.description || '도메인, 소유자, 검토자, 태그를 확인하거나 추가할 수 있습니다.' }}
          </p>
          <p v-if="metadataLoading" class="meta-loading">최신 메타데이터를 불러오는 중입니다.</p>
        </header>

        <section v-for="section in metadataSections" :key="section.key" class="meta-section">
          <h4>
            {{ section.title }}
            <button
              class="btn-icon btn-sm"
              :title="`${section.title} 추가`"
              @click="openMetadataEditor(section.key)"
            >
              <IconPlus :size="14" />
            </button>
          </h4>

          <div v-if="section.items.length > 0" class="meta-items">
            <span
              v-for="item in section.items"
              :key="`${section.key}-${item.id}`"
              class="meta-pill"
              :class="`meta-pill-${section.key}`"
            >
              <span
                v-if="section.key === 'tags' && item.color"
                class="meta-pill-color"
                :style="{ backgroundColor: item.color }"
              />
              {{ item.label }}
            </span>
          </div>
          <p v-else class="meta-empty">{{ section.emptyText }}</p>
        </section>
      </template>

      <div v-else class="empty-state">
        <p>용어를 선택하면 오른쪽 패널에서 메타데이터를 확인할 수 있습니다.</p>
      </div>
    </aside>
    
    <!-- 에러 메시지 -->
    <div v-if="error" class="error-toast" role="alert">
      {{ error }}
      <button v-if="retryAction" class="error-retry" @click="retryLastOperation">다시 시도</button>
      <button aria-label="오류 닫기" @click="clearOperationError">&times;</button>
    </div>

    <GlossaryActionDialog
      v-if="deleteTarget"
      :title="deleteDialogDetails.title"
      :message="deleteDialogDetails.message"
      :confirm-label="deleteDialogDetails.confirmLabel"
      :pending="deleting"
      :error="deleteError"
      danger
      @cancel="cancelDelete"
      @confirm="confirmDelete"
    />
    
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

    <TermBulkUploadModal
      v-if="showBulkUploadModal && selectedGlossary"
      :glossary-id="selectedGlossary.id"
      @close="showBulkUploadModal = false"
      @imported="handleBulkImported"
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
  flex: 0 0 260px;
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

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
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

  &.active {
    background: var(--color-accent-bg);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
}

.drag-handle {
  color: var(--color-text-light);
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
  line-clamp: 2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  &.expanded {
    display: block;
    overflow: visible;
    -webkit-line-clamp: unset;
  }
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
  flex: 0 0 280px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  padding: 24px;
  overflow-y: auto;
}

.metadata-header {
  margin-bottom: 24px;
}

.metadata-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 8px;
}

.metadata-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;

  h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    min-width: 0;
  }
}

.metadata-description {
  font-size: 13px;
  color: var(--color-text-light);
  margin: 0;
  line-height: 1.5;
}

.meta-loading {
  font-size: 12px;
  color: var(--color-text-light);
  margin: 8px 0 0;
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

.meta-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
}

.meta-pill-domains {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.meta-pill-owners,
.meta-pill-reviewers {
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
}

.meta-pill-tags {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.meta-pill-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
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
  width: min(680px, calc(100vw - 48px));
  white-space: pre-line;
  line-height: 1.5;
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

  .error-retry {
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 6px;
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

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--color-bg-tertiary);
  }
}

@media (max-width: 900px) {
  .glossary-tab {
    flex-direction: column;
    overflow-y: auto;
  }

  .glossary-sidebar {
    width: 100%;
    flex: 0 0 auto;
    max-height: 170px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-header {
    padding: 10px 16px;
  }

  .glossary-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .glossary-item {
    flex: 0 0 190px;
  }

  .glossary-main {
    flex: 0 0 auto;
    min-height: 520px;
    overflow: visible;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .search-box {
    min-width: 0;
  }

  .filters {
    flex-wrap: wrap;
  }

  .terms-table-container {
    flex: 0 0 auto;
    min-height: 320px;
    overflow: auto;
  }

  .terms-table {
    min-width: 820px;
  }

  .metadata-panel {
    width: auto;
    flex: 0 0 auto;
    min-height: 220px;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
}

@media (max-width: 600px) {
  .main-header,
  .toolbar,
  .metadata-panel {
    padding: 16px;
  }

  .tabs {
    padding: 0 8px;
    overflow-x: auto;
  }

  .tab {
    flex: 0 0 auto;
    padding-inline: 10px;
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    .filter-dropdown,
    .filter-dropdown select,
    .btn-primary,
    .btn-secondary {
      width: 100%;
    }

    .btn-primary,
    .btn-secondary {
      justify-content: center;
    }
  }

  .terms-table-container {
    padding: 0 16px 16px;
  }

  .error-toast {
    right: 12px;
    bottom: 12px;
    left: 12px;
    max-width: none;
  }
}
</style>
