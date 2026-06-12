<template>
  <div 
    class="table-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', table)"
  >
    <div class="card-header">
      <div class="breadcrumb">
        <span class="db-icon">🐘</span>
        <span class="path">{{ table.schema || 'public' }}</span>
        <span class="separator">/</span>
        <span class="path">{{ table.name }}</span>
      </div>
    </div>

    <div class="card-body">
      <div class="table-name">
        <span class="name">{{ table.name }}</span>
        <span class="tier-badge" :class="tierClass">{{ tier }}</span>
      </div>
      
      <p class="table-description">
        {{ table.description || '테이블 설명이 없습니다' }}
      </p>
    </div>

    <div class="card-footer">
      <div class="meta-info">
        <span class="meta-item">
          <span class="meta-label">도메인들 없음</span>
        </span>
        <span class="meta-separator">•</span>
        <span class="meta-item">
          <span class="owners-badge">
            <span class="owner-icon">👤</span>
            <span>0</span>
          </span>
          <span class="warning-badge" v-if="!hasOwner">!</span>
        </span>
        <span class="meta-separator">•</span>
        <span class="meta-item tier-info">
          <span class="tier-icon">◉</span>
          <span>{{ tier }}</span>
        </span>
        <span class="meta-separator">•</span>
        <span class="meta-item usage">
          사용량 {{ usagePercentile }}th 백분위수
        </span>
      </div>
    </div>

    <div class="column-count-badge">
      {{ table.column_count }} columns
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Text2SqlTableInfo } from '@/types'

const props = defineProps<{
  table: Text2SqlTableInfo
  isSelected: boolean
}>()

defineEmits<{
  (e: 'select', table: Text2SqlTableInfo): void
}>()

// Tier 계산 (컬럼 수 기반 가상 계산)
const tier = computed(() => {
  const colCount = props.table.column_count
  if (colCount > 15) return 'Tier1'
  if (colCount > 10) return 'Tier2'
  if (colCount > 5) return 'Tier3'
  return 'Tier4'
})

const tierClass = computed(() => {
  return tier.value.toLowerCase()
})

// 가상 데이터 - 실제로는 API에서 받아올 수 있음
const hasOwner = computed(() => props.table.column_count > 10)
const usagePercentile = computed(() => Math.floor(Math.random() * 100))
</script>

<style scoped>
.table-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.table-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
  transform: translateY(-1px);
}

.table-card.selected {
  border-color: #3b82f6;
  background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.15);
}

.card-header {
  margin-bottom: 0.75rem;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.db-icon {
  font-size: 0.875rem;
}

.path {
  color: #6b7280;
}

.separator {
  color: #d1d5db;
}

.card-body {
  margin-bottom: 0.75rem;
}

.table-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2563eb;
}

.tier-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.tier-badge.tier1 {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: #92400e;
}

.tier-badge.tier2 {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #1e40af;
}

.tier-badge.tier3 {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
}

.tier-badge.tier4 {
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  color: #4b5563;
}

.table-description {
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  border-top: 1px solid #f3f4f6;
  padding-top: 0.75rem;
}

.meta-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #9ca3af;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.meta-separator {
  color: #d1d5db;
}

.owners-badge {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 8px;
}

.owner-icon {
  font-size: 0.7rem;
}

.warning-badge {
  background: #fef3c7;
  color: #d97706;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
}

.tier-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.tier-icon {
  color: #10b981;
  font-size: 0.5rem;
}

.usage {
  color: #9ca3af;
}

.column-count-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  font-size: 0.7rem;
  color: #6b7280;
  background: #f3f4f6;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 500;
}
</style>



