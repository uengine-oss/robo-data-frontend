<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TopToolbar from '@/components/common/TopToolbar.vue'
import SideNav from '@/components/common/SideNav.vue'
import NavigatorPanel from '@/components/graph/NavigatorPanel.vue'
import FloatingProgressPanel from '@/components/common/FloatingProgressPanel.vue'
import { RouterView } from 'vue-router'
import { useAnalyzerStore } from '@/stores/analyzer'
import { useSessionStore } from '@/stores/session'
import { useNavigatorStore } from '@/stores/navigator'

const projectStore = useAnalyzerStore()
const sessionStore = useSessionStore()
const navigatorStore = useNavigatorStore()
const { activeTab } = storeToRefs(sessionStore)
const { activeView: graphActiveView } = storeToRefs(navigatorStore)

/** Navigator 는 Graph 탭의 "Graph" 하위 뷰에서만 렌더. */
const showNavigator = computed(
  () => activeTab.value === 'graph' && graphActiveView.value === 'graph'
)

// 앱 초기화 시 Neo4j에서 기존 그래프 데이터 로드
onMounted(async () => {
  try {
    await projectStore.loadExistingGraphData()
  } catch (error) {
    console.warn('초기 그래프 데이터 로드 실패:', error)
  }
})
</script>

<template>
  <div class="main-layout">
    <!-- 상단 헤더 -->
    <TopToolbar />
    
    <!-- 메인 영역: 사이드바 + Navigator + 콘텐츠 -->
    <div class="main-body">
      <!-- 왼쪽 사이드바 네비게이션 -->
      <SideNav />

      <!-- Navigator 사이드 패널 — Graph 탭에서만 렌더 -->
      <NavigatorPanel v-if="showNavigator" />

      <!-- 메인 콘텐츠 -->
      <main class="main-content">
        <RouterView />
      </main>
    </div>
    
    <!-- 플로팅 진행 상태 패널 (전역) -->
    <FloatingProgressPanel />
  </div>
</template>

<style lang="scss" scoped>
.main-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: var(--color-bg);
}
</style>
