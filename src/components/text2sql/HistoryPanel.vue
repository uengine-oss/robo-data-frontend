<template>
  <div class="history-panel" :class="{ collapsed: !isOpen }">
    <!-- 토글 버튼 -->
    <button class="toggle-btn" @click="$emit('toggle')">
      <IconHistory :size="16" />
      <span v-if="isOpen">히스토리</span>
    </button>

    <!-- 패널 내용 -->
    <div v-if="isOpen" class="panel-content">
      <!-- 헤더 -->
      <div class="panel-header">
        <h3>쿼리 히스토리</h3>
        <div class="header-actions">
          <button v-if="historyStore.items.length > 0" class="clear-btn" @click="handleClearAll" title="전체 삭제">
            <IconTrash :size="14" />
          </button>
          <button class="refresh-btn" @click="refreshHistory" title="새로고침">
            <IconRefresh :size="14" :class="{ spinning: historyStore.loading }" />
          </button>
        </div>
      </div>

      <!-- 검색 -->
      <div class="search-box">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="검색..." 
          @input="debouncedSearch"
        />
      </div>

      <!-- 히스토리 목록 -->
      <div class="history-list" ref="listRef">
        <div v-if="historyStore.loading" class="loading">
          <div class="spinner"></div>
        </div>
        
        <div v-else-if="historyStore.items.length === 0" class="empty">
          <IconHistory :size="32" />
          <p>히스토리가 없습니다</p>
        </div>

        <template v-else>
          <div
            v-for="item in historyStore.items"
            :key="item.id"
            class="history-item"
            :class="{ 
              active: historyStore.selectedItem?.id === item.id,
              error: item.status === 'error'
            }"
            @click="selectItem(item)"
          >
            <div class="item-header">
              <span class="status-dot" :class="item.status"></span>
              <span class="time">{{ formatTime(item.created_at) }}</span>
              <button class="delete-btn" @click.stop="deleteItem(item.id)" title="삭제">
                <IconX :size="12" />
              </button>
            </div>
            <div class="item-question">{{ truncateText(item.question, 60) }}</div>
            <div v-if="item.final_sql" class="item-sql">
              <code>{{ truncateText(item.final_sql, 40) }}</code>
            </div>
            <div v-if="item.row_count !== null" class="item-meta">
              {{ item.row_count }}행 · {{ Math.round(item.execution_time_ms || 0) }}ms
              <span v-if="item.steps_count" class="steps-badge">{{ item.steps_count }} 스텝</span>
            </div>
            
            <!-- 하단 버튼 영역 -->
            <div class="item-actions">
              <!-- 세부사항 보기 버튼 -->
              <button 
                v-if="item.steps && item.steps.length > 0"
                class="detail-btn"
                @click.stop="toggleDetails(item.id)"
                :title="expandedItems.has(item.id) ? '세부사항 접기' : '세부사항 보기'"
              >
                <IconChevron :size="12" :class="{ expanded: expandedItems.has(item.id) }" />
                <span>{{ expandedItems.has(item.id) ? '접기' : '세부사항' }}</span>
              </button>
              
              <!-- 온톨로지 내보내기 버튼 -->
              <button 
                v-if="item.final_sql"
                class="export-ontology-btn"
                @click.stop="exportToOntology(item)"
                title="온톨로지로 내보내기 - ObjectType 생성"
              >
                🧩
                <span>온톨로지</span>
              </button>
              
              <!-- OLAP 내보내기 버튼 -->
              <button 
                v-if="item.final_sql"
                class="export-olap-btn"
                @click.stop="exportToOlap(item)"
                title="OLAP으로 내보내기 - DW 스키마 설계"
              >
                <IconBarChart :size="12" />
                <span>OLAP</span>
              </button>
              
              <!-- 감시 에이전트 생성 버튼 -->
              <button 
                v-if="item.final_sql && item.status === 'completed'"
                class="create-agent-btn"
                @click.stop="createAgentFromQuery(item)"
                title="이 쿼리로 감시 에이전트 생성"
              >
                <IconWatchAgent :size="12" />
                <span>감시 에이전트</span>
              </button>
            </div>
            
            <!-- 세부사항 펼침 영역 -->
            <div v-if="expandedItems.has(item.id) && item.steps" class="steps-detail">
              <div v-for="(step, idx) in item.steps" :key="idx" class="step-item">
                <div class="step-header">
                  <span class="step-number">{{ idx + 1 }}</span>
                  <span v-if="step.tool_name" class="step-tool">{{ step.tool_name }}</span>
                </div>
                <div v-if="step.reasoning" class="step-reasoning">
                  {{ truncateText(step.reasoning, 200) }}
                </div>
                <div v-if="step.tool_result" class="step-result">
                  <pre>{{ truncateText(step.tool_result, 300) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 페이지네이션 -->
      <div v-if="historyStore.total > historyStore.pageSize" class="pagination">
        <button 
          :disabled="historyStore.page <= 1" 
          @click="historyStore.prevPage()"
        >
          ◀
        </button>
        <span>{{ historyStore.page }} / {{ Math.ceil(historyStore.total / historyStore.pageSize) }}</span>
        <button 
          :disabled="historyStore.page * historyStore.pageSize >= historyStore.total"
          @click="historyStore.nextPage()"
        >
          ▶
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useHistoryStore, type QueryHistoryItem } from '@/stores/text2sql'
import { useSessionStore } from '@/stores/session'
import { IconHistory, IconTrash, IconRefresh, IconX, IconBarChart, IconWatchAgent, IconChevronDown as IconChevron } from '@/components/icons'

// Props
defineProps<{
  isOpen: boolean
}>()

// Emits
const emit = defineEmits<{
  toggle: []
  select: [item: QueryHistoryItem]
}>()

const historyStore = useHistoryStore()
const sessionStore = useSessionStore()
const searchQuery = ref('')
const listRef = ref<HTMLElement | null>(null)
const expandedItems = reactive(new Set<number>())

// 세부사항 토글
function toggleDetails(itemId: number) {
  if (expandedItems.has(itemId)) {
    expandedItems.delete(itemId)
  } else {
    expandedItems.add(itemId)
  }
}

// 복잡한 쿼리 판별 (1개 이상 JOIN, 서브쿼리 등)
function isComplexQuery(sql: string | null): boolean {
  if (!sql) return false
  const upperSql = sql.toUpperCase()
  
  // JOIN 개수 카운트
  const joinCount = (upperSql.match(/\bJOIN\b/g) || []).length
  
  return (
    joinCount >= 1 ||  // 1개 이상 JOIN
    (upperSql.match(/SELECT/g) || []).length > 1 || // 서브쿼리
    upperSql.includes('GROUP BY') ||  // 집계 쿼리
    upperSql.includes('HAVING') ||
    upperSql.includes('UNION') ||
    upperSql.includes('WITH ') // CTE
  )
}

// OLAP으로 내보내기
function exportToOlap(item: QueryHistoryItem) {
  console.log('[OLAP Export] item:', item)
  console.log('[OLAP Export] final_sql:', item.final_sql)
  
  if (!item.final_sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }
  sessionStore.navigateToOlapWithSQL(item.question, item.final_sql)
}

// 온톨로지(도메인 스키마)로 내보내기
function exportToOntology(item: QueryHistoryItem) {
  console.log('[Ontology Export] item:', item)
  console.log('[Ontology Export] final_sql:', item.final_sql)
  
  if (!item.final_sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }
  sessionStore.navigateToOntologyWithSQL(item.question, item.final_sql)
}

// 에이전트 생성
function createAgentFromQuery(item: QueryHistoryItem) {
  console.log('[Agent Create] item:', item)
  
  if (!item.final_sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }
  
  // 감시 에이전트 화면으로 이동하면서 쿼리 정보 전달
  sessionStore.navigateToWatchAgentWithQuery({
    question: item.question,
    sql: item.final_sql,
    rowCount: item.row_count,
    executionTimeMs: item.execution_time_ms
  })
}

// Debounced search
let searchTimeout: number | null = null
function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = window.setTimeout(() => {
    historyStore.fetchHistory({ search: searchQuery.value || undefined })
  }, 300)
}

function refreshHistory() {
  historyStore.fetchHistory({ search: searchQuery.value || undefined })
}

function selectItem(item: QueryHistoryItem) {
  historyStore.selectItem(item)
  emit('select', item)
}

async function deleteItem(id: number) {
  if (confirm('이 히스토리를 삭제하시겠습니까?')) {
    await historyStore.deleteHistory(id)
  }
}

async function handleClearAll() {
  if (confirm('모든 히스토리를 삭제하시겠습니까?')) {
    await historyStore.deleteAllHistory()
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '방금 전'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`
  
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// Load history on mount
onMounted(() => {
  historyStore.fetchHistory()
})

// Watch for open state to refresh
watch(() => historyStore.items.length, () => {
  // Auto-scroll to top when new items are added
  if (listRef.value) {
    listRef.value.scrollTop = 0
  }
})
</script>

<style scoped lang="scss">
$primary: #00d4aa;
// Theme-aware variables using CSS custom properties
$bg-dark: var(--color-bg-secondary);
$border: var(--color-border);
$text-primary: var(--color-text-bright);
$text-secondary: var(--color-text-light);
$text-muted: var(--color-text-muted);

.history-panel {
  display: flex;
  flex-direction: column;
  background: $bg-dark;
  backdrop-filter: blur(20px);
  border-right: 1px solid $border;
  transition: width 0.3s ease;
  width: 280px;
  flex-shrink: 0;
  overflow: hidden;

  &.collapsed {
    width: 48px;
    
    .toggle-btn {
      justify-content: center;
      padding: 12px;
      
      span {
        display: none;
      }
    }
  }
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid $border;
  color: $text-primary;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  svg {
    color: $primary;
    flex-shrink: 0;
  }
}

.panel-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid $border;

  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: $text-secondary;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  button {
    padding: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: $text-muted;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.05);
      color: $text-secondary;
    }

    &.clear-btn:hover {
      color: #f87171;
    }
  }

  .spinning {
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.search-box {
  padding: 12px 16px;
  border-bottom: 1px solid $border;

  input {
    width: 100%;
    padding: 10px 14px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 13px;
    transition: border-color 0.2s;
    box-shadow: var(--shadow-sm);

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }
}

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: $text-muted;
  gap: 12px;

  p {
    margin: 0;
    font-size: 13px;
  }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba($primary, 0.2);
  border-top-color: $primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.history-item {
  padding: 12px;
  margin-bottom: 6px;
  background: var(--chat-card-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);

  &:hover {
    background: var(--chat-card-hover);
    border-color: var(--color-accent);
  }

  &.active {
    background: var(--chat-card-hover);
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  }

  &.error {
    border-left: 3px solid var(--color-error);
  }
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;

  &.completed {
    background: #34d399;
  }

  &.error {
    background: #f87171;
  }

  &.pending {
    background: #fbbf24;
  }
}

.time {
  font-size: 10px;
  color: $text-muted;
  flex: 1;
}

.delete-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: $text-muted;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;

  .history-item:hover & {
    opacity: 1;
  }

  &:hover {
    color: #f87171;
  }
}

.item-question {
  font-size: 13px;
  color: $text-primary;
  line-height: 1.4;
  margin-bottom: 6px;
  word-break: break-word;
}

.item-sql {
  margin-bottom: 6px;

  code {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--chat-code-text, #38bdf8);
    background: var(--chat-code-bg, #1e293b);
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.item-meta {
  font-size: 10px;
  color: $text-muted;
  font-family: 'JetBrains Mono', monospace;
}

.item-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.export-ontology-btn, .export-olap-btn, .create-agent-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.export-ontology-btn {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;

  &:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(6, 182, 212, 0.25) 100%);
    border-color: rgba(16, 185, 129, 0.5);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
  }
}

.export-olap-btn {
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%);
  border: 1px solid rgba(34, 139, 230, 0.3);
  color: #38bdf8;

  &:hover {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.25) 0%, rgba(124, 58, 237, 0.25) 100%);
    border-color: rgba(34, 139, 230, 0.5);
    box-shadow: 0 2px 8px rgba(34, 139, 230, 0.2);
  }

  svg {
    color: #38bdf8;
  }
}

.create-agent-btn {
  background: linear-gradient(135deg, rgba(0, 212, 170, 0.15) 0%, rgba(16, 185, 129, 0.15) 100%);
  border: 1px solid rgba(0, 212, 170, 0.3);
  color: #00d4aa;

  &:hover {
    background: linear-gradient(135deg, rgba(0, 212, 170, 0.25) 0%, rgba(16, 185, 129, 0.25) 100%);
    border-color: rgba(0, 212, 170, 0.5);
    box-shadow: 0 2px 8px rgba(0, 212, 170, 0.2);
  }

  svg {
    color: #00d4aa;
  }
}

.detail-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: $text-secondary;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  svg {
    transition: transform 0.2s ease;
    
    &.expanded {
      transform: rotate(180deg);
    }
  }
}

.steps-badge {
  margin-left: 6px;
  padding: 2px 6px;
  background: rgba($primary, 0.15);
  border-radius: 4px;
  font-size: 9px;
  color: $primary;
}

.steps-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  max-height: 400px;
  overflow-y: auto;
}

.step-item {
  margin-bottom: 12px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border-left: 3px solid $primary;

  &:last-child {
    margin-bottom: 0;
  }
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.step-number {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $primary;
  color: #000;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
}

.step-tool {
  padding: 2px 8px;
  background: rgba(139, 92, 246, 0.2);
  border-radius: 4px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: #a78bfa;
}

.step-reasoning {
  font-size: 11px;
  color: $text-secondary;
  line-height: 1.5;
  margin-bottom: 6px;
}

.step-result {
  pre {
    margin: 0;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: $text-muted;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 100px;
    overflow-y: auto;
  }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  border-top: 1px solid $border;

  button {
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid $border;
    border-radius: 6px;
    color: $text-secondary;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: rgba($primary, 0.1);
      border-color: rgba($primary, 0.3);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  span {
    font-size: 11px;
    color: $text-muted;
  }
}
</style>

