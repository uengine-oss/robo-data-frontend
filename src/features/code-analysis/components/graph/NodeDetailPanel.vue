<script setup lang="ts">
/**
 * NodeDetailPanel.vue
 * 노드 상세 정보 및 그래프 통계 패널
 * 
 * 주요 기능:
 * - 선택된 노드의 속성 표시
 * - 노드/관계 타입별 통계 표시
 */

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { GraphNode, GraphLink, SearchCluster } from '@/shared/types'
import { getNodeColor } from '@/shared/config/graphStyles'  // 통계용 — sortedNodeStats/Rel 색
import { technicalNodeName, logicalNodeName } from '@/shared/utils/graphDisplay'
import { kindOf } from '@/shared/utils/nodeLabels'  // 배지=종류(자기자신 라벨)만, 실제 노드색과 일치
import { useSemanticSearchStore } from '@/features/code-analysis/stores/semanticSearch'
import NodeDetailContent from './node-detail/NodeDetailContent.vue'

// ============================================================================
// 타입 정의
// ============================================================================

interface Stats {
  count: number
  color: string
  /** 'kind'=종류(labels[0]) / 'role'=역할(stereotype). 위치 파생(spec 035). */
  group?: 'kind' | 'role'
}

interface Props {
  node: GraphNode | null
  relationship: GraphLink | null
  nodeStats?: Map<string, Stats>
  relationshipStats?: Map<string, Stats>
  totalNodes?: number
  totalRelationships?: number
  /** 캔버스에 표시 중인 노드가 있는가 — '캔버스 비우기' 버튼 표시 조건 */
  hasGraph?: boolean
  isProcessing?: boolean
  activeFilters?: string[]  // 캔버스에 로드된 노드 라벨(isolate)
  activeRelFilters?: string[]  // 캔버스에 로드된 관계 타입(isolate)
  allNodes?: GraphNode[]   // 전체 노드 목록 (검색용)
}

interface PropertyItem {
  key: string
  value: string
  isMultiLine: boolean
}

// ============================================================================
// 상수 정의
// ============================================================================

/** 긴 값 기준 (자수) */
const LONG_VALUE_THRESHOLD = 50

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  totalNodes: 0,
  totalRelationships: 0,
  hasGraph: false,
  isProcessing: false,
  activeFilters: () => [],
  activeRelFilters: () => [],
  allNodes: () => []
})

const emit = defineEmits<{
  'node-type-select': [nodeType: string, topOffset: number]
  'relationship-type-select': [relType: string, topOffset: number]
  'relationship-filter': [relType: string]
  'label-filter': [label: string]
  'clear-filters': []
  'node-select': [node: GraphNode]
  'reset-graph': []
  'cluster-select': [nodeIds: string[]]
}>()

// ============================================================================
// 의미 기반 코드 검색 (spec 046) — 검색어는 스토어가 단일 출처(⌘K 진입 공용).
// ============================================================================
const semanticStore = useSemanticSearchStore()
const {
  status: semStatus, phases: semPhases, elapsedSec: semElapsed,
  clusters: semClusters, errorMessage: semError,
  isSearching: semIsSearching, hasResults: semHasResults, isEmpty: semIsEmpty,
} = storeToRefs(semanticStore)

function runSemanticSearch(): void {
  semanticStore.run()
}
function cancelSemanticSearch(): void {
  semanticStore.cancel()
}
function selectCluster(cluster: SearchCluster): void {
  emit('cluster-select', cluster.nodes.map(n => n.id))
}
function pct(score: number): number {
  return Math.round((score ?? 0) * 100)
}

function clusterAnswerNodes(cluster: SearchCluster) {
  const anchors = cluster.nodes.filter(node => node.role === 'anchor')
  return (anchors.length > 0 ? anchors : cluster.nodes).slice(0, 3)
}

function clusterAnswerNames(cluster: SearchCluster): string {
  return clusterAnswerNodes(cluster).map(node => node.name).join(' · ')
}

function clusterEvidenceCount(cluster: SearchCluster): number {
  return cluster.nodes.filter(node => node.role === 'evidence').length
}


// ============================================================================
// 상태
// ============================================================================

/** 펼침 상태 관리 */
const expandedKeys = ref<Set<string>>(new Set())

/** 노드 이름 검색 쿼리 — 의미검색과 같은 입력(스토어 query 단일 출처, ⌘K 진입 공용). */
const nodeSearchQuery = computed({
  get: () => semanticStore.query,
  set: (v: string) => semanticStore.setQuery(v),
})

/** 검색 입력 필드 포커스 상태 */
const isSearchFocused = ref(false)


// ============================================================================
// Computed - 노드 정보
// ============================================================================


/** 속성 목록 (관계용) */
const relationshipProperties = computed<PropertyItem[]>(() => {
  // 노드가 있으면 관계 속성은 절대 표시하지 않음
  if (props.node) return []
  if (!props.relationship) return []
  
  const propsList: PropertyItem[] = [{
    key: '<id>',
    value: props.relationship.id,
    isMultiLine: false
  }]
  
  if (props.relationship.properties) {
    const propEntries = Object.entries(props.relationship.properties)
      .map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
        isMultiLine: typeof value === 'object' || String(value).includes('\n')
      }))
    propsList.push(...propEntries)
  }
  
  return propsList
})

/** 관계 선택 시 표시할 raw 속성 목록(노드는 NodeDetailContent 카드로 렌더하므로 여기서 안 씀). */
const properties = computed(() => relationshipProperties.value)

/** 관계 클릭 시 양끝 노드 해소(spec 021) — allNodes 에서 source/target id 로 찾는다. */
const relEndpoints = computed(() => {
  const rel = props.relationship
  if (!rel) return null
  const nodes = props.allNodes ?? []
  return {
    from: nodes.find(n => n.id === rel.source),
    to: nodes.find(n => n.id === rel.target),
    fromId: rel.source,
    toId: rel.target,
  }
})

/** 끝점 노드 표시명 — `기술명 — 논리명`(논리명 있으면). 캔버스 밖이면 id 꼬리. */
function endpointLabel(n: GraphNode | undefined, fallbackId: string): string {
  if (!n) return fallbackId.includes(':') ? (fallbackId.split(':').pop() || fallbackId) : fallbackId
  const tech = technicalNodeName(n)
  const log = logicalNodeName(n)
  return log && log !== tech ? `${tech} — ${log}` : tech
}


// ============================================================================
// Computed - 통계
// ============================================================================

/** 노드 통계 (개수 많은 순 정렬) */
const sortedNodeStats = computed(() => {
  if (!props.nodeStats) return []

  return Array.from(props.nodeStats.entries())
    .map(([label, stat]) => ({ label, ...stat }))
    .sort((a, b) => b.count - a.count)
})

/** 종류(labels[0]) 라벨 통계 — 필터 '종류' 섹션. */
const kindNodeStats = computed(() => sortedNodeStats.value.filter(s => s.group !== 'role'))

/** 역할(stereotype) 라벨 통계 — 필터 '역할' 섹션. */
const roleNodeStats = computed(() => sortedNodeStats.value.filter(s => s.group === 'role'))

/** 관계 통계 (개수 많은 순 정렬) */
const sortedRelStats = computed(() => {
  if (!props.relationshipStats) return []
  
  return Array.from(props.relationshipStats.entries())
    .map(([type, stat]) => ({ type, ...stat }))
    .sort((a, b) => b.count - a.count)
})

/** 노드 이름 검색 결과 */
const searchResults = computed(() => {
  const query = nodeSearchQuery.value.trim().toLowerCase()
  if (!query || !props.allNodes || props.allNodes.length === 0) return []
  
  return props.allNodes
    .filter(node => {
      const name = node.properties?.name?.toString().toLowerCase() || ''
      const elementId = node.id?.toString().toLowerCase() || ''
      return name.includes(query) || elementId.includes(query)
    })
})

/** 검색 결과가 있는지 여부 */
const hasSearchResults = computed(() => {
  return searchResults.value.length > 0
})

/** 검색어가 입력되어 있고 결과 표시해야 하는지 */
const showSearchResults = computed(() => {
  const query = nodeSearchQuery.value.trim()
  return query.length > 0 && isSearchFocused.value
})

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 값이 긴지 확인
 */
function isLongValue(value: string): boolean {
  return value.length > LONG_VALUE_THRESHOLD || value.includes('\n')
}


// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 값 펼침/접기 토글
 */
function toggleExpand(key: string): void {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key)
  } else {
    expandedKeys.value.add(key)
  }
}

/**
 * 노드 타입 필터 핸들러 (클릭 시 해당 라벨로 필터링)
 */
function handleLabelFilter(label: string): void {
  emit('label-filter', label)
}

function handleRelFilter(relType: string): void {
  emit('relationship-filter', relType)
}
function isRelFilterActive(relType: string): boolean {
  return props.activeRelFilters?.includes(relType) ?? false
}
function hasActiveRelFilters(): boolean {
  return (props.activeRelFilters?.length ?? 0) > 0
}

/**
 * 뱃지 우클릭 시 스타일 패널 위치 계산 후 이벤트 emit
 */
function emitStyleSelect(event: MouseEvent, emitFn: (type: string, offset: number) => void, type: string): void {
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  const panelBody = target.closest('.panel-body') as HTMLElement
  const panelHeader = target.closest('.floating-panel')?.querySelector('.panel-header') as HTMLElement

  if (!panelBody || !panelHeader) {
    emitFn(type, 100)
    return
  }

  const panelHeaderHeight = panelHeader.offsetHeight
  const scrollTop = panelBody.scrollTop
  const rect = target.getBoundingClientRect()
  const panelBodyRect = panelBody.getBoundingClientRect()
  const labelCenterY = rect.top + rect.height / 2 - panelBodyRect.top + scrollTop
  emitFn(type, Math.max(0, panelHeaderHeight + labelCenterY))
}

function handleNodeTypeContextMenu(event: MouseEvent, nodeType: string): void {
  emitStyleSelect(event, (t, o) => emit('node-type-select', t, o), nodeType)
}

function handleRelTypeContextMenu(event: MouseEvent, relType: string): void {
  emitStyleSelect(event, (t, o) => emit('relationship-type-select', t, o), relType)
}

/**
 * 필터가 활성화되어 있는지 확인
 */
function isFilterActive(label: string): boolean {
  return props.activeFilters?.includes(label) ?? false
}

/**
 * 전체 필터가 적용되어 있는지
 */
function hasActiveFilters(): boolean {
  return (props.activeFilters?.length ?? 0) > 0 || (props.activeRelFilters?.length ?? 0) > 0
}

/**
 * 필터 초기화
 */
function handleClearFilters(): void {
  emit('clear-filters')
}

/**
 * 검색 결과에서 노드 선택
 */
function handleSearchResultSelect(node: GraphNode): void {
  emit('node-select', node)
  nodeSearchQuery.value = ''
  isSearchFocused.value = false
}

/**
 * 검색 입력 필드 포커스
 */
function handleSearchFocus(): void {
  isSearchFocused.value = true
}

/**
 * 검색 입력 필드 블러 (약간의 딜레이 후 결과 숨김)
 */
function handleSearchBlur(): void {
  // 클릭 이벤트가 먼저 발생하도록 약간의 딜레이
  setTimeout(() => {
    isSearchFocused.value = false
  }, 200)
}

/**
 * 검색 초기화
 */
function clearSearch(): void {
  nodeSearchQuery.value = ''
}

/**
 * 검색 결과에 표시할 추가 정보 (테이블명, 스키마 등)
 */
function getNodeSubInfo(node: GraphNode): string {
  const props = node.properties || {}

  // 소속(부모)은 id 계층에 인코딩됨 — COLUMN: "테이블.컬럼", FUNCTION: "패키지.모듈.함수".
  // 마지막 '.' 앞이 소속. (식별자=id 통일, 소속 속성은 미저장)
  const id = node.id?.toString() || ''
  const lastDot = id.lastIndexOf('.')
  if (lastDot > 0) return id.slice(0, lastDot)

  // 폴백: 명시 속성(스키마/파일)
  const parts: string[] = []
  if (props.schema_name) parts.push(props.schema_name.toString())
  if (props.file_path) parts.push(String(props.file_path).split(/[\\/]/).pop() || '')
  return parts.filter(Boolean).join(' • ')
}

/** 검색 결과 1차 표시 — 논리명 우선(없으면 물리명). 길면 CSS ellipsis */
function searchPrimary(node: GraphNode): string {
  const p = node.properties || {}
  return (p.logical_name || p.name || node.id || 'Unknown').toString()
}

/** 검색 결과 2차 줄 — (논리명을 1차로 썼으면) 물리명 · 소속. 길면 CSS ellipsis */
function searchSecondary(node: GraphNode): string {
  const p = node.properties || {}
  const parts: string[] = []
  if (p.logical_name && p.name && p.logical_name !== p.name) parts.push(p.name.toString())
  const sub = getNodeSubInfo(node)
  if (sub) parts.push(sub)
  return parts.join(' · ')
}


</script>

<template>
  <div class="panel-content">
    <!-- ========== 노드 선택 시: 노드 종류별 친화적 카드 ========== -->
    <template v-if="node">
      <NodeDetailContent :node="node" />
    </template>
    
    <!-- ========== 관계 선택 시: 관계 속성 표시 (노드가 없을 때만) ========== -->
    <template v-else-if="relationship">
      <!-- 관계 타입 표시 -->
      <div class="type-header">
        <span class="type-badge relationship-badge">{{ relationship.type }}</span>
      </div>

      <!-- 연결(양끝 노드) — spec 021: 관계 클릭 시 어느 노드끼리인지 한눈에 -->
      <div v-if="relEndpoints" class="rel-conn">
        <div class="rel-conn-row">
          <span class="rel-conn-tag from">출발</span>
          <span class="rel-conn-name">{{ endpointLabel(relEndpoints.from, relEndpoints.fromId) }}</span>
        </div>
        <div class="rel-conn-arrow">↓ <b>{{ relationship.type }}</b></div>
        <div class="rel-conn-row">
          <span class="rel-conn-tag to">도착</span>
          <span class="rel-conn-name">{{ endpointLabel(relEndpoints.to, relEndpoints.toId) }}</span>
        </div>
      </div>

      <!-- Properties 테이블 -->
      <div class="props-table-wrapper">
        <table class="props-table">
          <thead>
            <tr>
              <th class="col-key">속성</th>
              <th class="col-value">값</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="properties.length === 0">
              <td colspan="2" class="cell-empty">속성이 없습니다</td>
            </tr>
            <tr v-for="prop in properties" :key="prop.key">
              <td class="cell-key">{{ prop.key }}</td>
              <td class="cell-value">
                <div 
                  class="value-container" 
                  :class="{ expanded: expandedKeys.has(prop.key) }"
                >
                  <div class="value-content">{{ prop.value }}</div>
                </div>
                <button 
                  v-if="isLongValue(prop.value)" 
                  class="show-toggle"
                  @click="toggleExpand(prop.key)"
                >
                  {{ expandedKeys.has(prop.key) ? '접기' : '전체 보기' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
    </template>
    
    <!-- ========== 노드/관계 미선택 시: 통계 표시 ========== -->
    <template v-if="!node && !relationship">
      <div class="stats-wrapper">
        <!-- 노드 이름 검색 섹션 -->
        <div class="search-section">
          <div class="search-input-wrapper">
            <input
              v-model="nodeSearchQuery"
              type="text"
              class="node-search-input"
              placeholder="🔍 노드 이름, 또는 업무 말로 물어보기"
              @focus="handleSearchFocus"
              @blur="handleSearchBlur"
              @keyup.escape="clearSearch"
            />
            <button 
              v-if="nodeSearchQuery" 
              class="search-clear-btn"
              @click="clearSearch"
              title="검색 초기화"
            >
              ✕
            </button>
            <!-- 검색 결과 드롭다운 (입력칸 기준 앵커 — 검색 중 '캔버스 비우기' 버튼을 덮어 오조작 방지) -->
            <div v-if="showSearchResults" class="search-results-dropdown">
              <div class="search-results-header" v-if="hasSearchResults">
                검색 결과 ({{ searchResults.length }}개)
              </div>
              <template v-if="hasSearchResults">
                <div
                  v-for="resultNode in searchResults"
                  :key="resultNode.id"
                  class="search-result-item"
                  @mousedown.prevent="handleSearchResultSelect(resultNode)"
                >
                  <span
                    class="result-label"
                    :title="resultNode.labels?.join(' / ')"
                    :style="{ background: getNodeColor(resultNode.labels || ['Unknown']) }"
                  >{{ kindOf(resultNode.labels || ['Unknown']) }}</span>
                  <div class="result-info">
                    <span class="result-name" :title="searchPrimary(resultNode)">{{ searchPrimary(resultNode) }}</span>
                    <span class="result-sub" v-if="searchSecondary(resultNode)" :title="searchSecondary(resultNode)">{{ searchSecondary(resultNode) }}</span>
                  </div>
                </div>
              </template>
              <div v-else class="search-no-results">
                검색 결과가 없습니다
              </div>
            </div>
          </div>
          <!-- 캔버스 비우기 버튼 (캔버스에 노드 있을 때만 표시. 선택·활성 필터도 함께 해제) -->
          <button
            v-if="hasGraph"
            class="reset-graph-btn"
            @click="emit('reset-graph')"
            title="캔버스를 비우고 선택·활성 필터를 모두 해제합니다"
          >
            🔄 캔버스 비우기
          </button>
        </div>

        <!-- 의미 기반 관련 코드 (spec 046) — 이름검색 아래. 버튼 하나로 실행, 40초 스트림. -->
        <div class="semantic-search">
          <div class="sem-head">의미 기반 관련 코드</div>

          <!-- 진행 중: 단계·경과초·취소 (결과가 나올 그 자리) -->
          <template v-if="semIsSearching">
            <div class="sem-progress-head">
              <span class="sem-elapsed">{{ semElapsed }}초</span>
              <button class="sem-cancel" @click="cancelSemanticSearch">취소</button>
            </div>
            <div class="sem-bar"><i /></div>
            <div class="sem-steps">
              <div
                v-for="(p, i) in semPhases"
                :key="p.stage + i"
                class="sem-step"
                :class="{ 'is-current': i === semPhases.length - 1 }"
              >
                <span class="sem-step-mk">{{ i === semPhases.length - 1 ? '●' : '✓' }}</span>
                <span class="sem-step-label">{{ p.label }}</span>
                <span v-if="p.detail" class="sem-step-detail">{{ p.detail }}</span>
              </div>
            </div>
          </template>

          <!-- 결과 뭉치 -->
          <template v-else-if="semHasResults">
            <div class="sem-result-head">
              <span>관련 코드 ({{ semClusters.length }})</span>
              <button class="sem-again" @click="runSemanticSearch">다시 찾기</button>
            </div>
            <div
              v-for="cluster in semClusters"
              :key="cluster.id"
              class="sem-cluster"
              :title="clusterAnswerNames(cluster)"
              @click="selectCluster(cluster)"
            >
              <div class="sem-cluster-main">
                <span class="sem-cluster-title">{{ cluster.title }}</span>
                <span class="sem-cluster-sub">
                  {{ clusterAnswerNames(cluster) }}
                  <small v-if="clusterEvidenceCount(cluster) > 0">
                    · 근거 {{ clusterEvidenceCount(cluster) }}개
                  </small>
                </span>
              </div>
              <span class="sem-cluster-pct" :title="`관련도 ${pct(cluster.score)}%`">{{ pct(cluster.score) }}%</span>
            </div>
          </template>

          <!-- 못 찾음 (0건) -->
          <template v-else-if="semIsEmpty">
            <div class="sem-empty">
              <b>관련 코드를 못 찾았습니다</b>
              <ul>
                <li>함수 이름 말고 <b>업무 용어</b>로 써보세요</li>
                <li>무엇이 <b>어떻게 되는지</b>를 자세히 써보세요</li>
              </ul>
              <button class="sem-again" @click="runSemanticSearch">다시 찾기</button>
            </div>
          </template>

          <!-- 오류 (서버 사유 그대로) -->
          <template v-else-if="semStatus === 'error'">
            <div class="sem-error">{{ semError }}</div>
            <button class="sem-again" @click="runSemanticSearch">다시 찾기</button>
          </template>

          <!-- 기본: 버튼 하나 + 항상 같은 한 줄 안내 -->
          <template v-else>
            <button
              class="sem-run"
              :disabled="!nodeSearchQuery.trim()"
              @click="runSemanticSearch"
            >
              의미로 더 찾기 <small>약 40초</small>
            </button>
            <div class="sem-hint">자세히 쓸수록 잘 찾습니다</div>
          </template>
        </div>

        <!-- Node labels 섹션 — 종류(labels[0]) / 역할(stereotype) 위치기반 분리 (spec 035) -->
        <div class="stats-section">
          <div class="section-header">
            <span class="section-title">
              Node labels
              <span v-if="hasActiveFilters()" class="filter-count">
                ({{ activeFilters.length }}/{{ sortedNodeStats.length }} 활성)
              </span>
            </span>
            <span
              class="help-hint"
              title="클릭: 이것만 보기 (그 라벨만 캔버스에 로드) · 우클릭: 색상 변경"
            >?</span>
          </div>
          <!-- 종류 -->
          <div class="label-group-title">종류</div>
          <div class="badge-container">
            <span
              class="stat-badge total"
              :class="{ clickable: hasActiveFilters(), dimmed: !hasActiveFilters() }"
              @click="hasActiveFilters() && handleClearFilters()"
              :title="hasActiveFilters() ? `모든 필터 해제 (현재 ${activeFilters.length}개 활성)` : '필터 없음'"
            >* ({{ totalNodes }})</span>
            <span
              v-for="stat in kindNodeStats"
              :key="stat.label"
              class="stat-badge clickable"
              :class="{ active: isFilterActive(stat.label), dimmed: hasActiveFilters() && !isFilterActive(stat.label) }"
              :style="{ background: stat.color }"
              @click="handleLabelFilter(stat.label)"
              @contextmenu="handleNodeTypeContextMenu($event, stat.label)"
            >
              {{ stat.label }} ({{ stat.count }})
            </span>
          </div>
          <!-- 역할(stereotype) — 있을 때만 -->
          <template v-if="roleNodeStats.length">
            <div class="label-group-title">역할</div>
            <div class="badge-container">
              <span
                v-for="stat in roleNodeStats"
                :key="stat.label"
                class="stat-badge clickable"
                :class="{ active: isFilterActive(stat.label), dimmed: hasActiveFilters() && !isFilterActive(stat.label) }"
                :style="{ background: stat.color }"
                @click="handleLabelFilter(stat.label)"
                @contextmenu="handleNodeTypeContextMenu($event, stat.label)"
              >
                {{ stat.label }} ({{ stat.count }})
              </span>
            </div>
          </template>
        </div>
        
        <!-- Relationship types 섹션 -->
        <div class="stats-section">
          <div class="section-title">Relationship types</div>
          <div class="badge-container">
            <span class="stat-badge total">* ({{ totalRelationships }})</span>
            <span
              v-for="stat in sortedRelStats"
              :key="stat.type"
              class="stat-badge rel clickable"
              :class="{ active: isRelFilterActive(stat.type), dimmed: hasActiveRelFilters() && !isRelFilterActive(stat.type) }"
              :style="{ background: stat.color }"
              @click="handleRelFilter(stat.type)"
              @contextmenu="handleRelTypeContextMenu($event, stat.type)"
              :title="`좌클릭: 이 관계만 보기 / 우클릭: 색상·두께`"
            >
              {{ stat.type }} ({{ stat.count }})
            </span>
          </div>
        </div>
        
        <!-- 요약: 전체 프로젝트 데이터 규모 -->
        <div class="display-summary">
          <div class="summary-main">
            <span>총 {{ totalNodes }} nodes · {{ totalRelationships }} relationships</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 레이아웃
// ============================================================================

.panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 8px;
}

// ============================================================================
// 타입 뱃지
// ============================================================================

.type-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.type-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
}

.type-badge {
  display: inline-block;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: white;
  
  &.relationship-badge {
    background: var(--color-text-muted);
    color: white;
  }
}

// ============================================================================
// 관계 연결(양끝 노드) — spec 021
// ============================================================================
.rel-conn {
  margin: 10px 12px 4px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.rel-conn-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rel-conn-tag {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  color: #fff;
  &.from { background: #4dabf7; }
  &.to { background: #69db7c; }
}
.rel-conn-name {
  font-size: 12.5px;
  color: var(--color-text-bright);
  word-break: break-all;
}
.rel-conn-arrow {
  margin: 3px 0 3px 4px;
  font-size: 11px;
  color: var(--color-text-muted);
  b { color: var(--color-text-light); }
}

// ============================================================================
// Properties 테이블
// ============================================================================

.props-table-wrapper {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.props-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  
  thead {
    position: sticky;
    top: 0;
    z-index: 1;
    
    th {
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid var(--color-border);
      
      &.col-key {
        width: 110px;
        min-width: 110px;
        background: var(--color-bg-tertiary);
        color: var(--color-text-light);
      }
      
      &.col-value {
        width: auto;
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
      }
    }
  }
  
  tbody {
    tr {
      border-bottom: 1px solid var(--color-border);
      
      &:last-child {
        border-bottom: none;
      }
    }
    
    td {
      padding: 12px 14px;
      vertical-align: top;
    }
  }
}

.cell-key {
  font-weight: 600;
  color: var(--color-text);
  font-size: 12px;
  white-space: nowrap;
  background: var(--color-bg-tertiary);
  border-right: 1px solid var(--color-border);
  
  // 텍스트 선택시 가시성 보장
  ::selection {
    background: var(--color-accent);
    color: white;
  }
  
  ::-moz-selection {
    background: var(--color-accent);
    color: white;
  }
}

.cell-value {
  background: var(--color-bg);
  
  // 텍스트 선택시 가시성 보장
  ::selection {
    background: #1c7ed6;
    color: white;
  }
  
  ::-moz-selection {
    background: #1c7ed6;
    color: white;
  }
}

.cell-empty {
  text-align: center;
  padding: 20px;
  color: var(--color-text-muted);
  font-style: italic;
}

// ============================================================================
// 값 컨테이너
// ============================================================================

.value-container {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-accent);
  line-height: 1.6;
  
  // 텍스트 선택시 가시성 보장
  ::selection {
    background: #1c7ed6;
    color: white;
  }
  
  ::-moz-selection {
    background: #1c7ed6;
    color: white;
  }
  
  .value-content {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  &.expanded .value-content {
    display: block;
    -webkit-line-clamp: unset;
    max-height: 300px;
    overflow-y: auto;
  }
}

.show-toggle {
  display: block;
  margin-top: 6px;
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  
  &:hover {
    text-decoration: underline;
  }
}


// ============================================================================
// 통계 섹션
// ============================================================================

.stats-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  padding-bottom: 8px;
}

// ============================================================================
// 노드 검색
// ============================================================================

.search-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.node-search-input {
  width: 100%;
  padding: 10px 36px 10px 12px;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;

  &::placeholder {
    color: var(--color-text-tertiary);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }
}

.search-clear-btn {
  position: absolute;
  right: 8px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-tertiary);
  }
}

.search-results-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  max-height: 320px;
  overflow-y: auto;
  z-index: 9999;  /* 모든 요소 위에 표시 */
}

.search-results-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-light);
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.search-result-item {
  display: flex;
  align-items: center;          /* 배지 세로 가운데 */
  gap: 9px;
  padding: 7px 11px;            /* 위아래 컴팩트 */
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-bg-hover, #2c2e33);
  }

  &:not(:last-child) {
    border-bottom: 1px solid var(--color-border);
  }
}

.result-label {
  flex-shrink: 0;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  border-radius: 4px;
  text-transform: uppercase;
  min-width: 60px;
  text-align: center;
}

.result-info {
  display: flex;
  flex-direction: column;
  gap: 1px;                     /* 이름-소속 붙임 */
  min-width: 0;
  flex: 1;
}

.result-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-bright, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-sub {
  font-size: 11px;
  color: var(--color-text-light, #909296);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-no-results {
  padding: 20px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-tertiary, #5c5f66);
}

.reset-graph-btn {
  width: 100%;
  margin-top: 12px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
}

/* ── 의미 기반 코드 검색 (spec 046) ── */
.semantic-search {
  margin-bottom: 20px;
  flex-shrink: 0;
}

.sem-head {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary, #868e96);
  padding: 6px 8px;
  background: var(--color-bg-tertiary, #212430);
  border-radius: 4px;
  margin-bottom: 8px;
}

.sem-run {
  width: 100%;
  padding: 9px 0;
  font-size: 12px;
  color: var(--color-accent, #74c0fc);
  background: color-mix(in srgb, var(--color-accent, #3b82f6) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent, #3b82f6) 45%, transparent);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;

  small { color: var(--color-text-subtle, #7f93b5); font-size: 10px; }
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--color-accent, #3b82f6) 22%, transparent); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.sem-hint {
  text-align: center;
  font-size: 10px;
  color: var(--color-text-subtle, #6d717a);
  padding: 6px 2px 0;
}

.sem-progress-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 2px 0 6px;
}
.sem-elapsed {
  font-size: 11px;
  color: var(--color-text-secondary, #868e96);
  font-variant-numeric: tabular-nums;
}
.sem-cancel {
  font-size: 10px;
  color: #ffa8a8;
  border: 1px solid #5a3236;
  border-radius: 4px;
  padding: 2px 8px;
  background: rgba(90, 50, 54, 0.25);
  cursor: pointer;
}

.sem-bar {
  height: 2px;
  background: var(--color-border, #2a2d36);
  border-radius: 2px;
  overflow: hidden;
  margin: 2px 2px 6px;

  i {
    display: block;
    height: 100%;
    width: 45%;
    background: linear-gradient(90deg, transparent, var(--color-accent, #6ea8fe), transparent);
    animation: sem-slide 1.2s linear infinite;
  }
}
@keyframes sem-slide { from { transform: translateX(-120%); } to { transform: translateX(320%); } }

.sem-step {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 4px 2px;
  font-size: 11px;
  color: var(--color-text-secondary, #868e96);

  &.is-current { color: var(--color-text, #e6e7ea); }
  .sem-step-mk { text-align: center; font-size: 10px; color: #37b24d; }
  &.is-current .sem-step-mk { color: var(--color-accent, #6ea8fe); }
  .sem-step-detail { font-size: 10px; color: var(--color-text-subtle, #7f93b5); font-variant-numeric: tabular-nums; }
}

.sem-result-head, .sem-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-secondary, #868e96);
  padding: 2px 2px 6px;
}
.sem-error { color: #e8c89a; display: block; padding: 8px; background: rgba(74, 58, 42, 0.3); border: 1px solid #4a3a2a; border-radius: 5px; }

.sem-again {
  font-size: 10px;
  color: var(--color-accent, #8fb4ee);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

.sem-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-bottom: 1px solid var(--color-border-subtle, #24262d);
  cursor: pointer;

  &:hover { background: var(--color-bg-hover, #212430); }
  .sem-cluster-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .sem-cluster-title { font-size: 12px; color: var(--color-text, #e6e7ea); }
  .sem-cluster-sub {
    font-size: 10px; color: var(--color-text-subtle, #7f93b5);
    font-family: ui-monospace, Consolas, monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sem-cluster-pct { font-size: 11px; color: var(--color-accent, #9ec5ff); font-variant-numeric: tabular-nums; }
}

.sem-empty {
  padding: 8px;
  background: rgba(74, 58, 42, 0.2);
  border: 1px solid #4a3a2a;
  border-radius: 5px;

  b { font-size: 11px; color: #e8c89a; }
  ul { margin: 7px 0; padding-left: 16px; }
  li { font-size: 10.5px; color: var(--color-text-secondary, #9a9187); margin: 4px 0; }
}

.stats-section {
  margin-bottom: 24px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
  margin-bottom: 12px;
}

.section-header .section-title {
  margin-bottom: 0; // section-header 가 자체 margin 을 가짐
}

.filter-count {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.help-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: help;
  user-select: none;

  &:hover {
    background: var(--color-bg);
    color: var(--color-text);
  }
}

.badge-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  & + .label-group-title { margin-top: 10px; }
}

/** 종류 / 역할 소제목 — 라벨 칩 그룹 구분. */
.label-group-title {
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 14px;
  color: white;
  
  &.total {
    background: var(--color-text-muted);
  }
  
  &.rel {
    background: var(--color-text-light);
  }
  
  &.clickable {
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    
    &:hover {
      transform: scale(1.02);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      z-index: 1;
      opacity: 0.9;
    }
    
    &:active {
      transform: scale(1.0);
    }
  }
  
  &.active {
    box-shadow: 0 0 0 2px var(--color-accent);
    transform: scale(1.02);
    z-index: 2;
  }
  
  &.dimmed {
    opacity: 0.4;

    &:hover {
      opacity: 0.7;
    }

    // dimmed 가 clickable 이 아니면 (예: 활성 필터 0인 * 뱃지) 호버/클릭 무반응
    &:not(.clickable) {
      cursor: default;
      pointer-events: none;
    }
  }
}

// ============================================================================
// 요약
// ============================================================================

.display-summary {
  margin-top: auto;
  padding: 16px 0 8px 0;
  flex-shrink: 0;
  
  .summary-main {
    font-size: 13px;
    font-weight: 400;
    color: var(--color-text);
  }
}
</style>
