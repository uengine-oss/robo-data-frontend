<template>
  <div class="schema-view">
    <!-- View Mode Switcher -->
    <div class="view-switcher">
      <button 
        :class="{ active: viewMode === 'canvas' }"
        @click="viewMode = 'canvas'"
      >
        📐 캔버스
      </button>
      <button 
        :class="{ active: viewMode === 'mermaid' }"
        @click="viewMode = 'mermaid'"
      >
        📊 Mermaid ER
      </button>
    </div>
    
    <!-- Canvas View -->
    <SchemaCanvas v-show="viewMode === 'canvas'" />
    
    <!-- Mermaid ER View -->
    <MermaidERView 
      v-show="viewMode === 'mermaid'" 
      :isActive="viewMode === 'mermaid'"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SchemaCanvas from './SchemaCanvas.vue'
import MermaidERView from './MermaidERView.vue'

const viewMode = ref<'canvas' | 'mermaid'>('canvas')
</script>

<style scoped lang="scss">
.schema-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.view-switcher {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  
  button {
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-light);
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text);
    }
    
    &.active {
      background: var(--color-accent);
      color: white;
      font-weight: 600;
    }
  }
}
</style>
