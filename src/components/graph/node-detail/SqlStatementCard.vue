<script setup lang="ts">
/**
 * SqlStatementCard.vue
 * DBMS DML (SELECT/INSERT/UPDATE/DELETE/MERGE/UNION 등) + Framework SQL_STATEMENT.
 * 입력 테이블 + 출력 테이블 + code (전체 토글).
 */

import { computed, ref } from 'vue'
import type { GraphNode } from '@/types'
import { useAnalyzerStore } from '@/stores/analyzer'
import { getRelationshipGroups } from '@/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const subLabel = computed(() => props.node.labels?.[0] || 'SQL')

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const procedure = p.procedure_name as string | undefined
  const start = p.start_line ?? p.startLine
  const end = p.end_line ?? p.endLine
  const lines = start && end ? `라인 ${start}~${end}` : ''
  const token = p.token ? `토큰 ${p.token}` : ''
  return [procedure, lines, token].filter(Boolean).join(' · ')
})

const code = computed(() => {
  const p = props.node.properties || {}
  return (p.code as string) || (p.node_code as string) || (p.sql_text as string) || (p.code_text as string) || ''
})

const showFullCode = ref(false)

const groups = computed(() =>
  getRelationshipGroups(props.node.id, projectStore.linkMap.values()),
)

function resolveName(id: string): string {
  const n = projectStore.nodeMap.get(id)
  return (n?.properties?.name as string) || id
}

const inputs = computed(() =>
  groups.value.inputs.map(l => ({ id: l.target, name: resolveName(l.target), type: l.type })),
)
const outputs = computed(() =>
  groups.value.outputs.map(l => ({ id: l.target, name: resolveName(l.target) })),
)
</script>

<template>
  <NodeDetailBase :node="node" icon="🔍" :label-badge="subLabel" :sub-info="subInfo">
    <template #body>
      <section v-if="inputs.length > 0" class="data-section">
        <h4 class="section-title">📥 입력 ({{ inputs.length }})</h4>
        <ul class="data-list">
          <li v-for="t in inputs" :key="t.id">
            <span class="rel-tag">{{ t.type }}</span>
            <span class="data-name">{{ t.name }}</span>
          </li>
        </ul>
      </section>

      <section v-if="outputs.length > 0" class="data-section">
        <h4 class="section-title">📤 출력 ({{ outputs.length }})</h4>
        <ul class="data-list">
          <li v-for="t in outputs" :key="t.id"><span class="data-name">{{ t.name }}</span></li>
        </ul>
      </section>

      <section v-if="code" class="code-section">
        <h4 class="section-title">
          📄 코드
          <button class="toggle-btn" @click="showFullCode = !showFullCode">
            {{ showFullCode ? '접기' : '전체보기' }}
          </button>
        </h4>
        <pre class="code-block" :class="{ collapsed: !showFullCode }">{{ code }}</pre>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.data-section, .code-section {
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-btn {
  font-size: 0.65rem;
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  margin-left: auto;

  &:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
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

.code-block {
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--color-text);
  background: var(--color-bg);
  padding: 8px;
  border-radius: 4px;
  margin: 0;
  overflow: auto;
  white-space: pre;

  &.collapsed {
    max-height: 120px;
  }
}
</style>
