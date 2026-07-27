<script setup lang="ts">
/**
 * HomeView — 활성 탭의 기능 컴포넌트 하나를 렌더.
 * 탭→컴포넌트 매핑은 features.config 단일 진실원천에서 파생(하드코딩 사다리 제거).
 */
import { computed, inject, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppNavigationStore } from '@/app/navigation/state'
import { EMBEDDED_FEATURES, FEATURES } from '@/app/config/features'
import AlarmToast from '@/app/notifications/AlarmToast.vue'

const navigationStore = useAppNavigationStore()
const { activeFeatureId } = storeToRefs(navigationStore)
const isEmbedded = inject<boolean>('isEmbedded', false)

const availableFeatures = computed(() => isEmbedded ? EMBEDDED_FEATURES : FEATURES)
const activeFeature = computed(() =>
  availableFeatures.value.find(feature => feature.id === activeFeatureId.value) ?? availableFeatures.value[0]
)

// 실행 모드에서 허용되지 않는 탭 상태를 화면과 메뉴가 다른 채로 방치하지 않는다.
watchEffect(() => {
  if (activeFeature.value && activeFeature.value.id !== activeFeatureId.value) {
    navigationStore.setActiveFeature(activeFeature.value.id)
  }
})
</script>

<template>
  <div class="home-view">
    <component
      v-if="activeFeature"
      :is="activeFeature.component"
      :key="activeFeature.id"
      v-bind="activeFeature.props"
    />
    <!-- 실시간 알람 토스트 (단독 실행 시에만) -->
    <AlarmToast v-if="!isEmbedded" />
  </div>
</template>

<style lang="scss" scoped>
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  background: var(--color-bg);
  border-radius: var(--radius-lg) 0 0 0;
  box-shadow: -1px 0 0 var(--color-border);
}
</style>
