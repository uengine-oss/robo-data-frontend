<script setup lang="ts">
/**
 * OntologyViewerRemote.vue
 * air-swmm/frontend 앱을 Module Federation으로 로드하는 래퍼 컴포넌트
 */
import { defineAsyncComponent, ref } from 'vue'

const loadError = ref<string | null>(null)
const isLoading = ref(true)

const AirSwmmApp = defineAsyncComponent({
  loader: () => import(/* @vite-ignore */ 'airSwmmApp/App').catch((err: Error) => {
    loadError.value = `원격 모듈 로드 실패: ${err.message}`
    isLoading.value = false
    return { template: '<div></div>' }
  }),
  loadingComponent: {
    template: '<div class="remote-loading"><div class="spinner"></div><span>온톨로지 뷰어 로드 중...</span></div>'
  },
  errorComponent: {
    template: '<div class="remote-error">원격 모듈을 로드할 수 없습니다. air-swmm 서비스가 실행 중인지 확인해주세요.</div>'
  },
  delay: 200,
  timeout: 15000,
  onError(error, retry, fail) {
    loadError.value = error.message
    fail()
  }
})
</script>

<template>
  <div class="ontology-viewer-remote">
    <div v-if="loadError" class="remote-error">
      <div class="error-icon">⚠</div>
      <div class="error-text">
        <p>온톨로지 뷰어를 로드할 수 없습니다.</p>
        <p class="error-detail">{{ loadError }}</p>
        <p class="error-hint">air-swmm 서비스(포트 5173)가 실행 중인지 확인해주세요.</p>
      </div>
    </div>
    <AirSwmmApp v-else />
  </div>
</template>

<style scoped>
.ontology-viewer-remote {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.remote-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--color-text-muted, #888);
}

.remote-loading .spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border, #333);
  border-top-color: var(--color-accent, #0d6efd);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.remote-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  padding: 40px;
  color: var(--color-text-muted, #888);
}

.error-icon {
  font-size: 48px;
  color: #f59e0b;
}

.error-text p {
  margin: 4px 0;
}

.error-detail {
  font-size: 12px;
  color: #f88;
  font-family: monospace;
}

.error-hint {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-top: 8px !important;
}
</style>
