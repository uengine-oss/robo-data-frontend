<script setup lang="ts">
/**
 * DataSourcesTab.vue
 * 데이터 소스 관리 탭 래퍼 컴포넌트
 */
import DataSourceManager from './DataSourceManager.vue'
</script>

<template>
  <div class="data-sources-tab">
    <DataSourceManager mode="full" />
  </div>
</template>

<style scoped lang="scss">
.data-sources-tab {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
}
</style>
