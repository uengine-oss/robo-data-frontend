<script setup lang="ts">
// analyzer 핵심 3개 탭만 유지: 코드 업로드(분석→그래프화) · 데이터소스 · 스키마 조회.
// 그 외 메뉴(온톨로지·What-If·OLAP·리니지·용어집·text2sql·보안 등)는 robo-architect 통합 범위 밖이라 제거.
import UploadTab from '@/components/upload/UploadTab.vue'
import GraphTab from '@/components/graph/GraphTab.vue'
import DataSourcesTab from '@/components/datasources/DataSourcesTab.vue'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)
</script>

<template>
  <div class="home-view">
    <!-- 현재 활성 탭에 따라 컴포넌트 표시 -->
    <UploadTab v-if="activeTab === 'upload'" />
    <DataSourcesTab v-else-if="activeTab === 'datasources'" />
    <GraphTab v-else-if="activeTab === 'graph'" />
    <!-- 제거된 메뉴가 활성이던 경우 코드(업로드)로 폴백 -->
    <UploadTab v-else />
  </div>
</template>

<style lang="scss" scoped>
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  border-radius: var(--radius-lg) 0 0 0;
  box-shadow: -1px 0 0 var(--color-border);
}
</style>
