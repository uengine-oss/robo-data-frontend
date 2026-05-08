<script setup lang="ts">
/**
 * FunctionCard.vue
 * FUNCTION / PROCEDURE / TRIGGER 노드 (Framework FUNCTION + DBMS PROCEDURE/FUNCTION/TRIGGER).
 *
 * 표시: 시그니처 + Actor + summary + 호출/입출력 관계.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/types'
import { useAnalyzerStore } from '@/stores/analyzer'
import { getRelationshipGroups } from '@/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const subLabel = computed(() => {
  const sub = props.node.properties?.type as string | undefined
  if (sub) return sub
  return props.node.labels?.[0] || 'FUNCTION'
})

const signature = computed(() => {
  const p = props.node.properties || {}
  return (p.signature as string) || ''
})

const params = computed(() => (props.node.properties?.params as string) || (props.node.properties?.parameters as string) || '')
const returnType = computed(() => (props.node.properties?.return_type as string) || '')
const actor = computed(() => (props.node.properties?.actor as string) || '')

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const file = (p.file_path as string) || ''
  const fileName = (p.file_name as string) || file.split(/[/\\]/).pop() || ''
  const startLine = p.start_line as number | undefined
  const endLine = p.end_line as number | undefined
  const lines = startLine && endLine ? `라인 ${startLine}~${endLine}` : ''
  return [fileName, lines].filter(Boolean).join(' · ')
})

const groups = computed(() =>
  getRelationshipGroups(props.node.id, projectStore.linkMap.values()),
)

function resolveName(id: string): string {
  const n = projectStore.nodeMap.get(id)
  const p = n?.properties || {}
  return (p.name as string) || (p.fqn as string)?.split('.').pop() || id
}

const inputTables = computed(() =>
  groups.value.inputs.map(l => ({ id: l.target, name: resolveName(l.target), type: l.type })),
)
const outputTables = computed(() =>
  groups.value.outputs.map(l => ({ id: l.target, name: resolveName(l.target) })),
)
const calls = computed(() =>
  groups.value.calls.map(l => ({ id: l.target, name: resolveName(l.target), type: l.type })),
)
</script>

<template>
  <NodeDetailBase
    :node="node"
    icon="🔧"
    :label-badge="subLabel"
    :sub-info="subInfo"
  >
    <template #sub-header>
      <div v-if="signature" class="signature-line">{{ signature }}</div>
      <div v-else-if="params || returnType" class="signature-line">
        ({{ params }}){{ returnType ? ` → ${returnType}` : '' }}
      </div>
      <div v-if="actor" class="actor-line">👤 {{ actor }}</div>
    </template>

    <template #body>
      <section v-if="inputTables.length > 0" class="data-section">
        <h4 class="section-title">📥 입력 ({{ inputTables.length }})</h4>
        <ul class="data-list">
          <li v-for="t in inputTables" :key="t.id">
            <span class="rel-tag">{{ t.type }}</span>
            <span class="data-name">{{ t.name }}</span>
          </li>
        </ul>
      </section>

      <section v-if="outputTables.length > 0" class="data-section">
        <h4 class="section-title">📤 출력 ({{ outputTables.length }})</h4>
        <ul class="data-list">
          <li v-for="t in outputTables" :key="t.id">
            <span class="data-name">{{ t.name }}</span>
          </li>
        </ul>
      </section>

      <section v-if="calls.length > 0" class="data-section">
        <h4 class="section-title">📞 호출 ({{ calls.length }})</h4>
        <ul class="data-list">
          <li v-for="c in calls" :key="c.id">
            <span class="rel-tag">{{ c.type }}</span>
            <span class="data-name">{{ c.name }}</span>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.signature-line {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-text);
  margin-top: 6px;
  word-break: break-all;
}

.actor-line {
  font-size: 0.75rem;
  color: var(--color-accent-secondary, #a5b4fc);
  margin-top: 4px;
}

.data-section {
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

.data-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    font-size: 0.75rem;
  }
}

.rel-tag {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  font-weight: 600;
}

.data-name {
  color: var(--color-text);
  font-family: monospace;
}
</style>
