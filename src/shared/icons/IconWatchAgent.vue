<script setup lang="ts">
/**
 * WatchAgent Icon - 감시 에이전트 메뉴 아이콘
 * 로봇 눈 + 시계 모티프
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
    <!-- 로봇 눈 (감시) -->
    <circle cx="12" cy="10" r="7" />
    <circle cx="12" cy="10" r="3" />
    <circle cx="12" cy="10" r="1" fill="currentColor" />
    
    <!-- 시계 표시 (주기적 감시) -->
    <path d="M12 3v2" />
    <path d="M12 15v2" />
    
    <!-- 안테나 (에이전트) -->
    <path d="M8 3L6 1" />
    <path d="M16 3L18 1" />
    
    <!-- 연결선 -->
    <path d="M6 17h12" />
    <path d="M8 17v3" />
    <path d="M16 17v3" />
  </svg>
</template>
