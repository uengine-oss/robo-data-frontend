<script setup lang="ts">
/**
 * LineageTab.vue
 * 데이터 리니지 시각화 탭 - ETL 데이터 흐름을 그래프로 표시
 * 
 * 데이터 소스:
 * 1. Catalog의 Neo4j 리니지 데이터
 * 2. OLAP의 ETL 설정 데이터
 */
import { ref, computed, onMounted } from 'vue'
import { useRuntimeStore } from '@/shared/stores/runtime'
import LineageGraph from './LineageGraph.vue'
import LineageDetailPanel from './LineageDetailPanel.vue'
import { IconRefresh, IconUpload, IconSearch } from '@/shared/icons'
import { useLineageGraphQuery } from '../application/useLineageGraphQuery.ts'
import { analyzeLineageEtlCode } from '../application/lineageAnalysisGateway'
import type { LineageNode } from '../model/graph.ts'

// 스토어
const runtimeStore = useRuntimeStore()

// 상태
const searchQuery = ref('')
const selectedNode = ref<LineageNode | null>(null)
const isAnalyzing = ref(false)
const analysisError = ref<string | null>(null)
const {
  data: lineageData,
  isLoading,
  error,
  warnings,
  refresh: loadLineageData,
} = useLineageGraphQuery()
const isBusy = computed(() => isLoading.value || isAnalyzing.value)

// 표시할 통계 (실제 데이터)
const displayStats = computed(() => {
  return lineageData.value.stats
})

// 필터링된 노드
const filteredNodes = computed(() => {
  if (!searchQuery.value) return lineageData.value.nodes
  const query = searchQuery.value.toLowerCase()
  return lineageData.value.nodes.filter(node => 
    node.name.toLowerCase().includes(query)
  )
})

// 데이터 없음 여부
const hasNoData = computed(() => {
  return lineageData.value.nodes.length === 0 && !isBusy.value
})

// ETL 코드 분석
async function analyzeEtlCode(sqlContent: string, fileName: string = '') {
  if (!sqlContent.trim()) return
  
  isAnalyzing.value = true
  analysisError.value = null
  
  try {
    await analyzeLineageEtlCode(sqlContent, fileName, runtimeStore.getHeaders())
    // 분석 후 데이터 새로고침
    await loadLineageData()
  } catch (e) {
    analysisError.value = e instanceof Error ? e.message : 'ETL 분석에 실패했습니다.'
  } finally {
    isAnalyzing.value = false
  }
}

// 노드 선택 핸들러
function handleNodeSelect(node: LineageNode | null) {
  selectedNode.value = node
}

onMounted(() => {
  loadLineageData()
})

// 파일 업로드 처리
const fileInput = ref<HTMLInputElement | null>(null)

function triggerFileUpload() {
  fileInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const content = await file.text()
    await analyzeEtlCode(content, file.name)
  } catch (cause: unknown) {
    analysisError.value = cause instanceof Error ? cause.message : 'ETL 파일을 읽지 못했습니다.'
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div class="lineage-tab">
    <!-- 헤더 -->
    <header class="lineage-header">
      <div class="header-left">
        <h2 class="title">
          <span class="title-icon">🔀</span>
          데이터 리니지
        </h2>
      </div>
      
      <div class="header-actions">
        <!-- 검색 -->
        <div class="search-box">
          <IconSearch :size="16" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="테이블/ETL 검색..."
            class="search-input"
          />
        </div>
        
        <!-- ETL 파일 업로드 -->
        <input
          ref="fileInput"
          type="file"
          accept=".sql,.pls,.pck"
          class="hidden"
          @change="handleFileUpload"
        />
        <button class="action-btn upload-btn" @click="triggerFileUpload" :disabled="isBusy">
          <IconUpload :size="16" />
          <span>ETL 분석</span>
        </button>
        
        <!-- 새로고침 -->
        <button class="action-btn refresh-btn" @click="loadLineageData" :disabled="isBusy">
          <IconRefresh :size="16" :class="{ spinning: isBusy }" />
          <span>새로고침</span>
        </button>
      </div>
    </header>
    
    <!-- 통계 카드 -->
    <div class="stats-bar">
      <div class="stat-card source">
        <div class="stat-value">{{ displayStats.sourceCount }}</div>
        <div class="stat-label">소스 테이블</div>
      </div>
      <div class="stat-card etl">
        <div class="stat-value">{{ displayStats.etlCount }}</div>
        <div class="stat-label">ETL 프로세스</div>
      </div>
      <div class="stat-card target">
        <div class="stat-value">{{ displayStats.targetCount }}</div>
        <div class="stat-label">타겟 테이블</div>
      </div>
      <div class="stat-card flow">
        <div class="stat-value">{{ displayStats.flowCount }}</div>
        <div class="stat-label">데이터 흐름</div>
      </div>
    </div>
    
    <!-- 메인 컨텐츠 -->
    <div class="lineage-content">
      <div v-if="analysisError && !error" class="warning-message analysis-message" role="alert">
        <span class="warning-icon" aria-hidden="true">⚠️</span>
        <div class="warning-text">
          <strong>ETL 파일을 분석하지 못했습니다.</strong>
          <span>{{ analysisError }}</span>
        </div>
        <button type="button" @click="triggerFileUpload" class="retry-btn">다시 선택</button>
      </div>

      <div v-if="warnings.length > 0 && !error && !analysisError" class="warning-message" role="status">
        <span class="warning-icon" aria-hidden="true">⚠️</span>
        <div class="warning-text">
          <strong>일부 리니지 소스를 불러오지 못했습니다.</strong>
          <span v-for="warning in warnings" :key="warning">{{ warning }}</span>
        </div>
        <button type="button" @click="loadLineageData" class="retry-btn">다시 시도</button>
      </div>

      <!-- 에러 메시지 -->
      <div v-if="error" class="error-message" role="alert">
        <span class="error-icon" aria-hidden="true">⚠️</span>
        <span class="error-text">{{ error }}</span>
        <button type="button" @click="loadLineageData" class="retry-btn">다시 시도</button>
      </div>
      
      <!-- 그래프 뷰 -->
      <template v-if="!error">
        <!-- 데이터 없음 상태 -->
        <div v-if="hasNoData" class="empty-state">
          <div class="empty-icon">🔗</div>
          <h3>데이터 리니지 없음</h3>
          <p>ETL 설정을 생성하면 데이터 리니지가 표시됩니다.<br/>큐브 모델러에서 ETL을 설계하거나, ETL 파일을 업로드하세요.</p>
          <button class="upload-cta" @click="triggerFileUpload">
            <IconUpload :size="18" />
            <span>ETL 파일 업로드</span>
          </button>
        </div>
        
        <!-- 그래프 표시 -->
        <template v-else>
          <div class="graph-container">
            <LineageGraph
              :nodes="filteredNodes"
              :edges="lineageData.edges"
              :is-loading="isBusy"
              @node-select="handleNodeSelect"
            />
          </div>
          
          <!-- 상세 패널 -->
          <LineageDetailPanel
            v-if="selectedNode"
            :node="selectedNode"
            :edges="lineageData.edges"
            :all-nodes="lineageData.nodes"
            @close="selectedNode = null"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lineage-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

// 헤더
.lineage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-bright);
  margin: 0;
  
  .title-icon {
    font-size: 20px;
  }
}

.project-badge {
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.08) 100%);
  color: var(--color-accent);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  position: relative;
  
  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
  }
  
  .search-input {
    padding: 8px 12px 8px 32px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-tertiary);
    color: var(--color-text);
    font-size: 13px;
    width: 200px;
    transition: all 0.2s;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    background: var(--color-bg-elevated);
    border-color: var(--color-accent);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &.upload-btn {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: transparent;
    color: white;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
    }
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.hidden {
  display: none;
}

// 통계 바
.stats-bar {
  display: flex;
  gap: 16px;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  
  .stat-value {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
  }
  
  .stat-label {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  &.source {
    .stat-value { color: #3b82f6; }
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
    border-color: rgba(59, 130, 246, 0.3);
  }
  
  &.etl {
    .stat-value { color: #8b5cf6; }
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%);
    border-color: rgba(139, 92, 246, 0.3);
  }
  
  &.target {
    .stat-value { color: #10b981; }
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%);
    border-color: rgba(16, 185, 129, 0.3);
  }
  
  &.flow {
    .stat-value { color: #f59e0b; }
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%);
    border-color: rgba(245, 158, 11, 0.3);
  }
}

// 메인 컨텐츠
.lineage-content {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.graph-container {
  flex: 1;
  position: relative;
  z-index: 1;
}

.warning-message {
  position: absolute;
  z-index: 10;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: min(720px, calc(100% - 32px));
  padding: 12px 14px;
  color: #fef3c7;
  background: rgba(120, 53, 15, 0.94);
  border: 1px solid rgba(245, 158, 11, 0.5);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);

  .warning-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .retry-btn {
    flex: 0 0 auto;
    padding: 6px 10px;
    color: #78350f;
    background: #fef3c7;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }
}

// 에러 메시지
.error-message {
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(680px, calc(100% - 48px));
  padding: 18px 20px;
  background: rgba(127, 29, 29, 0.22);
  color: #fecaca;
  margin: auto;
  border-radius: 10px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  
  .error-icon {
    font-size: 18px;
    align-self: flex-start;
  }

  .error-text {
    flex: 1;
    min-width: 0;
    white-space: pre-line;
    overflow-wrap: anywhere;
    line-height: 1.55;
  }
  
  .retry-btn {
    flex: 0 0 auto;
    padding: 6px 12px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    
    &:hover {
      background: #dc2626;
    }
  }
}

@media (max-width: 720px) {
  .lineage-header {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .header-left {
    min-width: 0;
  }

  .title {
    white-space: nowrap;
  }

  .header-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
    width: 100%;
  }

  .search-box {
    grid-column: 1 / -1;
    min-width: 0;

    .search-input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
  }

  .action-btn {
    justify-content: center;
    min-width: 0;
    padding-inline: 10px;
  }

  .stats-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 10px 12px;
  }

  .stat-card {
    min-width: 0;
    padding: 9px;
  }

  .error-message {
    align-items: flex-start;
    flex-wrap: wrap;

    .retry-btn {
      margin-left: 30px;
    }
  }
}

// 빈 상태
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  padding: 48px;
  
  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin: 0 0 8px 0;
  }
  
  p {
    font-size: 14px;
    color: var(--color-text-muted);
    margin: 0 0 24px 0;
    max-width: 320px;
  }
  
  .upload-cta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
    }
  }
}
</style>
