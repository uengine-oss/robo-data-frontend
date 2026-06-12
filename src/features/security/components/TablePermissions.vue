<script setup lang="ts">
/**
 * TablePermissions.vue
 * 계층 구조 기반 캐스케이드 권한 설정 UI
 * - 데이터소스 > 스키마 > 테이블 3레벨 계층
 * - 상위 레벨 권한이 하위로 캐스케이드
 * - 하위 레벨 설정이 상위를 오버라이드
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useSchemaCanvasStore } from '@/stores/schemaCanvas'
import { storeToRefs } from 'pinia'
import { 
  IconChevronRight, 
  IconChevronDown,
  IconDatabase, 
  IconFolder, 
  IconTable,
  IconSecurity,
  IconCheck,
  IconX
} from '@/components/icons'

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

// Store
const store = useSchemaCanvasStore()
const { allTables, datasources } = storeToRefs(store)

// State
const expandedDatasources = reactive<Record<string, boolean>>({})
const expandedSchemas = reactive<Record<string, boolean>>({})
const selectedNode = ref<HierarchyNode | null>(null)
const showAddDialog = ref(false)

// 권한 규칙 저장소 (path -> rules)
const accessRules = reactive<Record<string, AccessRule[]>>({})

// 사용 가능한 역할/사용자
const availableRoles = ['admin', 'analyst', 'readonly']
const availableUsers = ['admin@localhost', 'test@localhost', 'readonly@localhost']

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
    const ds = table.datasource || 'default'
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

// 초기 데이터 로드
onMounted(async () => {
  if (allTables.value.length === 0) {
    await store.loadAllTables()
  }
  
  // 첫 번째 데이터소스 확장
  if (datasources.value.length > 0) {
    expandedDatasources[datasources.value[0]] = true
  }
  
  // Mock 권한 데이터
  accessRules['mysql_jjy'] = [
    { target_type: 'role', target_name: 'analyst', level: 'read' }
  ]
  accessRules['mysql_jjy/insurance_db'] = [
    { target_type: 'role', target_name: 'readonly', level: 'none' } // 보험 DB 접근 차단
  ]
  accessRules['mysql_jjy/common_db/customers'] = [
    { target_type: 'role', target_name: 'analyst', level: 'write' } // 고객 테이블 쓰기 허용
  ]
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

// 노드 선택
function selectNode(type: TargetType, path: string, name: string) {
  selectedNode.value = {
    type,
    path,
    name,
    rules: getEffectiveRules(path)
  }
}

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
  
  // 상위부터 하위로 순회하며 규칙 적용
  for (let i = paths.length - 1; i >= 0; i--) {
    const currentPath = paths[i]
    const rules = accessRules[currentPath] || []
    
    rules.forEach(rule => {
      const key = `${rule.target_type}:${rule.target_name}`
      if (currentPath === path) {
        // 현재 레벨의 규칙은 직접 적용
        effectiveRules.set(key, { ...rule })
      } else {
        // 상위 레벨에서 상속
        if (!effectiveRules.has(key)) {
          effectiveRules.set(key, { 
            ...rule, 
            level: 'inherited' as AccessLevel,
            inherited_from: currentPath 
          })
        }
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
function addRule() {
  if (!selectedNode.value || !newRule.value.target_name) return
  
  const path = selectedNode.value.path
  if (!accessRules[path]) accessRules[path] = []
  
  // 기존 규칙 제거
  accessRules[path] = accessRules[path].filter(
    r => !(r.target_type === newRule.value.target_type && r.target_name === newRule.value.target_name)
  )
  
  // 새 규칙 추가
  accessRules[path].push({
    target_type: newRule.value.target_type,
    target_name: newRule.value.target_name,
    level: newRule.value.level
  })
  
  // 선택된 노드 업데이트
  selectedNode.value.rules = getEffectiveRules(path)
  
  // 폼 초기화
  showAddDialog.value = false
  newRule.value.target_name = ''
}

// 규칙 삭제
function removeRule(rule: AccessRule) {
  if (!selectedNode.value) return
  
  const path = selectedNode.value.path
  accessRules[path] = (accessRules[path] || []).filter(
    r => !(r.target_type === rule.target_type && r.target_name === rule.target_name)
  )
  
  selectedNode.value.rules = getEffectiveRules(path)
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
            @click="selectNode('datasource', ds, ds)"
          >
            <button class="toggle-btn" @click.stop="toggleDatasource(ds)">
              <IconChevronRight 
                v-if="!expandedDatasources[ds]" 
                :size="14" 
              />
              <IconChevronDown v-else :size="14" />
            </button>
            <IconDatabase :size="16" class="node-icon datasource-icon" />
            <span class="node-name">{{ ds }}</span>
            <span class="node-count">{{ getTableCountInDatasource(ds) }}</span>
            <span v-if="hasDirectRules(ds)" class="rule-indicator">🔒</span>
          </div>
          
          <!-- 스키마 레벨 -->
          <div v-if="expandedDatasources[ds]" class="node-children">
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
                @click="selectNode('schema', `${ds}/${schema}`, schema)"
              >
                <button class="toggle-btn" @click.stop="toggleSchema(ds, schema)">
                  <IconChevronRight 
                    v-if="!expandedSchemas[`${ds}/${schema}`]" 
                    :size="14" 
                  />
                  <IconChevronDown v-else :size="14" />
                </button>
                <IconFolder :size="16" class="node-icon schema-icon" />
                <span class="node-name">{{ schema }}</span>
                <span class="node-count">{{ getTablesInSchema(ds, schema).length }}</span>
                <span v-if="hasDirectRules(`${ds}/${schema}`)" class="rule-indicator">🔒</span>
              </div>
              
              <!-- 테이블 레벨 -->
              <div v-if="expandedSchemas[`${ds}/${schema}`]" class="node-children">
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
                    @click="selectNode('table', table.path, table.name)"
                  >
                    <span class="toggle-placeholder"></span>
                    <IconTable :size="16" class="node-icon table-icon" />
                    <span class="node-name">{{ table.name }}</span>
                    <span v-if="hasDirectRules(table.path)" class="rule-indicator">🔒</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 빈 상태 -->
        <div v-if="datasources.length === 0" class="empty-tree">
          <p>데이터소스가 없습니다</p>
          <span>스키마 관리에서 테이블을 로드하세요</span>
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
          <button class="btn-add" @click="showAddDialog = true">
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
                <button class="btn-remove" @click="removeRule(rule)">
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
                <span class="rule-level level-inherited">
                  상속됨
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
    <div v-if="showAddDialog" class="dialog-overlay" @click.self="showAddDialog = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ selectedNode?.name }}에 권한 추가</h3>
          <button class="btn-close" @click="showAddDialog = false">
            <IconX :size="20" />
          </button>
        </div>
        
        <div class="dialog-body">
          <div class="form-group">
            <label>대상 유형</label>
            <div class="radio-group">
              <label class="radio-option">
                <input type="radio" v-model="newRule.target_type" value="role" />
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
                class="level-btn"
                :class="{ selected: newRule.level === level, [getLevelClass(level)]: true }"
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
          <button class="btn-secondary" @click="showAddDialog = false">취소</button>
          <button 
            class="btn-primary" 
            @click="addRule"
            :disabled="!newRule.target_name"
          >
            추가
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

.tree-node {
  margin-bottom: 2px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
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

.toggle-placeholder {
  width: 20px;
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
  font-size: 12px;
  color: var(--color-text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.rule-level {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  
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
  max-height: 90vh;
  overflow: hidden;
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
</style>
