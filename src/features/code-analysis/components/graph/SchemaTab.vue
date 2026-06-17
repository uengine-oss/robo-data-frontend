<script setup lang="ts">
/**
 * SchemaTab.vue — 「데이터 스키마」 탭 (spec 015·016).
 *
 * 캔버스 전용(FR-006): Mermaid ER·뷰 스위처 제거. SchemaView 가 자급(테이블 목록·캔버스 포함).
 */
import { onMounted } from 'vue'
import { SchemaView } from '@/features/schema'
import { useSessionStore } from '@/shared/stores/session'
import { useSchemaCanvasStore } from '@/features/schema/schemaCanvas'

const sessionStore = useSessionStore()
const schemaCanvasStore = useSchemaCanvasStore()

// 상단 검색에서 전달된 스키마 검색어 처리.
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
    <SchemaView />
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
</style>
