<template>
  <div class="data-table-section">
    <div class="table-header">
      <h5>📋 원천 데이터</h5>
      <span class="column-count">{{ columns.length }}개 컬럼</span>
    </div>
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">
              {{ column }}
              <span v-if="timeColumns.includes(column)" class="col-type time">📅</span>
              <span v-else-if="numericColumns.includes(column)" class="col-type numeric">#</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows.slice(0, 50)" :key="index">
            <td v-for="column in columns" :key="column">{{ formatCellValue(row[column]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="rows.length > 50" class="table-footer">
      처음 50개 행만 표시됨 (전체 {{ rowCount }}행)
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  columns: string[]
  timeColumns: string[]
  numericColumns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
}>()

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  }
  if (typeof value === 'string' && value.includes('T')) {
    try {
      const date = new Date(value)
      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return value
    }
  }
  return String(value)
}
</script>

<style scoped>
.data-table-section {
  margin-top: 16px;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.table-header h5 {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
}

.column-count,
.table-footer {
  color: rgba(255, 255, 255, 0.46);
  font-size: 0.7rem;
}

.data-table-wrapper {
  max-width: 100%;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
}

th,
td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.72);
  text-align: left;
  white-space: nowrap;
}

th {
  position: sticky;
  top: 0;
  background: #191927;
  color: rgba(255, 255, 255, 0.9);
}

.col-type {
  margin-left: 4px;
  opacity: 0.7;
}

.table-footer {
  padding: 9px 4px;
  text-align: center;
}

:global(.light-mode) th {
  background: #f8fafc;
  color: #1e293b;
}

:global(.light-mode) td {
  border-bottom-color: rgba(15, 23, 42, 0.08);
  color: #475569;
}
</style>
