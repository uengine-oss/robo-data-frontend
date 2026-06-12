<script setup lang="ts">
/**
 * Incident Icon - 사고 관리자 아이콘
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
    <!-- Document with warning -->
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 11v4" stroke-width="2.5" />
    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
</template>



