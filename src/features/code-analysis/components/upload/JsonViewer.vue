<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  json: string
}

const props = defineProps<Props>()

// JSON을 예쁘게 포맷
const formattedJson = computed(() => {
  try {
    const parsed = JSON.parse(props.json)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return props.json
  }
})

// 구문 강조 적용
const highlightedJson = computed(() => {
  return formattedJson.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 문자열 (키가 아닌)
    .replace(/: "(.*?)"/g, ': <span class="json-string">"$1"</span>')
    // 키
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    // 숫자
    .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
    // boolean
    .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
    // null
    .replace(/: (null)/g, ': <span class="json-null">$1</span>')
})
</script>

<template>
  <div class="json-viewer">
    <pre class="json-code" v-html="highlightedJson"></pre>
  </div>
</template>

<style lang="scss" scoped>
.json-viewer {
  height: 100%;
  overflow: auto;
}

.json-code {
  margin: 0;
  padding: 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
  color: #8a8a8a; // 기본 텍스트 (괄호, 콤마 등)
  
  :deep(.json-key) {
    color: #6b9bd2; // 키 - 좀 더 어두운 파란색
  }
  
  :deep(.json-string) {
    color: #c17d5e; // 문자열 - 좀 더 어두운 주황색
  }
  
  :deep(.json-number) {
    color: #8fac7e; // 숫자 - 좀 더 어두운 녹색
  }
  
  :deep(.json-boolean) {
    color: #4a8ac7; // boolean - 좀 더 어두운 파란색
  }
  
  :deep(.json-null) {
    color: #4a8ac7;
    font-style: italic;
  }
}
</style>
