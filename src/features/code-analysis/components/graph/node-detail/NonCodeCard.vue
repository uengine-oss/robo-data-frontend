<script setup lang="ts">
/**
 * NonCodeCard.vue
 * 외부 파일 의미 청크 — EXTERNAL_CHUNK (spec 078).
 * `text` = 원문 슬라이스 전문, `keys` = exact 참조 키, `provenance` = source_span/derived.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'
import { AsyncCodeViewer as CodeViewer } from '@/shared/components/codeViewerAsync'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const semanticKind = computed(() => (props.node.properties?.semantic_kind as string) || '')
const subLabel = computed(() => semanticKind.value.toUpperCase() || 'CHUNK')

const filePath = computed(() => (props.node.properties?.file_path as string) || '')
const text = computed(() => (props.node.properties?.text as string) || '')
const keys = computed(() => (props.node.properties?.keys as string[]) || [])
const isDerived = computed(() => props.node.properties?.provenance === 'derived_document')

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const start = p.start_line as number | undefined
  const end = p.end_line as number | undefined
  const lines = start && end ? `라인 ${start}~${end}` : ''
  const derived = isDerived.value ? '변환 문서(원문 좌표 없음)' : ''
  return [filePath.value, lines, derived].filter(Boolean).join(' · ')
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
      <section v-if="text" class="detail-card">
        <span class="detail-card__label">원문</span>
        <div class="detail-card__body detail-card__body--flush">
          <CodeViewer :content="text" :file-path="filePath" />
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
