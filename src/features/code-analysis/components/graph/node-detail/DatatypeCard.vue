<script setup lang="ts">
/**
 * DatatypeCard.vue
 * DATATYPE 라벨 노드 — C 의 STRUCT/UNION/ENUM 등 메서드 못 품는 데이터 컨테이너.
 *
 * 표시:
 *   - 헤더 (sub-label = STRUCT/UNION/ENUM)
 *   - 멤버 필드 목록 (HAS_VARIABLE)
 *   - 사용 흐름 (자식 필드를 REFERENCES 하는 함수 — 미구현, 추후 활성화)
 *
 * data_type 자체엔 summary 없음 — 자식 필드만 의미 담음 (백엔드 결정).
 */

import { computed } from 'vue'
import type { GraphNode } from '@/types'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import { getRelationshipGroups, getAttachedByType } from '@/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const subLabel = computed(() => (props.node.properties?.type as string) || 'DATATYPE')

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const pkg = p.package_name as string | undefined
  const file = p.file_path as string | undefined
  const fileName = (p.file_name as string | undefined) ||
    (file ? file.split(/[/\\]/).pop() : undefined)
  const parts: string[] = []
  if (pkg) parts.push(pkg)
  if (fileName) parts.push(fileName)
  return parts.join(' · ')
})

const groups = computed(() =>
  getRelationshipGroups(props.node.id, projectStore.linkMap.values()),
)

interface FieldEntry {
  id: string
  name: string
  type: string
}

function resolveField(id: string): FieldEntry {
  const n = projectStore.nodeMap.get(id)
  const p = n?.properties || {}
  return {
    id,
    name: (p.name as string) || id,
    type: (p.variable_type as string) || (p.dtype as string) || '',
  }
}

const fields = computed<FieldEntry[]>(() =>
  getAttachedByType(groups.value, 'HAS_VARIABLE').map(l => resolveField(l.target)),
)
</script>

<template>
  <NodeDetailBase
    :node="node"
    icon="📊"
    :label-badge="subLabel"
    :sub-info="subInfo"
  >
    <template #body>
      <section v-if="fields.length > 0" class="field-section">
        <h4 class="section-title">📋 필드 ({{ fields.length }})</h4>
        <ul class="field-list">
          <li v-for="f in fields" :key="f.id">
            <span class="field-name">{{ f.name }}</span>
            <span v-if="f.type" class="field-type">: {{ f.type }}</span>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.field-section {
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

.field-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--color-bg-tertiary);
    font-size: 0.8rem;
    font-family: monospace;
  }

  .field-name {
    color: var(--color-text-bright);
    font-weight: 600;
  }

  .field-type {
    color: #a5b4fc;
    font-size: 0.75rem;
  }
}
</style>
