<script setup lang="ts">
import { computed, defineAsyncComponent, inject, watch } from 'vue'
import { storeToRefs } from 'pinia'
import TopToolbar from '@/app/layout/TopToolbar.vue'
import SideNav from '@/app/navigation/SideNav.vue'
import { RouterView } from 'vue-router'
import {
  FloatingProgressPanel,
  useAnalyzerStore,
  useNavigatorStore,
} from '@/workflows/code-analysis'
import { useAppNavigationStore } from '@/app/navigation/state'
import { IconChevronRight } from '@/shared/icons'
import { logger } from '@/shared/utils/logger'

const NavigatorPanel = defineAsyncComponent(async () => (
  await import('@/features/code-analysis/navigation')
).NavigatorPanel)

// host(robo-architect)에 임베드되면 architect 상단바를 쓰므로 analyzer 자체 TopToolbar 는 숨긴다.
const isEmbedded = inject<boolean>('isEmbedded', false)

const projectStore = useAnalyzerStore()
const navigationStore = useAppNavigationStore()
const navigatorStore = useNavigatorStore()
const { activeFeatureId } = storeToRefs(navigationStore)
const { isPanelOpen: isNavOpen } = storeToRefs(navigatorStore)

/** Navigator 는 「코드 그래프」 탭에서만 렌더. */
const showNavigator = computed(() => activeFeatureId.value === 'graph')
const ANALYSIS_PROGRESS_TABS = new Set(['upload', 'graph'])
const showAnalysisProgress = computed(() => ANALYSIS_PROGRESS_TABS.has(activeFeatureId.value))

let graphLoadPromise: Promise<void> | null = null
let hasLoadedGraph = false

async function ensureExistingGraphData(): Promise<void> {
  if (hasLoadedGraph) return
  if (graphLoadPromise) return graphLoadPromise

  graphLoadPromise = (async () => {
    try {
      const result = await projectStore.loadExistingGraphData()
      hasLoadedGraph = result !== 'failed'
    } catch (error) {
      logger.warn('기존 분석 그래프를 불러오지 못했습니다.', error)
    } finally {
      graphLoadPromise = null
    }
  })()

  return graphLoadPromise
}

// Analyzer 그래프는 이를 실제 소비하는 화면에서만 로드한다.
watch(activeFeatureId, featureId => {
  if (!ANALYSIS_PROGRESS_TABS.has(featureId)) return
  void ensureExistingGraphData()
}, { immediate: true })
</script>

<template>
  <div class="main-layout">
    <!-- 상단 헤더 (단독 실행 시에만 — 임베드 시엔 architect 상단바 사용) -->
    <TopToolbar v-if="!isEmbedded" />
    
    <!-- 메인 영역: 사이드바 + Navigator + 콘텐츠 -->
    <div class="main-body">
      <!-- 왼쪽 사이드바 네비게이션 -->
      <SideNav />

      <!-- Navigator 사이드 패널 — Graph 탭에서만 렌더 (헤더 ‹ 로 접음) -->
      <NavigatorPanel v-if="showNavigator" />

      <!-- 네비게이터 닫힘 → SideNav 바로 오른쪽(메뉴 안 가림)에 › 로 다시 열기 -->
      <button
        v-if="showNavigator && !isNavOpen"
        class="nav-reopen"
        title="네비게이터 열기"
        aria-label="네비게이터 열기"
        @click="navigatorStore.setPanelOpen(true)"
      >
        <IconChevronRight :size="16" />
      </button>

      <!-- 메인 콘텐츠 -->
      <main class="main-content" tabindex="-1">
        <RouterView />
      </main>
    </div>
    
    <!-- 플로팅 진행 상태 패널 (전역) -->
    <FloatingProgressPanel v-if="showAnalysisProgress" />
  </div>
</template>

<style lang="scss" scoped>
.main-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  // FloatingProgressPanel(position:absolute)의 기준 컨테이너 — 임베드 시 탭 밖으로 안 튀게.
  position: relative;
}

.main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  min-width: 0;
  min-height: 0;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: var(--color-bg);
  min-width: 0;
  min-height: 0;

  &:focus {
    outline: none;
  }
}

@media (max-width: 720px) {
  .main-body :deep(.navigator-panel) {
    position: absolute;
    inset: 0 auto 0 52px;
    z-index: 55;
    width: min(300px, calc(100% - 64px)) !important;
    max-width: calc(100% - 64px);
    box-shadow: 8px 0 24px rgba(0, 0, 0, 0.35);
  }
}

/* 네비게이터 닫힘 시 재열기 = SideNav 오른쪽 상단의 작은 둥근 토글 버튼(아키텍트식 ‹›).
   align-self:flex-start 로 세로로 안 늘어남(전체-높이 컬럼 방지) + flex 흐름이라 툴바와 안 겹침. */
.nav-reopen {
  flex: none;
  align-self: center;   /* 세로 중앙 = 툴바 높이·위치에 의존 안 함(매직 top-margin 제거, 다해상도 견고) */
  margin: 0 6px;        /* 좌우 간격만 — 정렬은 align-self 가 담당 */
  width: 26px;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-bg-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition: background 0.12s, color 0.12s, border-color 0.12s;

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
    border-color: var(--color-accent);
  }
}
</style>
