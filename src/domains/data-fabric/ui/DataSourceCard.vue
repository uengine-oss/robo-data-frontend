<script setup lang="ts">
import type { DataSource } from '../api/contracts.ts'
import { getConnectorPresentation } from '../catalog/connectorPresentation.ts'

const props = defineProps<{
  source: DataSource
  selected: boolean
  allowDelete: boolean
}>()

const emit = defineEmits<{
  select: [source: DataSource]
  delete: [source: DataSource, event: MouseEvent]
}>()

function healthClass() {
  const status = props.source.health?.status
  if (status === 'healthy') return 'health-healthy'
  if (status === 'partial') return 'health-partial'
  if (status === 'disconnected') return 'health-disconnected'
  if (status === 'checking') return 'health-checking'
  return 'health-unknown'
}

function healthLabel() {
  const health = props.source.health
  if (!health) return '연결 상태 확인 중'
  if (health.status === 'healthy') return '연결 정상'
  if (health.status === 'partial') return `부분 연결: ${health.message}`
  if (health.status === 'disconnected') return `연결 끊김: ${health.message}`
  if (health.status === 'checking') return '연결 상태 확인 중'
  return health.message || '상태를 알 수 없음'
}
</script>

<template>
  <article :class="['source-card', { selected }]">
    <button
      type="button"
      class="source-select"
      :aria-pressed="selected"
      :aria-label="`${source.display_name || source.name} 데이터 소스 선택`"
      @click="emit('select', source)"
    />
    <div
      class="card-header"
      :style="{ background: getConnectorPresentation(source.engine).gradient }"
    >
      <span class="card-icon" aria-hidden="true">
        {{ getConnectorPresentation(source.engine).icon }}
      </span>
      <span
        class="health-indicator"
        :class="healthClass()"
        :title="healthLabel()"
        :aria-label="healthLabel()"
      >
        <span v-if="source.health?.status === 'checking'" class="health-spinner" />
        <span v-else-if="source.health?.status === 'healthy'" aria-hidden="true">✓</span>
        <span v-else-if="source.health?.status === 'partial'" aria-hidden="true">!</span>
        <span
          v-else-if="source.health?.status === 'disconnected'"
          class="disconnected-icon"
          aria-hidden="true"
        />
        <span v-else aria-hidden="true">?</span>
      </span>
    </div>
    <div class="card-body">
      <h3 class="source-name">{{ source.display_name || source.name }}</h3>
      <span
        class="source-engine"
        :style="{ color: getConnectorPresentation(source.engine).color }"
      >
        {{ source.engine.toUpperCase() }}
      </span>
      <div v-if="source.host" class="source-details">
        <span class="detail-item">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          {{ source.host }}
        </span>
        <span v-if="source.database" class="detail-item">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
          </svg>
          {{ source.database }}
        </span>
      </div>
    </div>

    <button
      v-if="allowDelete"
      type="button"
      class="btn-delete"
      :aria-label="`${source.display_name || source.name} 데이터 소스 삭제`"
      @click="emit('delete', source, $event)"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      </svg>
    </button>
  </article>
</template>

<style scoped lang="scss">
.source-card {
  position: relative;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  transition: all 0.2s;

  &:hover,
  &:focus-within {
    border-color: transparent;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
    transform: translateY(-4px);

    .btn-delete {
      opacity: 0.7;
    }
  }

  &.selected {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
}

.source-select {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: 0;

  &:focus-visible {
    outline: 3px solid rgba(99, 102, 241, 0.55);
    outline-offset: -3px;
  }
}

.card-header {
  position: relative;
  z-index: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-height: 80px;
  padding: 20px;
}

.card-icon {
  font-size: 2.5rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.health-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 50%;

  &.health-healthy {
    background: rgba(34, 197, 94, 0.9);
  }

  &.health-partial,
  &.health-checking {
    background: rgba(251, 191, 36, 0.9);
  }

  &.health-disconnected,
  &.health-unknown {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
  }
}

.disconnected-icon {
  position: relative;
  width: 8px;
  height: 8px;

  &::before,
  &::after {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 2px;
    content: '';
    background: rgba(255, 255, 255, 0.7);
    border-radius: 1px;
  }

  &::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }

  &::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }
}

.health-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.btn-delete {
  position: absolute;
  top: 8px;
  right: 34px;
  z-index: 2;
  padding: 4px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;

  &:hover,
  &:focus-visible {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.15);
    opacity: 1;
  }
}

.card-body {
  display: block;
  position: relative;
  z-index: 0;
  padding: 20px;
}

.source-name {
  display: block;
  margin: 0 0 4px;
  color: var(--color-text);
  font-size: 1.1rem;
  font-weight: 600;
}

.source-engine {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.source-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
