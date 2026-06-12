<script setup lang="ts">
/**
 * EventDetection Icon - 이벤트 감지 및 조치 메뉴 아이콘
 * 레이더/감지 + 번개 조합 디자인
 */
defineProps<{
  size?: number
}>()
</script>

<template>
  <svg
    :width="size || 24"
    :height="size || 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- 레이더/센서 원 -->
    <circle cx="12" cy="12" r="10" opacity="0.3" />
    <circle cx="12" cy="12" r="6" opacity="0.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    
    <!-- 감지 파동 -->
    <path d="M12 2a10 10 0 0 1 7.07 2.93" />
    <path d="M12 6a6 6 0 0 1 4.24 1.76" />
    
    <!-- 번개 (조치/실행) -->
    <path d="M17 8l-2 4h3l-3 5" stroke-width="2.5" />
  </svg>
</template>
