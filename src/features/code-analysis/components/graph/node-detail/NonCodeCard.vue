<script setup lang="ts">
/**
 * NonCodeCard.vue
 * EXTERNAL_CHUNK — 외부 파일에서 추출한 주소 가능한 원문 범위.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'
import { AsyncCodeViewer as CodeViewer } from '@/shared/components/codeViewerAsync'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const kind = computed(() => (props.node.properties?.kind as string) || '')
const subLabel = computed(() => kind.value.toUpperCase() || 'EXTERNAL_CHUNK')

const filePath = computed(() => (props.node.properties?.file_path as string) || '')
const codeText = computed(() => (props.node.properties?.code_text as string) || '')
const keys = computed(() => {
  const value = props.node.properties?.key
  return Array.isArray(value) ? value.map(String) : value ? [String(value)] : []
})

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const start = p.start_line as number | undefined
  const end = p.end_line as number | undefined
  const lines = start && end ? `라인 ${start}~${end}` : ''
  return [filePath.value, lines].filter(Boolean).join(' · ')
})
</script>

<template>
  <NodeDetailBase :node="node" icon="📜" :label-badge="subLabel" :sub-info="subInfo">
    <template #body>
      <section v-if="keys.length" class="detail-card">
        <span class="detail-card__label">참조 키</span>
        <div class="detail-card__body">
          <code v-for="key in keys" :key="key" class="detail-card__chip">{{ key }}</code>
        </div>
      </section>
      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">원문</span>
        <div class="detail-card__body detail-card__body--flush">
          <CodeViewer :content="codeText" :file-path="filePath" />
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style scoped>
.detail-card__chip {
  display: inline-block;
  margin: 0 6px 4px 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--sub-bg, rgba(127, 127, 127, 0.15));
  font-size: 12px;
}
</style>
