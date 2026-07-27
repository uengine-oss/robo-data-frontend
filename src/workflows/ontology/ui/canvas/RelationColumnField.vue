<template>
  <div class="detail-row">
    <label :for="selectId">
      {{ side === 'from' ? 'From' : 'To' }} 필드
      <span class="field-node-hint">({{ nodeName }})</span>
    </label>
    <span v-if="status === 'loading'" class="field-status loading" role="status">
      컬럼 정보 로딩 중...
    </span>
    <div v-else-if="status === 'no_datasource'" class="field-status no-datasource">
      <span>데이터 소스가 연결되지 않았습니다.</span>
      <button type="button" class="link-datasource-btn-sm" @click="emit('connect-datasource')">
        연결
      </button>
    </div>
    <div v-else-if="status === 'error'" class="field-status error" role="alert">
      {{ error || `${side === 'from' ? 'From' : 'To'} 노드의 컬럼 정보를 조회할 수 없습니다.` }}
    </div>
    <select
      v-else
      :id="selectId"
      :value="value"
      class="form-select"
      @change="emit('update', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">(미설정)</option>
      <option v-for="column in columns" :key="column" :value="column">{{ column }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FieldMappingStatus } from '../../model/relationFieldMapping'

const props = defineProps<{
  side: 'from' | 'to'
  nodeName: string
  value: string
  status: FieldMappingStatus
  error: string
  columns: readonly string[]
}>()

const emit = defineEmits<{
  (event: 'update', value: string): void
  (event: 'connect-datasource'): void
}>()

const selectId = computed(() => `ontology-relation-${props.side}-field`)
</script>

<style scoped>
.detail-row {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
  font-weight: 500;
}

.field-node-hint {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.7rem;
  font-weight: 400;
}

.field-status {
  box-sizing: border-box;
  width: 100%;
  border-radius: 10px;
  font-size: 0.8rem;
  line-height: 1.5;
}

.field-status.loading {
  color: rgba(255, 255, 255, 0.55);
}

.field-status.no-datasource {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.7);
}

.field-status.error {
  padding: 10px 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.form-select {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.92);
  color-scheme: dark;
  font: inherit;
}

.link-datasource-btn-sm {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.14);
  color: #93c5fd;
  font-size: 0.75rem;
  cursor: pointer;
}

:global(.light-mode) label {
  color: #475569;
}

:global(.light-mode) .field-node-hint {
  color: #94a3b8;
}

:global(.light-mode) .field-status.loading {
  color: #64748b;
}

:global(.light-mode) .field-status.no-datasource {
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.02);
  color: #475569;
}

:global(.light-mode) .field-status.error {
  border-color: rgba(239, 68, 68, 0.18);
  background: rgba(239, 68, 68, 0.06);
  color: #dc2626;
}

:global(.light-mode) .form-select {
  border-color: rgba(0, 0, 0, 0.15);
  background: rgba(0, 0, 0, 0.02);
  color: #1e293b;
  color-scheme: light;
}

:global(.light-mode) .link-datasource-btn-sm {
  border-color: rgba(59, 130, 246, 0.22);
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
}
</style>
