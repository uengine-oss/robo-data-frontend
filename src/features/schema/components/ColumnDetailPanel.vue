<template>
  <div class="column-detail-panel">
    <!-- 탭 헤더 -->
    <div class="panel-tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <component :is="tab.icon" class="tab-icon" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- 검색 -->
    <div class="panel-search" v-if="activeTab === 'schema'">
      <IconSearch class="search-icon" />
      <input 
        v-model="searchQuery" 
        type="text" 
        placeholder="컬럼 검색..." 
        class="search-input"
      />
    </div>

    <!-- 컬럼 목록 -->
    <div class="column-list" v-if="activeTab === 'schema'">
      <div 
        v-for="column in filteredColumns" 
        :key="column.name"
        class="column-item"
        :class="{ editing: editingColumn === column.name }"
      >
        <div class="column-main">
          <div class="column-name">
            <span class="name">{{ column.name }}</span>
            <span v-if="isKeyColumn(column)" class="key-badge">🔑</span>
          </div>
          
          <div class="column-type">
            <code>{{ column.dtype }}</code>
          </div>
          
          <p class="column-desc">
            {{ column.description || '설명 없음' }}
          </p>
        </div>

        <!-- 편집 폼 -->
        <div v-if="editingColumn === column.name" class="edit-form">
          <textarea
            v-model="editDescription"
            placeholder="컬럼 설명을 입력하세요..."
            rows="2"
          ></textarea>
          <div class="edit-actions">
            <button class="btn-save" @click="saveDescription(column)">저장</button>
            <button class="btn-cancel" @click="cancelEdit">취소</button>
          </div>
        </div>

        <!-- 편집 버튼 -->
        <button 
          v-else
          class="btn-edit" 
          @click="startEdit(column)"
        >
          편집
        </button>
      </div>

      <!-- 빈 상태 -->
      <div v-if="filteredColumns.length === 0 && columns.length > 0" class="empty-state">
        <p>검색 결과가 없습니다</p>
      </div>

      <div v-if="columns.length === 0" class="empty-state">
        <IconTable class="empty-icon" />
        <p>테이블을 선택하세요</p>
      </div>
    </div>

    <!-- 계보 탭 (placeholder) -->
    <div class="placeholder-content" v-if="activeTab === 'lineage'">
      <IconLayers class="placeholder-icon" />
      <p>데이터 계보</p>
      <span class="placeholder-desc">준비 중입니다</span>
    </div>

    <!-- 데이터 품질 탭 (placeholder) -->
    <div class="placeholder-content" v-if="activeTab === 'quality'">
      <IconCheck class="placeholder-icon" />
      <p>데이터 품질</p>
      <span class="placeholder-desc">준비 중입니다</span>
    </div>

    <!-- 보안 탭 -->
    <div class="security-content" v-if="activeTab === 'security'">
      <div v-if="!tableName" class="empty-state">
        <IconSecurity class="empty-icon" />
        <p>테이블을 선택하세요</p>
      </div>
      <template v-else>
        <div class="security-header">
          <h4>{{ tableName }} 접근 권한</h4>
        </div>
        
        <!-- Access List -->
        <div class="access-list">
          <div v-for="(access, idx) in securityAccessList" :key="idx" class="access-item">
            <span class="access-target">
              {{ access.target_type === 'user' ? '👤' : '🎭' }}
              {{ access.target_name }}
            </span>
            <span class="access-level" :class="'level-' + access.level">
              {{ getLevelLabel(access.level) }}
            </span>
            <button class="btn-remove" @click="removeSecurityAccess(idx)">×</button>
          </div>
          <div v-if="securityAccessList.length === 0" class="no-access">
            권한 설정 없음 (기본 정책 적용)
          </div>
        </div>
        
        <!-- Add Form -->
        <div class="add-access-form">
          <select v-model="newAccess.target_type">
            <option value="role">역할</option>
            <option value="user">사용자</option>
          </select>
          <select v-model="newAccess.target_name">
            <option value="">선택</option>
            <template v-if="newAccess.target_type === 'role'">
              <option v-for="r in availableRoles" :key="r" :value="r">{{ r }}</option>
            </template>
            <template v-else>
              <option v-for="u in availableUsers" :key="u" :value="u">{{ u }}</option>
            </template>
          </select>
          <select v-model="newAccess.level">
            <option value="read">읽기</option>
            <option value="write">쓰기</option>
            <option value="admin">관리자</option>
            <option value="none">차단</option>
          </select>
          <button class="btn-add" @click="addSecurityAccess">+</button>
        </div>
      </template>
    </div>

    <!-- 사용자 정의 속성 탭 (placeholder) -->
    <div class="placeholder-content" v-if="activeTab === 'custom'">
      <IconSettings class="placeholder-icon" />
      <p>사용자 정의 속성</p>
      <span class="placeholder-desc">준비 중입니다</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, markRaw, type Component } from 'vue'
import type { Text2SqlColumnInfo } from '@/types'
import IconSearch from '@/shared/icons/IconSearch.vue'
import IconTable from '@/shared/icons/IconTable.vue'
import IconLayers from '@/shared/icons/IconLayers.vue'
import IconCheck from '@/shared/icons/IconCheck.vue'
import IconSettings from '@/shared/icons/IconSettings.vue'
import IconGrid from '@/shared/icons/IconGrid.vue'
import IconClipboard from '@/shared/icons/IconClipboard.vue'
import IconSecurity from '@/shared/icons/IconSecurity.vue'

const props = defineProps<{
  columns: Text2SqlColumnInfo[]
  tableName: string | null
  tableSchema: string
}>()

const emit = defineEmits<{
  (e: 'update-description', column: Text2SqlColumnInfo, description: string): void
}>()

// 탭 정의
interface Tab {
  id: string
  label: string
  icon: Component
}

const tabs: Tab[] = [
  { id: 'schema', label: '스키마', icon: markRaw(IconGrid) },
  { id: 'lineage', label: '계보', icon: markRaw(IconLayers) },
  { id: 'quality', label: '데이터 품질', icon: markRaw(IconClipboard) },
  { id: 'security', label: '보안', icon: markRaw(IconSecurity) },
  { id: 'custom', label: '사용자 정의 속성', icon: markRaw(IconSettings) }
]

// Security Tab state
const securityAccessList = ref<Array<{
  target_type: 'user' | 'role'
  target_name: string
  level: 'none' | 'read' | 'write' | 'admin'
}>>([])
const availableRoles = ['admin', 'analyst', 'readonly']
const availableUsers = ['admin@localhost', 'test@localhost', 'readonly@localhost']
const newAccess = ref({
  target_type: 'role' as 'user' | 'role',
  target_name: '',
  level: 'read' as 'none' | 'read' | 'write' | 'admin'
})

function addSecurityAccess() {
  if (!newAccess.value.target_name) return
  securityAccessList.value.push({ ...newAccess.value })
  newAccess.value.target_name = ''
}

function removeSecurityAccess(index: number) {
  securityAccessList.value.splice(index, 1)
}

function getLevelLabel(level: string) {
  const labels: Record<string, string> = { admin: '관리자', write: '읽기/쓰기', read: '읽기 전용', none: '접근 불가' }
  return labels[level] || level
}

const activeTab = ref('schema')
const searchQuery = ref('')
const editingColumn = ref<string | null>(null)
const editDescription = ref('')

// 필터링된 컬럼
const filteredColumns = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.columns
  }
  const query = searchQuery.value.toLowerCase()
  return props.columns.filter(col => 
    col.name.toLowerCase().includes(query) ||
    col.dtype.toLowerCase().includes(query) ||
    (col.description || '').toLowerCase().includes(query)
  )
})

// 키 컬럼인지 확인
function isKeyColumn(column: Text2SqlColumnInfo): boolean {
  const name = column.name.toLowerCase()
  return name.includes('id') || name.includes('key') || name.endsWith('_pk')
}

// 편집 시작
function startEdit(column: Text2SqlColumnInfo) {
  editingColumn.value = column.name
  editDescription.value = column.description || ''
}

// 편집 취소
function cancelEdit() {
  editingColumn.value = null
  editDescription.value = ''
}

// 설명 저장
function saveDescription(column: Text2SqlColumnInfo) {
  emit('update-description', column, editDescription.value)
  cancelEdit()
}

// 테이블 변경 시 편집 상태 초기화
watch(() => props.tableName, () => {
  cancelEdit()
  searchQuery.value = ''
})
</script>

<style scoped>
.column-detail-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-left: 1px solid #e5e7eb;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  background: #fafbfc;
}

.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 0.5rem;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s ease;
  border-bottom: 2px solid transparent;
}

.tab-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.tab-btn.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  background: white;
}

.tab-icon {
  width: 18px;
  height: 18px;
}

.panel-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f3f4f6;
}

.search-icon {
  width: 16px;
  height: 16px;
  color: #9ca3af;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.875rem;
  color: #374151;
}

.search-input::placeholder {
  color: #9ca3af;
}

.column-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.column-item {
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  background: #fafbfc;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.column-item:hover {
  background: #f3f4f6;
  border-color: #e5e7eb;
}

.column-item.editing {
  background: #eff6ff;
  border-color: #3b82f6;
}

.column-main {
  margin-bottom: 0.5rem;
}

.column-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.column-name .name {
  font-weight: 600;
  color: #1f2937;
  font-size: 0.9375rem;
}

.key-badge {
  font-size: 0.75rem;
}

.column-type code {
  font-size: 0.75rem;
  color: #6b7280;
  background: #e5e7eb;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Consolas', monospace;
}

.column-desc {
  margin: 0.5rem 0 0 0;
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.5;
}

.edit-form {
  margin-top: 0.75rem;
}

.edit-form textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.8125rem;
  resize: vertical;
  font-family: inherit;
}

.edit-form textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.btn-save,
.btn-cancel {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-save {
  background: #2563eb;
  color: white;
}

.btn-save:hover {
  background: #1d4ed8;
}

.btn-cancel {
  background: #f3f4f6;
  color: #6b7280;
}

.btn-cancel:hover {
  background: #e5e7eb;
}

.btn-edit {
  padding: 0.25rem 0.5rem;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 4px;
  font-size: 0.7rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-edit:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #9ca3af;
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 0.875rem;
}

.placeholder-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
}

.placeholder-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 1rem;
  opacity: 0.4;
}

.placeholder-content p {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  color: #6b7280;
}

.placeholder-desc {
  font-size: 0.8125rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

/* 스크롤바 스타일 */
.column-list::-webkit-scrollbar {
  width: 6px;
}

.column-list::-webkit-scrollbar-track {
  background: transparent;
}

.column-list::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 3px;
}

.column-list::-webkit-scrollbar-thumb:hover {
  background: #d1d5db;
}

/* Security Tab Styles */
.security-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  overflow-y: auto;
}

.security-header {
  margin-bottom: 1rem;
}

.security-header h4 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.access-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.access-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 0.8125rem;
}

.access-target {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.access-level {
  padding: 0.25rem 0.625rem;
  border-radius: 12px;
  font-size: 0.6875rem;
  font-weight: 500;
}

.access-level.level-admin {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.access-level.level-write {
  background: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}

.access-level.level-read {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.access-level.level-none {
  background: rgba(156, 163, 175, 0.1);
  color: #6b7280;
}

.btn-remove {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

.btn-remove:hover {
  color: #ef4444;
}

.no-access {
  padding: 1rem;
  text-align: center;
  color: #9ca3af;
  font-size: 0.8125rem;
  background: #f9fafb;
  border-radius: 6px;
}

.add-access-form {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
}

.add-access-form select {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.75rem;
  background: white;
}

.add-access-form select:focus {
  outline: none;
  border-color: #3b82f6;
}

.btn-add {
  padding: 0.5rem 0.75rem;
  border: none;
  background: #2563eb;
  color: white;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-add:hover {
  background: #1d4ed8;
}
</style>



