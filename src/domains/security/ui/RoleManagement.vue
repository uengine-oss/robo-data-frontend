<script setup lang="ts">
/**
 * RoleManagement.vue
 * 역할 및 권한 관리 UI (Neo4j 기반 실제 데이터)
 */
import { ref, onMounted, nextTick } from 'vue'
import { IconPlus, IconEdit, IconTrash, IconCheck, IconX, IconRefresh } from '@/shared/icons'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import {
  getRoles,
  createRole,
  deleteRole as apiDeleteRole,
  getPermissions,
  type Role,
  type Permission,
} from '../application/roles'

const roles = ref<Role[]>([])
const allPermissions = ref<Permission[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showDialog = ref(false)
const editorDialog = ref<HTMLElement | null>(null)
const roleNameInput = ref<HTMLInputElement | null>(null)
const editorPending = ref(false)
const editorError = ref<string | null>(null)
const deleteTarget = ref<Role | null>(null)
const deletePending = ref(false)
const deleteError = ref<string | null>(null)
let editorTrigger: HTMLElement | null = null

const formData = ref({
  name: '',
  description: '',
  priority: 50,
  permissions: [] as string[]
})

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const [rolesData, permsData] = await Promise.all([
      getRoles(),
      getPermissions()
    ])
    roles.value = rolesData
    allPermissions.value = permsData
  } catch (cause: unknown) {
    error.value = cause instanceof Error
      ? `데이터를 불러오는데 실패했습니다. ${cause.message}`
      : '데이터를 불러오는데 실패했습니다.'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const openCreateDialog = () => {
  editorTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  formData.value = { name: '', description: '', priority: 50, permissions: [] }
  editorError.value = null
  showDialog.value = true
  void nextTick(() => roleNameInput.value?.focus())
}

const closeEditor = () => {
  if (editorPending.value) return
  showDialog.value = false
  const focusTarget = editorTrigger
  editorTrigger = null
  void nextTick(() => {
    if (focusTarget?.isConnected) focusTarget.focus()
  })
}

const handleEditorKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeEditor()
    return
  }
  if (event.key !== 'Tab' || !editorDialog.value) return
  const focusable = [...editorDialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const saveRole = async () => {
  if (editorPending.value) return
  editorPending.value = true
  editorError.value = null
  try {
    await createRole({
      name: formData.value.name,
      description: formData.value.description,
      priority: formData.value.priority,
      permissions: formData.value.permissions
    })
    showDialog.value = false
    await loadData()
    const focusTarget = editorTrigger
    editorTrigger = null
    void nextTick(() => {
      if (focusTarget?.isConnected) focusTarget.focus()
    })
  } catch (cause: unknown) {
    editorError.value = cause instanceof Error ? cause.message : '역할을 저장하지 못했습니다.'
  } finally {
    editorPending.value = false
  }
}

const requestDeleteRole = (role: Role) => {
  if (role.is_system) return
  deleteTarget.value = role
  deleteError.value = null
}

const cancelDeleteRole = () => {
  if (deletePending.value) return
  deleteTarget.value = null
  deleteError.value = null
}

const confirmDeleteRole = async () => {
  const role = deleteTarget.value
  if (!role || deletePending.value) return
  deletePending.value = true
  deleteError.value = null
  try {
    await apiDeleteRole(role.name)
    deleteTarget.value = null
    await loadData()
  } catch (cause: unknown) {
    deleteError.value = cause instanceof Error ? cause.message : '역할을 삭제하지 못했습니다.'
  } finally {
    deletePending.value = false
  }
}

const togglePermission = (permKey: string) => {
  const idx = formData.value.permissions.indexOf(permKey)
  if (idx >= 0) {
    formData.value.permissions.splice(idx, 1)
  } else {
    formData.value.permissions.push(permKey)
  }
}

const getPermissionKey = (p: Permission) => `${p.action}:${p.resource_type}`

const groupedPermissions = () => {
  const groups: Record<string, Permission[]> = {}
  for (const p of allPermissions.value) {
    if (!groups[p.resource_type]) {
      groups[p.resource_type] = []
    }
    groups[p.resource_type].push(p)
  }
  return groups
}

const resourceTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    table: '테이블',
    schema: '스키마',
    model: 'ML 모델',
    admin: '관리'
  }
  return labels[type] || type
}

const getPriorityClass = (priority: number) => {
  if (priority >= 100) return 'priority-high'
  if (priority >= 50) return 'priority-medium'
  return 'priority-low'
}
</script>

<template>
  <div class="role-management">
    <!-- Toolbar -->
    <div class="toolbar">
      <h2>역할 관리</h2>
      <div class="toolbar-actions">
        <button type="button" class="btn-refresh" aria-label="역할 새로고침" @click="loadData" :disabled="loading">
          <IconRefresh :size="18" :class="{ spinning: loading }" />
        </button>
        <button type="button" class="btn-primary" @click="openCreateDialog">
          <IconPlus :size="18" />
          <span>역할 추가</span>
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading-state">
      <IconRefresh :size="24" class="spinning" />
      <span>데이터 로딩 중...</span>
    </div>

    <!-- Empty -->
    <div v-else-if="roles.length === 0" class="empty-state">
      <p>등록된 역할이 없습니다</p>
      <span>Neo4j에 Role 노드가 있는지 확인하세요</span>
    </div>

    <!-- Roles Grid -->
    <div v-else class="roles-grid">
      <div v-for="role in roles" :key="role.name" class="role-card">
        <div class="role-header">
          <div class="role-info">
            <h3>{{ role.name }}</h3>
            <span v-if="role.is_system" class="system-badge">시스템</span>
          </div>
          <div class="role-actions">
            <button
              type="button"
              class="btn-icon"
              disabled
              aria-label="역할 수정 API 미제공"
              title="Security 서비스에 역할 수정 API가 없습니다"
            >
              <IconEdit :size="16" />
            </button>
            <button 
              type="button"
              class="btn-icon danger" 
              @click="requestDeleteRole(role)"
              :disabled="role.is_system"
              :aria-label="role.is_system ? `${role.name} 시스템 역할 삭제 불가` : `${role.name} 삭제`"
              title="삭제"
            >
              <IconTrash :size="16" />
            </button>
          </div>
        </div>
        
        <p class="role-description">{{ role.description || '설명 없음' }}</p>
        
        <div class="role-meta">
          <span class="priority" :class="getPriorityClass(role.priority)">
            우선순위: {{ role.priority }}
          </span>
          <span class="perm-count">{{ role.permissions.length }}개 권한</span>
        </div>
        
        <div class="permissions-list">
          <span 
            v-for="perm in role.permissions.slice(0, 5)" 
            :key="perm" 
            class="perm-badge"
          >
            {{ perm.split(':')[0] }}
          </span>
          <span v-if="role.permissions.length > 5" class="perm-more">
            +{{ role.permissions.length - 5 }}
          </span>
          <span v-if="role.permissions.length === 0" class="no-perms">없음</span>
        </div>
      </div>
    </div>

    <!-- Dialog -->
    <div v-if="showDialog" class="dialog-overlay" @click.self="closeEditor" @keydown="handleEditorKeydown">
      <div
        ref="editorDialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-editor-title"
        :aria-busy="editorPending"
      >
        <div class="dialog-header">
          <h3 id="role-editor-title">역할 추가</h3>
          <button type="button" class="btn-icon" aria-label="역할 추가 닫기" :disabled="editorPending" @click="closeEditor">
            <IconX :size="20" />
          </button>
        </div>
        
        <div class="dialog-body">
          <div class="form-group">
            <label for="security-role-name">역할명</label>
            <input 
              id="security-role-name"
              ref="roleNameInput"
              v-model="formData.name" 
              type="text" 
              placeholder="role_name"
            />
          </div>
          
          <div class="form-group">
            <label for="security-role-description">설명</label>
            <input id="security-role-description" v-model="formData.description" type="text" placeholder="역할 설명" />
          </div>
          
          <div class="form-group">
            <label for="security-role-priority">우선순위 (높을수록 먼저 적용)</label>
            <input id="security-role-priority" v-model.number="formData.priority" type="number" min="1" max="100" />
          </div>
          
          <div class="form-group" v-if="allPermissions.length > 0">
            <label>권한</label>
            <div class="permissions-selector">
              <div 
                v-for="(perms, type) in groupedPermissions()" 
                :key="type"
                class="perm-group"
              >
                <h4>{{ resourceTypeLabel(type) }}</h4>
                <div class="perm-options">
                  <button
                    v-for="p in perms"
                    :key="getPermissionKey(p)"
                    class="perm-option"
                    :class="{ selected: formData.permissions.includes(getPermissionKey(p)) }"
                    @click="togglePermission(getPermissionKey(p))"
                  >
                    <span class="perm-check">
                      <IconCheck v-if="formData.permissions.includes(getPermissionKey(p))" :size="12" />
                    </span>
                    <span class="perm-action">{{ p.action }}</span>
                    <span class="perm-desc">{{ p.description || p.resource_type }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="editorError" class="error-message" role="alert">{{ editorError }}</div>
        </div>
        
        <div class="dialog-footer">
          <button type="button" class="btn-secondary" :disabled="editorPending" @click="closeEditor">취소</button>
          <button type="button" class="btn-primary" :disabled="editorPending" @click="saveRole">
            {{ editorPending ? '저장 중…' : editorError ? '다시 시도' : '생성' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <ActionDialog
    :open="Boolean(deleteTarget)"
    dialog-id="security-role-delete"
    title="역할 삭제"
    :message="deleteTarget ? `정말 '${deleteTarget.name}' 역할을 삭제하시겠습니까?` : ''"
    confirm-label="삭제"
    pending-label="삭제 중…"
    :pending="deletePending"
    :error="deleteError"
    @cancel="cancelDeleteRole"
    @confirm="confirmDeleteRole"
  />
</template>

<style lang="scss" scoped>
.role-management {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 { margin: 0; font-size: 18px; font-weight: 600; }
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.btn-refresh {
  padding: 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text-light);

  &:hover { background: var(--color-bg-secondary); }
  &:disabled { opacity: 0.5; }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;

  &:hover { background: var(--color-accent-hover); }
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
}

.btn-icon {
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-light);

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  &.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  &:disabled { opacity: 0.3; cursor: not-allowed; }
}

.error-message {
  padding: 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #ef4444;
  text-align: center;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
  gap: 12px;

  p { margin: 0; font-weight: 500; }
  span { font-size: 13px; }
}

.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.role-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-accent);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

.role-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.role-info {
  display: flex;
  align-items: center;
  gap: 8px;

  h3 { margin: 0; font-size: 16px; font-weight: 600; }
}

.system-badge {
  padding: 2px 8px;
  background: rgba(34, 139, 230, 0.1);
  color: var(--color-accent);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.role-actions { display: flex; gap: 4px; }

.role-description {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--color-text-light);
}

.role-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
}

.priority {
  padding: 4px 8px;
  border-radius: 4px;

  &.priority-high { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  &.priority-medium { background: rgba(234, 179, 8, 0.1); color: #eab308; }
  &.priority-low { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
}

.perm-count { color: var(--color-text-muted); }

.permissions-list { display: flex; flex-wrap: wrap; gap: 6px; }

.perm-badge {
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-light);
}

.perm-more, .no-perms {
  padding: 4px 10px;
  color: var(--color-text-muted);
  font-size: 11px;
}

// Dialog
.dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--color-bg-secondary);
  border-radius: 16px;
  width: 600px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);

  h3 { margin: 0; font-size: 18px; }
}

.dialog-body {
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-light);
  }

  input {
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 14px;
    outline: none;

    &:focus { border-color: var(--color-accent); }
    &:disabled { opacity: 0.5; }
  }
}

.permissions-selector {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
}

.perm-group {
  h4 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-light);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.perm-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.perm-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;

  &:hover { border-color: var(--color-accent); }

  &.selected {
    border-color: var(--color-accent);
    background: rgba(34, 139, 230, 0.1);
  }
}

.perm-check {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  .selected & {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: white;
  }
}

.perm-action {
  font-weight: 500;
  font-size: 13px;
  color: var(--color-text);
  min-width: 120px;
}

.perm-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

@media (max-width: 720px) {
  .toolbar {
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .toolbar-actions { margin-left: auto; }

  .dialog-header,
  .dialog-body,
  .dialog-footer {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
