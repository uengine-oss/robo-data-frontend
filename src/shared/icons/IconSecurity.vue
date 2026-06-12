<script setup lang="ts">
/**
 * Security Shield Icon
 */
defineProps<{
  size?: number
}>()
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size || 24"
    :height="size || 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- Shield shape -->
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <!-- Lock inside -->
    <rect x="9" y="10" width="6" height="5" rx="1" />
    <path d="M10 10V8a2 2 0 1 1 4 0v2" />
  </svg>
</template>
