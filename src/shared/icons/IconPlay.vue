<template>
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    :width="size" 
    :height="size" 
    viewBox="0 0 24 24" 
    fill="none" 
    :stroke="color" 
    :stroke-width="strokeWidth" 
    stroke-linecap="round" 
    stroke-linejoin="round"
  >
    <polygon points="6 3 20 12 6 21 6 3"/>
  </svg>
</template>

<script setup lang="ts">
defineProps({
  size: { type: [Number, String], default: 20 },
  color: { type: String, default: 'currentColor' },
  strokeWidth: { type: [Number, String], default: 2 }
})
</script>



