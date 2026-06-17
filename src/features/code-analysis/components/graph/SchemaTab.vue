<script setup lang="ts">
/**
 * SchemaTab.vue — 「데이터 스키마」 탭 (spec 015).
 *
 * 기존 GraphTab 안에 뷰스위처로 묶여 있던 스키마(캔버스/Mermaid ER)를 독립 탭으로 분리.
 * SchemaView 는 자급(테이블 목록·캔버스·Mermaid 포함)이라 여기서는 캔버스/Mermaid 전환만 제어한다.
 */
import { ref, onMounted } from 'vue'
import { SchemaView } from '@/features/schema'
import { useSessionStore } from '@/shared/stores/session'
import { useSchemaCanvasStore } from '@/features/schema/schemaCanvas'

const schemaMode = ref<'canvas' | 'mermaid'>('canvas')
const sessionStore = useSessionStore()
const schemaCanvasStore = useSchemaCanvasStore()

// 상단 검색에서 전달된 스키마 검색어 처리 (구 GraphTab 에서 이관).
onMounted(() => {
  const pendingQuery = sessionStore.consumeSchemaSearch()
  if (pendingQuery) {
    schemaCanvasStore.searchQuery = pendingQuery
    schemaCanvasStore.performSemanticSearch(pendingQuery)
  }
})
</script>

<template>
  <div class="schema-tab">
    <!-- 캔버스 / Mermaid ER 전환 -->
    <div class="schema-switcher">
      <button :class="{ active: schemaMode === 'canvas' }" @click="schemaMode = 'canvas'">📐 캔버스</button>
      <button :class="{ active: schemaMode === 'mermaid' }" @click="schemaMode = 'mermaid'">📊 Mermaid ER</button>
    </div>
    <div class="schema-body">
      <SchemaView :mode="schemaMode" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.schema-tab {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
// 좌상단 떠있는 전환 — GraphTab 뷰스위처와 같은 톤
.schema-switcher {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 100;
  display: flex;
  gap: 6px;
  background: var(--color-bg-secondary, #1e1e1e);
  border: 1px solid var(--color-border, #333);
  border-radius: 8px;
  padding: 4px;
  button {
    background: transparent;
    border: none;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--color-text-muted, #aaa);
    cursor: pointer;
    &:hover { background: var(--color-bg-tertiary, #2a2a2a); }
    &.active { background: var(--color-accent, #228be6); color: #fff; }
  }
}
.schema-body { flex: 1; min-height: 0; }
</style>
