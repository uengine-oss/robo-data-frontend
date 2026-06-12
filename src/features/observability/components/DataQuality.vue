<script setup lang="ts">
/**
 * DataQuality.vue
 * 데이터 품질 관리 페이지
 */
import { ref, computed } from 'vue'
import { IconSearch, IconPlus, IconCheck, IconAlertTriangle, IconChevronDown, IconChevronRight } from '@/components/icons'
import TestCaseModal from './TestCaseModal.vue'

// 현재 탭
const currentSubTab = ref<'test-cases' | 'test-suites'>('test-cases')

// 필터 상태
const tableFilter = ref('')
const typeFilter = ref('')
const statusFilter = ref('')
const tagsFilter = ref('')
const searchQuery = ref('')
const showAdvancedFilters = ref(false)

// 테스트 케이스 추가 모달
const showTestCaseModal = ref(false)

// 더미 테스트 케이스 데이터
interface TestCase {
  id: string
  name: string
  table: string
  column: string
  status: 'Success' | 'Failed' | 'Aborted'
  failureReason?: string
  lastRun: string
  hasIncident: boolean
}

const testCases = ref<TestCase[]>([
  {
    id: '1',
    name: 'check_name_not_null',
    table: 'sample_snowflake.ANALYTICS_DB.prod.customer_360',
    column: 'name',
    status: 'Failed',
    failureReason: 'Found 17 failed rows (1.79%)',
    lastRun: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    hasIncident: true
  },
  {
    id: '2',
    name: 'check_total_orders_range',
    table: 'sample_snowflake.ANALYTICS_DB.prod.customer_360',
    column: 'total_orders',
    status: 'Failed',
    failureReason: 'Found 5 failed rows (0.52%)',
    lastRun: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    hasIncident: true
  },
  {
    id: '3',
    name: 'check_customer_id_unique',
    table: 'sample_snowflake.ANALYTICS_DB.prod.customer_360',
    column: 'customer_id',
    status: 'Success',
    lastRun: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    hasIncident: false
  },
  {
    id: '4',
    name: 'check_null_customer_id',
    table: 'sample_snowflake.ANALYTICS_DB.prod.customer_360',
    column: 'customer_id',
    status: 'Success',
    lastRun: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    hasIncident: false
  },
  {
    id: '5',
    name: 'check_email_format',
    table: 'sample_snowflake.ANALYTICS_DB.prod.customer_360',
    column: 'email',
    status: 'Success',
    lastRun: '12월 24, 2025, 1:35 오전 (UTC+09:00)',
    hasIncident: false
  }
])

// 통계 계산
const stats = computed(() => {
  const total = testCases.value.length
  const success = testCases.value.filter(t => t.status === 'Success').length
  const failed = testCases.value.filter(t => t.status === 'Failed').length
  const aborted = testCases.value.filter(t => t.status === 'Aborted').length
  
  const uniqueTables = new Set(testCases.value.map(t => t.table))
  const healthyAssets = uniqueTables.size - new Set(testCases.value.filter(t => t.status === 'Failed').map(t => t.table)).size
  
  return {
    total,
    success,
    failed,
    aborted,
    successRate: Math.round((success / total) * 100),
    healthyAssets,
    totalAssets: uniqueTables.size,
    healthyRate: Math.round((healthyAssets / uniqueTables.size) * 100),
    coverage: 22.73
  }
})

// 필터링된 테스트 케이스
const filteredTestCases = computed(() => {
  return testCases.value.filter(tc => {
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      if (!tc.name.toLowerCase().includes(query) && !tc.table.toLowerCase().includes(query)) {
        return false
      }
    }
    if (statusFilter.value && tc.status !== statusFilter.value) {
      return false
    }
    return true
  })
})

const openTestCaseModal = () => {
  showTestCaseModal.value = true
}

const handleTestCaseCreate = (testCase: any) => {
  console.log('New test case:', testCase)
  showTestCaseModal.value = false
}
</script>

<template>
  <div class="data-quality">
    <!-- 헤더 -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="page-title">데이터 품질</h1>
        <p class="page-description">품질 테스트로 데이터에 대한 신뢰를 구축하고 신뢰할 수 있는 데이터 제품을 만드세요.</p>
      </div>
      <button class="btn btn--primary" @click="openTestCaseModal">
        <IconPlus :size="16" />
        테스트 케이스 추가
      </button>
    </header>

    <!-- 서브 탭 -->
    <div class="sub-tabs">
      <button 
        class="sub-tab" 
        :class="{ active: currentSubTab === 'test-cases' }"
        @click="currentSubTab = 'test-cases'"
      >
        테스트 케이스들
      </button>
      <button 
        class="sub-tab" 
        :class="{ active: currentSubTab === 'test-suites' }"
        @click="currentSubTab = 'test-suites'"
      >
        테스트 스위트들
      </button>
    </div>

    <!-- 필터 바 -->
    <div class="filter-bar">
      <button class="filter-toggle" @click="showAdvancedFilters = !showAdvancedFilters">
        고급
        <component :is="showAdvancedFilters ? IconChevronDown : IconChevronRight" :size="14" />
      </button>
      
      <div class="filter-group">
        <label>테이블:</label>
        <select v-model="tableFilter" class="filter-select">
          <option value="">테이블</option>
          <option value="customer_360">customer_360</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label>유형:</label>
        <select v-model="typeFilter" class="filter-select">
          <option value="">유형</option>
          <option value="null_check">Null Check</option>
          <option value="unique_check">Unique Check</option>
          <option value="range_check">Range Check</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label>현황:</label>
        <select v-model="statusFilter" class="filter-select">
          <option value="">현황</option>
          <option value="Success">Success</option>
          <option value="Failed">Failed</option>
          <option value="Aborted">Aborted</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label>태그들:</label>
        <input type="text" v-model="tagsFilter" placeholder="태그들" class="filter-input" />
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-info">
          <div class="stat-header">
            <span class="stat-icon">📊</span>
            <span class="stat-label">전체 테스트들</span>
          </div>
          <div class="stat-value">{{ stats.total }}</div>
        </div>
        <div class="stat-chart">
          <div class="donut-chart">
            <svg viewBox="0 0 36 36">
              <path
                class="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                class="circle-success"
                :stroke-dasharray="`${stats.successRate}, 100`"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span class="donut-text">{{ stats.successRate }}%</span>
          </div>
          <div class="stat-legend">
            <div class="legend-item">
              <span class="legend-dot success"></span>
              Success {{ stats.success }}
            </div>
            <div class="legend-item">
              <span class="legend-dot aborted"></span>
              Aborted {{ stats.aborted }}
            </div>
            <div class="legend-item">
              <span class="legend-dot failed"></span>
              Failed {{ stats.failed }}
            </div>
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-info">
          <div class="stat-header">
            <span class="stat-icon">😊</span>
            <span class="stat-label">정상 데이터 자산</span>
          </div>
          <div class="stat-value">{{ stats.healthyAssets }}</div>
        </div>
        <div class="stat-chart">
          <div class="donut-chart light-blue">
            <svg viewBox="0 0 36 36">
              <path
                class="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                class="circle-primary"
                :stroke-dasharray="`${stats.healthyRate}, 100`"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span class="donut-text">{{ stats.healthyRate }}%</span>
          </div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-info">
          <div class="stat-header">
            <span class="stat-icon">✨</span>
            <span class="stat-label">데이터 자산 커버리지</span>
          </div>
          <div class="stat-value">{{ stats.totalAssets }}</div>
        </div>
        <div class="stat-chart">
          <div class="donut-chart light-blue">
            <svg viewBox="0 0 36 36">
              <path
                class="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                class="circle-primary"
                :stroke-dasharray="`${stats.coverage}, 100`"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span class="donut-text">{{ stats.coverage }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 테스트 케이스 인사이트 섹션 -->
    <section class="test-cases-section">
      <div class="section-header">
        <div>
          <h2 class="section-title">테스트 케이스 인사이트</h2>
          <p class="section-description">구성된 테스트 검증을 기반으로 데이터셋 상태의 중앙 집중식 보기에 액세스합니다.</p>
        </div>
        <div class="search-box">
          <IconSearch :size="16" />
          <input type="text" v-model="searchQuery" placeholder="테스트 케이스 검색" />
        </div>
      </div>

      <!-- 테스트 케이스 테이블 -->
      <div class="test-cases-table">
        <table>
          <thead>
            <tr>
              <th>현황</th>
              <th>실패/중단 사유</th>
              <th>마지막 실행 <span class="sort-icon">⇅</span></th>
              <th>이름 <span class="sort-icon">⇅</span></th>
              <th>테이블 <span class="sort-icon">⇅</span></th>
              <th>열 <span class="sort-icon">⇅</span></th>
              <th>사고</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tc in filteredTestCases" :key="tc.id">
              <td>
                <span class="status-badge" :class="tc.status.toLowerCase()">
                  <IconCheck v-if="tc.status === 'Success'" :size="12" />
                  <IconAlertTriangle v-else :size="12" />
                  {{ tc.status }}
                </span>
              </td>
              <td class="failure-reason">{{ tc.failureReason || '- -' }}</td>
              <td class="last-run">{{ tc.lastRun }}</td>
              <td>
                <a href="#" class="link">{{ tc.name }}</a>
              </td>
              <td>
                <a href="#" class="link">{{ tc.table.split('.').pop() }}</a>
              </td>
              <td>{{ tc.column }}</td>
              <td>
                <span v-if="tc.hasIncident" class="incident-badge">New</span>
                <span v-else>- -</span>
              </td>
              <td>
                <button class="action-btn">⋮</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 테스트 케이스 추가 모달 -->
    <TestCaseModal 
      v-if="showTestCaseModal"
      @close="showTestCaseModal = false"
      @create="handleTestCaseCreate"
    />
  </div>
</template>

<style lang="scss" scoped>
.data-quality {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg);
  overflow-y: auto;
  background: var(--color-bg);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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

.sub-tabs {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0;
}

.sub-tab {
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-light);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
  
  &:hover {
    color: var(--color-text);
  }
  
  &.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-lg);
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-accent);
  font-size: 13px;
  cursor: pointer;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  
  label {
    font-size: 13px;
    color: var(--color-text-light);
  }
}

.filter-select,
.filter-input {
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 13px;
  min-width: 120px;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.stat-card {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .stat-icon {
    font-size: 18px;
  }
  
  .stat-label {
    font-size: 14px;
    color: var(--color-text-light);
  }
}

.stat-value {
  font-size: 36px;
  font-weight: 600;
  color: var(--color-text-bright);
}

.stat-chart {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.donut-chart {
  position: relative;
  width: 80px;
  height: 80px;
  
  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  
  .circle-bg {
    fill: none;
    stroke: var(--color-bg-tertiary);
    stroke-width: 3;
  }
  
  .circle-success {
    fill: none;
    stroke: var(--color-success);
    stroke-width: 3;
    stroke-linecap: round;
  }
  
  .circle-primary {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 3;
    stroke-linecap: round;
  }
  
  .donut-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }
}

.stat-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-light);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  
  &.success { background: var(--color-success); }
  &.aborted { background: var(--color-warning); }
  &.failed { background: var(--color-error); }
}

.test-cases-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-bright);
  margin-bottom: 4px;
}

.section-description {
  font-size: 13px;
  color: var(--color-text-light);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  min-width: 250px;
  
  input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-size: 13px;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
    }
  }
  
  svg {
    color: var(--color-text-muted);
  }
}

.test-cases-table {
  flex: 1;
  overflow: auto;
  
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  th, td {
    padding: var(--spacing-md);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  
  th {
    background: var(--color-bg-tertiary);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-light);
    text-transform: uppercase;
    white-space: nowrap;
    
    .sort-icon {
      color: var(--color-text-muted);
      margin-left: 4px;
    }
  }
  
  td {
    font-size: 13px;
    color: var(--color-text);
  }
  
  tbody tr:hover {
    background: var(--color-bg-tertiary);
  }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  
  &.success {
    background: rgba(64, 192, 87, 0.15);
    color: var(--color-success);
  }
  
  &.failed {
    background: rgba(250, 82, 82, 0.15);
    color: var(--color-error);
  }
  
  &.aborted {
    background: rgba(250, 176, 5, 0.15);
    color: var(--color-warning);
  }
}

.failure-reason {
  color: var(--color-text-light);
  font-size: 12px;
}

.last-run {
  font-size: 12px;
  color: var(--color-text-light);
  white-space: nowrap;
}

.link {
  color: var(--color-accent);
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
}

.incident-badge {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(124, 58, 237, 0.15);
  color: var(--color-accent-secondary);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.action-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
}
</style>



