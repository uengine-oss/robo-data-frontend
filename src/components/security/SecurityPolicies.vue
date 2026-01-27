<script setup lang="ts">
/**
 * SecurityPolicies.vue
 * 보안 정책 관리 UI
 */
import { ref, onMounted } from 'vue'
import { IconEdit, IconX } from '@/components/icons'

interface SecurityPolicy {
  name: string
  policy_type: string
  description: string
  rules_json: string
  priority: number
  is_active: boolean
}

const policies = ref<SecurityPolicy[]>([])
const loading = ref(true)
const editingPolicy = ref<SecurityPolicy | null>(null)
const showEditDialog = ref(false)

const editForm = ref({
  rules_json: '',
  priority: 0,
  is_active: true
})

onMounted(async () => {
  try {
    // Mock data
    policies.value = [
      {
        name: 'default_limit',
        policy_type: 'query_limit',
        description: '기본 SELECT 결과 행 수 제한',
        rules_json: JSON.stringify({ max_rows: 1000, enforce_limit: true }, null, 2),
        priority: 100,
        is_active: true
      },
      {
        name: 'pii_protection',
        policy_type: 'column_mask',
        description: '개인정보(PII) 컬럼 마스킹',
        rules_json: JSON.stringify({
          masked_columns: ['ssn', 'phone', 'email', 'address'],
          mask_pattern: '***',
          except_roles: ['admin']
        }, null, 2),
        priority: 90,
        is_active: true
      },
      {
        name: 'salary_restriction',
        policy_type: 'column_filter',
        description: '급여 정보 접근 제한',
        rules_json: JSON.stringify({
          restricted_columns: ['salary', 'bonus', 'commission'],
          allowed_roles: ['admin', 'hr_manager']
        }, null, 2),
        priority: 85,
        is_active: true
      },
      {
        name: 'project_prefix',
        policy_type: 'query_rewrite',
        description: '프로젝트 테이블 프리픽스 강제',
        rules_json: JSON.stringify({
          prefix: 'robo_postgres',
          apply_to: ['SELECT', 'DESCRIBE']
        }, null, 2),
        priority: 80,
        is_active: false
      },
      {
        name: 'rate_limit',
        policy_type: 'rate_limit',
        description: '쿼리 실행 속도 제한',
        rules_json: JSON.stringify({
          max_queries_per_minute: 100,
          max_concurrent: 5,
          except_roles: ['admin']
        }, null, 2),
        priority: 70,
        is_active: true
      }
    ]
  } finally {
    loading.value = false
  }
})

const openEditDialog = (policy: SecurityPolicy) => {
  editingPolicy.value = policy
  editForm.value = {
    rules_json: policy.rules_json,
    priority: policy.priority,
    is_active: policy.is_active
  }
  showEditDialog.value = true
}

const savePolicy = () => {
  if (!editingPolicy.value) return
  
  const idx = policies.value.findIndex(p => p.name === editingPolicy.value!.name)
  if (idx >= 0) {
    policies.value[idx] = {
      ...policies.value[idx],
      rules_json: editForm.value.rules_json,
      priority: editForm.value.priority,
      is_active: editForm.value.is_active
    }
  }
  
  showEditDialog.value = false
}

const toggleActive = (policy: SecurityPolicy) => {
  policy.is_active = !policy.is_active
}

const getPolicyTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    query_limit: '쿼리 제한',
    column_mask: '컬럼 마스킹',
    column_filter: '컬럼 필터',
    query_rewrite: '쿼리 변환',
    rate_limit: '속도 제한'
  }
  return labels[type] || type
}

const getPolicyTypeIcon = (type: string) => {
  const icons: Record<string, string> = {
    query_limit: '📊',
    column_mask: '🔒',
    column_filter: '🚫',
    query_rewrite: '✏️',
    rate_limit: '⏱️'
  }
  return icons[type] || '📋'
}
</script>

<template>
  <div class="security-policies">
    <!-- Header -->
    <div class="section-header">
      <h2>보안 정책</h2>
      <p>SQL 쿼리에 적용되는 보안 정책을 관리합니다.</p>
    </div>

    <!-- Policies List -->
    <div class="policies-list">
      <div 
        v-for="policy in policies" 
        :key="policy.name"
        class="policy-card"
        :class="{ inactive: !policy.is_active }"
      >
        <div class="policy-header">
          <div class="policy-icon">{{ getPolicyTypeIcon(policy.policy_type) }}</div>
          <div class="policy-info">
            <h3>{{ policy.name }}</h3>
            <span class="policy-type">{{ getPolicyTypeLabel(policy.policy_type) }}</span>
          </div>
          <div class="policy-controls">
            <label class="toggle">
              <input 
                type="checkbox" 
                :checked="policy.is_active"
                @change="toggleActive(policy)"
              />
              <span class="toggle-slider"></span>
            </label>
            <button class="btn-edit" @click="openEditDialog(policy)">
              <IconEdit :size="16" />
            </button>
          </div>
        </div>
        
        <p class="policy-description">{{ policy.description }}</p>
        
        <div class="policy-meta">
          <span class="priority">우선순위: {{ policy.priority }}</span>
          <span class="status" :class="{ active: policy.is_active }">
            {{ policy.is_active ? '활성' : '비활성' }}
          </span>
        </div>
        
        <div class="policy-rules">
          <pre>{{ policy.rules_json }}</pre>
        </div>
      </div>
    </div>

    <!-- Edit Dialog -->
    <div v-if="showEditDialog && editingPolicy" class="dialog-overlay" @click.self="showEditDialog = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ editingPolicy.name }} 정책 수정</h3>
          <button class="btn-icon" @click="showEditDialog = false">
            <IconX :size="20" />
          </button>
        </div>
        
        <div class="dialog-body">
          <div class="form-group">
            <label>정책 규칙 (JSON)</label>
            <textarea 
              v-model="editForm.rules_json"
              rows="12"
              placeholder="{ }"
            ></textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>우선순위</label>
              <input v-model.number="editForm.priority" type="number" min="1" max="100" />
            </div>
            
            <div class="form-group">
              <label>상태</label>
              <select v-model="editForm.is_active">
                <option :value="true">활성</option>
                <option :value="false">비활성</option>
              </select>
            </div>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showEditDialog = false">취소</button>
          <button class="btn-primary" @click="savePolicy">저장</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.security-policies {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-header {
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  p {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--color-text-light);
  }
}

.policies-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.policy-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-accent);
  }

  &.inactive {
    opacity: 0.6;

    .policy-rules pre {
      opacity: 0.5;
    }
  }
}

.policy-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.policy-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  font-size: 20px;
}

.policy-info {
  flex: 1;

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }
}

.policy-type {
  font-size: 12px;
  color: var(--color-text-muted);
}

.policy-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .toggle-slider {
      background: var(--color-accent);

      &:before {
        transform: translateX(20px);
      }
    }
  }
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-bg-tertiary);
  border-radius: 24px;
  transition: 0.2s;

  &:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: 0.2s;
  }
}

.btn-edit {
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-light);

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-accent);
  }
}

.policy-description {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--color-text-light);
}

.policy-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
}

.priority {
  color: var(--color-text-muted);
}

.status {
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(156, 163, 175, 0.1);
  color: #9ca3af;

  &.active {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }
}

.policy-rules {
  pre {
    margin: 0;
    padding: 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    overflow-x: auto;
    color: var(--color-text-light);
  }
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
  width: 600px;
  max-height: 90vh;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);

  h3 {
    margin: 0;
    font-size: 18px;
  }
}

.btn-icon {
  padding: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-light);
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

  input, select, textarea {
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 14px;
    outline: none;

    &:focus {
      border-color: var(--color-accent);
    }
  }

  textarea {
    font-family: 'JetBrains Mono', monospace;
    resize: vertical;
  }
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.btn-primary {
  padding: 10px 20px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
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
