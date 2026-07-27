<template>
  <div v-if="loading" class="data-loading" role="status">
    <div class="loading-spinner small"></div>
    <span>데이터 조회 중...</span>
  </div>
  <div v-else class="no-data">
    <span>📭</span>
    <p v-if="!hasDataSource">연결된 데이터 소스가 없습니다.</p>
    <p v-else-if="message">{{ message }}</p>
    <p v-else>데이터 조회에 실패했습니다. 다시 시도해주세요.</p>
    <div v-if="error" class="error-detail" role="alert">
      <strong>에러 상세:</strong> {{ error }}
    </div>
    <div class="no-data-actions">
      <button v-if="hasDataSource" type="button" class="action-btn small" @click="emit('retry')">
        🔄 다시 조회
      </button>
      <button
        v-if="hasDataSource && fallbackAvailable"
        type="button"
        class="action-btn small secondary"
        title="온톨로지 필터 대신 연결된 테이블의 원본 데이터를 Text2SQL로 조회합니다"
        @click="emit('fallback')"
      >
        원본 데이터 직접 조회
      </button>
      <button v-else type="button" class="action-btn small" @click="emit('connect')">
        🔗 데이터 소스 연결
      </button>
      <button
        v-if="!hasDataSource && isMeasure"
        type="button"
        class="action-btn small secondary"
        @click="emit('create-object-type')"
      >
        📦 ObjectType 생성
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  loading: boolean
  hasDataSource: boolean
  message?: string
  error?: string
  fallbackAvailable: boolean
  isMeasure: boolean
}>()

const emit = defineEmits<{
  (event: 'retry' | 'fallback' | 'connect' | 'create-object-type'): void
}>()
</script>

<style scoped>
.data-loading,
.no-data {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 30px 16px;
  color: rgba(255, 255, 255, 0.58);
  text-align: center;
}

.error-detail {
  box-sizing: border-box;
  max-width: 100%;
  padding: 8px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 0.75rem;
  word-break: break-word;
}

.no-data-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  min-height: 34px;
  padding: 7px 11px;
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 7px;
  background: rgba(99, 102, 241, 0.12);
  color: #c7d2fe;
  cursor: pointer;
}

.action-btn.secondary {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.74);
}

button:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
</style>
