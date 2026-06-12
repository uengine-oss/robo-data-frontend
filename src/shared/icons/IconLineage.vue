<script setup lang="ts">
/**
 * IconLineage.vue
 * 데이터 리니지 아이콘 - 데이터 흐름을 나타내는 아이콘
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
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- 데이터 흐름을 표현하는 노드와 연결선 -->
    <!-- 소스 노드들 (왼쪽) -->
    <circle cx="4" cy="6" r="2" />
    <circle cx="4" cy="12" r="2" />
    <circle cx="4" cy="18" r="2" />
    
    <!-- ETL 프로세스 (중앙) -->
    <rect x="10" y="9" width="4" height="6" rx="1" />
    
    <!-- 타겟 노드 (오른쪽) -->
    <circle cx="20" cy="12" r="2" />
    
    <!-- 연결선들 -->
    <path d="M6 6 L10 10" />
    <path d="M6 12 L10 12" />
    <path d="M6 18 L10 14" />
    <path d="M14 12 L18 12" />
  </svg>
</template>



