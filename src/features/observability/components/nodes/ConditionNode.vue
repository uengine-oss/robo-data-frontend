<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

interface Props {
  data: {
    label: string
    conditionType: string
    expression: string
    description: string
    status: 'idle' | 'running' | 'success' | 'error'
  }
}

const props = defineProps<Props>()

const getConditionIcon = (type: string): string => {
  switch (type) {
    case 'exists': return '📋'
    case 'rising': return '📈'
    case 'threshold': return '⚠️'
    case 'custom': return '✏️'
    default: return '❓'
  }
}

const getConditionLabel = (type: string): string => {
  switch (type) {
    case 'exists': return '데이터 존재'
    case 'rising': return '지속 상승'
    case 'threshold': return '임계값 초과'
    case 'custom': return '사용자 정의'
    default: return type
  }
}
</script>

<template>
  <div class="condition-node" :class="props.data.status">
    <Handle type="target" :position="Position.Left" />
    
    <div class="node-header">
      <span class="node-icon">⚡</span>
      <span class="node-title">{{ props.data.label }}</span>
      <span class="status-indicator" :class="props.data.status">
        <span v-if="props.data.status === 'running'" class="pulse"></span>
      </span>
    </div>
    
    <div class="node-body">
      <div class="condition-type">
        <span class="type-icon">{{ getConditionIcon(props.data.conditionType) }}</span>
        <span class="type-label">{{ getConditionLabel(props.data.conditionType) }}</span>
      </div>
      
      <div class="condition-expression">
        <code>{{ props.data.expression }}</code>
      </div>
      
      <div class="condition-description">
        {{ props.data.description || '조건을 설정하세요' }}
      </div>
    </div>
    
    <div class="node-footer">
      <span class="step-label">2단계</span>
      <span class="click-hint">클릭하여 편집</span>
    </div>
    
    <!-- True/False 두 개의 출력 핸들 -->
    <div class="output-handles">
      <div class="handle-wrapper true-handle">
        <span class="handle-label">✓</span>
        <Handle id="true" type="source" :position="Position.Right" :style="{ top: '35%' }" />
      </div>
      <div class="handle-wrapper false-handle">
        <span class="handle-label">✗</span>
        <Handle id="false" type="source" :position="Position.Right" :style="{ top: '65%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.condition-node {
  background: var(--color-bg-secondary, #1e293b);
  border: 2px solid var(--color-border, #334155);
  border-radius: 12px;
  min-width: 260px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.condition-node:hover {
  border-color: #f59e0b;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.15);
  transform: translateY(-2px);
}

.condition-node.running {
  border-color: #f59e0b;
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
  animation: glow 1.5s ease-in-out infinite;
}

.condition-node.success {
  border-color: #22c55e;
}

.condition-node.error {
  border-color: #ef4444;
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.3); }
  50% { box-shadow: 0 0 30px rgba(245, 158, 11, 0.5); }
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #334155);
}

.node-icon {
  font-size: 18px;
}

.node-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-bright, #f1f5f9);
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-text-muted, #64748b);
  position: relative;
}

.status-indicator.running {
  background: #f59e0b;
}

.status-indicator.success {
  background: #22c55e;
}

.status-indicator.error {
  background: #ef4444;
}

.status-indicator .pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: #f59e0b;
  animation: pulse 1s ease-out infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2); opacity: 0; }
}

.node-body {
  padding: 12px 16px;
}

.condition-type {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .type-icon {
    font-size: 14px;
  }

  .type-label {
    font-size: 12px;
    font-weight: 500;
    color: #f59e0b;
  }
}

.condition-expression {
  margin-bottom: 8px;

  code {
    display: inline-block;
    padding: 4px 10px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 4px;
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    color: #fbbf24;
  }
}

.condition-description {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  line-height: 1.4;
}

.node-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 0 0 10px 10px;
}

.step-label {
  font-size: 10px;
  font-weight: 600;
  color: #f59e0b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.click-hint {
  font-size: 10px;
  color: var(--color-text-muted, #64748b);
}

.output-handles {
  position: absolute;
  right: -6px;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 24px;
}

.handle-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.handle-label {
  position: absolute;
  right: 20px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: 3px;
}

.true-handle .handle-label {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.false-handle .handle-label {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

:deep(.vue-flow__handle) {
  width: 12px;
  height: 12px;
  background: #f59e0b;
  border: 2px solid var(--color-bg-secondary, #1e293b);
}

:deep(.vue-flow__handle[data-handleid="true"]) {
  background: #22c55e;
}

:deep(.vue-flow__handle[data-handleid="false"]) {
  background: #ef4444;
}
</style>
