<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

interface Props {
  data: {
    label: string
    scenarioName: string
    outputField: string
    schemaId: string
    scenarioId: string
    status: 'idle' | 'running' | 'success' | 'error'
  }
}

const props = defineProps<Props>()

const truncateField = (field: string, maxLength: number = 40): string => {
  if (!field) return '출력 필드 미설정'
  return field.length > maxLength ? field.substring(0, maxLength) + '...' : field
}
</script>

<template>
  <div class="whatif-node" :class="props.data.status">
    <Handle type="target" :position="Position.Left" />
    
    <div class="node-header">
      <span class="node-icon">🔮</span>
      <span class="node-title">{{ props.data.label || 'What-If 시나리오' }}</span>
      <span class="status-indicator" :class="props.data.status">
        <span v-if="props.data.status === 'running'" class="pulse"></span>
      </span>
    </div>
    
    <div class="node-body">
      <div class="scenario-info">
        <div class="info-row">
          <span class="info-label">시나리오</span>
          <span class="info-value">{{ props.data.scenarioName || '미선택' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">모니터링 필드</span>
          <span class="info-value field-value">{{ truncateField(props.data.outputField) }}</span>
        </div>
      </div>
    </div>
    
    <div class="node-footer">
      <span class="step-label">1단계 · WhatIf</span>
      <span class="click-hint">클릭하여 편집</span>
    </div>
    
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.whatif-node {
  background: var(--color-bg-secondary, #1e293b);
  border: 2px solid #7c3aed;
  border-radius: 12px;
  min-width: 280px;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.whatif-node:hover {
  border-color: #a78bfa;
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.2);
  transform: translateY(-2px);
}

.whatif-node.running {
  border-color: #a78bfa;
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.3);
  animation: glow 1.5s ease-in-out infinite;
}

.whatif-node.success {
  border-color: #22c55e;
}

.whatif-node.error {
  border-color: #ef4444;
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 20px rgba(124, 58, 237, 0.3); }
  50% { box-shadow: 0 0 30px rgba(124, 58, 237, 0.5); }
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(124, 58, 237, 0.2);
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
  background: #a78bfa;
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
  background: #a78bfa;
  animation: pulse 1s ease-out infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2); opacity: 0; }
}

.node-body {
  padding: 12px 16px;
}

.scenario-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.info-label {
  font-size: 11px;
  color: var(--color-text-muted, #64748b);
  white-space: nowrap;
}

.info-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-bright, #f1f5f9);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-value {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: #c084fc;
  background: rgba(124, 58, 237, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.node-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(124, 58, 237, 0.05);
  border-radius: 0 0 10px 10px;
}

.step-label {
  font-size: 10px;
  font-weight: 600;
  color: #a78bfa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.click-hint {
  font-size: 10px;
  color: var(--color-text-muted, #64748b);
}

:deep(.vue-flow__handle) {
  width: 12px;
  height: 12px;
  background: #7c3aed;
  border: 2px solid var(--color-bg-secondary, #1e293b);
}
</style>
