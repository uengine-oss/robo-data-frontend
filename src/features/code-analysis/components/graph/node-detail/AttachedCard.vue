<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'
import { AsyncCodeViewer as CodeViewer } from '@/shared/components/codeViewerAsync'

interface Props { node: GraphNode }
const props = defineProps<Props>()

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

const condition = computed(() => String(
  props.node.properties.condition_description
  ?? props.node.properties.condition
  ?? '',
).trim())
const effects = computed(() => textList(
  props.node.properties.effect_descriptions
  ?? props.node.properties.effects,
))
const codeText = computed(() => String(props.node.properties.code_text ?? '').trim())
const sourcePath = computed(() => String(props.node.properties.file_path ?? ''))
</script>

<template>
  <NodeDetailBase :node="node" icon="📜" label-badge="RULE">
    <template #body>
      <section v-if="condition" class="content-section">
        <h4 class="section-title">조건</h4>
        <TextViewer :content="condition" :max-height="200" />
      </section>
      <section v-if="effects.length" class="content-section">
        <h4 class="section-title">효과</h4>
        <ul class="effect-list">
          <li v-for="effect in effects" :key="effect">{{ effect }}</li>
        </ul>
      </section>
      <section v-if="codeText" class="content-section">
        <h4 class="section-title">근거 코드</h4>
        <CodeViewer :content="codeText" :file-path="sourcePath" />
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.content-section {
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.effect-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--color-text-light);
}
</style>
