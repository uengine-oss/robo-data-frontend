<script setup lang="ts">
/**
 * ModuleCard.vue
 * MODULE 라벨 노드 — 메서드 품는 컨테이너 (CLASS/INTERFACE/ENUM/RECORD/Go STRUCT 등).
 *
 * 표시:
 *   - 헤더 (sub-label = CLASS/INTERFACE/ENUM 등)
 *   - summary (한 줄 핵심 + 설명)
 *   - 멤버 함수 (HAS_FUNCTION)
 *   - 멤버 필드 (HAS_VARIABLE)
 *   - UML 관계 (EXTENDS/IMPLEMENTS 등)
 *
 * 자식 0건이면 해당 섹션 자동 숨김.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/types'
import { useAnalyzerStore } from '@/stores/analyzer'
import { getRelationshipGroups, getAttachedByType } from '@/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const subLabel = computed(() => (props.node.properties?.type as string) || 'MODULE')

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
  summary?: string
}

function resolveNode(id: string): { name: string; summary: string } {
  const n = projectStore.nodeMap.get(id)
  const p = n?.properties || {}
  const name =
    (p.name as string) ||
    (p.fqn as string)?.split('.').pop() ||
    id
  const summary = (p.summary as string) || ''
  return { name, summary }
}

const methods = computed<MemberLink[]>(() =>
  getAttachedByType(groups.value, 'HAS_FUNCTION').map(l => {
    const r = resolveNode(l.target)
    return { id: l.target, name: r.name, summary: r.summary }
  }),
)

const fields = computed<MemberLink[]>(() =>
  getAttachedByType(groups.value, 'HAS_VARIABLE').map(l => {
    const r = resolveNode(l.target)
    return { id: l.target, name: r.name, summary: r.summary }
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
      <!-- 멤버 메서드 -->
      <section v-if="methods.length > 0" class="member-section">
        <h4 class="section-title">🔧 메서드 ({{ methods.length }})</h4>
        <ul class="member-list">
          <li v-for="m in methods" :key="m.id" :title="m.summary || m.id">
            <span class="member-name">{{ m.name }}</span>
            <span v-if="m.summary" class="member-summary">{{ m.summary }}</span>
          </li>
        </ul>
      </section>

      <!-- 멤버 필드 -->
      <section v-if="fields.length > 0" class="member-section">
        <h4 class="section-title">📋 필드 ({{ fields.length }})</h4>
        <ul class="member-list">
          <li v-for="f in fields" :key="f.id" :title="f.summary || f.id">
            <span class="member-name">{{ f.name }}</span>
            <span v-if="f.summary" class="member-summary">{{ f.summary }}</span>
          </li>
        </ul>
      </section>

      <!-- UML 관계 -->
      <section v-if="umlEdges.length > 0" class="member-section">
        <h4 class="section-title">🧩 클래스 관계</h4>
        <ul class="uml-list">
          <li v-for="(e, i) in umlEdges" :key="i">
            <span class="uml-type">{{ e.type }}</span>
            <span class="uml-dir">{{ e.direction === 'out' ? '→' : '←' }}</span>
            <span class="uml-name">{{ e.name }}</span>
          </li>
        </ul>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
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
  letter-spacing: 0.5px;
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

    &:hover {
      background: var(--color-bg-hover);
    }
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

.uml-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    padding: 3px 6px;
  }

  .uml-type {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(99, 102, 241, 0.15);
    color: #a5b4fc;
    font-weight: 700;
  }

  .uml-dir {
    color: var(--color-text-muted);
  }

  .uml-name {
    color: var(--color-text);
  }
}
</style>
