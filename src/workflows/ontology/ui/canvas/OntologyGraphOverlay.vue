<script setup lang="ts">
interface CanvasLayerPresentation {
  id: string
  name: string
  color: string
}

const props = defineProps<{
  pendingRelationshipSourceName: string | null
  relationshipModeActive: boolean
  relationshipModeDisabled: boolean
  layers: readonly CanvasLayerPresentation[]
}>()

const emit = defineEmits<{
  cancelPendingRelationship: []
  toggleRelationshipMode: []
}>()

function relationshipModeLabel(): string {
  return props.relationshipModeActive
    ? '연결 모드 끄기 (노드 이동 모드로 전환)'
    : '연결 모드 켜기 (노드 가장자리 드래그로 관계 생성)'
}
</script>

<template>
  <div
    v-if="pendingRelationshipSourceName"
    class="relation-pending-banner"
    role="status"
    aria-live="polite"
  >
    <span class="relation-pending-badge">🔗 관계 생성</span>
    <span class="relation-pending-text">
      <strong>{{ pendingRelationshipSourceName }}</strong>에서 연결할 노드를 클릭하세요
    </span>
    <button
      type="button"
      class="relation-pending-cancel"
      aria-label="관계 생성 취소"
      @click="emit('cancelPendingRelationship')"
    >
      취소
    </button>
  </div>

  <div class="graph-floating-toolbar">
    <button
      type="button"
      class="floating-tool-btn"
      :class="{ active: relationshipModeActive }"
      :disabled="relationshipModeDisabled"
      :aria-label="relationshipModeLabel()"
      :aria-pressed="relationshipModeActive"
      :title="relationshipModeLabel()"
      @click="emit('toggleRelationshipMode')"
    >
      <span class="floating-tool-icon" aria-hidden="true">🔗</span>
    </button>
  </div>

  <div class="graph-legend" role="group" aria-label="온톨로지 그래프 범례">
    <div
      v-for="layer in layers"
      :key="layer.id"
      class="legend-item"
      :style="{ color: layer.color }"
    >
      <span class="legend-dot" :style="{ backgroundColor: layer.color }"></span>
      {{ layer.name }}
    </div>
    <div class="legend-divider" aria-hidden="true">|</div>
    <div class="legend-item edge-legend">
      <span class="edge-line causes"></span> CAUSES
    </div>
    <div class="legend-item edge-legend">
      <span class="edge-line measured"></span> MEASURED_AS
    </div>
    <div class="legend-item edge-legend">
      <span class="edge-line produces"></span> PRODUCES
    </div>
  </div>
</template>

<style scoped>
.graph-floating-toolbar {
  position: absolute;
  bottom: 56px;
  left: 16px;
  z-index: 20;
  display: flex;
  gap: 6px;
}

.floating-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(30, 30, 45, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: all 0.2s ease;
}

.floating-tool-btn:hover:not(:disabled) {
  background: rgba(34, 211, 238, 0.12);
  border-color: rgba(34, 211, 238, 0.4);
  transform: scale(1.08);
}

.floating-tool-btn.active {
  background: #06b6d4;
  border-color: #06b6d4;
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.45);
}

.floating-tool-btn:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}

.floating-tool-icon {
  font-size: 1.1rem;
}

.relation-pending-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 20;
  display: flex;
  align-items: center;
  padding: 10px 16px;
  gap: 10px;
  white-space: nowrap;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(8, 47, 73, 0.35);
  backdrop-filter: blur(10px);
  transform: translateX(-50%);
  animation: slide-down-banner 0.2s ease;
}

@keyframes slide-down-banner {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.relation-pending-badge {
  color: #67e8f9;
  font-size: 0.8rem;
  font-weight: 700;
}

.relation-pending-text {
  color: rgba(226, 232, 240, 0.92);
  font-size: 0.82rem;
}

.relation-pending-text strong {
  color: #67e8f9;
}

.relation-pending-cancel {
  padding: 4px 10px;
  color: #fca5a5;
  font-size: 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.relation-pending-cancel:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

.graph-legend {
  position: absolute;
  bottom: 16px;
  left: 50%;
  z-index: 10;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 20px;
  gap: 16px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.75rem;
  background: rgba(30, 30, 40, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  transform: translateX(-50%);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-divider {
  color: var(--color-border);
}

.edge-legend {
  gap: 4px;
}

.edge-line {
  display: inline-block;
  width: 20px;
  height: 2px;
}

.edge-line.causes {
  background: #ef4444;
}

.edge-line.measured {
  background: #22c55e;
}

.edge-line.produces {
  background: #3b82f6;
}

:global(.light-mode) .graph-floating-toolbar .floating-tool-btn {
  background: rgba(255, 255, 255, 0.92) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
}

:global(.light-mode) .graph-floating-toolbar .floating-tool-btn:hover:not(:disabled) {
  background: rgba(8, 145, 178, 0.08) !important;
  border-color: rgba(8, 145, 178, 0.3) !important;
}

:global(.light-mode) .graph-floating-toolbar .floating-tool-btn.active {
  background: #0891b2 !important;
  border-color: #0891b2 !important;
  box-shadow: 0 4px 16px rgba(8, 145, 178, 0.3) !important;
}

:global(.light-mode) .relation-pending-banner {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(8, 145, 178, 0.2) !important;
  box-shadow: 0 8px 20px rgba(148, 163, 184, 0.18) !important;
}

:global(.light-mode) .relation-pending-badge,
:global(.light-mode) .relation-pending-text strong {
  color: #0f766e !important;
}

:global(.light-mode) .relation-pending-text {
  color: #334155 !important;
}

:global(.light-mode) .relation-pending-cancel {
  color: #dc2626 !important;
  background: rgba(239, 68, 68, 0.06) !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
}

:global(.light-mode) .graph-legend {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:global(.light-mode) .legend-item {
  color: #475569 !important;
}

@media (max-width: 720px) {
  .relation-pending-banner {
    left: 8px;
    right: 8px;
    max-width: calc(100% - 16px);
    flex-wrap: wrap;
    white-space: normal;
    z-index: 60;
    transform: none;
    animation: none;
  }

  .relation-pending-text {
    min-width: 0;
    flex: 1;
  }

  .graph-legend {
    right: 8px;
    bottom: 8px;
    left: 52px;
    max-width: calc(100% - 68px);
    max-height: 88px;
    padding: 8px 10px;
    overflow: auto;
    transform: none;
  }
}
</style>
