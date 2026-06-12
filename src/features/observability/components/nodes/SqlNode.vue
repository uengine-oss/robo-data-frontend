<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

interface Props {
  data: {
    label: string
    sql: string
    status: 'idle' | 'running' | 'success' | 'error'
  }
}

const props = defineProps<Props>()

const truncateSql = (sql: string, maxLength: number = 60): string => {
  if (!sql) return 'SELECT * FROM ...'
  const cleaned = sql.replace(/\s+/g, ' ').trim()
  return cleaned.length > maxLength ? cleaned.substring(0, maxLength) + '...' : cleaned
}
</script>

<template>
  <div class="sql-node" :class="props.data.status">
    <Handle type="target" :position="Position.Left" />
    
    <div class="node-header">
      <span class="node-icon">📊</span>
      <span class="node-title">{{ props.data.label }}</span>
      <span class="status-indicator" :class="props.data.status">
        <span v-if="props.data.status === 'running'" class="pulse"></span>
      </span>
    </div>
    
    <div class="node-body">
      <code class="sql-preview">{{ truncateSql(props.data.sql) }}</code>
    </div>
    
    <div class="node-footer">
      <span class="step-label">1단계</span>
      <span class="click-hint">클릭하여 편집</span>
    </div>
    
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.sql-node {
  background: var(--color-bg-secondary, #1e293b);
  border: 2px solid var(--color-border, #334155);
  border-radius: 12px;
  min-width: 260px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.sql-node:hover {
  border-color: #6366f1;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
  transform: translateY(-2px);
}

.sql-node.running {
  border-color: #6366f1;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
  animation: glow 1.5s ease-in-out infinite;
}

.sql-node.success {
  border-color: #22c55e;
}

.sql-node.error {
  border-color: #ef4444;
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
  50% { box-shadow: 0 0 30px rgba(99, 102, 241, 0.5); }
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
  background: #6366f1;
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
  background: #6366f1;
  animation: pulse 1s ease-out infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(2); opacity: 0; }
}

.node-body {
  padding: 12px 16px;
}

.sql-preview {
  display: block;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: #38bdf8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  color: #6366f1;
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
  background: #6366f1;
  border: 2px solid var(--color-bg-secondary, #1e293b);
}
</style>
