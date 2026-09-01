<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { getAttachedByType, getRelationshipGroups } from '@/shared/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'

const props = defineProps<{ node: GraphNode }>()
const projectStore = useAnalyzerStore()

const subInfo = computed(() => {
  const p = props.node.properties || {}
  return [p.datasource, p.database, p.schema, p.table_type].filter(Boolean).join(' · ')
})
const logicalName = computed(() => String(props.node.properties?.logical_name || '').trim())
const description = computed(() => String(props.node.properties?.description || '').trim())
const summary = computed(() => String(props.node.properties?.summary || '').trim())
const groups = computed(() => getRelationshipGroups(props.node.id, projectStore.linkMap.values()))

const columns = computed(() => getAttachedByType(groups.value, 'HAS_COLUMN').map(link => {
  const node = projectStore.nodeMap.get(link.target)
  const p = node?.properties || {}
  return {
    id: link.target,
    name: String(p.name || link.target),
    dataType: String(p.data_type || ''),
    nullable: p.nullable !== false,
    primaryKey: p.primary_key === true,
    summary: String(p.summary || p.description || ''),
  }
}))

const fks = computed(() => groups.value.fk.map(link => {
  const outgoing = link.source === props.node.id
  const peerId = outgoing ? link.target : link.source
  const peer = projectStore.nodeMap.get(peerId)
  return {
    id: link.id,
    direction: outgoing ? '→' : '←',
    name: String(peer?.properties?.name || peerId),
    fromColumn: String(link.properties?.from_column || ''),
    toColumn: String(link.properties?.to_column || ''),
  }
}))
</script>

<template>
  <NodeDetailBase :node="node" icon="🗂️" label-badge="TABLE" :sub-info="subInfo">
    <template #body>
      <div v-if="logicalName" class="logical-name">{{ logicalName }}</div>

      <section v-if="description" class="detail-section">
        <h4>정의 설명</h4>
        <TextViewer :content="description" :max-height="180" format="auto" />
      </section>
      <section v-if="summary" class="detail-section">
        <h4>업무 요약</h4>
        <TextViewer :content="summary" :max-height="220" format="auto" />
      </section>

      <section v-if="columns.length" class="detail-section">
        <h4>컬럼 · {{ columns.length }}</h4>
        <table>
          <thead><tr><th>이름</th><th>타입</th><th>NULL</th><th>PK</th><th>설명</th></tr></thead>
          <tbody>
            <tr v-for="column in columns" :key="column.id">
              <td class="mono">{{ column.name }}</td>
              <td class="mono">{{ column.dataType || '-' }}</td>
              <td>{{ column.nullable ? '허용' : '비허용' }}</td>
              <td>{{ column.primaryKey ? '✓' : '' }}</td>
              <td>{{ column.summary }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="fks.length" class="detail-section">
        <h4>FK · {{ fks.length }}</h4>
        <ul>
          <li v-for="fk in fks" :key="fk.id">
            <span>{{ fk.direction }} {{ fk.name }}</span>
            <small v-if="fk.fromColumn || fk.toColumn">{{ fk.fromColumn }} → {{ fk.toColumn }}</small>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.logical-name { font-size: 1rem; font-weight: 700; color: var(--color-text); }
.detail-section { padding: 12px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 8px; }
h4 { margin: 0 0 8px; font-size: 0.75rem; color: var(--color-text-muted); }
table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
th, td { padding: 5px 6px; border-bottom: 1px solid var(--color-border); text-align: left; }
th { color: var(--color-text-muted); }
.mono { font-family: monospace; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; }
small { color: var(--color-text-muted); font-family: monospace; }
</style>
