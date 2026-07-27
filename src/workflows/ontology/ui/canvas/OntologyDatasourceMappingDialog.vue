<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue'
import type {
  DatasourceMapping,
  NodeSearchCandidate,
} from '@/domains/ontology'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import {
  datasourceMappingStatusIcon,
  formatDatasourceSampleValue,
  getDatasourceMappingStats,
  type DatasourceLinkingProgress,
} from '../../application/datasourceMappingWorkspace'
import { getOntologyCanvasLayerColor } from '../../model/ontologyGraphElements'

interface MappingNode {
  id: string
  name: string
  label: string
  layer?: string
}

const props = defineProps<{
  open: boolean
  nodes: readonly MappingNode[]
  linking: boolean
  error: string | null
  progress: DatasourceLinkingProgress
  mappings: Readonly<Record<string, DatasourceMapping>>
  selectedNodeId: string | null
  expandedCandidates: ReadonlySet<string>
  confirmPendingIds: ReadonlySet<string>
  confirmErrors: Readonly<Record<string, string>>
  busy: boolean
  closeBlocked: boolean
  nestedDialogOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  retry: []
  'toggle-mapping': [nodeId: string]
  'toggle-candidate': [nodeId: string, candidateIndex: number]
  preview: [candidate: NodeSearchCandidate]
  'confirm-candidate': [nodeId: string, candidate: NodeSearchCandidate]
  'confirm-bulk': []
}>()

const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const stats = computed(() => getDatasourceMappingStats(props.mappings))
const progressPercent = computed(() => (
  props.progress.total > 0
    ? (props.progress.completed / props.progress.total) * 100
    : 0
))

useDialogFocusLifecycle({
  active: () => props.open,
  dialog: dialogRef,
  requestClose: () => emit('close'),
  initialFocus: () => closeButtonRef.value,
  canClose: () => !props.closeBlocked,
  suspended: () => props.nestedDialogOpen,
})

function candidateDetailsId(nodeId: string, index: number): string {
  return `datasource-candidate-${encodeURIComponent(nodeId).replace(/%/g, '_')}-${index}`
}

function mappingDetailsId(nodeId: string): string {
  return `ontology-mapping-details-${encodeURIComponent(nodeId).replace(/%/g, '_')}`
}
</script>

<template>
  <div v-if="open" class="dialog-overlay" @click.self="emit('close')">
    <div
      ref="dialogRef"
      class="datasource-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-link-datasource-title"
      :aria-busy="busy"
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3 id="auto-link-datasource-title">🔗 데이터 소스 자동 연결</h3>
        <button
          ref="closeButtonRef"
          type="button"
          class="close-btn"
          :disabled="closeBlocked"
          aria-label="데이터 소스 자동 연결 닫기"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <div v-if="error" class="datasource-operation-status error" role="alert">
          <span>{{ error }}</span>
          <button type="button" :disabled="linking" @click="emit('retry')">다시 시도</button>
        </div>

        <div v-if="linking" class="linking-status">
          <div class="progress-container">
            <div class="progress-header">
              <span class="progress-text">Text2SQL 에이전트로 데이터 소스 검색 중...</span>
              <span class="progress-count">{{ progress.completed }} / {{ progress.total }}</span>
            </div>
            <div class="progress-bar-wrapper">
              <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }"></div>
            </div>
          </div>

          <div class="node-progress-list">
            <div
              v-for="node in nodes"
              :key="node.id"
              class="node-progress-item"
              :class="progress.nodeStatuses[node.id]?.status || 'pending'"
            >
              <span class="node-status-icon">
                <span v-if="progress.nodeStatuses[node.id]?.status === 'searching'" class="searching-icon">⏳</span>
                <span v-else-if="progress.nodeStatuses[node.id]?.status === 'found'">✅</span>
                <span v-else-if="progress.nodeStatuses[node.id]?.status === 'not_found'">❌</span>
                <span v-else-if="progress.nodeStatuses[node.id]?.status === 'error'">⚠️</span>
                <span v-else>⏸️</span>
              </span>
              <span class="node-name">{{ node.name }}</span>
              <span
                class="node-layer-badge"
                :style="{ background: getOntologyCanvasLayerColor(node.layer || node.label) }"
              >
                {{ node.layer || node.label }}
              </span>
              <span class="node-status-text">
                {{ progress.nodeStatuses[node.id]?.message || '대기 중' }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="mapping-results">
          <div class="mapping-stats">
            <div class="stat-item">
              <span class="stat-value">{{ stats.total }}</span>
              <span class="stat-label">전체 노드</span>
            </div>
            <div class="stat-item found">
              <span class="stat-value">{{ stats.found }}</span>
              <span class="stat-label">후보 발견</span>
            </div>
            <div class="stat-item confirmed">
              <span class="stat-value">{{ stats.confirmed }}</span>
              <span class="stat-label">확정됨</span>
            </div>
            <div class="stat-item not-found">
              <span class="stat-value">{{ stats.notFound }}</span>
              <span class="stat-label">미발견</span>
            </div>
            <div class="stat-item error">
              <span class="stat-value">{{ stats.error }}</span>
              <span class="stat-label">오류</span>
            </div>
          </div>

          <div class="mapping-list">
            <div
              v-for="(mapping, nodeId) in mappings"
              :key="nodeId"
              class="mapping-item"
              :class="{ selected: selectedNodeId === nodeId }"
            >
              <button
                type="button"
                class="mapping-header"
                :aria-expanded="selectedNodeId === nodeId"
                :aria-controls="mappingDetailsId(nodeId)"
                @click="emit('toggle-mapping', nodeId)"
              >
                <span class="mapping-status">{{ datasourceMappingStatusIcon(mapping.status) }}</span>
                <span class="mapping-name">{{ mapping.node_name }}</span>
                <span
                  class="mapping-layer"
                  :style="{ color: getOntologyCanvasLayerColor(mapping.node_layer) }"
                >
                  {{ mapping.node_layer }}
                </span>
              </button>

              <div
                v-if="selectedNodeId === nodeId"
                :id="mappingDetailsId(nodeId)"
                class="mapping-details"
              >
                <div class="search-query">
                  <span class="label">검색 쿼리:</span>
                  <span class="value">{{ mapping.search_query }}</span>
                </div>

                <div v-if="mapping.candidates.length > 0" class="candidates-list">
                  <h5>📋 데이터 소스 후보 ({{ mapping.candidates.length }}개)</h5>
                  <div
                    v-for="(candidate, index) in mapping.candidates"
                    :key="index"
                    class="candidate-item"
                    :class="{
                      selected: mapping.selected_candidate?.table_name === candidate.table_name,
                      confirmed: mapping.status === 'confirmed'
                        && mapping.selected_candidate?.table_name === candidate.table_name,
                      expanded: expandedCandidates.has(`${nodeId}-${index}`),
                    }"
                  >
                    <div class="candidate-header">
                      <div class="candidate-info">
                        <div class="candidate-name">
                          <span class="expand-icon">{{ expandedCandidates.has(`${nodeId}-${index}`) ? '▼' : '▶' }}</span>
                          <span class="table-icon">📊</span>
                          <strong>{{ candidate.table_name }}</strong>
                          <span v-if="candidate.relevance_score !== null" class="relevance-badge">
                            {{ (candidate.relevance_score * 100).toFixed(0) }}%
                          </span>
                          <span
                            v-if="mapping.status === 'confirmed'
                              && mapping.selected_candidate?.table_name === candidate.table_name"
                            class="confirmed-tag"
                          >
                            ✅ 확정됨
                          </span>
                        </div>
                        <div class="candidate-meta">
                          <span v-if="candidate.row_count === null">📊 ... rows</span>
                          <span v-else-if="candidate.row_count === -1">📊 - rows</span>
                          <span v-else-if="candidate.row_count_approx">📊 {{ candidate.row_count.toLocaleString() }}+ rows</span>
                          <span v-else>📊 {{ candidate.row_count.toLocaleString() }} rows</span>
                          <span>📋 {{ candidate.columns.length }} columns</span>
                        </div>
                        <div class="candidate-reason">{{ candidate.match_reason }}</div>
                        <button
                          type="button"
                          class="candidate-toggle-hitbox"
                          :aria-label="`${candidate.table_name} 후보 상세`"
                          :aria-expanded="expandedCandidates.has(`${nodeId}-${index}`)"
                          :aria-controls="candidateDetailsId(nodeId, index)"
                          @click.stop="emit('toggle-candidate', nodeId, index)"
                        ></button>
                      </div>
                      <div class="candidate-actions">
                        <button
                          type="button"
                          class="preview-btn"
                          title="샘플 데이터 보기"
                          @click.stop="emit('preview', candidate)"
                        >
                          👁️ 미리보기
                        </button>
                        <button
                          v-if="mapping.status !== 'confirmed'
                            || mapping.selected_candidate?.table_name !== candidate.table_name"
                          type="button"
                          class="confirm-btn"
                          :disabled="confirmPendingIds.has(nodeId)"
                          title="이 데이터 소스 선택"
                          @click.stop="emit('confirm-candidate', nodeId, candidate)"
                        >
                          {{ confirmPendingIds.has(nodeId)
                            ? '확정 중…'
                            : confirmErrors[nodeId]
                              ? '다시 시도'
                              : '✓ 선택' }}
                        </button>
                      </div>
                    </div>
                    <p v-if="confirmErrors[nodeId]" class="datasource-operation-inline-error" role="alert">
                      {{ confirmErrors[nodeId] }}
                    </p>

                    <div
                      v-if="expandedCandidates.has(`${nodeId}-${index}`)"
                      :id="candidateDetailsId(nodeId, index)"
                      class="candidate-details"
                    >
                      <div class="candidate-columns">
                        <h6>📋 컬럼 목록 ({{ candidate.columns.length }}개)</h6>
                        <div class="columns-grid">
                          <span
                            v-for="(column, columnIndex) in candidate.columns"
                            :key="columnIndex"
                            class="column-badge"
                          >
                            {{ column }}
                          </span>
                        </div>
                      </div>
                      <div v-if="candidate.suggested_sql" class="candidate-sql">
                        <h6>🔍 추천 SQL 쿼리</h6>
                        <code class="sql-code">{{ candidate.suggested_sql }}</code>
                      </div>
                      <div v-if="candidate.sample_data.length > 0" class="candidate-sample">
                        <h6>👀 샘플 데이터 ({{ candidate.sample_data.length }}행)</h6>
                        <div class="sample-table-wrapper">
                          <table class="sample-table">
                            <thead>
                              <tr>
                                <th v-for="column in candidate.columns.slice(0, 5)" :key="column">{{ column }}</th>
                                <th v-if="candidate.columns.length > 5">...</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr v-for="(row, rowIndex) in candidate.sample_data.slice(0, 3)" :key="rowIndex">
                                <td v-for="column in candidate.columns.slice(0, 5)" :key="column">
                                  {{ formatDatasourceSampleValue(row[column]) }}
                                </td>
                                <td v-if="candidate.columns.length > 5">...</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else class="no-candidates">
                  <p>❌ 관련 데이터 소스를 찾지 못했습니다.</p>
                  <p class="hint">Text2SQL에서 직접 검색하거나, 수동으로 데이터 소스를 연결하세요.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button type="button" class="cancel-btn" :disabled="closeBlocked" @click="emit('close')">닫기</button>
        <button
          v-if="!linking && stats.found > 0"
          type="button"
          class="action-btn success"
          :disabled="busy || stats.confirmed >= stats.found"
          @click="emit('confirm-bulk')"
        >
          ✅ 선택된 후보 모두 확정 ({{ stats.confirmed }}/{{ stats.found }})
        </button>
        <button type="button" class="action-btn primary" :disabled="linking" @click="emit('retry')">
          🔄 다시 검색
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./OntologyDatasourceMappingDialog.scss"></style>
