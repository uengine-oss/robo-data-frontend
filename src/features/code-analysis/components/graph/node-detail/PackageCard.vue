<script setup lang="ts">
/**
 * PackageCard.vue
 * Framework PACKAGE — 자식 모듈 목록 (BELONGS_TO 역방향).
 */

import { computed } from 'vue'
import type { GraphNode, GraphLink } from '@/shared/types'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const fqn = computed(() => (props.node.properties?.id as string) || (props.node.properties?.name as string) || props.node.id)

const childModules = computed(() => {
  const result: { id: string; name: string; type: string }[] = []
  for (const link of projectStore.linkMap.values() as Iterable<GraphLink>) {
    if (link.target !== props.node.id) continue
    if (link.type !== 'BELONGS_TO') continue
    const n = projectStore.nodeMap.get(link.source)
    const p = n?.properties || {}
    result.push({
      id: link.source,
      name: (p.name as string) || (p.id as string)?.split('.').pop() || link.source,
      type: (p.type as string) || (n?.labels?.[0] as string) || '',
    })
  }
  return result
})
</script>

<template>
  <NodeDetailBase :node="node" icon="📦" label-badge="PACKAGE" :sub-info="fqn">
    <template #body>
      <section v-if="childModules.length > 0" class="modules-section">
        <h4 class="section-title">자식 모듈 ({{ childModules.length }})</h4>
        <ul class="modules-list">
          <li v-for="m in childModules" :key="m.id">
            <span class="module-type">{{ m.type }}</span>
            <span class="module-name">{{ m.name }}</span>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.modules-section {
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

.modules-list {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    font-size: 0.8rem;
  }

  .module-type {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--color-bg-tertiary);
    color: var(--color-text-muted);
    font-weight: 700;
  }

  .module-name {
    color: var(--color-text-bright);
    font-family: monospace;
  }
}
</style>
