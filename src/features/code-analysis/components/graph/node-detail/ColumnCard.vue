<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'

const props = defineProps<{ node: GraphNode }>()
const dataType = computed(() => String(props.node.properties?.data_type || ''))
const nullable = computed(() => props.node.properties?.nullable !== false)
const primaryKey = computed(() => props.node.properties?.primary_key === true)
const unique = computed(() => props.node.properties?.unique === true)
const defaultValue = computed(() => String(props.node.properties?.default_value || ''))
const description = computed(() => String(props.node.properties?.description || '').trim())
const summary = computed(() => String(props.node.properties?.summary || '').trim())
const logicalName = computed(() => String(props.node.properties?.logical_name || '').trim())
</script>

<template>
  <NodeDetailBase :node="node" icon="🔹" label-badge="COLUMN">
    <template #body>
      <section class="column-meta">
        <div v-if="logicalName"><span>논리명</span><strong>{{ logicalName }}</strong></div>
        <div><span>타입</span><strong>{{ dataType || '-' }}</strong></div>
        <div><span>NULL</span><strong>{{ nullable ? '허용' : '비허용' }}</strong></div>
        <div><span>PK</span><strong>{{ primaryKey ? '예' : '아니오' }}</strong></div>
        <div><span>고유</span><strong>{{ unique ? '예' : '아니오' }}</strong></div>
        <div v-if="defaultValue"><span>기본값</span><strong>{{ defaultValue }}</strong></div>
      </section>
      <section v-if="description" class="detail-section">
        <h4>정의 설명</h4>
        <TextViewer :content="description" :max-height="160" />
      </section>
      <section v-if="summary" class="detail-section">
        <h4>업무 요약</h4>
        <TextViewer :content="summary" :max-height="160" />
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.column-meta, .detail-section { padding: 10px 12px; background: var(--color-bg-secondary); border-radius: 6px; }
.column-meta div { display: grid; grid-template-columns: 80px 1fr; gap: 8px; padding: 3px 0; font-size: 0.8rem; }
.column-meta span, h4 { color: var(--color-text-muted); }
.column-meta strong { color: var(--color-text-bright); font-family: monospace; }
h4 { margin: 0 0 8px; font-size: 0.75rem; }
</style>
