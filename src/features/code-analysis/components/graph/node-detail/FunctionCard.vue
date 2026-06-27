<script setup lang="ts">
/**
 * FunctionCard.vue — FUNCTION / PROCEDURE / TRIGGER 디테일.
 * 순서: 식별(시그니처는 식별 카드 안 컴팩트) → 개요 → 역할 → 원문 코드 → 연결.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/shared/types'
import { technicalNodeName, stripCStyleComments } from '@/shared/utils/graphDisplay'
import { getSemanticReport } from '@/shared/utils/nodeRelationships'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import NodeDetailBase from './NodeDetailBase.vue'
import TextViewer from '@/shared/components/TextViewer.vue'

interface Props {
  node: GraphNode
}
const props = defineProps<Props>()

const projectStore = useAnalyzerStore()

// 의미데이터(업무규칙·예시·질문) — linkMap 에서 함수→규칙→예시 순회(getSemanticReport 가 의미 타입만 골라 씀).
const semantic = computed(() =>
  getSemanticReport(props.node.id, projectStore.linkMap.values(), projectStore.nodeMap),
)
const rules = computed(() =>
  semantic.value.rules
    .map(r => ({
      statement: String(r.node.properties?.statement ?? '').trim(),
      examples: r.examples
        .map(e => String(e.properties?.description ?? '').trim())
        .filter(Boolean),
    }))
    .filter(r => r.statement),
)
const questions = computed(() =>
  semantic.value.questions
    .map(q => ({
      text: String(q.properties?.text ?? '').trim(),
      reason: String(q.properties?.reason ?? '').trim(),
    }))
    .filter(q => q.text),
)
const hasSemantic = computed(() => rules.value.length > 0 || questions.value.length > 0)

const subLabel = computed(() => {
  const sub = props.node.properties?.type as string | undefined
  if (sub) return sub
  return props.node.labels?.[0] || 'FUNCTION'
})

const headerTech = computed(() => technicalNodeName(props.node))
const codeText = computed(() => (props.node.properties?.code_text as string) || '')
const codeForViewer = computed(() => stripCStyleComments(codeText.value))
// 논리명·경로·라인·분류(역할=stereotype)는 모두 식별 행(buildIdentityRows)에서 표시 — 카드 중복 제거.
</script>

<template>
  <NodeDetailBase
    :node="node"
    icon="🔧"
    :label-badge="subLabel"
    :header-title="headerTech"
  >
    <template #body>
      <section v-if="hasSemantic" class="detail-card">
        <span class="detail-card__label">업무 규칙 · 예시 · 질문</span>
        <p class="sem-hint">코드에서 뽑아낸 비즈니스 규칙 · 시나리오(예시) · 사람 확인이 필요한 질문</p>
        <div class="detail-card__body detail-card__body--tight">
          <div v-for="(r, ri) in rules" :key="'rule-' + ri" class="sem-rule">
            <p class="sem-rule__stmt">📌 {{ r.statement }}</p>
            <ul v-if="r.examples.length" class="sem-ex">
              <li v-for="(ex, ei) in r.examples" :key="ei" class="sem-ex__item">{{ ex }}</li>
            </ul>
          </div>
          <div v-if="questions.length" class="sem-q">
            <p v-for="(q, qi) in questions" :key="'q-' + qi" class="sem-q__item">
              <span class="sem-q__text">❓ {{ q.text }}</span>
              <span v-if="q.reason" class="sem-q__reason">— {{ q.reason }}</span>
            </p>
          </div>
        </div>
      </section>

      <section v-if="codeText" class="detail-card">
        <span class="detail-card__label">원문 코드</span>
        <div class="detail-card__body detail-card__body--flush">
          <div class="detail-scroll">
            <TextViewer :content="codeForViewer" compact />
          </div>
        </div>
      </section>
    </template>
  </NodeDetailBase>
</template>

<style lang="scss" scoped>
.fn-actor {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--color-text-light);
}

.sem-hint {
  margin: 0 0 8px;
  padding: 0 12px;
  font-size: 0.68rem;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.sem-rule {
  & + .sem-rule { margin-top: 10px; }
}

.sem-rule__stmt {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--color-text-bright);
}

.sem-ex {
  margin: 4px 0 0;
  padding-left: 18px;
  list-style: disc;
}

.sem-ex__item {
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--color-text-light);
}

.sem-q {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border);
}

.sem-q__item {
  margin: 0;
  & + .sem-q__item { margin-top: 4px; }
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--color-text-light);
}

.sem-q__reason {
  margin-left: 4px;
  color: var(--color-text-muted);
}
</style>
