<script setup lang="ts">
/**
 * NodeDetailBase.vue — 노드 디테일 공통 골격
 *
 * 읽는 순서: 식별(이름·타입·소속) → 개요(요약) → 본문 슬롯(코드 등) → 연결(그래프 관계)
 */

import { computed, nextTick, ref, useSlots, watch } from 'vue'
import type { GraphNode } from '@/shared/types'
import { getRelationshipGroups } from '@/shared/utils/nodeRelationships'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { useCanvasStore } from '@/features/code-analysis/graphCanvas'
import TextViewer from '@/shared/components/TextViewer.vue'
import { relationshipRowParts, technicalNodeName } from '@/shared/utils/graphDisplay'
import { getNodeColor } from '@/shared/config/graphStyles'
import { colorLabelOf } from '@/shared/utils/nodeLabels'
import { buildIdentityRows } from '@/shared/utils/nodeIdentity'
import { semanticRoleLabels } from '@/shared/utils/nodeLabels'

interface Props {
  node: GraphNode
  icon?: string
  labelBadge?: string
  subInfo?: string
  headerTitle?: string
}

const props = withDefaults(defineProps<Props>(), {
  icon: '📦',
  labelBadge: '',
  subInfo: '',
  headerTitle: '',
})

const projectStore = useAnalyzerStore()
const canvasStore = useCanvasStore()
const slots = useSlots()
const hasIdentityExtra = computed(() => Boolean(slots['identity-extra']?.()))

const nodeName = computed(() => technicalNodeName(props.node))

const ownerNode = computed(() => {
  const ownerId = props.node.properties?.owner_id
  return typeof ownerId === 'string' ? projectStore.nodeMap.get(ownerId) : undefined
})

const packageNode = computed(() => {
  const candidates = [props.node.id, ownerNode.value?.id].filter((id): id is string => Boolean(id))
  for (const link of projectStore.linkMap.values()) {
    if (link.type !== 'BELONGS_TO' || !candidates.includes(link.source)) continue
    const target = projectStore.nodeMap.get(link.target)
    if (target?.labels.includes('PACKAGE')) return target
  }
  return undefined
})

// 원본파일·경로·라인·소속·패키지 — id 파싱 없이 명시 속성/관계만 사용.
const identityRows = computed(() => buildIdentityRows(props.node, {
  ownerName: ownerNode.value ? technicalNodeName(ownerNode.value) : '',
  packageName: packageNode.value ? technicalNodeName(packageNode.value) : '',
}))
const roleLabels = computed(() => semanticRoleLabels(props.node))

// 식별 배지 색 = 그래프 캔버스와 동일한 노드 색(단일 소스 getNodeColor·colorLabelOf 재사용=DRY).
// 활성 렌즈(isolate된 역할) 따라감(spec 040) — 캔버스 노드 색과 일치. 어떤 포맷이든 color-mix 틴트.
const badgeColor = computed(() =>
  getNodeColor([colorLabelOf(props.node, canvasStore.loadedLabels)]))

// 건강지표 — 최종 판정만 저장(spec 020): risk_level(+in_call_cycle). 중간지표(fan/loc/god/table)는 미저장.
const health = computed(() => {
  const p = props.node.properties || {}
  const risk = typeof p.risk_level === 'string' ? p.risk_level : ''
  if (!risk && p.in_call_cycle !== true) return null
  return { risk, inCycle: p.in_call_cycle === true }
})
const RISK_LABEL: Record<string, string> = { high: '높음', medium: '보통', low: '낮음' }

const displayHeaderTitle = computed(() =>
  (props.headerTitle && props.headerTitle.trim()) ? props.headerTitle.trim() : nodeName.value,
)

const summaryRaw = computed(() => {
  const s = props.node.properties?.summary
  return typeof s === 'string' ? s : ''
})

const summaryHeadline = computed(() => {
  const s = summaryRaw.value.trim()
  if (!s) return ''
  const firstPara = s.split(/\n\s*\n/)[0] || s
  const sentenceMatch = firstPara.match(/^[^.!?。]+[.!?。]?/)
  return (sentenceMatch ? sentenceMatch[0] : firstPara).trim()
})

const summaryDetail = computed(() => {
  const s = summaryRaw.value.trim()
  if (!s) return ''
  const headline = summaryHeadline.value
  return s.slice(headline.length).trim()
})

interface RelTargetRow {
  linkId: string
  edge: string
  peerTech: string
  peerCaption: string
}

interface RelSummaryItem {
  label: string
  count: number
  hint: string
  targets: RelTargetRow[]
}

const relSummary = computed<RelSummaryItem[]>(() => {
  const g = getRelationshipGroups(props.node.id, projectStore.linkMap.values())
  const nodeId = props.node.id
  const peer = (id: string) => projectStore.nodeMap.get(id)

  const tableTargets: RelTargetRow[] = [
    ...g.inputs.map(l => ({
      linkId: l.id,
      ...relationshipRowParts(l, peer(l.target)),
    })),
    ...g.outputs.map(l => ({
      linkId: l.id,
      ...relationshipRowParts(l, peer(l.target)),
    })),
  ]

  return [
    ...(tableTargets.length > 0
      ? [{
        label: '테이블 상호작용',
        count: tableTargets.length,
        hint: 'READS·WRITES 등 테이블 접근',
        targets: tableTargets,
      }]
      : []),
    {
      label: '호출',
      count: g.calls.length,
      hint: '부르는 함수/모듈',
      targets: g.calls.map(l => ({
        linkId: l.id,
        ...relationshipRowParts(l, peer(l.target)),
      })),
    },
    {
      label: '피호출',
      count: g.incomingCalls.length,
      hint: '이 노드를 부르는 곳 (영향 분석)',
      targets: g.incomingCalls.map(l => ({
        linkId: l.id,
        ...relationshipRowParts(l, peer(l.source)),
      })),
    },
    {
      label: '구성',
      count: g.attached.length,
      hint: '하위 항목 (컬럼·함수 등)',
      targets: g.attached.map(l => ({
        linkId: l.id,
        ...relationshipRowParts(l, peer(l.target)),
      })),
    },
    {
      label: 'FK',
      count: g.fk.length,
      hint: '외래키 관계',
      targets: g.fk.map(l => {
        const otherId = l.source === nodeId ? l.target : l.source
        return {
          linkId: l.id,
          ...relationshipRowParts(l, peer(otherId)),
        }
      }),
    },
    {
      label: 'UML',
      count: g.uml.length,
      hint: '클래스 관계',
      targets: g.uml.map(l => {
        const otherId = l.source === nodeId ? l.target : l.source
        return {
          linkId: l.id,
          ...relationshipRowParts(l, peer(otherId)),
        }
      }),
    },
  ].filter(item => item.count > 0)
})

const expandedRelGroup = ref<string | null>(null)

watch(
  () => props.node?.id,
  async () => {
    expandedRelGroup.value = null
    await nextTick()
    const items = relSummary.value
    if (items.length === 0) return
    const preferred =
      items.find(i => i.label === '테이블 상호작용')
      ?? items.find(i => i.label === '호출')
      ?? items[0]
    expandedRelGroup.value = preferred.label
  },
  { immediate: true },
)

function toggleRelGroup(label: string): void {
  expandedRelGroup.value = expandedRelGroup.value === label ? null : label
}

const relStripToneClass = computed(() => {
  const g = expandedRelGroup.value
  if (!g) return ''
  if (g === '테이블 상호작용') return 'detail-rel-strip--tone-table'
  if (g === '호출') return 'detail-rel-strip--tone-call'
  return 'detail-rel-strip--tone-generic'
})
</script>

<template>
  <div class="node-detail-base">
    <!-- 1) 식별: 타입 · 이름 · 소속 -->
    <header class="detail-card">
      <span class="detail-card__label">식별</span>
      <div class="identity-head">
        <span class="identity-icon">{{ icon }}</span>
        <div class="identity-main">
          <div class="identity-title-row">
            <span class="identity-name">
              <span class="identity-tech">{{ displayHeaderTitle }}</span>
            </span>
            <span v-if="labelBadge" class="identity-badge" :style="{ '--badge-color': badgeColor }">{{ labelBadge }}</span>
            <span
              v-for="role in roleLabels"
              :key="role"
              class="identity-badge identity-badge--role"
            >{{ role }}</span>
          </div>
          <!-- 식별 정보 행 목록(논리명·경로·라인·분류·종류별) — 단일 생성처. 값 있는 것만, 종류 무관 일관. -->
          <div v-if="identityRows.length" class="identity-rows">
            <div v-for="r in identityRows" :key="r.k" class="identity-row">
              <span class="identity-row__k">{{ r.k }}</span>
              <span class="identity-row__v">{{ r.v }}</span>
            </div>
          </div>
          <!-- buildIdentityRows 가 비는 최소노드(패키지 등)만 카드가 준 subInfo 를 소속 폴백으로. -->
          <div v-else-if="subInfo" class="identity-rows">
            <div class="identity-row">
              <span class="identity-row__k">소속</span>
              <span class="identity-row__v">{{ subInfo }}</span>
            </div>
          </div>
          <div v-if="health" class="detail-health">
            <span v-if="health.risk" class="health-risk" :class="'health-risk--' + health.risk" title="건강지표(위험도)">
              위험 {{ RISK_LABEL[health.risk] ?? health.risk }}
            </span>
            <span v-if="health.inCycle" class="health-flag" title="호출 순환에 포함">순환</span>
          </div>
          <div v-if="hasIdentityExtra" class="detail-identity-extra">
            <slot name="identity-extra" />
          </div>
        </div>
      </div>
    </header>

    <!-- 2) 개요 -->
    <section v-if="summaryHeadline" class="detail-card">
      <span class="detail-card__label">개요</span>
      <div class="detail-card__body detail-card__body--prose">
        <p class="summary-headline">{{ summaryHeadline }}</p>
        <TextViewer
          v-if="summaryDetail"
          class="summary-detail"
          :content="summaryDetail"
          :max-height="1200"
          format="auto"
          compact
        />
      </div>
    </section>

    <!-- 3) 본문 (코드·시그니처 등 — 카드는 자식에서 동일 패턴) -->
    <slot name="body" />

    <!-- 4) 연결 -->
    <section v-if="relSummary.length > 0" class="detail-card">
      <span class="detail-card__label">연결</span>
      <div class="detail-rel-strip" :class="relStripToneClass">
        <div class="rel-chip-grid">
          <button
            v-for="item in relSummary"
            :key="item.label"
            type="button"
            class="rel-chip"
            :class="{ active: expandedRelGroup === item.label }"
            :title="item.hint"
            @click="toggleRelGroup(item.label)"
          >
            <span>{{ item.label }}</span>
            <span class="rel-chip-count">{{ item.count }}</span>
          </button>
        </div>
        <div
          v-for="item in relSummary"
          :key="'list-' + item.label"
          v-show="expandedRelGroup === item.label"
          class="detail-rel-rows"
        >
          <div v-for="t in item.targets" :key="t.linkId" class="detail-rel-row">
            <span class="detail-rel-row__edge">{{ t.edge }}</span>
            <span class="detail-rel-row__arrow" aria-hidden="true">→</span>
            <span class="detail-rel-row__peer">
              <span class="detail-rel-row__tech">{{ t.peerTech }}</span>
              <span v-if="t.peerCaption" class="detail-rel-row__cap">({{ t.peerCaption }})</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.identity-head {
  display: flex;
  gap: 10px;
  padding: var(--nd-content-pad-y) var(--nd-content-pad-x);
  align-items: flex-start;
}

.identity-icon {
  display: inline-flex;
  align-items: center;
  height: 1.42em;
  font-size: 1.15rem;
  line-height: 1;
  flex-shrink: 0;
}

.identity-main {
  flex: 1;
  min-width: 0;
}

// 식별 정보 행 목록 — 라벨(고정폭)+값. 소속·파일명·논리명 등을 한 흐름에 빠짐없이.
.identity-rows {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.identity-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.identity-row__k {
  flex-shrink: 0;
  width: 4.4rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
}
.identity-row__v {
  flex: 1;
  min-width: 0;
  font-size: 0.74rem;
  line-height: 1.42;
  color: var(--color-text-light);
  word-break: break-word;
}

.identity-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.identity-name {
  flex: 1;
  min-width: 0;
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.42;
  word-break: break-word;
  color: var(--color-text-bright);
}

.identity-name .identity-tech {
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.identity-name--composite .identity-tech {
  font-size: 0.8rem;
}

.identity-paren {
  color: var(--color-text-muted);
  font-weight: 500;
  font-size: 0.74rem;
}

.identity-logical {
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--color-text-light);
}

.identity-main .detail-locate {
  padding-left: 0;
  padding-right: 0;
  padding-bottom: 8px;
  margin-top: 6px;
}

.identity-badge {
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  // 색 = 그 노드의 그래프 색(--badge-color, getNodeColor). 어두운 패널 위 가독 위해
  // 색을 텍스트로 + 같은 색의 옅은 틴트 배경/테두리(color-mix). 라벨 없으면 중립 폴백.
  color: var(--badge-color, var(--color-text-muted));
  border: 1px solid color-mix(in srgb, var(--badge-color, var(--color-border)) 45%, transparent);
  background: color-mix(in srgb, var(--badge-color, var(--color-border)) 15%, transparent);
}

.identity-badge--role {
  color: var(--color-text-bright);
  border-color: var(--color-border);
  background: var(--color-bg-tertiary);
}

.detail-health {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;
}
.health-risk, .health-metric, .health-flag {
  font-size: 0.64rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}
.health-metric {
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  font-weight: 600;
}
.health-flag {
  background: rgba(250, 82, 82, 0.15);
  color: #ff8787;
  border: 1px solid rgba(250, 82, 82, 0.3);
}
.health-risk--high   { background: rgba(250, 82, 82, 0.18);  color: #ff8787; }
.health-risk--medium { background: rgba(255, 169, 77, 0.18); color: #ffc078; }
.health-risk--low    { background: rgba(81, 207, 102, 0.16); color: #8ce99a; }

.summary-headline {
  margin: 0 0 8px;
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.45;
  color: var(--color-text-bright);
}

.summary-detail {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--color-text);
}

.detail-card__body--prose :deep(.text-viewer.is-compact) {
  font-size: 0.78rem;
  line-height: 1.5;
}
</style>

<style lang="scss">
@use './nodeDetailPanel.shared.scss';
</style>
