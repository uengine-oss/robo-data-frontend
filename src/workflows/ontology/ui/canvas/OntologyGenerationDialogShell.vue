<script setup lang="ts">
import { ref } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

const props = defineProps<{
  open: boolean
  mode: 'document' | 'schema'
  generating: boolean
  hasError: boolean
  completed: boolean
  canGenerate: boolean
}>()

const emit = defineEmits<{
  close: []
  generate: []
  cancelGeneration: []
  'update:mode': [value: 'document' | 'schema']
}>()

const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)

function requestClose(): void {
  if (!props.generating) emit('close')
}

useDialogFocusLifecycle({
  active: () => props.open,
  dialog: dialogRef,
  requestClose,
  initialFocus: () => closeButtonRef.value,
})
</script>

<template>
  <div v-if="open" class="dialog-overlay" @click.self="requestClose">
    <div
      ref="dialogRef"
      class="generate-dialog"
      :class="{ 'dialog-expanded': generating || hasError || completed }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ontology-generation-dialog-title"
      :aria-busy="generating"
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3 id="ontology-generation-dialog-title">
          {{ mode === 'schema' ? '🗃️ DB 스키마에서 온톨로지 생성' : '📄 문서에서 온톨로지 생성' }}
        </h3>
        <button
          ref="closeButtonRef"
          type="button"
          class="close-btn"
          aria-label="생성 대화상자 닫기"
          :disabled="generating"
          @click="requestClose"
        >
          ✕
        </button>
      </div>

      <div v-if="!generating && !hasError && !completed" class="generation-mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="mode-tab"
          :class="{ active: mode === 'document' }"
          :aria-selected="mode === 'document'"
          @click="emit('update:mode', 'document')"
        >
          <span>📄</span> 문서 기반
        </button>
        <button
          type="button"
          role="tab"
          class="mode-tab"
          :class="{ active: mode === 'schema' }"
          :aria-selected="mode === 'schema'"
          @click="emit('update:mode', 'schema')"
        >
          <span>🗃️</span> DB 스키마 기반
        </button>
      </div>

      <slot></slot>

      <div v-if="mode === 'document' && !generating && !hasError && !completed" class="dialog-footer">
        <button type="button" class="cancel-btn" @click="requestClose">취소</button>
        <button type="button" class="generate-btn" :disabled="!canGenerate" @click="emit('generate')">
          🚀 온톨로지 생성
        </button>
      </div>
      <div v-else-if="generating" class="dialog-footer">
        <button type="button" class="cancel-btn" @click="emit('cancelGeneration')">취소</button>
      </div>
    </div>
  </div>
</template>

<style src="./OntologyGenerationDialog.scss" lang="scss"></style>
