<script setup lang="ts">
/**
 * FallbackCard.vue
 * 그 외 노드 — 베이스 + raw key-value (DBMS 의 IF/LOOP/COMMIT/EXCEPTION/Schema/DBLink 등).
 * 새 노드 종류가 추가되면 여기에 떨어짐.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const HIDDEN_KEYS = new Set(['labels', 'summary', 'search_text'])  // search_text = 임베딩 검색 전용 (화면 비노출)

const properties = computed(() => {
  const p = props.node.properties || {}
  return Object.entries(p)
    .filter(([k]) => !HIDDEN_KEYS.has(k))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
    }))
})

const subLabel = computed(() => props.node.labels?.[0] || '')
</script>

<template>
  <NodeDetailBase :node="node" icon="📄" :label-badge="subLabel">
    <template #body>
      <section v-if="properties.length > 0" class="props-section">
        <h4 class="section-title">속성</h4>
        <dl class="props-list">
          <template v-for="p in properties" :key="p.key">
            <dt>{{ p.key }}</dt>
            <dd>{{ p.value }}</dd>
          </template>
        </dl>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.props-section {
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  margin: 0 0 8px;
  letter-spacing: 0.5px;
}

.props-list {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 0.75rem;

  dt {
    color: var(--color-text-muted);
    font-family: monospace;
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--color-text);
    word-break: break-all;
    white-space: pre-wrap;
  }
}
</style>
