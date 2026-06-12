<script setup lang="ts">
/**
 * ObjectDetailPanel.vue
 * 선택된 오브젝트의 상세 정보 표시
 */

import { computed, ref } from 'vue'
import { IconX, IconChevronDown, IconRefresh } from '@/shared/icons'

// ============================================================================
// 타입 정의
// ============================================================================

interface ObjectNode {
  id: string
  name: string
  type: string
  labels: string[]
  properties: Record<string, unknown>
}

interface ObjectType {
  id: string
  name: string
  description?: string
  columns: Array<{ name: string; type: string }>
  materializedView?: string
  query?: string
}

interface Props {
  node: ObjectNode
  objectType: ObjectType | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'close': []
  'drilldown': [node: ObjectNode]
}>()

// ============================================================================
// 상태
// ============================================================================

const expandedKeys = ref<Set<string>>(new Set())

// ============================================================================
// Computed
// ============================================================================

const nodeColor = computed(() => {
  // Object Type에 따른 색상 지정
  const typeColors: Record<string, string> = {
    'Plant': '#22c55e',
    'ProcessUnit': '#3b82f6',
    'Equipment': '#f59e0b',
    'Sensor': '#8b5cf6',
    'Reservoir': '#06b6d4',
    'Algorithm': '#ec4899',
    'Model': '#ef4444',
  }
  return typeColors[props.node.type] || '#6b7280'
})

const properties = computed(() => {
  return Object.entries(props.node.properties)
    .filter(([key]) => !['id', 'name', '__typename'].includes(key))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? ''),
      isLong: String(value ?? '').length > 50
    }))
})

// ============================================================================
// 이벤트 핸들러
// ============================================================================

function toggleExpand(key: string) {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key)
  } else {
    expandedKeys.value.add(key)
  }
}

function handleDrilldown() {
  emit('drilldown', props.node)
}
</script>

<template>
  <div class="detail-panel-content">
    <!-- 헤더 -->
    <div class="panel-header">
      <div class="header-content">
        <span class="node-badge" :style="{ background: nodeColor }">{{ node.type }}</span>
        <h3 class="node-name">{{ node.name }}</h3>
      </div>
      <button class="close-btn" @click="emit('close')">
        <IconX :size="18" />
      </button>
    </div>
    
    <!-- 액션 버튼 -->
    <div class="actions-section">
      <button class="action-btn primary" @click="handleDrilldown">
        <IconChevronDown :size="16" />
        <span>하위 항목 탐색</span>
      </button>
      <button class="action-btn">
        <IconRefresh :size="16" />
        <span>새로고침</span>
      </button>
    </div>
    
    <!-- 속성 테이블 -->
    <div class="properties-section">
      <div class="section-header">
        <span class="section-title">속성</span>
        <span class="property-count">{{ properties.length }}개</span>
      </div>
      
      <div class="properties-table">
        <div v-if="properties.length === 0" class="empty-state">
          속성이 없습니다
        </div>
        
        <div 
          v-else
          v-for="prop in properties"
          :key="prop.key"
          class="property-row"
        >
          <div class="property-key">{{ prop.key }}</div>
          <div class="property-value" :class="{ expanded: expandedKeys.has(prop.key) }">
            <div class="value-content">{{ prop.value }}</div>
            <button 
              v-if="prop.isLong"
              class="expand-toggle"
              @click="toggleExpand(prop.key)"
            >
              {{ expandedKeys.has(prop.key) ? '접기' : '더보기' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Object Type 정보 -->
    <div v-if="objectType" class="type-info-section">
      <div class="section-header">
        <span class="section-title">Object Type 정보</span>
      </div>
      
      <div class="type-info">
        <div class="info-row">
          <span class="info-label">타입</span>
          <span class="info-value">{{ objectType.name }}</span>
        </div>
        <div v-if="objectType.description" class="info-row">
          <span class="info-label">설명</span>
          <span class="info-value">{{ objectType.description }}</span>
        </div>
        <div v-if="objectType.materializedView" class="info-row">
          <span class="info-label">MV</span>
          <span class="info-value code">{{ objectType.materializedView }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

// ============================================================================
// 헤더
// ============================================================================

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.node-badge {
  display: inline-block;
  width: fit-content;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: 4px;
  color: white;
}

.node-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-bright);
  word-break: break-word;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  
  &:hover {
    background: var(--color-bg);
    color: var(--color-text-bright);
  }
}

// ============================================================================
// 액션 버튼
// ============================================================================

.actions-section {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-accent);
  }
  
  &.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
    
    &:hover {
      background: var(--color-accent-hover);
    }
  }
}

// ============================================================================
// 속성 섹션
// ============================================================================

.properties-section {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
}

.property-count {
  font-size: 11px;
  color: var(--color-text-light);
}

.properties-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--color-border);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.empty-state {
  padding: 24px;
  text-align: center;
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: 13px;
}

.property-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  background: var(--color-bg);
}

.property-key {
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-bg-tertiary);
  border-right: 1px solid var(--color-border);
}

.property-value {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--color-accent);
  font-family: var(--font-mono);
  
  .value-content {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-all;
  }
  
  &.expanded .value-content {
    display: block;
    -webkit-line-clamp: unset;
  }
  
  .expand-toggle {
    display: inline-block;
    margin-top: 4px;
    padding: 0;
    background: transparent;
    border: none;
    font-size: 11px;
    color: var(--color-accent);
    cursor: pointer;
    
    &:hover {
      text-decoration: underline;
    }
  }
}

// ============================================================================
// Type 정보 섹션
// ============================================================================

.type-info-section {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.type-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.info-label {
  flex-shrink: 0;
  width: 60px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.info-value {
  color: var(--color-text);
  
  &.code {
    font-family: var(--font-mono);
    color: var(--color-accent);
  }
}
</style>
