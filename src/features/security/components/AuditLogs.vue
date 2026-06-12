<script setup lang="ts">
/**
 * AuditLogs.vue
 * 감사 로그 조회 UI (파일 시스템 기반 실제 데이터)
 */
import { ref, onMounted, computed } from 'vue'
import { IconSearch, IconRefresh, IconEye, IconX } from '@/shared/icons'
import { getAuditLogs } from '@/services/security-api'
import type { AuditLog } from '@/services/security-api'

const logs = ref<AuditLog[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const searchQuery = ref('')
const statusFilter = ref<string>('all')
const selectedLog = ref<AuditLog | null>(null)
const showDetailModal = ref(false)

async function loadLogs() {
  loading.value = true
  error.value = null
  try {
    logs.value = await getAuditLogs({
      status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
      limit: 200
    })
  } catch (e) {
    error.value = '감사 로그를 불러오는데 실패했습니다.'
    console.error('Failed to load audit logs:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadLogs)

const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    const matchesSearch = !searchQuery.value || 
      log.original_sql.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      log.user_email.toLowerCase().includes(searchQuery.value.toLowerCase())
    
    return matchesSearch
  })
})

const refreshLogs = async () => {
  await loadLogs()
}

const showDetail = (log: AuditLog) => {
  selectedLog.value = log
  showDetailModal.value = true
}

const formatTimestamp = (ts: string) => {
  try {
    const date = new Date(ts)
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return ts
  }
}

const getStatusClass = (status: string) => {
  switch (status) {
    case 'allowed': return 'status-allowed'
    case 'denied': return 'status-denied'
    case 'rewritten': return 'status-rewritten'
    default: return ''
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'allowed': return '허용'
    case 'denied': return '거부'
    case 'rewritten': return '변경됨'
    default: return status
  }
}
</script>

<template>
  <div class="audit-logs">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-box">
        <IconSearch :size="18" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="SQL 또는 사용자 검색..."
        />
      </div>
      
      <select v-model="statusFilter" class="status-filter" @change="loadLogs">
        <option value="all">모든 상태</option>
        <option value="allowed">허용</option>
        <option value="denied">거부</option>
        <option value="rewritten">변경됨</option>
      </select>
      
      <button class="btn-refresh" @click="refreshLogs" :disabled="loading">
        <IconRefresh :size="18" :class="{ spinning: loading }" />
        새로고침
      </button>
    </div>

    <!-- Info -->
    <div class="info-banner">
      📁 감사 로그는 <code>data-secure-guard/logs/</code> 디렉토리에 JSONL 형식으로 저장됩니다.
    </div>

    <!-- Error -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading-state">
      <IconRefresh :size="24" class="spinning" />
      <span>로그 로딩 중...</span>
    </div>

    <!-- Empty -->
    <div v-else-if="logs.length === 0" class="empty-state">
      <p>감사 로그가 없습니다</p>
      <span>SQL 쿼리가 실행되면 로그가 기록됩니다</span>
    </div>

    <!-- Logs Table -->
    <div v-else class="table-container">
      <table class="logs-table">
        <thead>
          <tr>
            <th>시간</th>
            <th>사용자</th>
            <th>SQL</th>
            <th>상태</th>
            <th>실행시간</th>
            <th>상세</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in filteredLogs" :key="log.log_id">
            <td class="timestamp">{{ formatTimestamp(log.timestamp) }}</td>
            <td class="user">{{ log.user_email }}</td>
            <td class="sql">
              <code>{{ log.original_sql.slice(0, 60) }}{{ log.original_sql.length > 60 ? '...' : '' }}</code>
            </td>
            <td>
              <span class="status-badge" :class="getStatusClass(log.status)">
                {{ getStatusLabel(log.status) }}
              </span>
            </td>
            <td class="exec-time">
              {{ log.execution_time_ms ? `${log.execution_time_ms}ms` : '-' }}
            </td>
            <td>
              <button class="btn-view" @click="showDetail(log)">
                <IconEye :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail Modal -->
    <div v-if="showDetailModal && selectedLog" class="modal-overlay" @click.self="showDetailModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>감사 로그 상세</h3>
          <button class="btn-close" @click="showDetailModal = false">
            <IconX :size="20" />
          </button>
        </div>
        
        <div class="modal-body">
          <div class="detail-row">
            <label>로그 ID</label>
            <span class="mono">{{ selectedLog.log_id }}</span>
          </div>
          
          <div class="detail-row">
            <label>시간</label>
            <span>{{ new Date(selectedLog.timestamp).toLocaleString('ko-KR') }}</span>
          </div>
          
          <div class="detail-row">
            <label>사용자</label>
            <span>{{ selectedLog.user_email }}</span>
          </div>
          
          <div class="detail-row">
            <label>세션 ID</label>
            <span class="mono">{{ selectedLog.session_id }}</span>
          </div>
          
          <div class="detail-row">
            <label>상태</label>
            <span class="status-badge" :class="getStatusClass(selectedLog.status)">
              {{ getStatusLabel(selectedLog.status) }}
            </span>
          </div>
          
          <div class="sql-section">
            <label>원본 SQL</label>
            <pre class="sql-code">{{ selectedLog.original_sql }}</pre>
          </div>
          
          <div v-if="selectedLog.rewritten_sql" class="sql-section">
            <label>변환된 SQL</label>
            <pre class="sql-code rewritten">{{ selectedLog.rewritten_sql }}</pre>
          </div>
          
          <div v-if="selectedLog.details" class="detail-row">
            <label>상세 정보</label>
            <span class="details-text">{{ selectedLog.details }}</span>
          </div>
          
          <div v-if="selectedLog.execution_time_ms" class="detail-row">
            <label>실행 시간</label>
            <span>{{ selectedLog.execution_time_ms }}ms</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.audit-logs {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  flex: 1;
  max-width: 400px;

  input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    color: var(--color-text);
    font-size: 14px;
  }
}

.status-filter {
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 14px;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  cursor: pointer;
  font-size: 14px;

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

.info-banner {
  padding: 12px 16px;
  background: rgba(34, 139, 230, 0.08);
  border: 1px solid rgba(34, 139, 230, 0.2);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-light);

  code {
    background: var(--color-bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
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
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 12px 16px;
    text-align: left;
  }

  th {
    background: var(--color-bg-tertiary);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
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

.timestamp {
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.user { font-weight: 500; }

.sql {
  max-width: 300px;

  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    background: var(--color-bg-tertiary);
    padding: 4px 8px;
    border-radius: 4px;
    color: var(--color-text);
  }
}

.exec-time {
  color: var(--color-text-muted);
  font-size: 12px;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;

  &.status-allowed { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
  &.status-denied { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  &.status-rewritten { background: rgba(234, 179, 8, 0.1); color: #eab308; }
}

.btn-view {
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-light);

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-accent);
  }
}

// Modal
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-bg-secondary);
  border-radius: 16px;
  width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
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
  border-radius: 6px;
  color: var(--color-text-light);
  cursor: pointer;

  &:hover { background: var(--color-bg-tertiary); }
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-row {
  display: flex;
  gap: 16px;

  label {
    width: 100px;
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-light);
  }

  span {
    font-size: 14px;
    color: var(--color-text);
  }

  .mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }
}

.sql-section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-light);
  }
}

.sql-code {
  margin: 0;
  padding: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text);

  &.rewritten {
    border-color: #eab308;
    background: rgba(234, 179, 8, 0.05);
  }
}

.details-text {
  color: #ef4444;
  font-size: 13px;
}
</style>
