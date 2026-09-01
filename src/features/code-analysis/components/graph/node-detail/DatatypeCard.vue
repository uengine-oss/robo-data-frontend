<script setup lang="ts">
/**
 * DatatypeCard.vue
 * DATATYPE 라벨 노드 — C 의 STRUCT/UNION/ENUM 등 메서드 못 품는 데이터 컨테이너.
 *
 * 표시:
 *   - 헤더 (sub-label = STRUCT/UNION/ENUM)
 *   - 멤버 필드 목록 (PARENT_OF + 데이터 라벨)
 *   - 사용 흐름 (자식 필드를 REFERENCES 하는 함수 — 미구현, 추후 활성화)
 *
 * data_type 자체엔 summary 없음 — 자식 필드만 의미 담음 (백엔드 결정).
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { getRelationshipGroups, getMembersByLabels, DATA_MEMBER_LABELS } from '@/shared/utils/nodeRelationships'
import NodeDetailBase from './NodeDetailBase.vue'
import { AsyncCodeViewer as CodeViewer } from '@/shared/components/codeViewerAsync'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const subLabel = computed(() => props.node.labels?.[0] || 'DATATYPE')

const subInfo = computed(() => {
  const p = props.node.properties || {}
  const file = p.file_path as string | undefined
  return file ? file.split(/[/\\]/).pop() || file : ''
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
    type: (p.data_type as string) || '',
  }
}

const fields = computed<FieldEntry[]>(() =>
  getMembersByLabels(groups.value, projectStore.nodeMap, DATA_MEMBER_LABELS)
    .map(l => resolveField(l.target)),
)

const codeText = computed(() => (props.node.properties?.code_text as string) || '')
const sourcePath = computed(() => (props.node.properties?.file_path as string) || '')
</script>

<template>
  <NodeDetailBase
    :node="node"
    icon="📊"
    :label-badge="subLabel"
    :sub-info="subInfo"
  >
    <template #body>
      <section v-if="fields.length > 0" class="detail-card">
        <span class="detail-card__label">필드 · {{ fields.length }}</span>
        <div class="detail-card__body detail-card__body--tight">
          <ul class="field-list">
            <li v-for="f in fields" :key="f.id">
              <span class="field-name">{{ f.name }}</span>
              <span v-if="f.type" class="field-type">: {{ f.type }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">원문 코드</span>
        <div class="detail-card__body detail-card__body--flush">
          <CodeViewer :content="codeText" :file-path="sourcePath" :max-height="240" />
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
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
