/**
 * features.ts — 메뉴·탭의 단일 진실원천(Single Source of Truth)
 *
 * SideNav(메뉴)와 HomeView(탭 렌더)가 모두 이 한 곳에서 파생된다.
 * "기능 추가/삭제 = 이 배열 한 줄" → 풀버전/임베드 두 벌 하드코딩이 사라진다.
 *
 * 풀 vs 임베드 분기는 런타임 스위치(`isEmbedded` provide/inject) 하나로:
 *   - 단독 실행      → FEATURES 전부(그룹 메뉴)
 *   - architect 임베드 → EMBEDDED_FEATURES(embeddable=true)만(플랫 메뉴)
 *
 * component 는 defineAsyncComponent 지연로딩 — 활성 탭만 청크를 받으므로
 * 임베드(3탭)에는 나머지 도메인 코드가 실리지 않는다.
 */
import { defineAsyncComponent, type Component } from 'vue'
import {
  IconFolder,
  IconDatabase,
  IconMessageSquare,
  IconLineage,
  IconBook,
  IconBarChart,
  IconObservability,
  IconDataQuality,
  IconIncident,
  IconAlertConfig,
  IconEventDetection,
  IconWatchAgent,
  IconOntology,
  IconSearch,
  IconWhatIf,
  IconSecurity,
  IconCalendar,
  IconSettings,
  IconEye,
} from '@/components/icons'

/** 메뉴 그룹 식별자. 'bottom' 은 그룹 헤더 없이 플랫 렌더(분석/도구). */
export type FeatureGroupId = 'physical' | 'domain' | 'dynamic' | 'standard' | 'bottom'

export interface FeatureGroup {
  id: FeatureGroupId
  label: string
  icon: Component
  defaultExpanded?: boolean   // 첫 진입 시 펼침 여부
  dividerBefore?: boolean     // 이 그룹 앞에 구분선
}

export interface FeatureDef {
  id: string                  // session.activeTab 값
  label: string
  icon: Component
  group: FeatureGroupId
  component: Component         // defineAsyncComponent — 활성 시에만 로드
  props?: Record<string, unknown>
  embeddable?: boolean        // host(architect) 임베드에서 노출 = 코드분석 핵심만
  hidden?: boolean            // 메뉴엔 숨기되 activeTab 라우팅은 가능(레거시 보존)
}

/** 그룹 헤더(렌더 순서대로). 'bottom' 은 헤더가 없어 여기 없음. */
export const FEATURE_GROUPS: FeatureGroup[] = [
  { id: 'physical', label: '피지컬 레이어', icon: IconDatabase, defaultExpanded: true },
  { id: 'domain', label: '도메인 레이어', icon: IconOntology },
  { id: 'dynamic', label: '다이나믹 레이어', icon: IconObservability },
  { id: 'standard', label: '기준관리', icon: IconSettings, dividerBefore: true },
]

const lazy = (loader: () => Promise<unknown>): Component => defineAsyncComponent(loader as never)

export const FEATURES: FeatureDef[] = [
  // ── 피지컬 레이어 ── (임베드 노출 = 코드분석 핵심 3개)
  { id: 'upload', label: '코드', icon: IconFolder, group: 'physical', embeddable: true,
    component: lazy(() => import('@/components/upload/UploadTab.vue')) },
  { id: 'datasources', label: '데이터 소스', icon: IconDatabase, group: 'physical', embeddable: true,
    component: lazy(() => import('@/components/datasources/DataSourcesTab.vue')) },
  { id: 'graph', label: '스키마 관리', icon: IconDatabase, group: 'physical', embeddable: true,
    component: lazy(() => import('@/components/graph/GraphTab.vue')) },
  { id: 'text2sql', label: '자연어 질의', icon: IconMessageSquare, group: 'physical',
    component: lazy(() => import('@/components/text2sql/Text2SqlTab.vue')) },
  { id: 'security-guard', label: '보안관리자', icon: IconSecurity, group: 'physical',
    component: lazy(() => import('@/components/security').then((m: any) => m.SecurityGuardTab)) },

  // ── 도메인 레이어 ──
  { id: 'schema-modeling', label: '도메인 스키마', icon: IconDatabase, group: 'domain',
    component: lazy(() => import('@/components/domain/ObjectTypeModeler.vue')) },
  { id: 'multi-layer-ontology', label: '온톨로지 관리', icon: IconLineage, group: 'domain',
    component: lazy(() => import('@/components/domain/MultiLayerOntologyViewer.vue')) },
  { id: 'object-explorer', label: '오브젝트 탐색기', icon: IconSearch, group: 'domain',
    component: lazy(() => import('@/components/object-explorer/ObjectExplorerTab.vue')) },
  { id: 'ontology-viewer', label: '온톨로지 뷰어', icon: IconEye, group: 'domain',
    component: lazy(() => import('@/components/domain/OntologyViewerRemote.vue')) },
  { id: 'domain-text2sql', label: '자연어 질의', icon: IconMessageSquare, group: 'domain',
    props: { domainLayerMode: true },
    component: lazy(() => import('@/components/text2sql/Text2SqlTab.vue')) },
  // 메뉴 숨김(원래 SideNav 에서 주석 처리)이나 activeTab 라우팅은 보존
  { id: 'ontology', label: '문서에서 스키마 추출', icon: IconOntology, group: 'domain', hidden: true,
    component: lazy(() => import('@/components/ontology').then((m: any) => m.OntologyTab)) },

  // ── 다이나믹 레이어 ──
  { id: 'whatif', label: 'What-If 시뮬레이터', icon: IconWhatIf, group: 'dynamic',
    component: lazy(() => import('@/components/whatif').then((m: any) => m.WhatIfSimulator)) },
  { id: 'data-quality', label: '데이터 품질', icon: IconDataQuality, group: 'dynamic',
    component: lazy(() => import('@/components/observability').then((m: any) => m.DataQuality)) },
  { id: 'incident-manager', label: '사고 관리자', icon: IconIncident, group: 'dynamic',
    component: lazy(() => import('@/components/observability').then((m: any) => m.IncidentManager)) },
  { id: 'alerts', label: '알림들', icon: IconAlertConfig, group: 'dynamic',
    component: lazy(() => import('@/components/observability').then((m: any) => m.AlertsPage)) },
  { id: 'event-detection', label: '이벤트 감지', icon: IconEventDetection, group: 'dynamic',
    component: lazy(() => import('@/components/observability').then((m: any) => m.EventDetection)) },
  { id: 'watch-agent', label: '감시 에이전트', icon: IconWatchAgent, group: 'dynamic',
    component: lazy(() => import('@/components/observability').then((m: any) => m.WatchAgent)) },

  // ── 기준관리 ──
  { id: 'glossary', label: '용어 관리', icon: IconBook, group: 'standard',
    component: lazy(() => import('@/components/glossary/GlossaryTab.vue')) },
  { id: 'business-calendar', label: '영업일 캘린더', icon: IconCalendar, group: 'standard',
    component: lazy(() => import('@/components/glossary/BusinessDayCalendar.vue')) },

  // ── 분석/도구 (그룹 헤더 없이 플랫) ──
  { id: 'lineage', label: '데이터 리니지', icon: IconLineage, group: 'bottom',
    component: lazy(() => import('@/components/lineage/LineageTab.vue')) },
  { id: 'olap', label: 'OLAP 분석', icon: IconBarChart, group: 'bottom',
    component: lazy(() => import('@/components/olap').then((m: any) => m.OlapTab)) },
  // 메뉴 없음(HomeView 에만 있던 탭) → hidden 으로 보존
  { id: 'langchain', label: 'LangChain', icon: IconMessageSquare, group: 'bottom', hidden: true,
    component: lazy(() => import('@/components/langchain-text2sql/LangChainTab.vue')) },
]

/** 임베드(host=architect) 노출 대상 = embeddable 표시된 코드분석 핵심. */
export const EMBEDDED_FEATURES = FEATURES.filter(f => f.embeddable)
