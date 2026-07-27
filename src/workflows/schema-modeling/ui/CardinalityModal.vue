<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import CloseButton from './CloseButton.vue'

export interface ConnectionInfo {
  fromTable: string
  fromSchema?: string
  fromColumn: string
  toTable: string
  toSchema?: string
  toColumn: string
}

export type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:N'

const props = defineProps<{
  isOpen: boolean
  connection: ConnectionInfo | null
  pending?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', cardinality: Cardinality, description: string): void
}>()

const selectedCardinality = ref<Cardinality>('N:1')
const description = ref('')
const dialogRef = ref<HTMLElement | null>(null)

const cardinalityOptions: { value: Cardinality; label: string; icon: string; desc: string }[] = [
  { 
    value: '1:1', 
    label: '일대일 (1:1)', 
    icon: '⟷',
    desc: '양쪽 테이블에서 각 레코드는 상대방의 한 레코드에만 연결됩니다.'
  },
  { 
    value: '1:N', 
    label: '일대다 (1:N)', 
    icon: '⟶',
    desc: `${props.connection?.fromTable || 'From'} 테이블의 한 레코드가 ${props.connection?.toTable || 'To'} 테이블의 여러 레코드에 연결됩니다.`
  },
  { 
    value: 'N:1', 
    label: '다대일 (N:1)', 
    icon: '⟵',
    desc: `${props.connection?.fromTable || 'From'} 테이블의 여러 레코드가 ${props.connection?.toTable || 'To'} 테이블의 한 레코드에 연결됩니다.`
  },
  { 
    value: 'N:N', 
    label: '다대다 (N:N)', 
    icon: '⇄',
    desc: '양쪽 테이블에서 여러 레코드가 서로 연결됩니다. (중간 테이블 필요)'
  },
]

const selectedOption = computed(() => 
  cardinalityOptions.find(opt => opt.value === selectedCardinality.value)
)

function handleConfirm() {
  if (props.pending) return
  emit('confirm', selectedCardinality.value, description.value)
}

function handleClose() {
  if (props.pending) return
  emit('close')
  resetForm()
}

function resetForm() {
  selectedCardinality.value = 'N:1'
  description.value = ''
}

function selectCardinality(value: Cardinality) {
  if (props.pending) return
  selectedCardinality.value = value
}

useDialogFocusLifecycle({
  active: () => props.isOpen,
  dialog: dialogRef,
  requestClose: handleClose,
  initialFocus: () => dialogRef.value?.querySelector<HTMLButtonElement>('.cardinality-option') ?? null,
  canClose: () => !props.pending,
})

watch(() => props.isOpen, isOpen => {
  if (!isOpen) resetForm()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
        <section
          ref="dialogRef"
          class="modal-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cardinality-dialog-title"
          :aria-busy="pending"
          tabindex="-1"
        >
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title">
              <span class="modal-icon">🔗</span>
              <span id="cardinality-dialog-title">릴레이션 설정</span>
            </div>
            <CloseButton light :disabled="pending" title="릴레이션 설정 닫기" @click="handleClose" />
          </div>
          
          <!-- Connection Info -->
          <div v-if="connection" class="connection-info">
            <div class="connection-from">
              <span class="table-badge">{{ connection.fromTable }}</span>
              <span class="column-badge">.{{ connection.fromColumn }}</span>
            </div>
            <div class="connection-arrow">→</div>
            <div class="connection-to">
              <span class="table-badge">{{ connection.toTable }}</span>
              <span class="column-badge">.{{ connection.toColumn }}</span>
            </div>
          </div>
          
          <!-- Cardinality Selection -->
          <div class="modal-body">
            <div class="section-label">카디널리티 선택</div>
            
            <div class="cardinality-grid">
              <button 
                v-for="option in cardinalityOptions"
                :key="option.value"
                class="cardinality-option"
                :class="{ 'is-selected': selectedCardinality === option.value }"
                :aria-pressed="selectedCardinality === option.value"
                :disabled="pending"
                @click="selectCardinality(option.value)"
              >
                <span class="option-icon">{{ option.icon }}</span>
                <span class="option-label">{{ option.label }}</span>
              </button>
            </div>
            
            <div class="cardinality-description">
              <p>{{ selectedOption?.desc }}</p>
            </div>
            
            <!-- Visual Representation with Crow's Foot Notation -->
            <div class="visual-representation">
              <div class="entity from-entity">
                <div class="entity-name">{{ connection?.fromTable || 'From' }}</div>
              </div>
              <div class="relation-line">
                <svg viewBox="0 0 160 50" width="160" height="50">
                  <!-- Main line -->
                  <line x1="30" y1="25" x2="130" y2="25" stroke="#228be6" stroke-width="2.5"/>
                  
                  <!-- From side marker (left) -->
                  <template v-if="selectedCardinality === '1:1' || selectedCardinality === '1:N'">
                    <!-- One: vertical bar -->
                    <line x1="25" y1="12" x2="25" y2="38" stroke="#228be6" stroke-width="3" stroke-linecap="round"/>
                  </template>
                  <template v-else>
                    <!-- Many: crow's foot -->
                    <line x1="30" y1="25" x2="10" y2="8" stroke="#228be6" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="30" y1="25" x2="10" y2="25" stroke="#228be6" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="30" y1="25" x2="10" y2="42" stroke="#228be6" stroke-width="2.5" stroke-linecap="round"/>
                  </template>
                  
                  <!-- To side marker (right) -->
                  <template v-if="selectedCardinality === '1:1' || selectedCardinality === 'N:1'">
                    <!-- One: vertical bar -->
                    <line x1="135" y1="12" x2="135" y2="38" stroke="#228be6" stroke-width="3" stroke-linecap="round"/>
                  </template>
                  <template v-else>
                    <!-- Many: crow's foot (삼지창) -->
                    <line x1="130" y1="25" x2="150" y2="8" stroke="#228be6" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="130" y1="25" x2="150" y2="25" stroke="#228be6" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="130" y1="25" x2="150" y2="42" stroke="#228be6" stroke-width="2.5" stroke-linecap="round"/>
                  </template>
                </svg>
              </div>
              <div class="entity to-entity">
                <div class="entity-name">{{ connection?.toTable || 'To' }}</div>
              </div>
            </div>
            
            <!-- Cardinality Label -->
            <div class="cardinality-label">
              <span class="from-indicator">
                {{ selectedCardinality === '1:1' || selectedCardinality === '1:N' ? '1' : 'N' }}
              </span>
              <span class="separator">:</span>
              <span class="to-indicator">
                {{ selectedCardinality === '1:1' || selectedCardinality === 'N:1' ? '1' : 'N' }}
              </span>
            </div>
            
            <!-- Description Input -->
            <div class="description-field">
              <label for="cardinality-description">설명 (선택사항)</label>
              <input 
                id="cardinality-description"
                v-model="description"
                type="text"
                placeholder="예: 사용자가 여러 주문을 가질 수 있음"
                :disabled="pending"
              />
            </div>
            <div v-if="error" class="modal-error" role="alert">{{ error }}</div>
          </div>
          
          <!-- Footer -->
          <div class="modal-footer">
            <button class="btn btn--secondary" :disabled="pending" @click="handleClose">취소</button>
            <button class="btn btn--primary" :disabled="pending" @click="handleConfirm">
              {{ pending ? '생성 중...' : error ? '같은 설정 다시 시도' : '릴레이션 생성' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
/* Modal Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  backdrop-filter: blur(4px);
}

/* Modal Container */
.modal-container {
  background: var(--color-bg-secondary, #25262b);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 16px;
  width: min(480px, 100%);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  outline: none;
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-20px);
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #339af0 0%, #228be6 100%);
  color: white;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal-icon {
  font-size: 1.3rem;
}

.modal-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

/* Connection Info */
.connection-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--color-bg-tertiary, #1a1b26);
  border-bottom: 1px solid var(--color-border, #373a40);
}

.connection-from,
.connection-to {
  display: flex;
  align-items: center;
}

.table-badge {
  background: var(--color-accent, #228be6);
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
}

.column-badge {
  color: var(--color-text-light, #909296);
  font-size: 0.85rem;
  font-family: var(--font-mono);
}

.connection-arrow {
  font-size: 1.5rem;
  color: var(--color-accent, #228be6);
}

/* Modal Body */
.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.modal-error {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.1);
  color: #fca5a5;
  overflow-wrap: anywhere;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-light, #909296);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}

/* Cardinality Grid */
.cardinality-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.cardinality-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: var(--color-bg-tertiary, #373a40);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--color-bg, #25262b);
    border-color: var(--color-accent-light, #4dabf7);
  }
  
  &.is-selected {
    background: rgba(34, 139, 230, 0.2);
    border-color: var(--color-accent, #228be6);
    
    .option-icon {
      transform: scale(1.2);
    }
  }
}

.option-icon {
  font-size: 1.5rem;
  transition: transform 0.2s;
}

.option-label {
  font-size: 0.7rem;
  color: var(--color-text-light, #909296);
  text-align: center;
  white-space: nowrap;
}

/* Cardinality Description */
.cardinality-description {
  background: var(--color-bg-tertiary, #1a1b26);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  
  p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-light, #909296);
    line-height: 1.5;
  }
}

/* Visual Representation */
.visual-representation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg, #1a1b26);
  border-radius: 10px;
  margin-bottom: 16px;
}

.entity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  min-width: 80px;
}

.entity-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-bright);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-indicator {
  font-size: 1rem;
  font-weight: bold;
  color: var(--color-accent);
}

.relation-line {
  svg {
    display: block;
  }
}

/* Cardinality Label */
.cardinality-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-accent);
}

.from-indicator,
.to-indicator {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(34, 139, 230, 0.2);
  border: 2px solid var(--color-accent);
  border-radius: 8px;
}

.separator {
  color: var(--color-text-muted);
}

/* Match Strategy Section */
.match-strategy-section {
  margin-bottom: 16px;
}

.match-strategy-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.match-strategy-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary, #373a40);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  
  &:hover {
    background: var(--color-bg, #25262b);
    border-color: var(--color-accent-light, #4dabf7);
  }
  
  &.is-selected {
    background: rgba(0, 212, 170, 0.15);
    border-color: #00d4aa;
  }
  
  .strategy-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
  
  .strategy-desc {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }
}

/* Description Field */
.description-field {
  label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-light);
    margin-bottom: 8px;
  }
  
  input {
    width: 100%;
    padding: 10px 12px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 0.9rem;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }
  }
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

@media (max-width: 520px) {
  .modal-overlay {
    padding: 8px;
  }

  .modal-container {
    max-height: calc(100dvh - 16px);
    border-radius: 12px;
  }

  .connection-info,
  .visual-representation {
    align-items: stretch;
    flex-direction: column;
  }

  .connection-arrow {
    align-self: center;
    transform: rotate(90deg);
  }

  .relation-line {
    display: none;
  }

  .cardinality-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .modal-footer {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
