<template>
  <div class="ontology-node-data-summary">
    <div class="data-source-info">
      <span class="source-label">{{ isObjectType ? '📦 ObjectType' : '🗄️ 테이블' }}</span>
      <code>{{ dataSource }}</code>
      <span class="row-count">{{ rowCount }}행</span>
      <span v-if="businessDayFiltered" class="biz-day-badge">📅 영업일 필터 적용됨</span>
    </div>
    <div class="business-day-filter-toggle">
      <label class="toggle-label">
        <input
          type="checkbox"
          :checked="businessDayFilterEnabled"
          @change="emit('toggle-business-day', ($event.target as HTMLInputElement).checked)"
        />
        <span class="toggle-switch"></span>
        <span class="toggle-text">📅 영업일 캘린더 적용</span>
      </label>
      <span class="toggle-desc">비영업일(주말/공휴일) 데이터를 타임시리즈에서 제외합니다</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isObjectType: boolean
  dataSource?: string
  rowCount: number
  businessDayFiltered: boolean
  businessDayFilterEnabled: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle-business-day', enabled: boolean): void
}>()
</script>

<style scoped>
.data-source-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.76rem;
}

.data-source-info code {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #93c5fd;
}

.row-count,
.biz-day-badge {
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.biz-day-badge {
  color: #86efac;
}

.business-day-filter-toggle {
  display: grid;
  gap: 5px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.025);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.toggle-desc {
  color: rgba(255, 255, 255, 0.42);
  font-size: 0.7rem;
}

input:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

:global(.light-mode) .data-source-info,
:global(.light-mode) .toggle-label {
  color: #475569;
}

:global(.light-mode) .business-day-filter-toggle {
  border-color: rgba(15, 23, 42, 0.1);
  background: rgba(15, 23, 42, 0.02);
}

:global(.light-mode) .toggle-desc {
  color: #94a3b8;
}
</style>
