<template>
  <div class="schema-view">
    <!-- 캔버스/Mermaid 전환은 부모(GraphTab) 공통 툴바가 제어 — 그래프·UML 뷰와
         같은 위치·스타일을 갖게 해 레이아웃 일관성을 맞춘다. -->
    <SchemaCanvas v-show="mode === 'canvas'" />
    <MermaidERView
      v-show="mode === 'mermaid'"
      :isActive="mode === 'mermaid'"
    />
  </div>
</template>

<script setup lang="ts">
import SchemaCanvas from './SchemaCanvas.vue'
import MermaidERView from './MermaidERView.vue'

// mode 는 부모가 제어(단일 소비처 = GraphTab). 기본 'canvas'.
withDefaults(defineProps<{ mode?: 'canvas' | 'mermaid' }>(), { mode: 'canvas' })
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
