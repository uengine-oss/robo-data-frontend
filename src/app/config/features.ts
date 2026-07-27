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
  IconTable,
  IconLayers,
  IconBrain,
  IconCode,
  IconGrid,
} from '@/shared/icons'

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
  id: string                  // app navigation의 activeFeatureId 값
  label: string
  icon: Component
  group: FeatureGroupId
  component: Component         // defineAsyncComponent — 활성 시에만 로드
  props?: Record<string, unknown>
  embeddable?: boolean        // host(architect) 임베드에서 노출 = 코드분석 핵심만
  hidden?: boolean            // 메뉴엔 숨기되 feature id 직접 이동은 가능
}

/** 그룹 헤더(렌더 순서대로). 'bottom' 은 헤더가 없어 여기 없음. */
export const FEATURE_GROUPS: FeatureGroup[] = [
  { id: 'physical', label: '피지컬 레이어', icon: IconLayers, defaultExpanded: true },
  { id: 'domain', label: '도메인 레이어', icon: IconBrain },
  { id: 'dynamic', label: '다이나믹 레이어', icon: IconObservability },
  { id: 'standard', label: '기준관리', icon: IconSettings, dividerBefore: true },
]

const lazyNamed = <TModule, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
): Component => defineAsyncComponent(async () => (await loader())[exportName] as Component)

export const FEATURES: FeatureDef[] = [
  // ── 피지컬 레이어 ── (임베드 노출 = 코드분석 핵심 3개)
  { id: 'upload', label: '코드', icon: IconCode, group: 'physical', embeddable: true,
    component: lazyNamed(() => import('@/workflows/code-analysis/upload'), 'UploadTab') },
  { id: 'datasources', label: '데이터 소스', icon: IconDatabase, group: 'physical', embeddable: true,
    component: lazyNamed(() => import('@/domains/data-fabric'), 'DataSourcesTab') },
  { id: 'graph', label: '코드 그래프', icon: IconOntology, group: 'physical', embeddable: true,
    component: lazyNamed(() => import('@/features/code-analysis/graph'), 'GraphTab') },
  { id: 'schema', label: '데이터 스키마', icon: IconTable, group: 'physical', embeddable: true,
    component: lazyNamed(() => import('@/features/code-analysis/schema'), 'SchemaTab') },
  { id: 'text2sql', label: '자연어 질의', icon: IconMessageSquare, group: 'physical',
    component: lazyNamed(() => import('@/workflows/text2sql-ontology'), 'Text2SqlWorkspace') },
  { id: 'security-guard', label: '보안관리자', icon: IconSecurity, group: 'physical',
    component: lazyNamed(() => import('@/domains/security'), 'SecurityGuardTab') },

  // ── 도메인 레이어 ──
  { id: 'schema-modeling', label: '도메인 스키마', icon: IconGrid, group: 'domain',
    component: lazyNamed(() => import('@/workflows/ontology'), 'ObjectTypeModeler') },
  { id: 'multi-layer-ontology', label: '온톨로지 관리', icon: IconLineage, group: 'domain',
    component: lazyNamed(() => import('@/workflows/ontology'), 'MultiLayerOntologyViewer') },
  { id: 'object-explorer', label: '오브젝트 탐색기', icon: IconSearch, group: 'domain',
    component: lazyNamed(() => import('@/domains/ontology/ui/explorer'), 'ObjectExplorerTab') },
  { id: 'ontology-viewer', label: '온톨로지 뷰어', icon: IconEye, group: 'domain',
    component: lazyNamed(() => import('@/domains/ontology/ui/modeling'), 'OntologyViewerRemote') },
  { id: 'domain-text2sql', label: '자연어 질의', icon: IconMessageSquare, group: 'domain',
    props: { domainLayerMode: true },
    component: lazyNamed(() => import('@/workflows/text2sql-ontology'), 'Text2SqlWorkspace') },
  // 메뉴에서는 숨기지만 기존 feature id 직접 이동 계약은 보존
  { id: 'ontology', label: '문서에서 스키마 추출', icon: IconOntology, group: 'domain', hidden: true,
    component: lazyNamed(() => import('@/workflows/ontology'), 'OntologyTab') },

  // ── 다이나믹 레이어 ──
  { id: 'whatif', label: 'What-If 시뮬레이터', icon: IconWhatIf, group: 'dynamic',
    component: lazyNamed(() => import('@/domains/whatif'), 'WhatIfSimulator') },
  { id: 'data-quality', label: '데이터 품질', icon: IconDataQuality, group: 'dynamic',
    component: lazyNamed(() => import('@/workflows/observability'), 'DataQuality') },
  { id: 'incident-manager', label: '사고 관리자', icon: IconIncident, group: 'dynamic',
    component: lazyNamed(() => import('@/workflows/observability'), 'IncidentManager') },
  { id: 'alerts', label: '알림들', icon: IconAlertConfig, group: 'dynamic',
    component: lazyNamed(() => import('@/workflows/observability'), 'AlertsPage') },
  { id: 'event-detection', label: '이벤트 감지', icon: IconEventDetection, group: 'dynamic',
    component: lazyNamed(() => import('@/workflows/observability'), 'EventDetection') },
  { id: 'watch-agent', label: '감시 에이전트', icon: IconWatchAgent, group: 'dynamic',
    component: lazyNamed(() => import('@/workflows/observability'), 'WatchAgent') },

  // ── 기준관리 ──
  { id: 'glossary', label: '용어 관리', icon: IconBook, group: 'standard',
    component: lazyNamed(() => import('@/domains/catalog/glossary'), 'GlossaryTab') },
  { id: 'business-calendar', label: '영업일 캘린더', icon: IconCalendar, group: 'standard',
    component: lazyNamed(() => import('@/domains/catalog/glossary'), 'BusinessDayCalendar') },

  // ── 분석/도구 (그룹 헤더 없이 플랫) ──
  { id: 'lineage', label: '데이터 리니지', icon: IconLineage, group: 'bottom',
    component: lazyNamed(() => import('@/workflows/data-lineage'), 'LineageTab') },
  { id: 'olap', label: 'OLAP 분석', icon: IconBarChart, group: 'bottom',
    component: lazyNamed(() => import('@/domains/olap'), 'OlapTab') },
  // 메뉴 없음(HomeView 에만 있던 탭) → hidden 으로 보존
]

/** 임베드(host=architect) 노출 대상 = embeddable 표시된 코드분석 핵심. */
export const EMBEDDED_FEATURES = FEATURES.filter(f => f.embeddable)
