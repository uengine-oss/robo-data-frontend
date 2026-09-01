<script setup lang="ts">
import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { technicalNodeName } from '@/shared/utils/graphDisplay'
import { getSemanticReport } from '@/shared/utils/nodeRelationships'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'
import { AsyncCodeViewer as CodeViewer } from '@/shared/components/codeViewerAsync'

interface Props {
  node: GraphNode
}

const props = defineProps<Props>()
const projectStore = useAnalyzerStore()

function textList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

const rules = computed(() =>
  getSemanticReport(
    props.node.id,
    projectStore.linkMap.values(),
    projectStore.nodeMap,
  ).rules.map(({ node }) => ({
    id: node.id,
    line: Number(node.properties.line ?? 0),
    condition: String(
      node.properties.condition_description
      ?? node.properties.condition
      ?? '',
    ).trim(),
    effects: textList(
      node.properties.effect_descriptions
      ?? node.properties.effects,
    ),
    codeText: String(node.properties.code_text ?? '').trim(),
  })),
)

const subLabel = computed(() => {
  return props.node.labels?.[0] || 'FUNCTION'
})
const headerTech = computed(() => technicalNodeName(props.node))
const codeText = computed(() => String(props.node.properties?.code_text || ''))
const sourcePath = computed(() => String(props.node.properties?.file_path || ''))
</script>

<template>
  <NodeDetailBase
    :node="node"
    icon="🔧"
    :label-badge="subLabel"
    :header-title="headerTech"
  >
    <template #body>
      <section v-if="rules.length" class="detail-card">
        <span class="detail-card__label">업무 규칙</span>
        <div class="detail-card__body detail-card__body--tight rule-list">
          <article v-for="rule in rules" :key="rule.id" class="rule-item">
            <p v-if="rule.line" class="rule-line">라인 {{ rule.line }}</p>
            <div v-if="rule.condition" class="rule-section">
              <strong>조건</strong>
              <TextViewer :content="rule.condition" :max-height="160" compact />
            </div>
            <div v-if="rule.effects.length" class="rule-section">
              <strong>효과</strong>
              <ul>
                <li v-for="effect in rule.effects" :key="effect">{{ effect }}</li>
              </ul>
            </div>
            <div v-if="rule.codeText" class="rule-section">
              <strong>근거 코드</strong>
              <CodeViewer :content="rule.codeText" :file-path="sourcePath" />
            </div>
          </article>
        </div>
      </section>

      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">원문 코드</span>
        <div class="detail-card__body detail-card__body--flush">
          <CodeViewer :content="codeText" :file-path="sourcePath" />
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.rule-list {
  display: grid;
  gap: 12px;
}

.rule-item {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-secondary);
}

.rule-line {
  margin: 0 0 8px;
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.rule-section {
  & + & { margin-top: 10px; }

  strong {
    display: block;
    margin-bottom: 4px;
    font-size: 0.72rem;
    color: var(--color-text-muted);
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    font-size: 0.76rem;
    line-height: 1.5;
    color: var(--color-text-light);
  }
}
</style>
