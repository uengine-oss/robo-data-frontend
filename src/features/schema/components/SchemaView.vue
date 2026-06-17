<template>
  <div class="schema-view">
    <!-- 데이터 스키마 = 캔버스 전용(spec 016 FR-006). Mermaid ER·뷰 스위처 제거. -->
    <SchemaCanvas />
  </div>
</template>

<script setup lang="ts">
import SchemaCanvas from './SchemaCanvas.vue'
</script>

<style scoped lang="scss">
.schema-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
</style>
