<script setup lang="ts">
// 스키마 탭 공용 닫기 버튼 — 팝업/패널/모달 닫기 일관화(IconX 단일). spec 043.
// light: 컬러(그라데이션) 헤더 위에서 흰색 + 반투명 흰 hover.
import { IconX } from '@/shared/icons'

withDefaults(defineProps<{
  size?: number
  light?: boolean
  title?: string
  disabled?: boolean
}>(), {
  size: 16,
  light: false,
  title: '닫기',
  disabled: false,
})
defineEmits<{ (e: 'click', ev: MouseEvent): void }>()
</script>

<template>
  <button
    type="button"
    class="close-btn-shared"
    :class="{ 'close-btn-shared--light': light }"
    :title="title"
    :aria-label="title"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <IconX :size="size" />
  </button>
</template>

<style scoped>
.close-btn-shared {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.85;
  transition: background 0.15s, opacity 0.15s;
}
.close-btn-shared:hover {
  opacity: 1;
  background: var(--color-bg-hover, rgba(127, 127, 127, 0.18));
}
.close-btn-shared:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.close-btn-shared--light {
  color: #fff;
  opacity: 0.95;
  background: rgba(255, 255, 255, 0.18);
}
.close-btn-shared--light:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.32);
}
</style>
