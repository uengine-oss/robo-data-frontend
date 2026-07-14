<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'
import { AsyncCodeViewer as CodeViewer } from '@/shared/components/codeViewerAsync'

interface Props { node: GraphNode }
const props = defineProps<Props>()

// 상수 = antlr type 집합 (역할 라벨 폐기 — CONSTANT/DEFINE/CONSTANT_FIELD).
const CONSTANT_LABELS = new Set(['CONSTANT', 'DEFINE', 'CONSTANT_FIELD'])
const isConstant = computed(() => (props.node.labels || []).some(l => CONSTANT_LABELS.has(l)))
const subLabel = computed(() => props.node.labels?.[0] || (isConstant.value ? 'CONSTANT' : 'VARIABLE'))
// 백엔드 저장 이름은 `var_type` (analyzer shared/neo4j/nodes/variable.py·constant.py).
// 옛 `variable_type` 은 어디서도 저장되지 않아 타입 행이 영구 공백이었다 (spec 045 FR-009).
const variableType = computed(() => (props.node.properties?.var_type as string) || '')
// 변수는 `init_value`, 상수는 `value` 로 저장된다 — 한 카드가 둘 다 담당 (FR-010).
const initValue = computed(
  () => (props.node.properties?.init_value as string) || (props.node.properties?.value as string) || '',
)
const modifiers = computed(() => (props.node.properties?.modifiers as string) || '')
const codeText = computed(() => (props.node.properties?.code_text as string) || '')
const sourcePath = computed(() =>
  (props.node.properties?.file_path as string)
  || (props.node.properties?.file_name as string)
  || '',
)

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const file = (p.file_name as string) || (p.code_ref as string) || ''
  const line = p.start_line ? `라인 ${p.start_line}` : ''
  return [file, line].filter(Boolean).join(' · ')
})
</script>

<template>
  <NodeDetailBase
    :node="node"
    :icon="isConstant ? '🔒' : '📌'"
    :label-badge="subLabel"
    :sub-info="subInfo"
  >
    <template #body>
      <section v-if="variableType || initValue || modifiers" class="detail-card">
        <span class="detail-card__label">선언</span>
        <div class="detail-card__body detail-card__body--tight var-meta">
          <div v-if="variableType" class="meta-row">
            <span class="meta-key">타입</span>
            <span class="meta-val">{{ variableType }}</span>
          </div>
          <div v-if="initValue" class="meta-row">
            <span class="meta-key">{{ isConstant ? '값' : '초기값' }}</span>
            <span class="meta-val">{{ initValue }}</span>
          </div>
          <div v-if="modifiers" class="meta-row">
            <span class="meta-key">수정자</span>
            <span class="meta-val">{{ modifiers }}</span>
          </div>
        </div>
      </section>

      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">원문 코드</span>
        <div class="detail-card__body detail-card__body--flush">
          <CodeViewer :content="codeText" :file-path="sourcePath" :max-height="240" />
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.meta-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px;
  font-size: 0.8rem;
  padding: 3px 0;

  .meta-key { color: var(--color-text-muted); }
  .meta-val {
    color: var(--color-text-bright);
    font-family: monospace;
    word-break: break-all;
  }
}
</style>
