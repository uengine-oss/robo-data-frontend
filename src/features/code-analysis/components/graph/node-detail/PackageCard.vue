<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import NodeDetailBase from './NodeDetailBase.vue'

const props = defineProps<{ node: GraphNode }>()
const projectStore = useAnalyzerStore()
const qualifiedName = computed(() => String(props.node.properties?.qualified_name || props.node.properties?.name || ''))
const children = computed(() => [...projectStore.linkMap.values()]
  .filter(link => link.type === 'PARENT_OF' && link.source === props.node.id)
  .map(link => {
    const node = projectStore.nodeMap.get(link.target)
    return {
      id: link.target,
      name: String(node?.properties?.name || link.target),
      type: String(node?.labels?.[0] || ''),
    }
  }))
</script>

<template>
  <NodeDetailBase :node="node" icon="📦" label-badge="PACKAGE" :sub-info="qualifiedName">
    <template #body>
      <section v-if="children.length" class="detail-card">
        <span class="detail-card__label">하위 항목 · {{ children.length }}</span>
        <ul>
          <li v-for="child in children" :key="child.id">
            <span class="type">{{ child.type }}</span>
            <span class="name">{{ child.name }}</span>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
ul { list-style: none; margin: 0; padding: 8px; }
li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.type { color: var(--color-text-muted); font-size: 0.68rem; font-weight: 700; }
.name { color: var(--color-text-bright); font-family: monospace; }
</style>
