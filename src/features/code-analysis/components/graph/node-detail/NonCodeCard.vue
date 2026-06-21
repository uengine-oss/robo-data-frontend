<script setup lang="ts">
/**
 * NonCodeCard.vue
 * Framework 의 비코드 청크 — ARTIFACT_CHUNK (XML/EJB) / CONFIG_SECTION (YAML/Properties).
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const isArtifact = computed(() => props.node.labels?.[0] === 'ARTIFACT_CHUNK')
const subLabel = computed(() => isArtifact.value ? 'ARTIFACT' : 'CONFIG')

const filePath = computed(() => (props.node.properties?.file_path as string) || '')
const codeText = computed(() => (props.node.properties?.code_text as string) || '')

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
      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">내용</span>
        <div class="detail-card__body detail-card__body--flush">
          <div class="detail-scroll">
            <pre>{{ codeText }}</pre>
          </div>
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>
