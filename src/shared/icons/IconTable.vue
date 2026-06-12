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
    <path d="M12 3v18"/>
    <rect width="18" height="18" x="3" y="3" rx="2"/>
    <path d="M3 9h18"/>
    <path d="M3 15h18"/>
  </svg>
</template>

<script setup lang="ts">
defineProps({
  size: { type: [Number, String], default: 20 },
  color: { type: String, default: 'currentColor' },
  strokeWidth: { type: [Number, String], default: 2 }
})
</script>



