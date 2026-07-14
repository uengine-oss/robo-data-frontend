import { defineAsyncComponent } from 'vue'

/** Monaco와 언어 정의는 원문 코드가 실제로 표시될 때만 로드한다. */
export const AsyncCodeViewer = defineAsyncComponent(() => import('./CodeViewer.vue'))
