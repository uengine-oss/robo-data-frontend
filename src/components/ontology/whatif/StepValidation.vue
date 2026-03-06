<script setup lang="ts">
/**
 * StepValidation.vue
 * Step 4: 모델 검증 — 백테스팅 메트릭, 민감도 분석
 */
import { ref } from 'vue'
import { whatifDomainApi, type ValidateResponse } from '@/services/whatif-domain-api'

const props = defineProps<{
  schemaId: string
  fieldDescriptions?: Record<string, string>
  loading: boolean
}>()

function fieldLabel(fieldName: string): string {
  // "노드명__필드명" 또는 "필드명" 에서 필드명 추출 후 description 매핑
  const raw = fieldName.includes('__') ? fieldName.split('__').pop()! : fieldName
  return props.fieldDescriptions?.[raw] || raw
}

const emit = defineEmits<{
  (e: 'validated', result: ValidateResponse): void
}>()

const isValidating = ref(false)
const result = ref<ValidateResponse | null>(null)
const error = ref('')

async function runValidation() {
  isValidating.value = true
  error.value = ''
  try {
    result.value = await whatifDomainApi.validate(props.schemaId, 0.2)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isValidating.value = false
  }
}

function confirmValidation() {
  if (result.value) {
    emit('validated', result.value)
  }
}

function metricColor(r2: number): string {
  if (r2 >= 0.5) return '#22c55e'
  if (r2 >= 0.1) return '#f59e0b'
  return '#ef4444'
}

function barWidth(value: number, max: number): string {
  return `${Math.min(100, Math.max(2, (Math.abs(value) / max) * 100))}%`
}

// 자동 실행
runValidation()
</script>

<template>
  <div class="step-validation">
    <div class="step-header">
      <h4>✅ 모델 검증 (백테스팅)</h4>
      <p class="step-desc">시간 기반 train/test 분할로 각 모델의 예측 성능을 평가합니다.</p>
    </div>

    <div v-if="isValidating" class="loading">
      <div class="spinner"></div>
      <p>모델 검증 중...</p>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="result" class="results">
      <!-- 전체 요약 -->
      <div class="summary-row">
        <div class="summary-item">
          <span class="label">평균 R²</span>
          <span class="value" :style="{ color: metricColor(result.summary.mean_r2) }">
            {{ result.summary.mean_r2.toFixed(4) }}
          </span>
        </div>
        <div class="summary-item">
          <span class="label">평균 RMSE</span>
          <span class="value">{{ result.summary.mean_rmse.toFixed(2) }}</span>
        </div>
        <div class="summary-item">
          <span class="label">검증 모델</span>
          <span class="value">{{ result.validated_count }}개</span>
        </div>
      </div>

      <!-- 모델별 결과 카드 -->
      <div class="model-cards">
        <div
          v-for="mr in result.model_results"
          :key="mr.model_name"
          class="model-card"
          :class="{ valid: mr.valid, invalid: !mr.valid }"
        >
          <div class="card-title">
            <span class="valid-icon">{{ mr.valid ? '✅' : '⚠️' }}</span>
            <span>{{ mr.model_name }}</span>
          </div>

          <!-- 메트릭 -->
          <div class="metrics-grid">
            <div class="metric">
              <span class="metric-label">R²</span>
              <span class="metric-value" :style="{ color: metricColor(mr.metrics.r2) }">
                {{ mr.metrics.r2.toFixed(4) }}
              </span>
            </div>
            <div class="metric">
              <span class="metric-label">RMSE</span>
              <span class="metric-value">{{ mr.metrics.rmse.toFixed(2) }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">MAE</span>
              <span class="metric-value">{{ mr.metrics.mae.toFixed(2) }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">MAPE</span>
              <span class="metric-value">{{ mr.metrics.mape.toFixed(1) }}%</span>
            </div>
          </div>

          <!-- 민감도 분석 -->
          <div v-if="mr.sensitivity && mr.sensitivity.length > 0" class="sensitivity">
            <div class="sens-title">민감도 (+10% 변동)</div>
            <div v-for="s in mr.sensitivity" :key="s.feature" class="sens-row">
              <span class="sens-feature" :title="s.feature.split('__').pop()">{{ fieldLabel(s.feature) }}</span>
              <div class="sens-bar-container">
                <div
                  class="sens-bar"
                  :class="s.direction"
                  :style="{ width: barWidth(s.pct_change, 30) }"
                ></div>
              </div>
              <span class="sens-value" :class="s.direction">
                {{ s.pct_change > 0 ? '+' : '' }}{{ s.pct_change.toFixed(1) }}%
              </span>
            </div>
          </div>

          <!-- 모델 상세 (알고리즘, 계수, 학습데이터) -->
          <details class="model-details">
            <summary class="details-toggle">📋 모델 상세 정보</summary>
            <div class="details-content">
              <!-- 알고리즘 -->
              <div v-if="mr.algorithm" class="detail-row">
                <span class="detail-label">알고리즘</span>
                <span class="detail-value mono">{{ mr.algorithm }}</span>
              </div>
              <!-- 절편 -->
              <div v-if="mr.intercept !== undefined" class="detail-row">
                <span class="detail-label">절편 (intercept)</span>
                <span class="detail-value mono">{{ mr.intercept }}</span>
              </div>
              <!-- 회귀 계수 -->
              <div v-if="mr.coefficients" class="detail-row">
                <span class="detail-label">회귀 계수</span>
                <div class="coeff-list">
                  <div v-for="(coef, fname) in mr.coefficients" :key="fname" class="coeff-item">
                    <span class="coeff-name" :title="String(fname)">{{ fieldLabel(String(fname)) }}</span>
                    <span class="coeff-value" :class="coef > 0 ? 'positive' : 'negative'">
                      {{ coef > 0 ? '+' : '' }}{{ coef }}
                    </span>
                  </div>
                </div>
              </div>
              <!-- 학습 데이터 미리보기 -->
              <div v-if="mr.train_preview" class="detail-row">
                <span class="detail-label">학습 데이터 (첫 3행)</span>
                <div class="train-preview-table">
                  <table>
                    <thead>
                      <tr>
                        <th v-for="col in mr.train_preview.columns" :key="col" :title="col">{{ fieldLabel(col) }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, ri) in mr.train_preview.rows" :key="ri">
                        <td v-for="(val, ci) in row" :key="ci">
                          {{ typeof val === 'number' ? val.toFixed(2) : val }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </details>

          <div v-if="mr.error" class="model-error">{{ mr.error }}</div>
        </div>
      </div>

      <button class="confirm-btn" @click="confirmValidation">
        시뮬레이션으로 →
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.step-validation { max-width: 1000px; }
.step-header {
  margin-bottom: 16px;
  h4 { margin: 0 0 4px; color: var(--color-text-bright); }
  .step-desc { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
}

.loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px;
  .spinner { width: 32px; height: 32px; border: 3px solid var(--color-border); border-top-color: var(--color-primary, #6366f1); border-radius: 50%; animation: spin 0.8s linear infinite; }
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-msg { padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #dc2626; margin-bottom: 16px; }

.summary-row {
  display: flex; gap: 24px; margin-bottom: 20px;
  .summary-item {
    display: flex; flex-direction: column; gap: 2px;
    .label { font-size: 0.75rem; color: var(--color-text-muted); }
    .value { font-size: 1.2rem; font-weight: 700; }
  }
}

.model-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }

.model-card {
  background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 10px; padding: 14px;
  &.valid { border-left: 3px solid #22c55e; }
  &.invalid { border-left: 3px solid #f59e0b; }
  .card-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.9rem; color: var(--color-text-bright); margin-bottom: 10px; }
}

.metrics-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px;
  .metric {
    display: flex; flex-direction: column; align-items: center;
    .metric-label { font-size: 0.65rem; color: var(--color-text-muted); text-transform: uppercase; }
    .metric-value { font-size: 0.85rem; font-weight: 700; }
  }
}

.sensitivity {
  .sens-title { font-size: 0.7rem; color: var(--color-text-muted); margin-bottom: 6px; font-weight: 600; }
  .sens-row { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; font-size: 0.75rem; }
  .sens-feature { width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); }
  .sens-bar-container { flex: 1; height: 8px; background: var(--color-bg); border-radius: 4px; overflow: hidden; }
  .sens-bar { height: 100%; border-radius: 4px; &.positive { background: #22c55e; } &.negative { background: #ef4444; } }
  .sens-value { width: 60px; text-align: right; font-weight: 600; &.positive { color: #22c55e; } &.negative { color: #ef4444; } }
}

.model-details {
  margin-top: 8px; border-top: 1px solid var(--color-border); padding-top: 6px;
  .details-toggle {
    font-size: 0.75rem; color: var(--color-text-muted); cursor: pointer;
    &:hover { color: var(--color-text-bright); }
  }
  .details-content { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
  .detail-row {
    .detail-label { font-size: 0.7rem; color: var(--color-text-muted); font-weight: 600; display: block; margin-bottom: 2px; }
    .detail-value { font-size: 0.8rem; color: var(--color-text-bright); }
    .mono { font-family: monospace; }
  }
  .coeff-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .coeff-item {
    display: flex; gap: 4px; padding: 2px 8px; background: var(--color-bg); border-radius: 4px; font-size: 0.7rem;
    .coeff-name { color: var(--color-text-muted); }
    .coeff-value { font-family: monospace; font-weight: 600;
      &.positive { color: #22c55e; }
      &.negative { color: #ef4444; }
    }
  }
  .train-preview-table {
    overflow-x: auto;
    table { border-collapse: collapse; font-size: 0.65rem; }
    th { background: var(--color-bg); padding: 3px 6px; font-weight: 600; border-bottom: 1px solid var(--color-border); white-space: nowrap; }
    td { padding: 2px 6px; border-bottom: 1px solid var(--color-border); font-family: monospace; white-space: nowrap; }
  }
}

.model-error { font-size: 0.75rem; color: #dc2626; margin-top: 8px; }

.confirm-btn {
  margin-top: 16px; padding: 10px 24px; background: var(--color-success, #22c55e); color: #fff;
  border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;
}
</style>
