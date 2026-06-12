<script setup lang="ts">
/**
 * FunctionCard.vue — FUNCTION / PROCEDURE / TRIGGER 디테일.
 * 순서: 식별(시그니처는 식별 카드 안 컴팩트) → 개요 → 역할 → 원문 코드 → 연결.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/types'
import {
  technicalNodeName,
  logicalNodeName,
  stripCStyleComments,
} from '@/utils/graphDisplay'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/components/common/TextViewer.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const subLabel = computed(() => {
  const sub = props.node.properties?.type as string | undefined
  if (sub) return sub
  return props.node.labels?.[0] || 'FUNCTION'
})

const headerTech = computed(() => technicalNodeName(props.node))
const headerLogical = computed(() => logicalNodeName(props.node))

const actor = computed(() => (props.node.properties?.actor as string) || '')
const codeText = computed(() => (props.node.properties?.code_text as string) || '')
const moduleName = computed(() => (props.node.properties?.module_name as string) || '')
const codeForViewer = computed(() => stripCStyleComments(codeText.value))

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const file = (p.file_path as string) || ''
  const fileName = (p.file_name as string) || file.split(/[/\\]/).pop() || ''
  const startLine = p.start_line as number | undefined
  const endLine = p.end_line as number | undefined
  const lines = startLine && endLine ? `라인 ${startLine}~${endLine}` : ''
  const parts = [moduleName.value, fileName, lines].filter(Boolean)
  return parts.join(' · ')
})
</script>

<template>
  <NodeDetailBase
    :node="node"
    icon="🔧"
    :label-badge="subLabel"
    :sub-info="subInfo"
    :header-title="headerTech"
    :header-logical="headerLogical"
  >
    <template #body>
      <section v-if="actor" class="detail-card">
        <span class="detail-card__label">역할</span>
        <div class="detail-card__body detail-card__body--tight">
          <p class="fn-actor">{{ actor }}</p>
        </div>
      </section>

      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">원문 코드</span>
        <div class="detail-card__body detail-card__body--flush">
          <div class="detail-scroll">
            <TextViewer :content="codeForViewer" compact />
          </div>
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.fn-actor {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--color-text-light);
}
</style>
