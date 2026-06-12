<script setup lang="ts">
/**
 * StepModelGraph.vue
 * Step 2: 제안된 모델 DAG 시각화
 */
import { ref, computed } from 'vue'
import { whatifDomainApi, type EdgeCandidate, type ModelSpec } from '@/features/ontology/whatif-domain-api'

const props = defineProps<{
  schemaId: string
  edges: EdgeCandidate[]
  fieldDescriptions?: Record<string, string>
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'models-built', models: ModelSpec[]): void
}>()

const isBuilding = ref(false)
const models = ref<ModelSpec[]>([])
const error = ref('')

// 노드 ID → 노드 이름 매핑 (edges에서 추출)
const nodeNameMap = computed(() => {
  const map: Record<string, string> = {}
  for (const e of props.edges) {
    if (e.sourceNodeId && e.sourceNodeName) map[e.sourceNodeId] = e.sourceNodeName
    if (e.targetNodeId && e.targetNodeName) map[e.targetNodeId] = e.targetNodeName
  }
  return map
})

function shortNodeName(nodeId: string): string {
  const name = nodeNameMap.value[nodeId] || nodeId
  const parenIdx = name.indexOf('(')
  return parenIdx > 0 ? name.slice(0, parenIdx).trim() : name
}

function fieldLabel(fieldName: string): string {
  return props.fieldDescriptions?.[fieldName] || fieldName
}

// 자체 field descriptions (API 응답에서 갱신)
const localFieldDescs = ref<Record<string, string>>({})

// fieldLabel을 localFieldDescs도 참조하도록 재정의
function fieldLabelResolved(fieldName: string): string {
  return localFieldDescs.value[fieldName] || props.fieldDescriptions?.[fieldName] || fieldName
}

async function buildGraph() {
  isBuilding.value = true
  error.value = ''
  try {
    const result = await whatifDomainApi.buildModelGraph(props.schemaId, props.edges)
    models.value = result.models
    // API에서 반환된 field_descriptions 병합
    if ((result as any).field_descriptions) {
      localFieldDescs.value = (result as any).field_descriptions
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isBuilding.value = false
  }
}

function confirmModels() {
  emit('models-built', models.value)
}

// 자동 실행
buildGraph()
</script>

<template>
  <div class="step-model-graph">
    <div class="step-header">
      <h4>🧩 모델 체인 구성</h4>
      <p class="step-desc">발견된 관계를 기반으로 예측 모델 DAG를 자동 생성합니다. 각 타겟 변수마다 별도 모델이 생성됩니다.</p>
    </div>

    <div v-if="isBuilding" class="loading">모델 그래프 구성 중...</div>
    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="models.length > 0" class="model-list">
      <div class="model-count">{{ models.length }}개 모델이 제안되었습니다</div>

      <div class="model-cards">
        <div v-for="model in models" :key="model.model_id" class="model-card">
          <div class="card-header">
            <span class="order-badge">#{{ model.execution_order + 1 }}</span>
            <h5>{{ model.name }}</h5>
          </div>
          <div class="card-body">
            <!-- 입력 -->
            <div class="io-section inputs">
              <div class="io-label">입력 (READS_FIELD)</div>
              <div v-for="feat in model.features" :key="feat.field" class="io-item">
                <div class="field-info">
                  <span class="node-badge">{{ shortNodeName(feat.nodeId) }}</span>
                  <span class="field-name" :title="feat.field">.{{ fieldLabelResolved(feat.field) }}</span>
                </div>
                <span class="field-meta">
                  lag={{ feat.lag }}, score={{ feat.score.toFixed(2) }}
                </span>
              </div>
            </div>
            <!-- 화살표 -->
            <div class="arrow-section">
              <div class="arrow-line"></div>
              <span class="arrow-label">→ predict</span>
              <div class="arrow-line"></div>
            </div>
            <!-- 출력 -->
            <div class="io-section outputs">
              <div class="io-label">출력 (PREDICTS_FIELD)</div>
              <div class="io-item target">
                <div class="field-info">
                  <span class="node-badge target-badge">{{ shortNodeName(model.target_node_id) }}</span>
                  <span class="field-name" :title="model.target_field">.{{ fieldLabelResolved(model.target_field) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button class="confirm-btn" @click="confirmModels">
        이 모델로 학습 시작 →
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.step-model-graph { max-width: 1000px; }
.step-header {
  margin-bottom: 16px;
  h4 { margin: 0 0 4px; color: var(--color-text-bright); }
  .step-desc { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
}
.loading { padding: 20px; text-align: center; color: var(--color-text-muted); }
.error-msg { padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #dc2626; margin-bottom: 16px; }
.model-count { font-size: 0.9rem; color: var(--color-text-muted); margin-bottom: 12px; }

.model-cards { display: flex; flex-direction: column; gap: 12px; }

.model-card {
  background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden;
  .card-header {
    display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--color-bg-tertiary);
    .order-badge { background: var(--color-primary, #6366f1); color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 700; }
    h5 { margin: 0; font-size: 0.9rem; color: var(--color-text-bright); }
  }
  .card-body { display: flex; align-items: stretch; padding: 12px 16px; gap: 12px; }
}

.io-section {
  flex: 1;
  .io-label { font-size: 0.7rem; color: var(--color-text-muted); margin-bottom: 6px; font-weight: 600; text-transform: uppercase; }
  .io-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 8px; background: var(--color-bg); border-radius: 4px; margin-bottom: 4px; font-size: 0.8rem;
    .field-info { display: flex; align-items: center; gap: 2px; }
    .node-badge { font-size: 0.65rem; color: var(--color-text-muted); background: var(--color-bg-tertiary, rgba(255,255,255,0.08)); padding: 1px 6px; border-radius: 4px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .target-badge { background: rgba(255,255,255,0.2); color: rgba(255,255,255,0.8); }
    .field-name { font-weight: 600; color: var(--color-text-bright); }
    .field-meta { font-size: 0.7rem; color: var(--color-text-muted); }
    &.target { background: var(--color-primary, #6366f1); .field-name { color: #fff; } }
  }
}

.arrow-section {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 0 8px;
  .arrow-line { width: 2px; flex: 1; background: var(--color-border); }
  .arrow-label { font-size: 0.7rem; color: var(--color-text-muted); white-space: nowrap; }
}

.confirm-btn {
  margin-top: 16px; padding: 10px 24px; background: var(--color-success, #22c55e); color: #fff;
  border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;
}
</style>
