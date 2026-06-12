<script setup lang="ts">
/**
 * Observability Icon - 관찰 가능성 메뉴 아이콘
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
    <!-- Magnifying glass with database -->
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
    <ellipse cx="11" cy="9" rx="4" ry="2" />
    <path d="M7 9v3c0 1.1 1.8 2 4 2s4-.9 4-2V9" />
  </svg>
</template>



