<script setup lang="ts">
/**
 * StepEdgeDiscovery.vue
 * Step 1: 상관/인과 관계 자동 발견 + 상관 매트릭스 히트맵
 */
import { ref, computed } from 'vue'
import { whatifDomainApi, type EdgeCandidate, type CorrelationMatrixResponse, type ExcludedInfo } from '@/services/whatif-domain-api'

const props = defineProps<{
  schemaId: string
  filters?: Record<string, Record<string, any>>
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'edges-discovered', edges: EdgeCandidate[], sql: string, descs: Record<string, string>): void
}>()

const isDiscovering = ref(false)
const hasRunDiscovery = ref(false)
const edges = ref<EdgeCandidate[]>([])
const dataRows = ref(0)
const varsCount = ref(0)
const featureViewSql = ref('')
const error = ref('')

// 상관 매트릭스
const corrMatrix = ref<CorrelationMatrixResponse | null>(null)
const showMatrix = ref(false)

// 제외된 변수 정보
const excludedInfo = ref<ExcludedInfo[]>([])
const showExcluded = ref(false)

// 데이터 미리보기
const dataPreview = ref<{ columns: string[]; rows: unknown[][]; total_rows: number; date_range: { start: string; end: string } } | null>(null)
const showPreview = ref(false)

// 엣지 제외 관리 (사용자 수동 + LLM 자동)
const excludedEdgeKeys = ref(new Set<string>())
const excludeReasons = ref<Record<string, string>>({})
const isFiltering = ref(false)

function edgeKey(e: EdgeCandidate): string {
  return `${e.sourceNodeId}::${e.sourceField}->${e.targetNodeId}::${e.targetField}`
}

function toggleEdgeExclusion(e: EdgeCandidate) {
  const key = edgeKey(e)
  if (excludedEdgeKeys.value.has(key)) {
    excludedEdgeKeys.value.delete(key)
    delete excludeReasons.value[key]
  } else {
    excludedEdgeKeys.value.add(key)
    excludeReasons.value[key] = '사용자 제외'
  }
}

function isEdgeExcluded(e: EdgeCandidate): boolean {
  return excludedEdgeKeys.value.has(edgeKey(e))
}

// 제외되지 않은 엣지만 반환
const includedEdges = computed(() => {
  return edges.value.filter(e => !isEdgeExcluded(e))
})

// 적용된 필터
const appliedFilters = ref<Record<string, Record<string, unknown>>>({})

// 필드 description (한국어)
const fieldDescs = ref<Record<string, string>>({})

// 필터가 활성 상태인지
const hasFilters = computed(() => {
  if (!props.filters) return false
  return Object.values(props.filters).some(f =>
    Object.values(f).some(v => v !== '' && v !== null && v !== undefined)
  )
})

// 파라미터
const maxLag = ref(3)
const minCorrelation = ref(0.3)

async function runDiscovery() {
  isDiscovering.value = true
  error.value = ''
  try {
    const result = await whatifDomainApi.discoverEdges(props.schemaId, {
      maxLag: maxLag.value,
      minCorrelation: minCorrelation.value,
      filters: props.filters || undefined,
    })
    edges.value = result.edges
    dataRows.value = result.data_rows
    varsCount.value = result.variables_count
    featureViewSql.value = result.feature_view_sql
    excludedInfo.value = result.excluded || []
    appliedFilters.value = result.applied_filters || {}
    dataPreview.value = result.data_preview || null
    fieldDescs.value = result.field_descriptions || {}

    // 상관 매트릭스도 로드 (같은 필터 적용)
    try {
      corrMatrix.value = await whatifDomainApi.getCorrelationMatrix(
        props.schemaId, 'pearson', props.filters || undefined
      )
    } catch (matrixErr) {
      console.warn('상관 매트릭스 로드 실패:', matrixErr)
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    hasRunDiscovery.value = true
    isDiscovering.value = false
  }
}

async function autoFilterEdges() {
  isFiltering.value = true
  try {
    const result = await whatifDomainApi.filterEdges(
      props.schemaId,
      edges.value,
      fieldDescs.value,
    )
    if (result.success && result.exclude_indices.length > 0) {
      // LLM 추천 제외 적용
      for (const idx of result.exclude_indices) {
        if (idx >= 0 && idx < edges.value.length) {
          const e = edges.value[idx]
          const key = edgeKey(e)
          excludedEdgeKeys.value.add(key)
          excludeReasons.value[key] = result.reasons[String(idx)] || 'LLM 자동 제외'
        }
      }
    }
  } catch (e) {
    console.warn('LLM 필터링 실패:', e)
  } finally {
    isFiltering.value = false
  }
}

function confirmEdges() {
  emit('edges-discovered', includedEdges.value, featureViewSql.value, fieldDescs.value)
}

function fieldLabel(fieldName: string): string {
  return fieldDescs.value[fieldName] || fieldName
}

function getCorrColor(value: number): string {
  if (value > 0) return `rgba(34, 197, 94, ${Math.abs(value)})`
  if (value < 0) return `rgba(239, 68, 68, ${Math.abs(value)})`
  return 'transparent'
}

function shortName(col: string): string {
  const parts = col.split('__')
  return parts[parts.length - 1]
}

function shortNodeName(name: string): string {
  // "일별 매출 데이터 (Daily Sales Data)" → "일별 매출 데이터"
  const parenIdx = name.indexOf('(')
  return parenIdx > 0 ? name.slice(0, parenIdx).trim() : name
}

function reasonIcon(reason: string): string {
  const icons: Record<string, string> = {
    load_failed: '❌',
    no_time_column: '⏰',
    not_timeseries: '📋',
    no_numeric: '🔢',
    non_numeric_field: '🏷️',
  }
  return icons[reason] || '⚠️'
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    load_failed: '데이터 로드 실패',
    no_time_column: '시간 컬럼 없음',
    not_timeseries: '시계열 아님 (마스터)',
    no_numeric: '숫자 컬럼 없음',
    non_numeric_field: '비숫자 필드 제외',
  }
  return labels[reason] || reason
}
</script>

<template>
  <div class="step-discovery">
    <div class="step-header">
      <h4>🔍 변수 간 관계 자동 발견</h4>
      <p class="step-desc">온톨로지 노드의 데이터에서 상관관계와 인과관계를 자동으로 분석합니다.</p>
    </div>

    <!-- 적용된 필터 표시 -->
    <div v-if="hasFilters" class="active-filters-banner">
      <span class="filter-icon">🔍</span>
      <span class="filter-label">적용된 필터:</span>
      <template v-for="(fields, nodeId) in (props.filters || {})" :key="nodeId">
        <span v-for="(value, field) in fields" :key="`${nodeId}-${field}`" class="filter-tag">
          {{ field }} = {{ value }}
        </span>
      </template>
    </div>

    <!-- 파라미터 설정 -->
    <div class="params-row">
      <label>
        최대 시차 (lag)
        <input type="number" v-model="maxLag" min="1" max="12" />
      </label>
      <label>
        최소 상관계수
        <input type="number" v-model="minCorrelation" min="0.1" max="0.9" step="0.05" />
      </label>
      <button class="run-btn" @click="runDiscovery" :disabled="isDiscovering">
        {{ isDiscovering ? '분석 중...' : '관계 분석 시작' }}
      </button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 결과 요약 -->
    <div v-if="hasRunDiscovery" class="results">
      <div class="summary-cards">
        <div class="summary-card">
          <span class="card-value">{{ dataRows }}</span>
          <span class="card-label">데이터 행</span>
        </div>
        <div class="summary-card">
          <span class="card-value">{{ varsCount }}</span>
          <span class="card-label">변수</span>
        </div>
        <div class="summary-card">
          <span class="card-value">{{ edges.length }}</span>
          <span class="card-label">발견된 관계</span>
        </div>
      </div>

      <div v-if="edges.length === 0" class="empty-result-msg">
        발견된 관계가 없습니다. 최소 상관계수를 낮추거나(예: 0.3 → 0.1), 필터 조건/데이터 소스 설정을 확인해 주세요.
      </div>

      <!-- 학습 데이터 미리보기 -->
      <div v-if="dataPreview" class="data-preview-section">
        <button class="toggle-btn" @click="showPreview = !showPreview">
          {{ showPreview ? '▼' : '▶' }} 학습 데이터 미리보기 ({{ dataPreview.total_rows }}행, {{ dataPreview.date_range?.start }} ~ {{ dataPreview.date_range?.end }})
        </button>
        <div v-if="showPreview" class="preview-table">
          <table>
            <thead>
              <tr>
                <th v-for="col in dataPreview.columns" :key="col" :title="col">
                  {{ shortName(col) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in dataPreview.rows" :key="i">
                <td v-for="(val, j) in row.slice(0, dataPreview.columns.length)" :key="j">
                  {{ typeof val === 'number' ? val.toFixed(2) : val }}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="preview-note">
            ※ 날짜별 집계 후 데이터입니다. 
            <span v-if="hasFilters" class="preview-filter-note">필터가 적용된 데이터만 포함됩니다.</span>
          </p>
        </div>
      </div>

      <!-- 상관 매트릭스 토글 -->
      <div v-if="corrMatrix" class="matrix-section">
        <button class="toggle-btn" @click="showMatrix = !showMatrix">
          {{ showMatrix ? '▼ 상관 매트릭스 접기' : '▶ 상관 매트릭스 보기' }}
        </button>
        <div v-if="showMatrix" class="matrix-grid">
          <table>
            <thead>
              <tr>
                <th></th>
                <th v-for="col in corrMatrix.columns" :key="col" :title="col">
                  {{ shortName(col) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in corrMatrix.matrix" :key="i">
                <td class="row-label" :title="corrMatrix.columns[i]">
                  {{ shortName(corrMatrix.columns[i]) }}
                </td>
                <td
                  v-for="(val, j) in row"
                  :key="j"
                  class="cell"
                  :style="{ background: getCorrColor(val) }"
                  :title="`${shortName(corrMatrix.columns[i])} ↔ ${shortName(corrMatrix.columns[j])}: ${val.toFixed(3)}`"
                >
                  {{ val.toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 제외된 변수 정보 -->
      <div v-if="excludedInfo.length > 0" class="excluded-section">
        <button class="toggle-btn" @click="showExcluded = !showExcluded">
          {{ showExcluded ? '▼' : '▶' }} 제외된 변수 ({{ excludedInfo.length }}건)
        </button>
        <div v-if="showExcluded" class="excluded-list">
          <div v-for="(ex, idx) in excludedInfo" :key="idx" class="excluded-item">
            <span class="excluded-icon">{{ reasonIcon(ex.reason) }}</span>
            <span class="excluded-node">{{ ex.nodeName }}</span>
            <span class="excluded-reason">{{ reasonLabel(ex.reason) }}</span>
            <span class="excluded-detail">{{ ex.detail }}</span>
            <div v-if="ex.fields.length > 0" class="excluded-fields">
              필드: {{ ex.fields.join(', ') }}
            </div>
          </div>
        </div>
      </div>

      <!-- 엣지 목록 -->
      <div class="edges-table">
        <h5>
          발견된 관계 ({{ edges.length }}개)
          <span v-if="excludedEdgeKeys.size > 0" class="excluded-count">
            {{ excludedEdgeKeys.size }}개 제외됨 → {{ includedEdges.length }}개 사용
          </span>
        </h5>
        <table>
          <thead>
            <tr>
              <th class="col-toggle"></th>
              <th>소스 노드</th>
              <th>소스 필드</th>
              <th>→</th>
              <th>타겟 노드</th>
              <th>타겟 필드</th>
              <th>점수</th>
              <th>Lag</th>
              <th>Pearson</th>
              <th>Granger p</th>
              <th>방향</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="edge in edges"
              :key="`${edge.sourceField}-${edge.targetField}`"
              :class="{ 'row-excluded': isEdgeExcluded(edge) }"
            >
              <td class="col-toggle">
                <button
                  class="exclude-btn"
                  :class="{ excluded: isEdgeExcluded(edge) }"
                  @click="toggleEdgeExclusion(edge)"
                  :title="isEdgeExcluded(edge) ? '포함시키기' : '제외하기'"
                >
                  {{ isEdgeExcluded(edge) ? '✗' : '✓' }}
                </button>
              </td>
              <td class="node-name">{{ shortNodeName(edge.sourceNodeName) }}</td>
              <td class="field-name" :title="edge.sourceField">{{ fieldLabel(edge.sourceField) }}</td>
              <td class="arrow">→</td>
              <td class="node-name">{{ shortNodeName(edge.targetNodeName) }}</td>
              <td class="field-name" :title="edge.targetField">{{ fieldLabel(edge.targetField) }}</td>
              <td class="score">{{ edge.score.toFixed(3) }}</td>
              <td>{{ edge.lag }}</td>
              <td :class="edge.pearson > 0 ? 'positive' : 'negative'">
                {{ edge.pearson.toFixed(3) }}
              </td>
              <td>{{ edge.grangerPValue.toFixed(4) }}</td>
              <td>
                <span :class="edge.direction">
                  {{ edge.direction === 'positive' ? '↑ 양' : '↓ 음' }}
                </span>
              </td>
              <td class="reason-col" v-if="excludeReasons[edgeKey(edge)]">
                <span class="reason-tag" :title="excludeReasons[edgeKey(edge)]">
                  {{ excludeReasons[edgeKey(edge)] }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="isFiltering" class="filtering-indicator">
        <span class="filter-spinner"></span>
        🧠 LLM이 의미 없는 관계를 자동 분석 중...
      </div>

      <div class="action-buttons">
        <button class="llm-filter-btn" @click="autoFilterEdges" :disabled="isFiltering || edges.length === 0">
          🧠 LLM 자동 필터
        </button>
        <button class="confirm-btn" @click="confirmEdges" :disabled="isFiltering">
          이 관계로 모델 구성 → ({{ includedEdges.length }}개)
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.step-discovery {
  max-width: 1200px;
}

.step-header {
  margin-bottom: 16px;
  h4 { margin: 0 0 4px; color: var(--color-text-bright); }
  .step-desc { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
}

.params-row {
  display: flex; gap: 16px; align-items: flex-end; margin-bottom: 16px;
  label {
    display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: var(--color-text-muted);
    input { padding: 6px 10px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg-secondary); color: var(--color-text); width: 100px; }
  }
}

.run-btn, .confirm-btn {
  padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;
}
.run-btn { background: var(--color-primary, #6366f1); color: #fff; &:disabled { opacity: 0.5; } }
.action-buttons { display: flex; gap: 10px; margin-top: 16px; }
.llm-filter-btn { background: #f59e0b; color: #fff; &:disabled { opacity: 0.5; } &:hover:not(:disabled) { background: #d97706; } }
.confirm-btn { background: var(--color-success, #22c55e); color: #fff; &:disabled { opacity: 0.5; } }

.filtering-indicator {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2);
  border-radius: 8px; margin-top: 12px; font-size: 0.85rem; color: #a5b4fc;
  .filter-spinner {
    display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(99,102,241,0.3);
    border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite;
  }
}

.reason-col { max-width: 150px; }
.reason-tag {
  font-size: 0.65rem; padding: 1px 6px; border-radius: 4px;
  background: rgba(239,68,68,0.1); color: #ef4444; font-weight: 600;
  display: inline-block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.error-msg { padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #dc2626; margin-bottom: 16px; }
.empty-result-msg {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  color: #f59e0b;
  font-size: 0.82rem;
}

.summary-cards {
  display: flex; gap: 12px; margin-bottom: 16px;
  .summary-card {
    display: flex; flex-direction: column; align-items: center; padding: 12px 24px;
    background: var(--color-bg-secondary); border-radius: 8px; border: 1px solid var(--color-border);
    .card-value { font-size: 1.5rem; font-weight: 700; color: var(--color-primary, #6366f1); }
    .card-label { font-size: 0.75rem; color: var(--color-text-muted); }
  }
}

.toggle-btn {
  background: none; border: none; cursor: pointer; color: var(--color-text-muted);
  font-size: 0.85rem; padding: 4px 0; margin-bottom: 8px;
  &:hover { color: var(--color-text-bright); }
}

.matrix-grid {
  overflow-x: auto; margin-bottom: 16px;
  table { border-collapse: collapse; font-size: 0.7rem; }
  th, td { padding: 4px 6px; text-align: center; border: 1px solid var(--color-border); white-space: nowrap; }
  th { background: var(--color-bg-secondary); font-weight: 600; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
  .row-label { font-weight: 600; text-align: right; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
  .cell { font-size: 0.65rem; color: #fff; min-width: 40px; }
}

.active-filters-banner {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 14px; margin-bottom: 12px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(147, 51, 234, 0.08));
  border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px;
  .filter-icon { font-size: 1rem; }
  .filter-label { font-size: 0.85rem; font-weight: 600; color: var(--color-text-bright); }
  .filter-tag {
    padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;
    background: rgba(99, 102, 241, 0.2); color: #a5b4fc;
  }
}

.data-preview-section { margin-bottom: 16px; }

.preview-table {
  overflow-x: auto; margin-top: 8px;
  table { border-collapse: collapse; font-size: 0.7rem; width: 100%; }
  th { background: var(--color-bg-secondary); padding: 5px 8px; text-align: left; font-weight: 600;
       border-bottom: 2px solid var(--color-border); white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
  td { padding: 4px 8px; border-bottom: 1px solid var(--color-border); white-space: nowrap; font-family: monospace; font-size: 0.7rem; }
  tr:hover td { background: var(--color-bg-tertiary); }
}

.preview-note {
  margin: 6px 0 0; font-size: 0.75rem; color: var(--color-text-muted);
  .preview-filter-note { color: #a5b4fc; font-weight: 600; }
}

.excluded-section {
  margin-bottom: 16px;
  .excluded-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .excluded-item {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    background: var(--color-bg-secondary); border-radius: 6px; font-size: 0.8rem; flex-wrap: wrap;
    .excluded-icon { font-size: 0.9rem; }
    .excluded-node { font-weight: 600; color: var(--color-text-bright); }
    .excluded-reason { padding: 1px 8px; border-radius: 8px; font-size: 0.7rem; font-weight: 600; background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .excluded-detail { font-size: 0.75rem; color: var(--color-text-muted); }
    .excluded-fields { width: 100%; font-size: 0.7rem; color: var(--color-text-muted); margin-left: 24px; }
  }
}

.excluded-count { font-size: 0.75rem; color: #f59e0b; font-weight: 600; margin-left: 8px; }

.col-toggle { width: 32px; text-align: center; }
.exclude-btn {
  width: 24px; height: 24px; border-radius: 6px; border: 1.5px solid var(--color-border);
  background: none; cursor: pointer; font-size: 0.7rem; font-weight: 700; color: var(--color-success, #22c55e);
  &.excluded { color: #ef4444; border-color: #ef4444; background: rgba(239,68,68,0.08); }
  &:hover { opacity: 0.8; }
}
.row-excluded td {
  opacity: 0.4; text-decoration: line-through;
}

.edges-table {
  h5 { margin: 0 0 8px; font-size: 0.9rem; color: var(--color-text-bright); }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { background: var(--color-bg-secondary); padding: 8px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--color-border); }
  td { padding: 6px 8px; border-bottom: 1px solid var(--color-border); }
  .node-name { font-size: 0.75rem; color: var(--color-text-muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field-name { font-weight: 600; color: var(--color-text-bright); }
  .arrow { text-align: center; color: var(--color-text-muted); }
  .score { font-weight: 600; color: var(--color-primary, #6366f1); }
  .positive { color: var(--color-success, #22c55e); }
  .negative { color: var(--color-danger, #ef4444); }
}
</style>
