<script setup lang="ts">
/**
 * FileCard.vue
 * 파일 노드 — Framework MODULE.FILE / MODULE.DEFINE + DBMS FILE 라벨.
 * 모듈 아닌 물리 컨테이너. 안의 함수/변수 목록 표시.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { getRelationshipGroups, getMembersByLabels, ROUTINE_LABELS } from '@/shared/utils/nodeRelationships'
import { technicalNodeName, logicalNodeName } from '@/shared/utils/graphDisplay'
import NodeDetailBase from './NodeDetailBase.vue'
import { AsyncCodeViewer as CodeViewer } from '@/shared/components/codeViewerAsync'

interface Props { node: GraphNode }
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

const groups = computed(() =>
  getRelationshipGroups(props.node.id, projectStore.linkMap.values()),
)

function resolveChild(id: string): { id: string; name: string; logical: string } {
  const n = projectStore.nodeMap.get(id)
  return {
    id,
    name: technicalNodeName(n) || id,
    logical: logicalNodeName(n),
  }
}

const functions = computed(() =>
  getMembersByLabels(groups.value, projectStore.nodeMap, ROUTINE_LABELS)
    .map(l => resolveChild(l.target)),
)

const codeText = computed(() => (props.node.properties?.code_text as string) || '')
const sourcePath = computed(() =>
  (props.node.properties?.file_path as string)
  || (props.node.properties?.file_name as string)
  || '',
)
</script>

<template>
  <NodeDetailBase :node="node" icon="📄" label-badge="FILE">
    <template #body>
      <section v-if="functions.length > 0" class="detail-card">
        <span class="detail-card__label">함수 · {{ functions.length }}</span>
        <div class="detail-card__body detail-card__body--tight">
          <ul class="member-list">
            <li v-for="f in functions" :key="f.id" :title="f.logical ? `${f.name} (${f.logical})` : f.name">
              <span class="member-name">{{ f.name }}</span>
              <span v-if="f.logical" class="member-logical">({{ f.logical }})</span>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">원문 코드</span>
        <div class="detail-card__body detail-card__body--flush">
          <CodeViewer :content="codeText" :file-path="sourcePath" :max-height="320" />
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.member-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--color-bg-tertiary);
    font-size: 0.74rem;
    min-width: 0;
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
</style>
