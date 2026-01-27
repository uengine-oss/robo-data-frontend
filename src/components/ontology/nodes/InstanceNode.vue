<script setup lang="ts">
/**
 * InstanceNode.vue
 * 온톨로지 인스턴스 노드 (실제 데이터 인스턴스)
 */
import { Handle, Position } from '@vue-flow/core'

interface NodeData {
  id: string
  name: string
  parentNodeId: string
  parentNodeName: string
}

defineProps<{
  data: NodeData
}>()
</script>

<template>
  <div class="instance-node">
    <!-- 연결 핸들 -->
    <Handle type="target" :position="Position.Top" class="handle" />
    
    <!-- 노드 내용 -->
    <div class="node-content">
      <span class="node-icon">📍</span>
      <span class="node-name" :title="data.name">{{ data.name }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.instance-node {
  min-width: 50px;
  max-width: 100px;
  padding: 6px 10px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(124, 58, 237, 0.15));
  border: 1px solid rgba(167, 139, 250, 0.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    transform: scale(1.05);
    border-color: rgba(167, 139, 250, 0.7);
    box-shadow: 0 4px 12px rgba(167, 139, 250, 0.3);
  }
}

.node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  
  .node-icon {
    font-size: 12px;
    flex-shrink: 0;
  }
  
  .node-name {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--color-text-bright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.handle {
  width: 6px;
  height: 6px;
  background: rgba(167, 139, 250, 0.6);
  border: 1px solid rgba(167, 139, 250, 0.8);
}
</style>
