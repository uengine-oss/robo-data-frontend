<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/types'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const dtype = computed(() => (props.node.properties?.dtype as string) || '')
const nullable = computed(() => props.node.properties?.nullable !== false)
const pk = computed(() => Boolean(props.node.properties?.pk || props.node.properties?.is_primary_key))
const defaultVal = computed(() => (props.node.properties?.default as string) || '')
const description = computed(() => (props.node.properties?.description as string) || '')
const analyzedDesc = computed(() => (props.node.properties?.analyzed_description as string) || '')
const source = computed(() => (props.node.properties?.description_source as string) || '')

const subInfo = computed(() => {
  const fqn = props.node.properties?.fqn as string | undefined
  return fqn || ''
})
</script>

<template>
  <NodeDetailBase :node="node" icon="🔹" label-badge="COLUMN" :sub-info="subInfo">
    <template #body>
      <section class="col-meta">
        <div class="meta-row"><span class="meta-key">타입</span><span class="meta-val">{{ dtype || '-' }}</span></div>
        <div class="meta-row"><span class="meta-key">NULL</span><span class="meta-val">{{ nullable ? '허용' : '비허용' }}</span></div>
        <div class="meta-row"><span class="meta-key">PK</span><span class="meta-val">{{ pk ? '✓' : '-' }}</span></div>
        <div v-if="defaultVal" class="meta-row"><span class="meta-key">기본값</span><span class="meta-val">{{ defaultVal }}</span></div>
      </section>

      <section v-if="description" class="desc-section">
        <h4 class="section-title">📝 설명 <span v-if="source" class="src-tag">{{ source }}</span></h4>
        <TextViewer :content="description" :max-height="160" />
      </section>

      <section v-if="analyzedDesc && analyzedDesc !== description" class="desc-section">
        <h4 class="section-title">🤖 코드 분석 설명</h4>
        <TextViewer :content="analyzedDesc" :max-height="160" />
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.col-meta, .desc-section {
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

.src-tag {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  margin-left: 4px;
}

.meta-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px;
  font-size: 0.8rem;
  padding: 3px 0;

  .meta-key {
    color: var(--color-text-muted);
  }

  .meta-val {
    color: var(--color-text-bright);
    font-family: monospace;
  }
}
</style>
