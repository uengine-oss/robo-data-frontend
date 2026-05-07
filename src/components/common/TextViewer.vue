<script setup lang="ts">
/**
 * TextViewer.vue
 * 일반 텍스트(설명/요약 등)를 가독성 있게 표시하는 공용 뷰어.
 *
 * - white-space: pre-wrap 으로 줄바꿈/공백 보존
 * - word-break: break-word 로 긴 토큰도 wrap
 * - 단락 간격, 적절한 line-height, 색 대비
 * - maxHeight 지정 시 자체 스크롤 (얇은 스크롤바)
 * - 빈 값일 때 placeholder 표시
 *
 * 사용:
 *   <TextViewer :content="table.description" />
 *   <TextViewer :content="ai.summary" max-height="200px" placeholder="설명 없음" />
 */

import { computed } from 'vue'

interface Props {
  /** 표시할 텍스트. 빈 값이면 placeholder 표시 */
  content?: string | null
  /** 자체 스크롤 한도 — 미지정 시 부모 높이까지 자유 확장 */
  maxHeight?: string | number
  /** 빈 값일 때 표시 문구 */
  placeholder?: string
  /** 컴팩트 모드 (작은 폰트/간격) */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  content: '',
  placeholder: '',
  compact: false,
})

const hasContent = computed(() => !!props.content && String(props.content).trim().length > 0)

const maxHeightStyle = computed(() => {
  if (props.maxHeight == null) return undefined
  return typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight
})
</script>

<template>
  <div class="text-viewer" :class="{ 'is-compact': compact, 'is-empty': !hasContent }">
    <p
      v-if="hasContent"
      class="text-viewer__body"
      :style="maxHeightStyle ? { maxHeight: maxHeightStyle, overflowY: 'auto' } : undefined"
    >{{ content }}</p>
    <span v-else-if="placeholder" class="text-viewer__placeholder">{{ placeholder }}</span>
  </div>
</template>

<style lang="scss" scoped>
.text-viewer {
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--color-text);

  &.is-compact {
    font-size: 0.825rem;
    line-height: 1.5;
  }
}

.text-viewer__body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;

  // 텍스트 안의 빈 줄(\n\n)을 단락 분리처럼 보이게 하기 위해 자연스러운 spacing 유지
  // pre-wrap 이 \n 을 그대로 살리므로 별도 단락 처리 불필요

  // 자체 스크롤 시 얇은 스크롤바
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-muted);
  }
}

.text-viewer__placeholder {
  color: var(--color-text-muted);
  font-style: italic;
  font-size: 0.875em;
}
</style>
