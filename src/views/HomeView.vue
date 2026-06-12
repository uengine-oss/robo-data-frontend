<script setup lang="ts">
/**
 * HomeView — 활성 탭의 기능 컴포넌트 하나를 렌더.
 * 탭→컴포넌트 매핑은 features.config 단일 진실원천에서 파생(하드코딩 사다리 제거).
 */
import { computed, inject } from 'vue'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/shared/stores/session'
import { FEATURES } from '@/config/features'
import AlarmToast from '@/shared/components/AlarmToast.vue'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)
const isEmbedded = inject<boolean>('isEmbedded', false)

// 활성 탭의 기능 — 없으면 첫 기능(코드)으로 폴백.
const activeFeature = computed(() => FEATURES.find(f => f.id === activeTab.value) ?? FEATURES[0])
</script>

<template>
  <div class="home-view">
    <component :is="activeFeature.component" v-bind="activeFeature.props" />
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
  background: var(--color-bg);
  border-radius: var(--radius-lg) 0 0 0;
  box-shadow: -1px 0 0 var(--color-border);
}
</style>
