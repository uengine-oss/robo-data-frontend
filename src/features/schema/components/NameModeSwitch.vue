<script setup lang="ts">
// 논리명/물리명 전환 토글 — 그래프 탭(.name-toggle)과 동일 스타일·키보드 접근(button). spec 044.
import { useSchemaCanvasStore } from '@/features/schema/schemaCanvas'

const store = useSchemaCanvasStore()
</script>

<template>
  <button
    type="button"
    class="name-toggle"
    :aria-pressed="store.showLogicalNames"
    :title="store.showLogicalNames ? '논리명 표시 중 — 클릭하면 물리명' : '물리명 표시 중 — 클릭하면 논리명'"
    @click="store.toggleLogicalNames()"
  >
    <span class="toggle-track" :class="{ active: store.showLogicalNames }">
      <span class="toggle-thumb" />
    </span>
    <span class="toggle-text">{{ store.showLogicalNames ? '논리명' : '물리명' }}</span>
  </button>
</template>

<style scoped>
.name-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 10px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  box-shadow: var(--shadow-md);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.name-toggle:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-text-muted);
}

.toggle-track {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  transition: background 0.18s ease, border-color 0.18s ease;
}

.toggle-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-text-light);
  transition: transform 0.18s ease, background 0.18s ease;
}

.toggle-track.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.toggle-track.active .toggle-thumb {
  transform: translateX(12px);
  background: #fff;
}

.toggle-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-bright);
  letter-spacing: 0.2px;
}
</style>
