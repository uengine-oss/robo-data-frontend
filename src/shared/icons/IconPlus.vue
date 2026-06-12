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
    <path d="M5 12h14"/>
    <path d="M12 5v14"/>
  </svg>
</template>

<script setup lang="ts">
defineProps({
  size: { type: [Number, String], default: 20 },
  color: { type: String, default: 'currentColor' },
  strokeWidth: { type: [Number, String], default: 2 }
})
</script>



