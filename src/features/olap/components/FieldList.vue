<script setup lang="ts">
/**
 * FieldList.vue
 * 피벗 분석을 위한 차원 및 측정값 필드 목록 (HTML5 Drag & Drop)
 */
import { useOlapStore } from '@/stores/olap'

const store = useOlapStore()

// Drag start handler for dimensions
function onDragStartDimension(event: DragEvent, dimName: string, levelName: string) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({
      type: 'dimension',
      dimension: dimName,
      level: levelName
    }))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

// Drag start handler for measures
function onDragStartMeasure(event: DragEvent, measureName: string) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({
      type: 'measure',
      name: measureName
    }))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

// Double click handlers as alternative
function handleDimensionDblClick(dimName: string, levelName: string) {
  store.addToRows({ dimension: dimName, level: levelName })
}

function handleMeasureDblClick(measureName: string) {
  store.addMeasure({ name: measureName })
}
</script>

<template>
  <div class="field-list">
    <!-- Dimensions -->
    <div class="field-section">
      <h4 class="section-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18"/>
          <path d="M9 21V9"/>
        </svg>
        차원
        <span class="hint">(드래그하여 추가)</span>
      </h4>
      
      <div class="field-items">
        <div 
          v-for="dim in store.dimensions" 
          :key="dim.name"
          class="dimension-group"
        >
          <div class="dim-header">{{ dim.name }}</div>
          <div class="level-list">
            <div 
              v-for="level in dim.levels" 
              :key="level.name"
              class="tag dimension"
              draggable="true"
              @dragstart="onDragStartDimension($event, dim.name, level.name)"
              @dblclick="handleDimensionDblClick(dim.name, level.name)"
            >
              <span class="level-icon">↳</span>
              {{ level.name }}
            </div>
          </div>
        </div>
        
        <div v-if="!store.dimensions.length" class="empty-message">
          큐브를 선택하세요
        </div>
      </div>
    </div>
    
    <!-- Measures -->
    <div class="field-section">
      <h4 class="section-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="20" x2="12" y2="10"/>
          <line x1="18" y1="20" x2="18" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="16"/>
        </svg>
        측정값
        <span class="hint">(드래그하여 추가)</span>
      </h4>
      
      <div class="field-items">
        <div 
          v-for="measure in store.measures" 
          :key="measure.name"
          class="tag measure"
          draggable="true"
          @dragstart="onDragStartMeasure($event, measure.name)"
          @dblclick="handleMeasureDblClick(measure.name)"
        >
          <span class="measure-icon">Σ</span>
          {{ measure.name }}
          <span class="agg-badge">{{ measure.aggregator }}</span>
        </div>
        
        <div v-if="!store.measures.length" class="empty-message">
          큐브를 선택하세요
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.field-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  
  .hint {
    font-size: 0.625rem;
    font-weight: normal;
    text-transform: none;
    letter-spacing: normal;
    margin-left: auto;
    opacity: 0.7;
  }
}

.field-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dimension-group {
  margin-bottom: 8px;
}

.dim-header {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #ae3ec9;
  margin-bottom: 4px;
  padding-left: 4px;
}

.level-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
}

.tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: grab;
  transition: all 0.15s ease;
  user-select: none;
  
  &:active {
    cursor: grabbing;
  }
  
  &.dimension {
    background: rgba(174, 62, 201, 0.1);
    border: 1px solid rgba(174, 62, 201, 0.2);
    color: var(--color-text);
    
    &:hover {
      background: rgba(174, 62, 201, 0.2);
      border-color: rgba(174, 62, 201, 0.4);
      transform: translateX(2px);
    }
  }
  
  &.measure {
    background: rgba(55, 178, 77, 0.1);
    border: 1px solid rgba(55, 178, 77, 0.2);
    color: var(--color-text);
    
    &:hover {
      background: rgba(55, 178, 77, 0.2);
      border-color: rgba(55, 178, 77, 0.4);
      transform: translateX(2px);
    }
  }
}

.level-icon {
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.measure-icon {
  color: #37b24d;
  font-weight: 600;
}

.agg-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  margin-left: auto;
}

.empty-message {
  padding: 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
</style>
