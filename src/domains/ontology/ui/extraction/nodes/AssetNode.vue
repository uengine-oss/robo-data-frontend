<script setup lang="ts">
/**
 * AssetNode.vue
 * Asset 유형 온톨로지 노드 (데이터 자산, 컨테이너 이미지 등)
 */
import { Handle, Position } from '@vue-flow/core'

interface NodeData {
  id: string
  name: string
  label: string
  description?: string
  properties?: Record<string, unknown>
  dataSource?: string
  instanceCount?: number
  isSelected?: boolean
  hasInstances?: boolean
}

defineProps<{
  data: NodeData
}>()
</script>

<template>
  <div 
    class="ontology-node asset-node"
    :class="{ 
      selected: data.isSelected,
      'has-instances': data.hasInstances
    }"
  >
    <!-- 연결 핸들 -->
    <Handle type="target" :position="Position.Top" class="handle handle-top" />
    <Handle type="source" :position="Position.Bottom" class="handle handle-bottom" />
    <Handle type="target" :position="Position.Left" class="handle handle-left" />
    <Handle type="source" :position="Position.Right" class="handle handle-right" />
    
    <!-- 노드 헤더 -->
    <div class="node-header">
      <span class="node-icon">📦</span>
      <span class="node-label">{{ data.label }}</span>
      <span v-if="data.hasInstances" class="instance-indicator" :title="`${data.instanceCount} 인스턴스`">
        {{ data.instanceCount }}
      </span>
    </div>
    
    <!-- 노드 이름 -->
    <div class="node-name">{{ data.name }}</div>
    
    <!-- 설명 (있는 경우) -->
    <div v-if="data.description" class="node-description">
      {{ data.description.length > 60 ? data.description.substring(0, 60) + '...' : data.description }}
    </div>
    
    <!-- 데이터 소스 -->
    <div v-if="data.dataSource" class="node-source">
      <span class="source-icon">🔗</span>
      <span class="source-name">{{ data.dataSource }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ontology-node {
  min-width: 180px;
  max-width: 260px;
  padding: 0;
  border-radius: 12px;
  background: var(--color-bg-secondary);
  border: 2px solid transparent;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  cursor: pointer;
  overflow: hidden;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  
  &.selected {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 4px rgba(34, 139, 230, 0.2);
  }
  
  &.has-instances {
    .node-header {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.1));
    }
  }
}

.asset-node {
  .node-header {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
  }
  
  &.selected {
    border-color: #fbbf24;
    box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.2);
  }
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  .node-icon {
    font-size: 14px;
  }
  
  .node-label {
    flex: 1;
  }
  
  .instance-indicator {
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 10px;
    font-size: 0.7rem;
  }
}

.node-name {
  padding: 12px 14px 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.node-description {
  padding: 0 14px 10px;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.node-source {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
  font-size: 0.75rem;
  
  .source-icon {
    font-size: 12px;
  }
  
  .source-name {
    font-family: 'JetBrains Mono', monospace;
    color: #34d399;
  }
}

// VueFlow 핸들 스타일
.handle {
  width: 10px;
  height: 10px;
  background: var(--color-bg-tertiary);
  border: 2px solid #fbbf24;
  transition: all 0.2s ease;
  
  &:hover {
    transform: scale(1.3);
    background: #fbbf24;
  }
}

.handle-top {
  top: -5px;
}

.handle-bottom {
  bottom: -5px;
}

.handle-left {
  left: -5px;
}

.handle-right {
  right: -5px;
}
</style>
