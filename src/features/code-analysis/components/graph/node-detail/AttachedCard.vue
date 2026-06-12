<script setup lang="ts">
/**
 * AttachedCard.vue
 * 부착 노드 단독 표시 — Rule / Example / Question / Actor.
 * 라벨별로 키 필드 다름.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const primary = computed(() => props.node.labels?.[0] || '')

const ICONS: Record<string, string> = {
  Rule: '📜',
  Example: '✨',
  Question: '❓',
  Actor: '👤',
}

const icon = computed(() => ICONS[primary.value] || '📌')

// Rule
const statement = computed(() => (props.node.properties?.statement as string) || '')
// Example
const description = computed(() => (props.node.properties?.description as string) || '')
const given = computed(() => safeJsonString(props.node.properties?.given))
const whenText = computed(() => (props.node.properties?.when_ as string) || (props.node.properties?.when as string) || '')
const then = computed(() => safeJsonString(props.node.properties?.then_ ?? props.node.properties?.then))
// Question
const text = computed(() => (props.node.properties?.text as string) || '')
const reason = computed(() => (props.node.properties?.reason as string) || '')

function safeJsonString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
</script>

<template>
  <NodeDetailBase :node="node" :icon="icon" :label-badge="primary">
    <template #body>
      <!-- Rule -->
      <section v-if="primary === 'Rule' && statement" class="content-section">
        <h4 class="section-title">규칙</h4>
        <TextViewer :content="statement" :max-height="200" />
      </section>

      <!-- Example -->
      <template v-if="primary === 'Example'">
        <section v-if="description" class="content-section">
          <h4 class="section-title">설명</h4>
          <TextViewer :content="description" :max-height="160" />
        </section>
        <section v-if="given" class="content-section">
          <h4 class="section-title">Given</h4>
          <pre class="json-block">{{ given }}</pre>
        </section>
        <section v-if="whenText" class="content-section">
          <h4 class="section-title">When</h4>
          <TextViewer :content="whenText" :max-height="120" />
        </section>
        <section v-if="then" class="content-section">
          <h4 class="section-title">Then</h4>
          <pre class="json-block">{{ then }}</pre>
        </section>
      </template>

      <!-- Question -->
      <template v-if="primary === 'Question'">
        <section v-if="text" class="content-section">
          <h4 class="section-title">질문</h4>
          <TextViewer :content="text" :max-height="160" />
        </section>
        <section v-if="reason" class="content-section">
          <h4 class="section-title">근거 부재 이유</h4>
          <TextViewer :content="reason" :max-height="160" />
        </section>
      </template>

      <!-- Actor — 이름만, 추가 정보 없음. NodeDetailBase 헤더로 충분 -->
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
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  margin: 0 0 8px;
}

.json-block {
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--color-text);
  background: var(--color-bg);
  padding: 8px;
  border-radius: 4px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  max-height: 200px;
}
</style>
