<template>
  <div
    id="ontology-node-panel-info"
    class="ontology-node-info"
    role="tabpanel"
    aria-labelledby="ontology-node-tab-info"
  >
    <div class="detail-row">
      <label>이름</label>
      <div class="editable-name-container">
        <input
          v-if="isEditingName"
          ref="nameInput"
          :value="editingNameValue"
          class="node-name-edit-input"
          @input="emit('update-name', ($event.target as HTMLInputElement).value)"
          @blur="emit('save-name')"
          @keyup.enter="emit('save-name')"
          @keyup.esc="emit('cancel-name')"
        />
        <span v-else class="editable-node-name">{{ node.name }}</span>
        <button
          v-if="!isEditingName"
          type="button"
          class="edit-name-btn"
          :aria-label="`${node.name} 노드 이름 편집`"
          @click="emit('start-name')"
        >
          ✏️
        </button>
      </div>
    </div>

    <div class="detail-row">
      <label>레이어</label>
      <div class="layer-selector-wrapper">
        <button
          type="button"
          class="layer-badge layer-badge-clickable"
          :style="{ backgroundColor: currentLayerColor }"
          aria-label="노드 레이어 변경"
          :aria-expanded="layerSelectorOpen"
          aria-controls="selected-node-layer-options"
          title="레이어 변경"
          @click="emit('toggle-layer-selector')"
        >
          {{ currentLayerId }}
          <span class="layer-badge-arrow">▾</span>
        </button>
        <div
          v-if="layerSelectorOpen"
          id="selected-node-layer-options"
          class="layer-selector-dropdown"
        >
          <button
            v-for="layer in layers"
            :key="layer.id"
            type="button"
            class="layer-selector-item"
            :class="{ active: currentLayerId === layer.id }"
            :style="{ '--layer-color': layer.color }"
            :aria-pressed="currentLayerId === layer.id"
            @click="emit('change-layer', layer.id)"
          >
            <span class="layer-selector-icon">{{ layer.icon }}</span>
            <span class="layer-selector-name">{{ layer.name }}</span>
            <span class="layer-selector-dot" :style="{ backgroundColor: layer.color }"></span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="node.description" class="detail-row">
      <label>설명</label>
      <span>{{ node.description }}</span>
    </div>
    <div v-if="node.unit" class="detail-row">
      <label>단위</label>
      <span>{{ node.unit }}</span>
    </div>
    <div v-if="node.formula" class="detail-row">
      <label>공식</label>
      <code>{{ node.formula }}</code>
    </div>
    <div v-if="node.targetValue" class="detail-row">
      <label>목표값</label>
      <span>{{ node.targetValue }}</span>
    </div>

    <div v-if="filterChips.length > 0" class="detail-row">
      <label>🔍 적용된 필터</label>
      <div class="filter-chips">
        <div
          v-for="chip in filterChips"
          :key="`${chip.label}:${String(chip.value)}:${chip.fromNodeName ?? ''}`"
          class="filter-chip"
          :class="chip.type"
        >
          <span class="chip-label">{{ chip.label }}</span>
          <span class="chip-equals">=</span>
          <span class="chip-value">{{ chip.value }}</span>
          <span v-if="chip.fromNodeName" class="chip-source" :title="`상위 노드: ${chip.fromNodeName}`">
            ← {{ chip.fromNodeName }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="node.dataSource" class="detail-row">
      <label>데이터 소스</label>
      <div class="datasource-info">
        <div class="datasource-content">
          <code class="datasource-badge">{{ node.dataSource }}</code>
          <span v-if="node.dataSourceSchema" class="datasource-meta">
            {{ dataSourceColumnCount }}개 컬럼
          </span>
        </div>
        <button
          type="button"
          class="reset-datasource-btn"
          title="데이터 소스 재설정"
          @click="emit('open-datasource')"
        >
          🔄 재설정
        </button>
      </div>
    </div>
    <div v-else class="detail-row">
      <label>데이터 소스</label>
      <span class="no-datasource">연결되지 않음</span>
      <button type="button" class="link-datasource-btn" @click="emit('open-datasource')">
        🔗 연결하기
      </button>
    </div>

    <div class="related-section">
      <h4>🔗 연결된 관계</h4>
      <div class="relation-list">
        <div v-for="relation in relationships" :key="relation.id" class="relation-item">
          <div class="rel-main">
            <span class="rel-source">{{ relation.sourceName }}</span>
            <span class="rel-type" :class="relation.type.toLowerCase()">{{ relation.type }}</span>
            <span class="rel-target">{{ relation.targetName }}</span>
          </div>
          <div v-if="relation.fromField && relation.toField" class="rel-field-mapping">
            <span class="rel-field">{{ relation.fromField }}</span>
            <span class="rel-field-arrow">→</span>
            <span class="rel-field">{{ relation.toField }}</span>
          </div>
          <button
            type="button"
            class="relation-edit-btn"
            :aria-label="`${relation.sourceName}에서 ${relation.targetName} ${relation.type} 관계 편집`"
            @click="emit('edit-relation', relation.id)"
          >
            ✏️ 편집
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { OntologyCanvasNode } from '../../application/ontologyCanvasSchema'

export interface OntologyNodeInfoLayer {
  id: string
  name: string
  color: string
  icon: string
}

export interface OntologyNodeInfoFilterChip {
  label: string
  value: unknown
  type: 'direct' | 'cascade'
  fromNodeName?: string
}

export interface OntologyNodeInfoRelationship {
  id: string
  type: string
  sourceName: string
  targetName: string
  fromField?: string
  toField?: string
}

const props = defineProps<{
  node: OntologyCanvasNode
  layers: readonly OntologyNodeInfoLayer[]
  isEditingName: boolean
  editingNameValue: string
  layerSelectorOpen: boolean
  dataSourceColumnCount: number
  filterChips: readonly OntologyNodeInfoFilterChip[]
  relationships: readonly OntologyNodeInfoRelationship[]
}>()

const emit = defineEmits<{
  (event: 'update-name', value: string): void
  (event: 'start-name' | 'save-name' | 'cancel-name' | 'toggle-layer-selector' | 'open-datasource'): void
  (event: 'change-layer' | 'edit-relation', id: string): void
}>()

const nameInput = ref<HTMLInputElement | null>(null)
const currentLayerId = computed(() => props.node.layer || props.node.label)
const currentLayerColor = computed(
  () => props.layers.find(layer => layer.id === currentLayerId.value)?.color ?? '',
)

watch(
  () => props.isEditingName,
  editing => {
    if (!editing) return
    void nextTick(() => {
      nameInput.value?.focus()
      nameInput.value?.select()
    })
  },
)
</script>

<style scoped>
.ontology-node-info {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.detail-row {
  margin-bottom: 16px;
}

.detail-row > label {
  display: block;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
}

.detail-row > span,
.detail-row > code {
  color: rgba(255, 255, 255, 0.86);
  font-size: 0.86rem;
}

.editable-name-container,
.datasource-info,
.datasource-content,
.rel-main,
.rel-field-mapping {
  display: flex;
  align-items: center;
}

.editable-name-container {
  gap: 8px;
}

.editable-node-name {
  flex: 1;
  min-width: 0;
  color: rgba(255, 255, 255, 0.9);
  overflow-wrap: anywhere;
}

.node-name-edit-input {
  box-sizing: border-box;
  min-width: 0;
  flex: 1;
  padding: 8px 10px;
  border: 1px solid rgba(99, 102, 241, 0.55);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font: inherit;
}

.edit-name-btn,
.reset-datasource-btn,
.link-datasource-btn,
.relation-edit-btn {
  border-radius: 7px;
  cursor: pointer;
}

.edit-name-btn {
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
}

.layer-selector-wrapper {
  position: relative;
}

.layer-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  font-size: 0.75rem;
}

.layer-badge-clickable {
  cursor: pointer;
}

.layer-selector-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: grid;
  min-width: 190px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: #191927;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
}

.layer-selector-item {
  display: grid;
  grid-template-columns: 22px 1fr 10px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  text-align: left;
  cursor: pointer;
}

.layer-selector-item:hover,
.layer-selector-item.active {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.layer-selector-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.filter-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 4px 7px;
  border: 1px solid rgba(96, 165, 250, 0.22);
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.1);
  color: #bfdbfe;
  font-size: 0.7rem;
  overflow-wrap: anywhere;
}

.filter-chip.cascade {
  border-color: rgba(167, 139, 250, 0.25);
  background: rgba(139, 92, 246, 0.1);
}

.chip-source {
  color: rgba(196, 181, 253, 0.7);
}

.datasource-info {
  justify-content: space-between;
  gap: 10px;
}

.datasource-content {
  min-width: 0;
  gap: 8px;
  flex-wrap: wrap;
}

.datasource-badge {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: #93c5fd;
}

.datasource-meta,
.no-datasource {
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.72rem;
}

.reset-datasource-btn,
.link-datasource-btn {
  padding: 6px 10px;
  border: 1px solid rgba(96, 165, 250, 0.28);
  background: rgba(59, 130, 246, 0.1);
  color: #93c5fd;
  font-size: 0.74rem;
}

.related-section {
  margin-top: 22px;
}

.related-section h4 {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.84rem;
}

.relation-list {
  display: grid;
  gap: 8px;
}

.relation-item {
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.025);
}

.rel-main,
.rel-field-mapping {
  min-width: 0;
  gap: 6px;
  flex-wrap: wrap;
}

.rel-source,
.rel-target {
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.75rem;
}

.rel-type {
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 0.65rem;
}

.rel-field-mapping {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
}

.relation-edit-btn {
  justify-self: end;
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.7rem;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

:global(.light-mode) .ontology-node-info {
  color: #1e293b;
}

:global(.light-mode) .detail-row > label,
:global(.light-mode) .datasource-meta,
:global(.light-mode) .no-datasource {
  color: #64748b;
}

:global(.light-mode) .detail-row > span,
:global(.light-mode) .detail-row > code,
:global(.light-mode) .editable-node-name,
:global(.light-mode) .rel-source,
:global(.light-mode) .rel-target {
  color: #334155;
}

:global(.light-mode) .node-name-edit-input {
  background: #fff;
  color: #0f172a;
}

:global(.light-mode) .layer-selector-dropdown {
  border-color: rgba(15, 23, 42, 0.12);
  background: #fff;
}

:global(.light-mode) .layer-selector-item {
  color: #475569;
}

:global(.light-mode) .layer-selector-item:hover,
:global(.light-mode) .layer-selector-item.active {
  background: #f1f5f9;
  color: #0f172a;
}

:global(.light-mode) .related-section h4 {
  color: #334155;
}

:global(.light-mode) .relation-item {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(15, 23, 42, 0.02);
}
</style>
