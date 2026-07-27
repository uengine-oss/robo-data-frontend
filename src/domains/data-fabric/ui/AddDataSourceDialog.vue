<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { DataSourceTypeConfig } from '../api/contracts.ts'
import {
  buildConnectionTestRequest,
  createConnectionParameters,
  groupConnectorTypes,
  type ConnectionParameters,
} from '../application/connectionDraft.ts'
import {
  DATA_SOURCE_CATEGORY_ICONS,
  getConnectorPresentation,
} from '../catalog/connectorPresentation.ts'
import { useDatasourcesStore } from '../state/datasources.ts'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'

const emit = defineEmits<{
  close: []
}>()

const store = useDatasourcesStore()
const timers = useManagedTimeouts()
const dialogRef = ref<HTMLElement>()
const selectedType = ref<DataSourceTypeConfig | null>(null)
const parameters = ref<ConnectionParameters>({})
const connectionName = ref('')
const searchQuery = ref('')
const isTesting = ref(false)
const createSuccess = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const groupedTypes = computed(() =>
  groupConnectorTypes(store.datasourceTypes, searchQuery.value),
)
const filteredTypesCount = computed(() =>
  Object.values(groupedTypes.value).reduce((sum, types) => sum + types.length, 0),
)
const isBusy = computed(() => store.isMutating || isTesting.value)

onMounted(async () => {
  store.clearMutationError()
  if (store.datasourceTypes.length === 0) store.fetchTypes()
  await nextTick()
  dialogRef.value?.focus()
})

function selectType(type: DataSourceTypeConfig) {
  store.clearMutationError()
  selectedType.value = type
  parameters.value = createConnectionParameters(type)
  testResult.value = null
  nextTick(() => {
    const input = dialogRef.value?.querySelector<HTMLInputElement>('#datasource-connection-name')
    input?.focus()
  })
}

function returnToCatalog() {
  if (isBusy.value) return
  store.clearMutationError()
  selectedType.value = null
  parameters.value = {}
  connectionName.value = ''
  testResult.value = null
}

function requestClose() {
  if (isBusy.value) return
  timers.cancel('success-close')
  store.clearMutationError()
  emit('close')
}

async function testConnection() {
  if (!selectedType.value || !connectionName.value || isBusy.value) return
  isTesting.value = true
  testResult.value = null
  try {
    testResult.value = await store.testConnectionWithParams(
      buildConnectionTestRequest(selectedType.value, parameters.value),
    )
  } finally {
    isTesting.value = false
  }
}

async function createConnection() {
  if (!selectedType.value || !connectionName.value || isBusy.value) return
  store.clearMutationError()
  const createdDatasource = await store.createDatasource(
    connectionName.value,
    selectedType.value.type,
    parameters.value,
  )
  if (!createdDatasource) return

  createSuccess.value = true
  timers.schedule('success-close', () => emit('close'), 1500)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div class="modal-overlay" @click.self="requestClose">
        <section
          ref="dialogRef"
          class="modal"
          :class="{ 'modal-wide': !selectedType }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-datasource-title"
          :aria-busy="isBusy"
          tabindex="-1"
          @keydown.esc.stop.prevent="requestClose"
        >
          <header class="modal-header">
            <h2 id="add-datasource-title">
              {{ selectedType ? `${selectedType.display_name} 연결` : '새 데이터 소스' }}
            </h2>
            <button
              type="button"
              class="btn-modal-close"
              aria-label="데이터 소스 추가 닫기"
              :disabled="isBusy"
              @click="requestClose"
            >
              ×
            </button>
          </header>

          <div class="modal-body">
            <div v-if="createSuccess" class="success-state" role="status" aria-live="polite">
              <div class="success-icon" aria-hidden="true">✓</div>
              <h3>연결 완료!</h3>
              <p>데이터 소스가 성공적으로 추가되었습니다.</p>
            </div>

            <div v-else-if="!selectedType" class="type-selection">
              <label class="type-search-box">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <span class="sr-only">데이터 소스 유형 검색</span>
                <input
                  v-model="searchQuery"
                  type="search"
                  placeholder="데이터 소스 유형 검색... (예: postgres, kafka, s3)"
                />
              </label>

              <p class="type-count" role="status">
                {{ filteredTypesCount }}개의 데이터 소스 유형 사용 가능
              </p>

              <div class="categories-container">
                <section
                  v-for="(label, category) in store.categoryLabels"
                  v-show="groupedTypes[category].length > 0"
                  :key="category"
                  class="category-section"
                  :aria-labelledby="`connector-category-${category}`"
                >
                  <h3 :id="`connector-category-${category}`" class="category-title">
                    <span class="category-icon" aria-hidden="true">
                      {{ DATA_SOURCE_CATEGORY_ICONS[category] }}
                    </span>
                    {{ label }}
                    <span class="category-count">{{ groupedTypes[category].length }}</span>
                  </h3>
                  <div class="type-grid">
                    <button
                      v-for="type in groupedTypes[category]"
                      :key="type.type"
                      type="button"
                      class="type-card"
                      :style="{ '--accent-color': getConnectorPresentation(type.type).color }"
                      @click="selectType(type)"
                    >
                      <span
                        class="type-icon-wrapper"
                        :style="{ background: getConnectorPresentation(type.type).gradient }"
                        aria-hidden="true"
                      >
                        <span class="type-icon">
                          {{ getConnectorPresentation(type.type).icon }}
                        </span>
                      </span>
                      <span class="type-info">
                        <span class="type-name">{{ type.display_name }}</span>
                        <span v-if="type.description" class="type-desc">
                          {{ type.description }}
                        </span>
                      </span>
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <div v-else class="connection-form">
              <button type="button" class="btn-back" :disabled="isBusy" @click="returnToCatalog">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                다른 유형 선택
              </button>

              <div
                class="form-type-badge"
                :style="{ background: getConnectorPresentation(selectedType.type).gradient }"
              >
                <span aria-hidden="true">{{ getConnectorPresentation(selectedType.type).icon }}</span>
                <span>{{ selectedType.display_name }}</span>
              </div>
              <p v-if="selectedType.description" class="form-type-desc">
                {{ selectedType.description }}
              </p>

              <form @submit.prevent="createConnection">
                <div class="form-group">
                  <label for="datasource-connection-name">
                    연결 이름 <span class="required" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="datasource-connection-name"
                    v-model="connectionName"
                    type="text"
                    placeholder="my_database"
                    autocomplete="off"
                    required
                  />
                </div>

                <div class="form-grid">
                  <div v-for="field in selectedType.fields" :key="field.name" class="form-group">
                    <label :for="`datasource-field-${field.name}`">
                      {{ field.label }}
                      <span v-if="field.required" class="required" aria-hidden="true">*</span>
                    </label>
                    <select
                      v-if="field.type === 'select'"
                      :id="`datasource-field-${field.name}`"
                      v-model="parameters[field.name]"
                      :required="field.required"
                    >
                      <option
                        v-for="option in field.options"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                    <input
                      v-else
                      :id="`datasource-field-${field.name}`"
                      v-model="parameters[field.name]"
                      :type="field.type"
                      :placeholder="field.placeholder || field.default?.toString() || ''"
                      :required="field.required"
                    />
                  </div>
                </div>

                <div v-if="store.mutationError" class="error-alert" role="alert">
                  {{ store.mutationError }}
                </div>
                <div
                  v-if="testResult"
                  :class="['test-alert', testResult.success ? 'success' : 'error']"
                  role="status"
                  aria-live="polite"
                >
                  {{ testResult.success ? '✓' : '!' }} {{ testResult.message }}
                </div>

                <div class="form-actions">
                  <button
                    type="button"
                    class="btn-test"
                    :disabled="!connectionName || isBusy"
                    @click="testConnection"
                  >
                    {{ isTesting ? '테스트 중...' : '연결 테스트' }}
                  </button>
                  <button
                    type="submit"
                    class="btn-create"
                    :disabled="store.isMutating || isTesting || !connectionName"
                  >
                    {{ store.isMutating ? '등록 중...' : '연결 생성' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);

  &:focus {
    outline: none;
  }

  &.modal-wide {
    max-width: 900px;
  }
}

.modal-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid var(--color-border);

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
}

.btn-modal-close {
  padding: 8px 12px;
  color: var(--color-text-muted);
  font-size: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--color-text);
  }
}

.modal-body {
  flex: 1;
  min-height: 0;
  padding: 28px;
  overflow-y: auto;
}

.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
  text-align: center;

  .success-icon {
    margin-bottom: 16px;
    color: #22c55e;
    font-size: 4rem;
  }

  h3 {
    margin: 0 0 8px;
    color: var(--color-text);
    font-size: 1.5rem;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
  }
}

.type-selection {
  display: flex;
  flex-direction: column;
}

.type-search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;

  &:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  svg {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  input {
    flex: 1;
    min-width: 0;
    color: var(--color-text);
    font-size: 0.95rem;
    background: none;
    border: none;

    &:focus {
      outline: none;
    }
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.type-count {
  margin: 0 0 20px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.categories-container {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 600;
}

.category-icon {
  font-size: 1.2rem;
}

.category-count {
  padding: 2px 8px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--color-bg);
  border-radius: 10px;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.type-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  text-align: left;
  cursor: pointer;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  transition: all 0.2s;

  &:hover,
  &:focus-visible {
    border-color: var(--accent-color, #6366f1);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
}

.type-icon-wrapper {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.type-icon {
  font-size: 1.25rem;
}

.type-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.type-name {
  color: var(--color-text);
  font-size: 0.9rem;
  font-weight: 600;
}

.type-desc {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  margin-bottom: 20px;
  color: #6366f1;
  font-size: 0.9rem;
  cursor: pointer;
  background: none;
  border: none;

  &:hover:not(:disabled) {
    text-decoration: underline;
  }
}

.form-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  margin-bottom: 12px;
  color: white;
  font-weight: 600;
  border-radius: 12px;
}

.form-type-desc {
  margin: 0 0 24px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.form-group {
  min-width: 0;
  margin-bottom: 16px;

  label {
    display: block;
    margin-bottom: 8px;
    color: var(--color-text-light);
    font-size: 0.85rem;
    font-weight: 500;
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    padding: 12px 16px;
    color: var(--color-text);
    font-size: 0.95rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    transition: all 0.15s;

    &:focus {
      border-color: #6366f1;
      outline: none;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
}

.error-alert,
.test-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
  overflow-wrap: anywhere;
  border-radius: 10px;
}

.error-alert,
.test-alert.error {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.test-alert.success {
  color: #4ade80;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-test,
.btn-create {
  flex: 1;
  padding: 14px 24px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  border-radius: 12px;
  transition: all 0.2s;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.btn-test {
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
}

.btn-create {
  color: white;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;

  .modal {
    transition: transform 0.25s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal {
    transform: scale(0.95) translateY(20px);
  }
}

@media (max-width: 600px) {
  .modal-overlay {
    align-items: stretch;
    padding: 12px;
  }

  .modal,
  .modal.modal-wide {
    max-width: none;
    max-height: none;
    border-radius: 16px;
  }

  .modal-header {
    padding: 16px 18px;
  }

  .modal-body {
    padding: 18px;
  }

  .type-grid,
  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-actions {
    padding: 12px 0 0;
    margin-top: 12px;
  }
}
</style>
