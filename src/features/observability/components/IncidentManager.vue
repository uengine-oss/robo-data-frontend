<script setup lang="ts">
/**
 * IncidentManager.vue
 * 사고 관리자 페이지 - 데이터 품질 사고 추적
 */
import { ref, computed } from 'vue'

// 필터 상태
const testCaseFilter = ref('')
const assigneeFilter = ref('')
const statusFilter = ref('')
const dateRangeFilter = ref('30')

// 사고 데이터
interface Incident {
  id: string
  testCaseName: string
  table: string
  lastUpdated: string
  status: 'New' | 'Acknowledged' | 'Resolved' | 'Muted'
  severity: string
  assignee: string
}

const incidents = ref<Incident[]>([
  {
    id: '1',
    testCaseName: 'check_null_customer_id',
    table: 'customer_360',
    lastUpdated: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    status: 'New',
    severity: 'No Severity',
    assignee: ''
  },
  {
    id: '2',
    testCaseName: 'check_name_not_null',
    table: 'customer_360',
    lastUpdated: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    status: 'New',
    severity: 'No Severity',
    assignee: ''
  },
  {
    id: '3',
    testCaseName: 'check_total_orders_range',
    table: 'customer_360',
    lastUpdated: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    status: 'New',
    severity: 'No Severity',
    assignee: ''
  }
])

// 필터링된 사고 목록
const filteredIncidents = computed(() => {
  return incidents.value.filter(inc => {
    if (statusFilter.value && inc.status !== statusFilter.value) {
      return false
    }
    if (assigneeFilter.value && inc.assignee !== assigneeFilter.value) {
      return false
    }
    return true
  })
})

// 상태 스타일
const getStatusClass = (status: string) => {
  switch (status) {
    case 'New': return 'new'
    case 'Acknowledged': return 'acknowledged'
    case 'Resolved': return 'resolved'
    case 'Muted': return 'muted'
    default: return ''
  }
}
</script>

<template>
  <div class="incident-manager">
    <!-- 헤더 -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="page-title">사고 관리자</h1>
        <p class="page-description">품질 테스트로 데이터에 대한 신뢰를 구축하고 신뢰할 수 있는 데이터 제품을 만드세요.</p>
      </div>
    </header>

    <!-- 필터 바 -->
    <div class="filter-bar">
      <div class="filter-group">
        <select v-model="testCaseFilter" class="filter-select wide">
          <option value="">테스트 케이스</option>
          <option value="check_null_customer_id">check_null_customer_id</option>
          <option value="check_name_not_null">check_name_not_null</option>
          <option value="check_total_orders_range">check_total_orders_range</option>
        </select>
      </div>
      
      <div class="filter-spacer"></div>
      
      <div class="filter-group">
        <label>담당자:</label>
        <input type="text" v-model="assigneeFilter" placeholder="담당자" class="filter-input" />
      </div>
      
      <div class="filter-group">
        <label>현황:</label>
        <select v-model="statusFilter" class="filter-select">
          <option value="">현황</option>
          <option value="New">New</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Resolved">Resolved</option>
          <option value="Muted">Muted</option>
        </select>
      </div>
      
      <div class="filter-group">
        <select v-model="dateRangeFilter" class="filter-select">
          <option value="7">최근 7일</option>
          <option value="30">최근 30일</option>
          <option value="90">최근 90일</option>
          <option value="all">전체</option>
        </select>
      </div>
    </div>

    <!-- 사고 테이블 -->
    <div class="incidents-table-container">
      <table class="incidents-table">
        <thead>
          <tr>
            <th>테스트 케이스 이름</th>
            <th>테이블</th>
            <th>마지막 업데이트</th>
            <th>현황</th>
            <th>심각도</th>
            <th>담당자</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="incident in filteredIncidents" :key="incident.id">
            <td>
              <a href="#" class="link">{{ incident.testCaseName }}</a>
            </td>
            <td>
              <a href="#" class="link">{{ incident.table }}</a>
            </td>
            <td class="date-cell">{{ incident.lastUpdated }}</td>
            <td>
              <span class="status-badge" :class="getStatusClass(incident.status)">
                {{ incident.status }}
              </span>
            </td>
            <td>
              <span class="severity-badge">{{ incident.severity }}</span>
            </td>
            <td class="assignee-cell">
              <span v-if="incident.assignee">{{ incident.assignee }}</span>
              <span v-else class="no-assignee">
                <span class="assignee-icon">👤</span>
                담당자 없음
              </span>
            </td>
          </tr>
          
          <tr v-if="filteredIncidents.length === 0">
            <td colspan="6" class="empty-row">
              사고가 없습니다.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.incident-manager {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg);
  overflow-y: auto;
  background: var(--color-bg);
}

.page-header {
  margin-bottom: var(--spacing-lg);
}

.header-content {
  .page-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin-bottom: 4px;
  }
  
  .page-description {
    font-size: 14px;
    color: var(--color-text-light);
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  
  label {
    font-size: 13px;
    color: var(--color-text-light);
    white-space: nowrap;
  }
}

.filter-spacer {
  flex: 1;
}

.filter-select,
.filter-input {
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 13px;
  min-width: 120px;
  
  &.wide {
    min-width: 200px;
  }
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.incidents-table-container {
  flex: 1;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.incidents-table {
  width: 100%;
  border-collapse: collapse;
  
  th, td {
    padding: var(--spacing-md) var(--spacing-lg);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  
  th {
    background: var(--color-bg-tertiary);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-light);
  }
  
  td {
    font-size: 13px;
    color: var(--color-text);
  }
  
  tbody tr:hover {
    background: var(--color-bg-tertiary);
  }
}

.link {
  color: var(--color-accent);
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
}

.date-cell {
  font-size: 12px;
  color: var(--color-text-light);
  white-space: nowrap;
}

.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  
  &.new {
    background: rgba(124, 58, 237, 0.15);
    color: var(--color-accent-secondary);
  }
  
  &.acknowledged {
    background: rgba(34, 139, 230, 0.15);
    color: var(--color-accent);
  }
  
  &.resolved {
    background: rgba(64, 192, 87, 0.15);
    color: var(--color-success);
  }
  
  &.muted {
    background: rgba(128, 128, 128, 0.15);
    color: var(--color-text-light);
  }
}

.severity-badge {
  display: inline-block;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-text-light);
}

.assignee-cell {
  .no-assignee {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-text-muted);
    font-size: 12px;
  }
  
  .assignee-icon {
    font-size: 14px;
  }
}

.empty-row {
  text-align: center;
  padding: var(--spacing-xl) !important;
  color: var(--color-text-muted);
}
</style>



