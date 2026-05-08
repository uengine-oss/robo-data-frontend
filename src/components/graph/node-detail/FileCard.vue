<script setup lang="ts">
/**
 * FileCard.vue
 * 파일 노드 — Framework MODULE.FILE / MODULE.DEFINE + DBMS FILE 라벨.
 * 모듈 아닌 물리 컨테이너. 안의 함수/변수 목록 표시.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/types'
import { useAnalyzerStore } from '@/stores/analyzer'
import { getRelationshipGroups, getAttachedByType } from '@/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const filePath = computed(() => {
  const p = props.node.properties || {}
  return (p.file_path as string) || ''
})

const fileName = computed(() => {
  const p = props.node.properties || {}
  return (p.file_name as string) || filePath.value.split(/[/\\]/).pop() || (p.name as string) || props.node.id
})

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const dir = (p.directory as string) || ''
  const startLine = p.start_line as number | undefined
  const endLine = p.end_line as number | undefined
  const lines = startLine && endLine ? `${endLine - startLine + 1}줄` : ''
  return [dir, lines].filter(Boolean).join(' · ')
})

const groups = computed(() =>
  getRelationshipGroups(props.node.id, projectStore.linkMap.values()),
)

function resolveChild(id: string): { id: string; name: string; summary: string } {
  const n = projectStore.nodeMap.get(id)
  const p = n?.properties || {}
  return {
    id,
    name: (p.name as string) || id,
    summary: (p.summary as string) || '',
  }
}

const functions = computed(() => {
  const fn = getAttachedByType(groups.value, 'HAS_FUNCTION')
  const proc = getAttachedByType(groups.value, 'HAS_PROCEDURE')
  return [...fn, ...proc].map(l => resolveChild(l.target))
})

const variables = computed(() =>
  getAttachedByType(groups.value, 'HAS_VARIABLE').map(l => resolveChild(l.target)),
)
</script>

<template>
  <NodeDetailBase :node="node" icon="📄" label-badge="FILE" :sub-info="subInfo">
    <template #sub-header>
      <div class="file-name">{{ fileName }}</div>
    </template>
    <template #body>
      <section v-if="functions.length > 0" class="member-section">
        <h4 class="section-title">🔧 함수 ({{ functions.length }})</h4>
        <ul class="member-list">
          <li v-for="f in functions" :key="f.id" :title="f.summary">
            <span class="member-name">{{ f.name }}</span>
            <span v-if="f.summary" class="member-summary">{{ f.summary }}</span>
          </li>
        </ul>
      </section>

      <section v-if="variables.length > 0" class="member-section">
        <h4 class="section-title">📋 변수 ({{ variables.length }})</h4>
        <ul class="member-list">
          <li v-for="v in variables" :key="v.id">
            <span class="member-name">{{ v.name }}</span>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.file-name {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-accent);
  margin-top: 4px;
}

.member-section {
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

.member-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--color-bg-tertiary);
    font-size: 0.8rem;
  }

  .member-name {
    color: var(--color-text-bright);
    font-weight: 600;
  }

  .member-summary {
    color: var(--color-text-muted);
    font-size: 0.7rem;
    line-height: 1.4;
  }
}
</style>
