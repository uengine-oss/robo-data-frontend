<template>
  <div class="result-table">
    <div class="table-header">
      <h3>
        <IconTable :size="14" />
        결과 ({{ data.row_count }}행)
      </h3>
      <span class="execution-time">
        <IconPlay :size="12" />
        {{ data.execution_time_ms }}ms
      </span>
    </div>
    
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th v-for="col in data.columns" :key="col">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in visibleRows" :key="idx">
            <td v-for="(cell, cidx) in row" :key="cidx">
              {{ formatCell(cell) }}
            </td>
          </tr>
        </tbody>
      </table>
      
      <!-- 더 많은 행이 있을 때 표시 -->
      <div v-if="hasMoreRows" class="more-rows-indicator">
        <button @click="showMore" class="show-more-btn">
          {{ remainingRows }}개 더 보기...
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ReactExecutionResult } from '../model/react'
import { IconTable, IconPlay } from '@/shared/icons'

const props = withDefaults(defineProps<{
  data: ReactExecutionResult
  maxRows?: number
}>(), {
  maxRows: 50  // 기본 최대 표시 행 수
})

const displayLimit = ref(props.maxRows)

const visibleRows = computed(() => {
  if (!props.data.rows) return []
  return props.data.rows.slice(0, displayLimit.value)
})

const hasMoreRows = computed(() => {
  return props.data.rows && props.data.rows.length > displayLimit.value
})

const remainingRows = computed(() => {
  if (!props.data.rows) return 0
  return Math.max(0, props.data.rows.length - displayLimit.value)
})

function showMore() {
  displayLimit.value += props.maxRows
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    return value.toLocaleString()
  }
  const str = String(value)
  // 긴 문자열 축소
  return str.length > 100 ? str.slice(0, 100) + '...' : str
}
</script>

<style scoped lang="scss">
.result-table {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.table-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.execution-time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-success);
}

.table-wrapper {
  overflow-x: auto;
  max-height: 400px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: var(--color-bg-tertiary);
  position: sticky;
  top: 0;
}

th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-light);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  font-size: 12px;
}

td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 13px;
}

tbody tr:hover {
  background: var(--color-bg-tertiary);
}

.more-rows-indicator {
  padding: 12px;
  text-align: center;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.show-more-btn {
  padding: 6px 16px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
    border-color: var(--color-accent);
  }
}
</style>
