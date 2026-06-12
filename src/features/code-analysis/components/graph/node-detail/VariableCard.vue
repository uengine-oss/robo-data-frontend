<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const isConstant = computed(() => props.node.labels?.[0] === 'CONSTANT')
const subLabel = computed(() => (props.node.properties?.type as string) || (isConstant.value ? 'CONSTANT' : 'VARIABLE'))
const variableType = computed(() => (props.node.properties?.variable_type as string) || '')
const initValue = computed(() => (props.node.properties?.init_value as string) || '')
const modifiers = computed(() => (props.node.properties?.modifiers as string) || '')
const summary = computed(() => (props.node.properties?.summary as string) || '')

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
      <section class="var-meta">
        <div v-if="variableType" class="meta-row">
          <span class="meta-key">타입</span>
          <span class="meta-val">{{ variableType }}</span>
        </div>
        <div v-if="initValue" class="meta-row">
          <span class="meta-key">초기값</span>
          <span class="meta-val">{{ initValue }}</span>
        </div>
        <div v-if="modifiers" class="meta-row">
          <span class="meta-key">수정자</span>
          <span class="meta-val">{{ modifiers }}</span>
        </div>
      </section>

      <section v-if="summary" class="summary-section">
        <h4 class="section-title">📝 설명</h4>
        <TextViewer :content="summary" :max-height="160" />
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.var-meta, .summary-section {
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  margin: 0 0 8px;
}

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
