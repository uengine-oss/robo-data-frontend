<script setup lang="ts">
/**
 * TablePermissions.vue
 * 계층 구조 기반 캐스케이드 권한 설정 UI
 * - 데이터소스 > 스키마 > 테이블 3레벨 계층
 * - 상위 레벨 권한이 하위로 캐스케이드
 * - 하위 레벨 설정이 상위를 오버라이드
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import {
  deleteAccessRule,
  getAccessRules,
  getRoles,
  getTables,
  getUsers,
  saveAccessRule,
} from '../application/tableAccess'
import { 
  IconChevronRight, 
  IconChevronDown,
  IconDatabase, 
  IconFolder, 
  IconTable,
  IconSecurity,
  IconCheck,
  IconX
} from '@/shared/icons'

// Types
type AccessLevel = 'none' | 'read' | 'write' | 'admin' | 'inherited'
type TargetType = 'datasource' | 'schema' | 'table'

interface AccessRule {
  target_type: 'user' | 'role'
  target_name: string
  level: AccessLevel
  inherited_from?: string // 상속받은 경로 (예: "mysql_jjy" 또는 "mysql_jjy/common_db")
}

interface HierarchyNode {
  type: TargetType
  path: string // 고유 경로 (예: "mysql_jjy/common_db/customers")
  name: string
  parent?: string
  rules: AccessRule[]
}

interface SecurityTable {
  name: string
  schema: string
  db: string
}

const allTables = ref<SecurityTable[]>([])

// State
const expandedDatasources = reactive<Record<string, boolean>>({})
const expandedSchemas = reactive<Record<string, boolean>>({})
const selectedNode = ref<HierarchyNode | null>(null)
const showAddDialog = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const addDialogRef = ref<HTMLElement | null>(null)
const addTargetTypeRef = ref<HTMLInputElement | null>(null)

// 권한 규칙 저장소 (path -> rules)
const accessRules = reactive<Record<string, AccessRule[]>>({})

// 사용 가능한 역할/사용자
const availableRoles = ref<string[]>([])
const availableUsers = ref<string[]>([])

// 새 규칙 폼
const newRule = ref({
  target_type: 'role' as 'user' | 'role',
  target_name: '',
  level: 'read' as AccessLevel
})

// 데이터소스별 스키마 그룹핑
const tablesByDatasource = computed(() => {
  const grouped: Record<string, Record<string, Array<{ name: string; path: string }>>> = {}
  
  allTables.value.forEach(table => {
    const ds = table.db || 'default'
    const schema = table.schema || 'public'
    
    if (!grouped[ds]) grouped[ds] = {}
    if (!grouped[ds][schema]) grouped[ds][schema] = []
    
    grouped[ds][schema].push({
      name: table.name,
      path: `${ds}/${schema}/${table.name}`
    })
  })
  
  return grouped
})
const datasources = computed(() => Object.keys(tablesByDatasource.value).sort())

async function loadPermissions() {
  loading.value = true
  error.value = null
  selectedNode.value = null

  try {
    const [tables, rules, roles, users] = await Promise.all([
      getTables(),
      getAccessRules(),
      getRoles(),
      getUsers(),
    ])

    allTables.value = tables
    availableRoles.value = roles.map(role => role.name)
    availableUsers.value = users.map(user => user.email)

    Object.keys(accessRules).forEach(path => delete accessRules[path])
    rules.forEach(({ path, target_type, target_name, level, inherited_from }) => {
      if (!accessRules[path]) accessRules[path] = []
      accessRules[path].push({ target_type, target_name, level, inherited_from })
    })

    const firstDatasource = datasources.value[0]
    if (firstDatasource) expandedDatasources[firstDatasource] = true
  } catch (cause: unknown) {
    allTables.value = []
    error.value = cause instanceof Error
      ? `보안 권한 데이터를 불러오지 못했습니다. ${cause.message}`
      : '보안 권한 데이터를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadPermissions()
})

// 스키마 목록
function getSchemasInDatasource(ds: string): string[] {
  return Object.keys(tablesByDatasource.value[ds] || {}).sort()
}

// 테이블 목록
function getTablesInSchema(ds: string, schema: string) {
  return tablesByDatasource.value[ds]?.[schema] || []
}

// 테이블 개수
function getTableCountInDatasource(ds: string): number {
  const schemas = tablesByDatasource.value[ds] || {}
  return Object.values(schemas).reduce((sum, tables) => sum + tables.length, 0)
}

// 토글
function toggleDatasource(ds: string) {
  expandedDatasources[ds] = !expandedDatasources[ds]
}

function toggleSchema(ds: string, schema: string) {
  const key = `${ds}/${schema}`
  expandedSchemas[key] = !expandedSchemas[key]
}

function treeIdentity(value: string): string {
  return encodeURIComponent(value)
}

function datasourceChildrenId(ds: string): string {
  return `security-datasource-${treeIdentity(ds)}-schemas`
}

function schemaChildrenId(ds: string, schema: string): string {
  return `security-schema-${treeIdentity(ds)}-${treeIdentity(schema)}-tables`
}

// 노드 선택
function selectNode(type: TargetType, path: string, name: string) {
  selectedNode.value = {
    type,
    path,
    name,
    rules: getEffectiveRules(path)
  }
}

function openAddDialog() {
  error.value = null
  showAddDialog.value = true
}

function closeAddDialog() {
  showAddDialog.value = false
}

useDialogFocusLifecycle({
  active: () => showAddDialog.value,
  dialog: addDialogRef,
  requestClose: closeAddDialog,
  initialFocus: () => addTargetTypeRef.value,
})

// 경로에서 상위 경로들 추출
function getParentPaths(path: string): string[] {
  const parts = path.split('/')
  const paths: string[] = []
  for (let i = 1; i <= parts.length; i++) {
    paths.push(parts.slice(0, i).join('/'))
  }
  return paths.reverse() // 가장 구체적인 것부터
}

// 실제 적용되는 권한 규칙 계산 (캐스케이드)
function getEffectiveRules(path: string): AccessRule[] {
  const paths = getParentPaths(path)
  const effectiveRules: Map<string, AccessRule> = new Map()
  
  // 상위부터 하위로 순회하며 더 구체적인 규칙으로 덮어쓴다.
  for (let i = paths.length - 1; i >= 0; i--) {
    const currentPath = paths[i]
    const rules = accessRules[currentPath] || []
    
    rules.forEach(rule => {
      const key = `${rule.target_type}:${rule.target_name}`
      if (currentPath === path) {
        effectiveRules.set(key, { ...rule, inherited_from: undefined })
      } else {
        effectiveRules.set(key, {
          ...rule,
          inherited_from: currentPath
        })
      }
    })
  }
  
  return Array.from(effectiveRules.values())
}

// 직접 설정된 규칙만 가져오기
function getDirectRules(path: string): AccessRule[] {
  return accessRules[path] || []
}

// 규칙 추가
async function addRule() {
  if (!selectedNode.value || !newRule.value.target_name) return

  const selected = { ...selectedNode.value }
  const path = selected.path
  const submittedRule: AccessRule = {
    target_type: newRule.value.target_type,
    target_name: newRule.value.target_name,
    level: newRule.value.level,
  }
  saving.value = true
  error.value = null
  try {
    await saveAccessRule({
      path,
      ...submittedRule,
    })

    const rules = accessRules[path] || []
    const existingIndex = rules.findIndex(
      rule => rule.target_type === submittedRule.target_type && rule.target_name === submittedRule.target_name,
    )
    if (existingIndex >= 0) rules[existingIndex] = submittedRule
    else rules.push(submittedRule)
    accessRules[path] = rules
    selectNode(selected.type, selected.path, selected.name)
    closeAddDialog()
    newRule.value.target_name = ''
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? `권한을 저장하지 못했습니다. ${cause.message}` : '권한을 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

// 규칙 삭제
async function removeRule(rule: AccessRule) {
  if (!selectedNode.value) return

  const path = selectedNode.value.path
  saving.value = true
  error.value = null
  try {
    await deleteAccessRule(path, rule.target_type, rule.target_name)
    accessRules[path] = (accessRules[path] || []).filter(
      item => !(item.target_type === rule.target_type && item.target_name === rule.target_name)
    )
    selectedNode.value.rules = getEffectiveRules(path)
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? `권한을 삭제하지 못했습니다. ${cause.message}` : '권한을 삭제하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

// 노드에 직접 규칙이 있는지 확인
function hasDirectRules(path: string): boolean {
  return (accessRules[path] || []).length > 0
}

// 레벨 표시
function getLevelLabel(level: AccessLevel): string {
  const labels: Record<AccessLevel, string> = {
    admin: '관리자',
    write: '읽기/쓰기',
    read: '읽기 전용',
    none: '접근 불가',
    inherited: '상속됨'
  }
  return labels[level] || level
}

function getLevelClass(level: AccessLevel): string {
  return `level-${level}`
}

function getTypeLabel(type: TargetType): string {
  const labels: Record<TargetType, string> = {
    datasource: '데이터소스',
    schema: '스키마',
    table: '테이블'
  }
  return labels[type]
}
</script>

<template>
  <div class="table-permissions">
    <!-- 왼쪽: 계층 트리 -->
    <div class="hierarchy-tree">
      <div class="tree-header">
        <IconDatabase :size="16" />
        <span>데이터 계층 구조</span>
      </div>
      
      <div class="tree-content">
        <div v-if="error" class="permissions-error" role="alert">
          <span>{{ error }}</span>
          <button type="button" @click="loadPermissions">다시 시도</button>
        </div>
        <div v-else-if="loading" class="permissions-loading">권한 데이터를 불러오는 중...</div>

        <!-- 데이터소스 레벨 -->
        <div 
          v-for="ds in datasources" 
          :key="ds"
          class="tree-node datasource-node"
        >
          <div
            class="node-header"
            :class="{ 
              active: selectedNode?.path === ds,
              'has-rules': hasDirectRules(ds)
            }"
          >
            <button
              type="button"
              class="toggle-btn"
              :aria-label="`${ds} 데이터소스 ${expandedDatasources[ds] ? '접기' : '펼치기'}`"
              :aria-expanded="Boolean(expandedDatasources[ds])"
              :aria-controls="datasourceChildrenId(ds)"
              @click="toggleDatasource(ds)"
            >
              <IconChevronRight 
                v-if="!expandedDatasources[ds]" 
                :size="14" 
              />
              <IconChevronDown v-else :size="14" />
            </button>
            <button
              type="button"
              class="node-select"
              :aria-label="`${ds} 데이터소스 권한 선택`"
              :aria-pressed="selectedNode?.path === ds"
              @click="selectNode('datasource', ds, ds)"
            >
              <IconDatabase :size="16" class="node-icon datasource-icon" />
              <span class="node-name">{{ ds }}</span>
              <span class="node-count">{{ getTableCountInDatasource(ds) }}</span>
              <span v-if="hasDirectRules(ds)" class="rule-indicator">🔒</span>
            </button>
          </div>
          
          <!-- 스키마 레벨 -->
          <div
            v-if="expandedDatasources[ds]"
            :id="datasourceChildrenId(ds)"
            class="node-children"
          >
            <div 
              v-for="schema in getSchemasInDatasource(ds)" 
              :key="`${ds}/${schema}`"
              class="tree-node schema-node"
            >
              <div
                class="node-header"
                :class="{ 
                  active: selectedNode?.path === `${ds}/${schema}`,
                  'has-rules': hasDirectRules(`${ds}/${schema}`)
                }"
              >
                <button
                  type="button"
                  class="toggle-btn"
                  :aria-label="`${schema} 스키마 ${expandedSchemas[`${ds}/${schema}`] ? '접기' : '펼치기'}`"
                  :aria-expanded="Boolean(expandedSchemas[`${ds}/${schema}`])"
                  :aria-controls="schemaChildrenId(ds, schema)"
                  @click="toggleSchema(ds, schema)"
                >
                  <IconChevronRight 
                    v-if="!expandedSchemas[`${ds}/${schema}`]" 
                    :size="14" 
                  />
                  <IconChevronDown v-else :size="14" />
                </button>
                <button
                  type="button"
                  class="node-select"
                  :aria-label="`${schema} 스키마 권한 선택`"
                  :aria-pressed="selectedNode?.path === `${ds}/${schema}`"
                  @click="selectNode('schema', `${ds}/${schema}`, schema)"
                >
                  <IconFolder :size="16" class="node-icon schema-icon" />
                  <span class="node-name">{{ schema }}</span>
                  <span class="node-count">{{ getTablesInSchema(ds, schema).length }}</span>
                  <span v-if="hasDirectRules(`${ds}/${schema}`)" class="rule-indicator">🔒</span>
                </button>
              </div>
              
              <!-- 테이블 레벨 -->
              <div
                v-if="expandedSchemas[`${ds}/${schema}`]"
                :id="schemaChildrenId(ds, schema)"
                class="node-children"
              >
                <div 
                  v-for="table in getTablesInSchema(ds, schema)" 
                  :key="table.path"
                  class="tree-node table-node"
                >
                  <div
                    class="node-header"
                    :class="{ 
                      active: selectedNode?.path === table.path,
                      'has-rules': hasDirectRules(table.path)
                    }"
                  >
                    <span class="toggle-placeholder"></span>
                    <button
                      type="button"
                      class="node-select"
                      :aria-label="`${table.name} 테이블 권한 선택`"
                      :aria-pressed="selectedNode?.path === table.path"
                      @click="selectNode('table', table.path, table.name)"
                    >
                      <IconTable :size="16" class="node-icon table-icon" />
                      <span class="node-name">{{ table.name }}</span>
                      <span v-if="hasDirectRules(table.path)" class="rule-indicator">🔒</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 빈 상태 -->
        <div v-if="!loading && !error && datasources.length === 0" class="empty-tree">
          <p>데이터소스가 없습니다</p>
          <span>Security 서비스에 등록된 테이블이 없습니다</span>
        </div>
      </div>
    </div>
    
    <!-- 오른쪽: 권한 설정 패널 -->
    <div class="permission-panel">
      <template v-if="selectedNode">
        <div class="panel-header">
          <div class="selected-info">
            <span class="selected-type">{{ getTypeLabel(selectedNode.type) }}</span>
            <h3>{{ selectedNode.name }}</h3>
            <span class="selected-path">{{ selectedNode.path }}</span>
          </div>
          <button type="button" class="btn-add" @click="openAddDialog">
            + 권한 추가
          </button>
        </div>
        
        <div class="panel-content">
          <!-- 상속 설명 -->
          <div class="cascade-info">
            <IconSecurity :size="16" />
            <span>
              이 {{ getTypeLabel(selectedNode.type) }}에 설정된 권한은 
              <strong v-if="selectedNode.type !== 'table'">하위 항목에 자동 적용</strong>
              <strong v-else>직접 적용</strong>됩니다.
            </span>
          </div>
          
          <!-- 직접 설정된 규칙 -->
          <div class="rules-section">
            <h4>직접 설정된 권한</h4>
            <div v-if="getDirectRules(selectedNode.path).length > 0" class="rules-list">
              <div 
                v-for="rule in getDirectRules(selectedNode.path)" 
                :key="`${rule.target_type}-${rule.target_name}`"
                class="rule-item direct-rule"
              >
                <span class="rule-target">
                  {{ rule.target_type === 'user' ? '👤' : '🎭' }}
                  {{ rule.target_name }}
                </span>
                <span class="rule-level" :class="getLevelClass(rule.level)">
                  {{ getLevelLabel(rule.level) }}
                </span>
                <button
                  type="button"
                  class="btn-remove"
                  :aria-label="`${rule.target_name} 직접 권한 삭제`"
                  :disabled="saving"
                  @click="removeRule(rule)"
                >
                  <IconX :size="14" />
                </button>
              </div>
            </div>
            <div v-else class="no-rules">
              직접 설정된 권한이 없습니다
            </div>
          </div>
          
          <!-- 상속받은 규칙 -->
          <div v-if="selectedNode.type !== 'datasource'" class="rules-section inherited-section">
            <h4>상위에서 상속된 권한</h4>
            <div class="inherited-rules">
              <div 
                v-for="rule in selectedNode.rules.filter(r => r.inherited_from)" 
                :key="`inherited-${rule.target_type}-${rule.target_name}`"
                class="rule-item inherited-rule"
              >
                <span class="rule-target">
                  {{ rule.target_type === 'user' ? '👤' : '🎭' }}
                  {{ rule.target_name }}
                </span>
                <span class="rule-source">
                  ← {{ rule.inherited_from }}
                </span>
                <span class="rule-level" :class="getLevelClass(rule.level)">
                  {{ getLevelLabel(rule.level) }} · 상속됨
                </span>
              </div>
              <div v-if="selectedNode.rules.filter(r => r.inherited_from).length === 0" class="no-rules">
                상속된 권한이 없습니다
              </div>
            </div>
          </div>
        </div>
      </template>
      
      <!-- 선택 안됨 -->
      <div v-else class="empty-panel">
        <IconSecurity :size="48" />
        <h3>계층 선택</h3>
        <p>왼쪽 트리에서 데이터소스, 스키마 또는 테이블을 선택하세요</p>
      </div>
    </div>
    
    <!-- 규칙 추가 다이얼로그 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click.self="closeAddDialog">
      <div
        ref="addDialogRef"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-add-title"
        tabindex="-1"
      >
        <div class="dialog-header">
          <h3 id="permission-add-title">{{ selectedNode?.name }}에 권한 추가</h3>
          <button type="button" class="btn-close" aria-label="권한 추가 닫기" @click="closeAddDialog">
            <IconX :size="20" />
          </button>
        </div>
        
        <div class="dialog-body">
          <div v-if="error" class="dialog-error" role="alert">{{ error }}</div>
          <div class="form-group">
            <label>대상 유형</label>
            <div class="radio-group">
              <label class="radio-option">
                <input ref="addTargetTypeRef" type="radio" v-model="newRule.target_type" value="role" />
                <span>🎭 역할</span>
              </label>
              <label class="radio-option">
                <input type="radio" v-model="newRule.target_type" value="user" />
                <span>👤 사용자</span>
              </label>
            </div>
          </div>
          
          <div class="form-group">
            <label>{{ newRule.target_type === 'role' ? '역할' : '사용자' }} 선택</label>
            <select v-model="newRule.target_name">
              <option value="">선택하세요</option>
              <template v-if="newRule.target_type === 'role'">
                <option v-for="r in availableRoles" :key="r" :value="r">{{ r }}</option>
              </template>
              <template v-else>
                <option v-for="u in availableUsers" :key="u" :value="u">{{ u }}</option>
              </template>
            </select>
          </div>
          
          <div class="form-group">
            <label>접근 수준</label>
            <div class="level-options">
              <button
                v-for="level in (['read', 'write', 'admin', 'none'] as AccessLevel[])"
                :key="level"
                type="button"
                class="level-btn"
                :class="{ selected: newRule.level === level, [getLevelClass(level)]: true }"
                :aria-pressed="newRule.level === level"
                @click="newRule.level = level"
              >
                <IconCheck v-if="newRule.level === level" :size="14" />
                {{ getLevelLabel(level) }}
              </button>
            </div>
          </div>
          
          <div class="cascade-note">
            <strong>참고:</strong> 
            <template v-if="selectedNode?.type === 'datasource'">
              이 권한은 모든 스키마와 테이블에 적용됩니다.
            </template>
            <template v-else-if="selectedNode?.type === 'schema'">
              이 권한은 스키마 내 모든 테이블에 적용됩니다.
            </template>
            <template v-else>
              이 권한은 해당 테이블에만 적용됩니다.
            </template>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button type="button" class="btn-secondary" @click="closeAddDialog">취소</button>
          <button 
            type="button"
            class="btn-primary" 
            @click="addRule"
            :disabled="!newRule.target_name || saving"
          >
            {{ saving ? '저장 중...' : '추가' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.table-permissions {
  display: flex;
  height: 100%;
  gap: 1px;
  background: var(--color-border);
}

// 왼쪽 트리
.hierarchy-tree {
  width: 320px;
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
}

.tree-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.permissions-error,
.permissions-loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 8px;
  padding: 14px;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 8px;
}

.permissions-error {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.22);
  border: 1px solid rgba(239, 68, 68, 0.35);

  button {
    align-self: flex-start;
    padding: 6px 10px;
    color: white;
    font-weight: 600;
    background: #ef4444;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }
}

.permissions-loading {
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
}

.tree-node {
  margin-bottom: 2px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 6px;
  transition: all 0.15s;
  color: var(--color-text-light);
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
  
  &.active {
    background: rgba(34, 139, 230, 0.15);
    color: var(--color-accent);
  }
  
  &.has-rules {
    font-weight: 500;
  }
}

.node-select {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  padding: 6px 6px;
  border: 0;
  border-radius: 4px;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.toggle-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    color: var(--color-text);
  }
}

.toggle-btn:focus-visible,
.node-select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.toggle-placeholder {
  width: 20px;
  flex-shrink: 0;
}

.node-icon {
  flex-shrink: 0;
  
  &.datasource-icon { color: #60a5fa; }
  &.schema-icon { color: #fbbf24; }
  &.table-icon { color: #34d399; }
}

.node-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-count {
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 10px;
}

.rule-indicator {
  font-size: 12px;
}

.node-children {
  margin-left: 20px;
  padding-left: 10px;
  border-left: 1px solid var(--color-border);
}

.empty-tree {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-muted);
  
  p { margin: 0 0 8px; font-weight: 500; }
  span { font-size: 13px; }
}

// 오른쪽 패널
.permission-panel {
  flex: 1;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.selected-info {
  .selected-type {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
  }
  
  h3 {
    margin: 4px 0;
    font-size: 18px;
    font-weight: 600;
  }
  
  .selected-path {
    font-size: 12px;
    color: var(--color-text-light);
    font-family: 'JetBrains Mono', monospace;
  }
}

.btn-add {
  padding: 10px 16px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  
  &:hover {
    background: var(--color-accent-hover);
  }
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.cascade-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: rgba(34, 139, 230, 0.08);
  border: 1px solid rgba(34, 139, 230, 0.2);
  border-radius: 8px;
  margin-bottom: 24px;
  font-size: 13px;
  color: var(--color-text-light);
  
  strong { color: var(--color-accent); }
}

.rules-section {
  margin-bottom: 24px;
  
  h4 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-light);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.inherited-section h4 {
  color: var(--color-text-muted);
}

.rules-list, .inherited-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  
  &.inherited-rule {
    opacity: 0.7;
    border-style: dashed;
  }
}

.rule-target {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.rule-source {
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  font-family: 'JetBrains Mono', monospace;
  overflow-wrap: anywhere;
}

.rule-level {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  
  &.level-admin { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  &.level-write { background: rgba(234, 179, 8, 0.1); color: #eab308; }
  &.level-read { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
  &.level-none { background: rgba(156, 163, 175, 0.1); color: #9ca3af; }
  &.level-inherited { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
}

.btn-remove {
  padding: 6px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 4px;
  
  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
}

.no-rules {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  background: var(--color-bg-secondary);
  border: 1px dashed var(--color-border);
  border-radius: 8px;
}

.empty-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  gap: 12px;
  
  h3 { margin: 0; color: var(--color-text-light); }
  p { margin: 0; font-size: 14px; }
}

// Dialog
.dialog-overlay {
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
}

.dialog {
  background: var(--color-bg-secondary);
  border-radius: 16px;
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog:focus-visible,
.dialog :focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  
  h3 { margin: 0; font-size: 18px; }
}

.btn-close {
  padding: 8px;
  background: transparent;
  border: none;
  color: var(--color-text-light);
  cursor: pointer;
  border-radius: 6px;
  
  &:hover { background: var(--color-bg-tertiary); }
}

.dialog-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.dialog-error {
  padding: 10px 12px;
  border: 1px solid var(--color-error);
  border-radius: 8px;
  color: var(--color-error);
  overflow-wrap: anywhere;
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
  
  select {
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 14px;
  }
}

.radio-group {
  display: flex;
  gap: 20px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  
  input { accent-color: var(--color-accent); }
}

.level-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.level-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  
  &:hover { border-color: currentColor; }
  &.selected { border-width: 2px; font-weight: 600; }
}

.cascade-note {
  padding: 12px 14px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-light);
  
  strong { color: var(--color-text); }
}

.btn-primary {
  padding: 10px 20px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
}

@media (max-width: 720px) {
  .table-permissions {
    flex-direction: column;
    overflow-y: auto;
  }

  .hierarchy-tree {
    width: 100%;
    min-height: 180px;
    max-height: 40%;
    flex-shrink: 0;
  }

  .permission-panel { min-height: 260px; }

  .inherited-rule {
    flex-wrap: wrap;

    .rule-target {
      min-width: 80px;
    }

    .rule-source {
      order: 3;
      flex-basis: 100%;
      padding-left: 28px;
    }
  }

  .dialog-header,
  .dialog-body,
  .dialog-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .dialog-overlay {
    align-items: flex-start;
    padding: 16px;
  }

  .dialog {
    max-height: calc(100dvh - 32px);
  }
}
</style>
