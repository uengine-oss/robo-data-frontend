<script setup lang="ts">
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
    <!-- Central hub node -->
    <circle cx="12" cy="12" r="3" />
    <!-- Top node -->
    <circle cx="12" cy="4" r="2" />
    <!-- Bottom left node -->
    <circle cx="5" cy="18" r="2" />
    <!-- Bottom right node -->
    <circle cx="19" cy="18" r="2" />
    <!-- Connections -->
    <line x1="12" y1="9" x2="12" y2="6" />
    <line x1="9.5" y1="13.5" x2="6.5" y2="16.5" />
    <line x1="14.5" y1="13.5" x2="17.5" y2="16.5" />
    <!-- Horizontal connection between bottom nodes -->
    <line x1="7" y1="18" x2="17" y2="18" />
  </svg>
</template>
