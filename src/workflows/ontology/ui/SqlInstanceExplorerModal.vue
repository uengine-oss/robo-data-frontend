<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { OntologyNode } from '@/domains/ontology'
import { IconCheck } from '@/shared/icons'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { logger } from '@/shared/utils/logger'
import { useDatasourcesStore } from '@/domains/data-fabric'
import {
  useOntologyStore,
} from '@/domains/ontology'
import {
  useReactStore,
} from '@/domains/text2sql'
import { createOntologyInstancesFromQuery } from '../application/ontologyDataGateway'
import { Text2SqlWorkspace } from '@/workflows/text2sql-ontology'

const props = defineProps<{
  open: boolean
  node: OntologyNode
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'instances-created', count: number): void
}>()

const ontologyStore = useOntologyStore()
const datasourcesStore = useDatasourcesStore()
const reactStore = useReactStore()
const timers = useManagedTimeouts()
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)

const showInstanceConfig = ref(false)
const selectedIdColumn = ref('')
const selectedNameColumn = ref('')
const createMaterializedView = ref(true)
const mvViewName = ref('')
const isCreatingInstances = ref(false)
const createError = ref<string | null>(null)
const createSuccess = ref<string | null>(null)
const createWarning = ref<string | null>(null)

const defaultInstanceQuery = computed(() => {
  const description = props.node.description || props.node.label
  return `${props.node.name}(${description})에 해당하는 모든 데이터를 조회해줘`
})

const hasSearchResult = computed(() =>
  Boolean(reactStore.executionResult?.rows?.length),
)
const searchResultColumns = computed(() =>
  reactStore.executionResult?.columns ?? [],
)
const searchResultRowCount = computed(() =>
  reactStore.executionResult?.row_count ?? 0,
)

watch(
  () => props.node.name,
  newName => {
    mvViewName.value = defaultViewName(newName)
  },
  { immediate: true },
)

function defaultViewName(nodeName: string): string {
  return `mv_${nodeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_instances`
}

watch(
  () => props.open,
  open => {
    timers.cancel('close-sql-instance-explorer')
    if (!open) return
    showInstanceConfig.value = false
    createMaterializedView.value = true
    mvViewName.value = defaultViewName(props.node.name)
    createError.value = null
    createSuccess.value = null
    createWarning.value = null
    const columns = reactStore.executionResult?.columns ?? []
    selectedIdColumn.value = columns[0] ?? ''
    selectedNameColumn.value = columns[1] ?? columns[0] ?? ''
  },
)

watch(
  () => reactStore.executionResult,
  result => {
    if (!result?.columns?.length) return
    selectedIdColumn.value = result.columns[0]
    selectedNameColumn.value = result.columns.length > 1
      ? result.columns[1]
      : result.columns[0]
  },
)

function close() {
  if (isCreatingInstances.value) return
  timers.cancel('close-sql-instance-explorer')
  emit('close')
}

useDialogFocusLifecycle({
  active: () => props.open,
  dialog,
  requestClose: close,
  initialFocus: () => closeButton.value,
  canClose: () => !isCreatingInstances.value,
})

function confirmAdopt() {
  showInstanceConfig.value = true
  createError.value = null
  createSuccess.value = null
  createWarning.value = null
}

async function createInstances() {
  if (!reactStore.finalSql || !selectedIdColumn.value) {
    createError.value = 'ID 컬럼을 선택해주세요'
    return
  }

  isCreatingInstances.value = true
  createError.value = null
  createSuccess.value = null
  createWarning.value = null

  try {
    const selectedDatasource = datasourcesStore.selectedDatasource
    if (!selectedDatasource?.name) {
      throw new Error('데이터소스를 선택해주세요')
    }
    const schemaId = ontologyStore.schema?.id
    if (!schemaId) {
      throw new Error('스키마 ID가 없습니다')
    }

    const result = await createOntologyInstancesFromQuery({
      datasource: selectedDatasource.name,
      sourceSql: reactStore.finalSql,
      schemaId,
      nodeType: props.node.name,
      idColumn: selectedIdColumn.value,
      nameColumn: selectedNameColumn.value || selectedIdColumn.value,
      sourceQuestion: reactStore.currentQuestion,
      materializedView: {
        enabled: createMaterializedView.value,
        viewName: mvViewName.value,
        description: `${props.node.name} 인스턴스 동기화`,
      },
    })

    const count = result.createdCount
    createSuccess.value = `${count}개의 ${props.node.name} 인스턴스가 생성되었습니다!`
    createWarning.value = result.warning
    if (result.warning) logger.warn(result.warning)

    ontologyStore.updateNodeInstanceCountByName(props.node.name, count)
    if (reactStore.executionResult?.rows) {
      const columns = reactStore.executionResult.columns
      const idColumnIndex = columns.indexOf(selectedIdColumn.value)
      const nameColumnIndex = columns.indexOf(
        selectedNameColumn.value || selectedIdColumn.value,
      )
      const instances = reactStore.executionResult.rows
        .map(row => ({
          id: String(idColumnIndex >= 0 ? (row[idColumnIndex] ?? '') : ''),
          name: String(nameColumnIndex >= 0 ? (row[nameColumnIndex] ?? '') : ''),
        }))
        .filter(instance => instance.id)
      ontologyStore.addCanvasInstances(props.node.name, instances)
    }

    emit('instances-created', count)
    if (!result.warning) {
      timers.schedule('close-sql-instance-explorer', close, 1500)
    }
  } catch (cause) {
    createError.value = cause instanceof Error
      ? cause.message
      : '인스턴스 생성 실패'
  } finally {
    isCreatingInstances.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="instance-explorer-overlay"
      @click.self="close"
    >
      <section
        ref="dialog"
        class="instance-explorer-modal large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sql-instance-explorer-title"
        :aria-busy="isCreatingInstances"
        tabindex="-1"
      >
        <div class="modal-header">
          <div class="header-title">
            <span class="modal-icon">🔮</span>
            <h3 id="sql-instance-explorer-title">
              AI 인스턴스 탐색 - {{ node.name }}
            </h3>
          </div>
          <button
            ref="closeButton"
            type="button"
            class="close-btn"
            aria-label="AI 인스턴스 탐색 닫기"
            :disabled="isCreatingInstances"
            @click="close"
          >
            ✕
          </button>
        </div>

        <div class="modal-body">
          <Text2SqlWorkspace
            class="embedded-text2sql"
            :embedded="true"
            :initial-query="defaultInstanceQuery"
            :auto-execute="true"
          />
        </div>

        <div v-if="hasSearchResult" class="modal-footer">
          <div class="result-summary">
            <span class="result-icon">📊</span>
            <span>검색 결과: <strong>{{ searchResultRowCount }}</strong>건</span>
          </div>

          <button
            v-if="!showInstanceConfig"
            type="button"
            class="adopt-btn"
            @click="confirmAdopt"
          >
            <IconCheck :size="16" />
            <span>이 결과를 {{ node.name }} 인스턴스로 채택</span>
          </button>

          <div v-if="showInstanceConfig" class="instance-config">
            <div class="config-row">
              <label for="sql-instance-id-column">ID 컬럼</label>
              <select id="sql-instance-id-column" v-model="selectedIdColumn">
                <option
                  v-for="column in searchResultColumns"
                  :key="column"
                  :value="column"
                >
                  {{ column }}
                </option>
              </select>
            </div>
            <div class="config-row">
              <label for="sql-instance-name-column">이름 컬럼</label>
              <select id="sql-instance-name-column" v-model="selectedNameColumn">
                <option value="">ID와 동일</option>
                <option
                  v-for="column in searchResultColumns"
                  :key="column"
                  :value="column"
                >
                  {{ column }}
                </option>
              </select>
            </div>
            <div class="config-row checkbox">
              <label>
                <input v-model="createMaterializedView" type="checkbox" />
                Materialized View 생성 (동기화용)
              </label>
            </div>
            <div v-if="createMaterializedView" class="config-row">
              <label for="sql-instance-view-name">뷰 이름</label>
              <input
                id="sql-instance-view-name"
                v-model="mvViewName"
                type="text"
                placeholder="mv_..."
              />
            </div>

            <div v-if="createError" class="error-msg" role="alert">
              {{ createError }}
            </div>
            <div v-if="createSuccess" class="success-msg" role="status">
              {{ createSuccess }}
            </div>
            <div v-if="createWarning" class="warning-msg" role="status">
              {{ createWarning }}
            </div>

            <div class="config-actions">
              <button
                type="button"
                class="cancel-btn"
                :disabled="isCreatingInstances"
                @click="showInstanceConfig = false"
              >
                취소
              </button>
              <button
                type="button"
                class="create-btn"
                :disabled="isCreatingInstances || !selectedIdColumn"
                :aria-busy="isCreatingInstances"
                @click="createInstances"
              >
                <span v-if="isCreatingInstances" class="spinner"></span>
                <span>
                  {{ isCreatingInstances ? '생성 중...' : `${searchResultRowCount}개 인스턴스 생성` }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.instance-explorer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.instance-explorer-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  width: 90%;
  max-width: 700px;
  max-height: min(85dvh, 860px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);

  &.large {
    max-width: 1200px;
    width: 95%;
    height: calc(100dvh - 48px);
    max-height: 900px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border);

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;

      .modal-icon {
        font-size: 1.5rem;
      }

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-bright);
      }
    }

    .close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      font-size: 1.3rem;
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 6px;

      &:hover:not(:disabled) {
        background: var(--color-bg-tertiary);
        color: var(--color-text-bright);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
    }
  }

  .modal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0;

    .embedded-text2sql {
      height: 100%;
      border: none;

      :deep(.text2sql-tab) {
        height: 100%;
      }
    }
  }

  .modal-footer {
    border-top: 1px solid var(--color-border);
    padding: 16px 24px;
    background: var(--color-bg-tertiary);
    display: flex;
    flex-direction: column;
    gap: 12px;

    .result-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      color: var(--color-text-light);

      .result-icon {
        font-size: 1.2rem;
      }

      strong {
        color: #00d4aa;
      }
    }

    .adopt-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 28px;
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
      border: none;
      border-radius: 10px;
      color: white;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(167, 139, 250, 0.4);
      }
    }

    .instance-config {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: flex-end;

      .config-row {
        display: flex;
        flex-direction: column;
        gap: 4px;

        label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
        }

        select,
        input[type='text'] {
          padding: 8px 12px;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          color: var(--color-text-bright);
          min-width: 150px;
        }

        &.checkbox {
          flex-direction: row;

          label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.85rem;
            color: var(--color-text-light);

            input[type='checkbox'] {
              width: 16px;
              height: 16px;
            }
          }
        }
      }

      .error-msg,
      .success-msg,
      .warning-msg {
        width: 100%;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.85rem;
      }

      .error-msg {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #f87171;
      }

      .success-msg {
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #4ade80;
      }

      .warning-msg {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.35);
        color: #fbbf24;
      }

      .config-actions {
        display: flex;
        gap: 10px;
        margin-left: auto;

        .cancel-btn {
          padding: 10px 20px;
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          color: var(--color-text-light);
          cursor: pointer;

          &:hover:not(:disabled) {
            background: var(--color-bg-secondary);
          }
        }

        .create-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: linear-gradient(135deg, #00d4aa, #00a8cc);
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          cursor: pointer;

          &:hover:not(:disabled) {
            box-shadow: 0 4px 16px rgba(0, 212, 170, 0.4);
          }

          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .spinner {
            width: 14px;
            height: 14px;
            border: 2px solid transparent;
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
        }
      }
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
