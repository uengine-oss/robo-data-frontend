<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

interface Props {
  data: {
    label: string
    actionType: 'process' | 'alarm'
    processName: string
    status: 'idle' | 'running' | 'success' | 'error'
  }
}

const props = defineProps<Props>()
</script>

<template>
  <div class="action-node" :class="props.data.status">
    <Handle type="target" :position="Position.Left" />
    
    <div class="node-header">
      <span class="node-icon">🎯</span>
      <span class="node-title">{{ props.data.label }}</span>
      <span class="status-indicator" :class="props.data.status">
        <span v-if="props.data.status === 'running'" class="pulse"></span>
      </span>
    </div>
    
    <div class="node-body">
      <div class="action-type">
        <span class="type-icon">{{ props.data.actionType === 'process' ? '⚙️' : '🔔' }}</span>
        <span class="type-label">{{ props.data.actionType === 'process' ? '프로세스 실행' : '알람 발송' }}</span>
      </div>
      
      <div class="process-name" v-if="props.data.actionType === 'process'">
        <span class="process-icon">▶</span>
        <span>{{ props.data.processName || '프로세스를 선택하세요' }}</span>
      </div>
      
      <div class="action-badge">
        ProcessGPT 연동
      </div>
    </div>
    
    <div class="node-footer">
      <span class="step-label">3단계</span>
      <span class="click-hint">클릭하여 편집</span>
    </div>
  </div>
</template>

<style scoped>
.action-node {
  background: var(--color-bg-secondary, #1e293b);
  border: 2px solid var(--color-border, #334155);
  border-radius: 12px;
  min-width: 260px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.action-node:hover {
  border-color: #22c55e;
  box-shadow: 0 8px 24px rgba(34, 197, 94, 0.15);
  transform: translateY(-2px);
}

.action-node.running {
  border-color: #22c55e;
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
  animation: glow 1.5s ease-in-out infinite;
}

.action-node.success {
  border-color: #22c55e;
}

.action-node.error {
  border-color: #ef4444;
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.3); }
  50% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.5); }
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
  background: #22c55e;
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
  background: #22c55e;
  animation: pulse 1s ease-out infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2); opacity: 0; }
}

.node-body {
  padding: 12px 16px;
}

.action-type {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;

  .type-icon {
    font-size: 16px;
  }

  .type-label {
    font-size: 13px;
    font-weight: 500;
    color: #22c55e;
  }
}

.process-name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 6px;
  margin-bottom: 10px;

  .process-icon {
    font-size: 10px;
    color: #22c55e;
  }

  span {
    font-size: 12px;
    color: var(--color-text, #e2e8f0);
  }
}

.action-badge {
  display: inline-block;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.15));
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 12px;
  font-size: 10px;
  font-weight: 500;
  color: #4ade80;
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
  color: #22c55e;
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
  background: #22c55e;
  border: 2px solid var(--color-bg-secondary, #1e293b);
}
</style>
