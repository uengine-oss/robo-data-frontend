<script setup lang="ts">
/**
 * Alert Config Icon - 알림 설정 아이콘
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
    <!-- Bell with light rays (alert notification) -->
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    <!-- Alert lines -->
    <path d="M12 2v1" />
    <path d="M19 4l-1 1" />
    <path d="M5 4l1 1" />
  </svg>
</template>



