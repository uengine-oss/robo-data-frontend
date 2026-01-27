<script setup lang="ts">
/**
 * UserManagement.vue
 * 사용자 관리 UI (Neo4j 기반 실제 데이터)
 */
import { ref, onMounted, computed } from 'vue'
import { IconPlus, IconEdit, IconTrash, IconSearch, IconCheck, IconX, IconRefresh } from '@/components/icons'
import { getUsers, createUser, updateUser, deleteUser as apiDeleteUser, getRoles } from '@/services/security-api'
import type { User, Role } from '@/services/security-api'

const users = ref<User[]>([])
const roles = ref<Role[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const searchQuery = ref('')
const showCreateDialog = ref(false)
const editingUser = ref<User | null>(null)

// 폼 데이터
const formData = ref({
  email: '',
  username: '',
  password: '',
  roles: [] as string[],
  status: 'active' as 'active' | 'inactive'
})

// 데이터 로드
async function loadData() {
  loading.value = true
  error.value = null
  try {
    const [usersData, rolesData] = await Promise.all([
      getUsers(),
      getRoles()
    ])
    users.value = usersData
    roles.value = rolesData
  } catch (e) {
    error.value = '데이터를 불러오는데 실패했습니다. 백엔드 서버가 실행 중인지 확인하세요.'
    console.error('Failed to load security data:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value
  const query = searchQuery.value.toLowerCase()
  return users.value.filter(
    u => u.email.toLowerCase().includes(query) ||
         u.username.toLowerCase().includes(query)
  )
})

const openCreateDialog = () => {
  formData.value = { email: '', username: '', password: '', roles: [], status: 'active' }
  editingUser.value = null
  showCreateDialog.value = true
}

const openEditDialog = (user: User) => {
  formData.value = {
    email: user.email,
    username: user.username,
    password: '',
    roles: [...user.roles],
    status: user.status
  }
  editingUser.value = user
  showCreateDialog.value = true
}

const saveUser = async () => {
  try {
    if (editingUser.value) {
      // Update
      await updateUser(editingUser.value.uid, {
        username: formData.value.username,
        roles: formData.value.roles,
        status: formData.value.status
      })
    } else {
      // Create
      await createUser({
        email: formData.value.email,
        username: formData.value.username,
        password: formData.value.password,
        roles: formData.value.roles
      })
    }
    showCreateDialog.value = false
    await loadData() // Refresh
  } catch (e) {
    alert('저장에 실패했습니다: ' + e)
  }
}

const handleDeleteUser = async (user: User) => {
  if (confirm(`정말 "${user.username}" 사용자를 삭제하시겠습니까?`)) {
    try {
      await apiDeleteUser(user.uid)
      await loadData()
    } catch (e) {
      alert('삭제에 실패했습니다: ' + e)
    }
  }
}

const toggleRole = (role: string) => {
  const idx = formData.value.roles.indexOf(role)
  if (idx >= 0) {
    formData.value.roles.splice(idx, 1)
  } else {
    formData.value.roles.push(role)
  }
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

const getRoleBadgeClass = (role: string) => {
  switch (role) {
    case 'admin': return 'badge-admin'
    case 'analyst': return 'badge-analyst'
    case 'readonly': return 'badge-readonly'
    default: return ''
  }
}
</script>

<template>
  <div class="user-management">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-box">
        <IconSearch :size="18" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="사용자 검색..."
        />
      </div>
      <div class="toolbar-actions">
        <button class="btn-refresh" @click="loadData" :disabled="loading">
          <IconRefresh :size="18" :class="{ spinning: loading }" />
        </button>
        <button class="btn-primary" @click="openCreateDialog">
          <IconPlus :size="18" />
          <span>사용자 추가</span>
        </button>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading-state">
      <IconRefresh :size="24" class="spinning" />
      <span>데이터 로딩 중...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="users.length === 0" class="empty-state">
      <p>등록된 사용자가 없습니다</p>
      <span>Neo4j에 User 노드가 있는지 확인하세요</span>
    </div>

    <!-- Users Table -->
    <div v-else class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>사용자</th>
            <th>역할</th>
            <th>상태</th>
            <th>생성일</th>
            <th>마지막 로그인</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filteredUsers" :key="user.uid">
            <td>
              <div class="user-info">
                <div class="avatar">{{ (user.username || user.email)[0].toUpperCase() }}</div>
                <div class="user-details">
                  <span class="username">{{ user.username }}</span>
                  <span class="email">{{ user.email }}</span>
                </div>
              </div>
            </td>
            <td>
              <div class="role-badges">
                <span
                  v-for="role in user.roles"
                  :key="role"
                  class="badge"
                  :class="getRoleBadgeClass(role)"
                >
                  {{ role }}
                </span>
                <span v-if="user.roles.length === 0" class="no-roles">없음</span>
              </div>
            </td>
            <td>
              <span class="status-badge" :class="user.status">
                {{ user.status === 'active' ? '활성' : '비활성' }}
              </span>
            </td>
            <td>{{ formatDate(user.created_at) }}</td>
            <td>{{ formatDate(user.last_login_at || '') }}</td>
            <td>
              <div class="actions">
                <button class="btn-icon" @click="openEditDialog(user)" title="수정">
                  <IconEdit :size="16" />
                </button>
                <button class="btn-icon danger" @click="handleDeleteUser(user)" title="삭제">
                  <IconTrash :size="16" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create/Edit Dialog -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="showCreateDialog = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ editingUser ? '사용자 수정' : '사용자 추가' }}</h3>
          <button class="btn-icon" @click="showCreateDialog = false">
            <IconX :size="20" />
          </button>
        </div>
        
        <div class="dialog-body">
          <div class="form-group">
            <label>이메일</label>
            <input 
              v-model="formData.email" 
              type="email" 
              placeholder="user@example.com"
              :disabled="!!editingUser"
            />
          </div>
          
          <div class="form-group">
            <label>사용자명</label>
            <input v-model="formData.username" type="text" placeholder="username" />
          </div>
          
          <div class="form-group" v-if="!editingUser">
            <label>비밀번호</label>
            <input v-model="formData.password" type="password" placeholder="••••••••" />
          </div>
          
          <div class="form-group">
            <label>역할</label>
            <div class="role-selector">
              <button
                v-for="role in roles"
                :key="role.name"
                class="role-option"
                :class="{ selected: formData.roles.includes(role.name) }"
                @click="toggleRole(role.name)"
              >
                <span class="role-check">
                  <IconCheck v-if="formData.roles.includes(role.name)" :size="14" />
                </span>
                <span class="role-name">{{ role.name }}</span>
                <span class="role-desc">{{ role.description }}</span>
              </button>
            </div>
          </div>
          
          <div class="form-group" v-if="editingUser">
            <label>상태</label>
            <select v-model="formData.status">
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showCreateDialog = false">취소</button>
          <button class="btn-primary" @click="saveUser">
            {{ editingUser ? '수정' : '생성' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.user-management {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 300px;

  input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    color: var(--color-text);
    font-size: 14px;
  }
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
  transition: all 0.2s;

  &:hover { background: var(--color-accent-hover); }
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;

  &:hover { background: var(--color-bg-secondary); }
}

.btn-icon {
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-light);
  transition: all 0.2s;

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  &.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
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

.table-container {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 14px 16px;
    text-align: left;
  }

  th {
    background: var(--color-bg-tertiary);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-light);
    border-bottom: 1px solid var(--color-border);
  }

  td {
    border-bottom: 1px solid var(--color-border);
    font-size: 14px;
  }

  tr:last-child td { border-bottom: none; }
  tr:hover { background: var(--color-bg-tertiary); }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent) 0%, #6366f1 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.username { font-weight: 500; color: var(--color-text); }
.email { font-size: 12px; color: var(--color-text-light); }

.role-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.no-roles { font-size: 12px; color: var(--color-text-muted); }

.badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;

  &.badge-admin { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  &.badge-analyst { background: rgba(34, 139, 230, 0.1); color: var(--color-accent); }
  &.badge-readonly { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
}

.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;

  &.active { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
  &.inactive { background: rgba(156, 163, 175, 0.1); color: #9ca3af; }
}

.actions { display: flex; gap: 4px; }

// Dialog styles
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
  width: 480px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);

  h3 { margin: 0; font-size: 18px; font-weight: 600; }
}

.dialog-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 60vh;
  overflow-y: auto;
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

  input, select {
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;

    &:focus { border-color: var(--color-accent); }
    &:disabled { opacity: 0.5; }
  }
}

.role-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
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

.role-check {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);

  .selected & {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: white;
  }
}

.role-name { font-weight: 500; color: var(--color-text); }
.role-desc { margin-left: auto; font-size: 12px; color: var(--color-text-light); }
</style>
