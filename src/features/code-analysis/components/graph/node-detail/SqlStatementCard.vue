<script setup lang="ts">
/**
 * SqlStatementCard.vue
 * DBMS DML (SELECT/INSERT/UPDATE/DELETE/MERGE/UNION 등) + Framework SQL_STATEMENT.
 */

import { computed, ref } from 'vue'
import type { GraphNode } from '@/types'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
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
      <section v-if="inputs.length > 0" class="detail-card">
        <span class="detail-card__label">입력 · {{ inputs.length }}</span>
        <div class="detail-card__body detail-card__body--tight">
          <ul class="sql-data-list">
            <li v-for="t in inputs" :key="t.id">
              <span class="rel-tag">{{ t.type }}</span>
              <span class="data-name">{{ t.name }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="outputs.length > 0" class="detail-card">
        <span class="detail-card__label">출력 · {{ outputs.length }}</span>
        <div class="detail-card__body detail-card__body--tight">
          <ul class="sql-data-list">
            <li v-for="t in outputs" :key="t.id"><span class="data-name">{{ t.name }}</span></li>
          </ul>
        </div>
      </section>

      <section v-if="code" class="detail-card">
        <span class="detail-card__label sql-code-label">
          <span>원문 SQL</span>
          <button type="button" class="toggle-btn" @click="showFullCode = !showFullCode">
            {{ showFullCode ? '접기' : '전체보기' }}
          </button>
        </span>
        <div class="detail-card__body detail-card__body--flush">
          <div class="detail-scroll" :class="{ 'detail-scroll--collapsed-sql': !showFullCode }">
            <pre>{{ code }}</pre>
          </div>
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.sql-code-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
}

.toggle-btn {
  margin-left: auto;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;

  &:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}

.sql-data-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--color-border-light, var(--color-border));
    background: var(--color-bg-tertiary);
    font-size: 0.74rem;
  }
}

.rel-tag {
  font-size: 0.62rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  font-weight: 700;
}

.data-name {
  color: var(--color-text-bright);
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.7rem;
}
</style>
