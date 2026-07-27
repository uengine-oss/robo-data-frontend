<script setup lang="ts">
import type { DataSource, DataSourceTable } from '../api/contracts.ts'
import { getConnectorPresentation } from '../catalog/connectorPresentation.ts'

defineProps<{
  datasource: DataSource
  tables: DataSourceTable[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  retry: []
}>()
</script>

<template>
  <aside class="detail-panel" aria-labelledby="datasource-detail-title">
    <header class="panel-header">
      <div class="panel-title">
        <span
          class="panel-icon"
          :style="{ background: getConnectorPresentation(datasource.engine).gradient }"
          aria-hidden="true"
        >
          {{ getConnectorPresentation(datasource.engine).icon }}
        </span>
        <div>
          <h3 id="datasource-detail-title">
            {{ datasource.display_name || datasource.name }}
          </h3>
          <span class="panel-engine">{{ datasource.engine }}</span>
        </div>
      </div>
      <button
        type="button"
        class="btn-close-panel"
        aria-label="데이터 소스 상세 닫기"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div class="panel-content">
      <section class="panel-section" aria-labelledby="datasource-tables-title">
        <h4 id="datasource-tables-title">📋 실제 DB 테이블</h4>
        <div v-if="loading" class="empty-section" role="status">
          테이블을 불러오는 중...
        </div>
        <div v-else-if="error" class="error-alert" role="alert">
          <span>{{ error }}</span>
          <button type="button" class="btn-retry" @click="emit('retry')">
            다시 시도
          </button>
        </div>
        <div v-else-if="tables.length === 0" class="empty-section">
          테이블이 없습니다
        </div>
        <div v-else class="table-list">
          <div v-for="table in tables" :key="table.name" class="table-item">
            <span class="table-name">{{ table.name }}</span>
            <span v-if="table.column_count" class="table-count">
              {{ table.column_count }} 컬럼
            </span>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.detail-panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  max-height: 50%;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.15);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;

  h3 {
    margin: 0;
    overflow: hidden;
    font-size: 1.1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.panel-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 1.5rem;
  border-radius: 12px;
}

.panel-engine {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.btn-close-panel {
  padding: 8px 12px;
  color: var(--color-text-muted);
  font-size: 1.25rem;
  cursor: pointer;
  background: none;
  border: none;
}

.panel-content {
  flex: 1;
  min-height: 0;
  padding: 20px 24px;
  overflow-y: auto;
}

.panel-section h4 {
  margin: 0 0 12px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.empty-section {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-style: italic;
}

.error-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.btn-retry {
  flex-shrink: 0;
  padding: 8px 14px;
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.table-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--color-bg);
  border-radius: 8px;
}

.table-name {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
}

.table-count {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

@media (max-width: 600px) {
  .detail-panel {
    max-height: 60%;
    border-radius: 16px 16px 0 0;
  }

  .panel-header,
  .panel-content {
    padding: 14px 16px;
  }
}
</style>
