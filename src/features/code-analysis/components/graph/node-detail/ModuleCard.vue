<script setup lang="ts">
/**
 * ModuleCard.vue
 * MODULE 라벨 노드 — 메서드 품는 컨테이너 (CLASS/INTERFACE/ENUM/RECORD/Go STRUCT 등).
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { getRelationshipGroups, getMembersByLabels, ROUTINE_LABELS } from '@/shared/utils/nodeRelationships'
import { technicalNodeName, logicalNodeName } from '@/shared/utils/graphDisplay'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const subLabel = computed(() => (props.node.properties?.type as string) || 'MODULE')

const intent = computed(() => (props.node.properties?.intent as string) || '')

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

interface MemberLink {
  id: string
  name: string
  logical: string
}

function resolveNode(id: string): { name: string; logical: string } {
  const n = projectStore.nodeMap.get(id)
  return {
    name: technicalNodeName(n) || id,
    logical: logicalNodeName(n),
  }
}

const methods = computed<MemberLink[]>(() =>
  getMembersByLabels(groups.value, projectStore.nodeMap, ROUTINE_LABELS).map(l => {
    const r = resolveNode(l.target)
    return { id: l.target, name: r.name, logical: r.logical }
  }),
)

const umlEdges = computed(() =>
  groups.value.uml.map(l => {
    const otherId = l.source === props.node.id ? l.target : l.source
    const direction = l.source === props.node.id ? 'out' : 'in'
    return { type: l.type, direction, ...resolveNode(otherId) }
  }),
)
</script>

<template>
  <NodeDetailBase
    :node="node"
    icon="📦"
    :label-badge="subLabel"
    :sub-info="subInfo"
  >
    <template #body>
      <section v-if="intent" class="detail-card">
        <span class="detail-card__label">의도</span>
        <div class="detail-card__body detail-card__body--tight">
          <p class="module-prose">{{ intent }}</p>
        </div>
      </section>

      <section v-if="methods.length > 0" class="detail-card">
        <span class="detail-card__label">함수 · {{ methods.length }}</span>
        <div class="detail-card__body detail-card__body--tight">
          <ul class="member-list">
            <li v-for="m in methods" :key="m.id" :title="m.logical ? `${m.name} (${m.logical})` : m.name">
              <span class="member-name">{{ m.name }}</span>
              <span v-if="m.logical" class="member-logical">({{ m.logical }})</span>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="umlEdges.length > 0" class="detail-card">
        <span class="detail-card__label">클래스 관계 · {{ umlEdges.length }}</span>
        <div class="detail-card__body detail-card__body--tight">
          <ul class="uml-list">
            <li v-for="(e, i) in umlEdges" :key="i">
              <span class="uml-type">{{ e.type }}</span>
              <span class="uml-dir">{{ e.direction === 'out' ? '→' : '←' }}</span>
              <span class="uml-name">{{ e.name }}</span>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.module-prose {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text);
  line-height: 1.5;
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
    align-items: baseline;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid var(--color-border-light, var(--color-border));
    background: var(--color-bg-tertiary);
    font-size: 0.74rem;
    min-width: 0;

    &:hover {
      border-color: var(--color-text-muted);
    }
  }

  .member-name {
    color: var(--color-text-bright);
    font-weight: 600;
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.72rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .member-logical {
    color: var(--color-text-muted);
    font-size: 0.66rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
}

.uml-list {
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
    font-size: 0.74rem;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-light, var(--color-border));
  }

  .uml-type {
    font-size: 0.62rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.14);
    color: var(--color-accent-secondary, #a5b4fc);
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .uml-dir {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .uml-name {
    color: var(--color-text-bright);
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.7rem;
    min-width: 0;
    word-break: break-word;
  }
}
</style>
