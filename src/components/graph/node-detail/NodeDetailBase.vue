<script setup lang="ts">
/**
 * NodeDetailBase.vue
 * 노드 디테일 패널 — 모든 노드 종류 공통 베이스.
 *
 * 슬롯 구성:
 *   - sub-header: 헤더 옆 sub-label / 메타 (CLASS / STRUCT / 라인 등)
 *   - body:       노드 종류별 본문 섹션 (자식 컴포넌트가 채움)
 *
 * 자동 표시 (props):
 *   - 한 줄 핵심 (summary 첫 문장)
 *   - 나머지 설명 (summary 후속 단락)
 *   - 의미 그룹별 관계 합산 (입력/출력/호출/부착/FK)
 *
 * null-safe — 비어있는 섹션은 자동 숨김.
 */

import { computed } from 'vue'
import type { GraphNode } from '@/types'
import { getNodeColor } from '@/config/graphStyles'
import { getRelationshipGroups } from '@/utils/nodeRelationships'
import { useAnalyzerStore } from '@/stores/analyzer'
import TextViewer from '@/components/common/TextViewer.vue'

interface Props {
  node: GraphNode
  /** 헤더 아이콘 (이모지) */
  icon?: string
  /** 라벨 표시 (CLASS / STRUCT / FUNCTION 등) */
  labelBadge?: string
  /** 헤더 보조 정보 줄 (스키마/패키지/파일 등) */
  subInfo?: string
}

const props = withDefaults(defineProps<Props>(), {
  icon: '📦',
  labelBadge: '',
  subInfo: '',
})

const projectStore = useAnalyzerStore()

// ─── 헤더 ───────────────────────────────────────────────────────────────
const nodeName = computed(() => {
  const props_ = props.node.properties || {}
  return (
    (props_.name as string) ||
    (props_.fqn as string)?.split('.').pop() ||
    props.node.id
  )
})

const headerColor = computed(() => getNodeColor(props.node.labels || []))

// ─── summary 분리 (첫 문장 = 핵심 / 나머지 = 설명) ────────────────────────
const summaryRaw = computed(() => {
  const s = props.node.properties?.summary
  return typeof s === 'string' ? s : ''
})

const summaryHeadline = computed(() => {
  const s = summaryRaw.value.trim()
  if (!s) return ''
  // 첫 단락 (빈 줄 전까지) 의 첫 문장
  const firstPara = s.split(/\n\s*\n/)[0] || s
  const sentenceMatch = firstPara.match(/^[^.!?。]+[.!?。]?/)
  return (sentenceMatch ? sentenceMatch[0] : firstPara).trim()
})

const summaryDetail = computed(() => {
  const s = summaryRaw.value.trim()
  if (!s) return ''
  const headline = summaryHeadline.value
  const rest = s.slice(headline.length).trim()
  return rest
})

// ─── 의미 그룹별 관계 합산 ──────────────────────────────────────────────
const relGroups = computed(() =>
  getRelationshipGroups(props.node.id, projectStore.linkMap.values()),
)

const relSummary = computed(() => {
  const g = relGroups.value
  return [
    { label: '입력', count: g.inputs.length, hint: '읽는 테이블/리소스' },
    { label: '출력', count: g.outputs.length, hint: '쓰는 테이블' },
    { label: '호출', count: g.calls.length, hint: '부르는 함수/모듈' },
    { label: '부착', count: g.attached.length, hint: '자식 노드' },
    { label: 'FK', count: g.fk.length, hint: '외래키 관계' },
    { label: 'UML', count: g.uml.length, hint: '클래스 관계' },
  ].filter(item => item.count > 0)
})
</script>

<template>
  <div class="node-detail-base">
    <!-- 헤더 -->
    <header class="detail-header" :style="{ borderLeftColor: headerColor }">
      <div class="header-row">
        <span class="header-icon">{{ icon }}</span>
        <span class="header-name">{{ nodeName }}</span>
        <span v-if="labelBadge" class="header-badge">{{ labelBadge }}</span>
      </div>
      <div v-if="subInfo" class="header-sub">{{ subInfo }}</div>
      <slot name="sub-header" />
    </header>

    <!-- 한 줄 핵심 + 설명 -->
    <section v-if="summaryHeadline" class="detail-summary">
      <p class="summary-headline">{{ summaryHeadline }}</p>
      <TextViewer
        v-if="summaryDetail"
        class="summary-detail"
        :content="summaryDetail"
        :max-height="200"
        compact
      />
    </section>

    <!-- 본문 (자식 컴포넌트가 채움) -->
    <slot name="body" />

    <!-- 관계 합산 (의미 그룹별) -->
    <section v-if="relSummary.length > 0" class="detail-relations">
      <h4 class="section-title">🔗 관계</h4>
      <div class="rel-grid">
        <div
          v-for="item in relSummary"
          :key="item.label"
          class="rel-chip"
          :title="item.hint"
        >
          <span class="rel-label">{{ item.label }}</span>
          <span class="rel-count">{{ item.count }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.node-detail-base {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
}

.detail-header {
  border-left: 3px solid;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 1.1rem;
}

.header-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-bright);
  flex: 1;
  word-break: break-all;
}

.header-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  letter-spacing: 0.5px;
}

.header-sub {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.detail-summary {
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  border-left: 3px solid var(--color-accent);
}

.summary-headline {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-bright);
  margin: 0;
  line-height: 1.5;
}

.summary-detail {
  margin-top: 8px;
  font-size: 0.8rem;
  color: var(--color-text);
  line-height: 1.5;
}

.detail-relations {
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

.rel-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rel-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--color-bg-tertiary);
  font-size: 0.75rem;
  cursor: help;

  .rel-label {
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .rel-count {
    color: var(--color-text-bright);
    font-weight: 700;
  }
}
</style>
