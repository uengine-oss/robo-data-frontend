<script setup lang="ts">
import { ref } from 'vue'
import { IconAlertTriangle, IconLink, IconTrash } from '@/shared/icons'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import type { EditingRelationship } from '../model/relationshipInteraction'
import CloseButton from './CloseButton.vue'

const props = defineProps<{
  visible: boolean
  relationship: EditingRelationship
  deleting?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'delete'): void
}>()

const dialogRef = ref<HTMLElement | null>(null)
const isUserRelationship = () => props.relationship.source === 'user'

useDialogFocusLifecycle({
  active: () => props.visible,
  dialog: dialogRef,
  requestClose: () => emit('close'),
  initialFocus: () => dialogRef.value,
  canClose: () => !props.deleting,
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="catalog-relationship-overlay" @click.self="!deleting && emit('close')">
      <section
        ref="dialogRef"
        class="catalog-relationship-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-relationship-title"
        tabindex="-1"
      >
        <header>
          <div class="dialog-title">
            <IconLink :size="18" />
            <h2 id="catalog-relationship-title">Catalog 관계</h2>
          </div>
          <CloseButton :disabled="deleting" @click="emit('close')" />
        </header>

        <div class="dialog-body">
          <dl>
            <div>
              <dt>출발</dt>
              <dd>{{ relationship.fromSchema }}.{{ relationship.sourceType }}.{{ relationship.sourceColumn }}</dd>
            </div>
            <div>
              <dt>도착</dt>
              <dd>{{ relationship.toSchema }}.{{ relationship.targetType }}.{{ relationship.targetColumn }}</dd>
            </div>
            <div>
              <dt>출처</dt>
              <dd>{{ relationship.source }}</dd>
            </div>
          </dl>

          <p v-if="isUserRelationship()" class="scope-note">
            Catalog API는 관계 생성과 삭제를 제공합니다. 관계를 바꾸려면 삭제한 뒤 다시 연결하세요.
          </p>
          <p v-else class="scope-note scope-note--derived">
            이 관계는 {{ relationship.source }} 분석 결과입니다. 원본 분석 결과는 이 화면에서 수정하거나 삭제하지 않습니다.
          </p>

          <div v-if="error" class="dialog-error" role="alert">
            <IconAlertTriangle :size="16" />
            <span>{{ error }}</span>
          </div>
        </div>

        <footer>
          <button type="button" class="secondary-button" :disabled="deleting" @click="emit('close')">
            닫기
          </button>
          <button
            v-if="isUserRelationship()"
            type="button"
            class="delete-button"
            :disabled="deleting"
            @click="emit('delete')"
          >
            <IconTrash :size="15" />
            {{ deleting ? '삭제 중...' : '관계 삭제' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.catalog-relationship-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
}

.catalog-relationship-dialog {
  width: min(560px, 100%);
  max-height: calc(100dvh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text, #c1c2c5);
  background: var(--color-bg-secondary, #25262b);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 10px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
  outline: none;
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}

header { border-bottom: 1px solid var(--color-border, #373a40); }
footer { border-top: 1px solid var(--color-border, #373a40); }

.dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

h2 {
  margin: 0;
  font-size: 1rem;
}

.dialog-body {
  padding: 16px;
  overflow-y: auto;
}

dl {
  display: grid;
  gap: 10px;
  margin: 0;
}

dl > div {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 10px;
}

dt { color: var(--color-text-muted, #909296); }
dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: 'JetBrains Mono', monospace;
}

.scope-note,
.dialog-error {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.84rem;
  line-height: 1.5;
}

.scope-note {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.28);
}

.scope-note--derived {
  color: #cbd5e1;
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.2);
}

.dialog-error {
  display: flex;
  gap: 8px;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
}

button:disabled { cursor: not-allowed; opacity: 0.55; }
.secondary-button { color: inherit; background: transparent; border: 1px solid var(--color-border, #373a40); }
.delete-button { color: white; background: #dc2626; border: 1px solid #ef4444; }

@media (max-width: 520px) {
  .catalog-relationship-overlay { padding: 10px; }
  dl > div { grid-template-columns: 1fr; gap: 2px; }
}
</style>
