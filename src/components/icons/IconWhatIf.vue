<script setup lang="ts">
/**
 * What-If Simulator 아이콘
 */
withDefaults(defineProps<{
  size?: number
}>(), {
  size: 24
})
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- 분기 화살표 (What-If 시나리오 표현) -->
    <path d="M4 12h4" />
    <path d="M8 12l4-4" />
    <path d="M8 12l4 4" />
    <circle cx="16" cy="8" r="3" />
    <circle cx="16" cy="16" r="3" />
    <!-- 물음표 -->
    <path d="M19 8.5c.5-.5.5-1.5 0-2s-1.5-.5-2 0" />
    <path d="M17 9.5v.5" />
  </svg>
</template>
