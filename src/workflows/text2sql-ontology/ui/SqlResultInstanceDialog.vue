<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  type SchemaListItem,
} from '@/domains/ontology'
import {
  type SqlResultInstanceExport,
} from '@/domains/text2sql'
import {
  createOntologyInstancesFromSql,
  listTargetOntologySchemas,
  loadTargetOntologySchema,
} from '../application/instanceCreationGateway'
import { useDatasourcesStore } from '@/domains/data-fabric'
import type { OntologyNode } from '@/domains/ontology'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

const props = defineProps<{
  source: SqlResultInstanceExport | null
}>()

const emit = defineEmits<{
  close: []
}>()

const datasourcesStore = useDatasourcesStore()
const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const schemaSelect = ref<HTMLSelectElement | null>(null)
const nodeTypeSelect = ref<HTMLSelectElement | null>(null)
const schemas = ref<SchemaListItem[]>([])
const nodeTypes = ref<OntologyNode[]>([])
const selectedSchemaId = ref('')
const selectedNodeType = ref('')
const selectedIdColumn = ref('')
const selectedNameColumn = ref('')
const createMaterializedView = ref(true)
const materializedViewName = ref('')
const schemaListLoading = ref(false)
const schemaListError = ref<string | null>(null)
const schemaDetailLoading = ref(false)
const schemaDetailError = ref<string | null>(null)
const createPending = ref(false)
const createError = ref<string | null>(null)
const createResult = ref<{ createdCount: number; warning: string | null } | null>(null)
let metadataSequence = 0

const busy = computed(() =>
  schemaListLoading.value || schemaDetailLoading.value || createPending.value,
)

const canCreate = computed(() =>
  Boolean(
    props.source
    && selectedSchemaId.value
    && selectedNodeType.value
    && selectedIdColumn.value
    && !busy.value
    && !createResult.value,
  ),
)

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

async function loadSchemas(): Promise<void> {
  const sequence = ++metadataSequence
  schemaListLoading.value = true
  schemaListError.value = null
  try {
    const response = await listTargetOntologySchemas()
    if (sequence !== metadataSequence || !props.source) return
    schemas.value = response.schemas
  } catch (error: unknown) {
    if (sequence !== metadataSequence || !props.source) return
    schemaListError.value = errorMessage(error, '온톨로지 스키마 목록을 불러오지 못했습니다.')
  } finally {
    if (sequence === metadataSequence) schemaListLoading.value = false
  }
}

async function loadSchemaDetail(schemaId: string): Promise<void> {
  const sequence = ++metadataSequence
  schemaDetailLoading.value = true
  schemaDetailError.value = null
  try {
    const schema = await loadTargetOntologySchema(schemaId)
    if (sequence !== metadataSequence || selectedSchemaId.value !== schemaId) return
    if (!schema) throw new Error('선택한 온톨로지 스키마를 찾을 수 없습니다.')
    nodeTypes.value = schema.nodes
  } catch (error: unknown) {
    if (sequence !== metadataSequence || selectedSchemaId.value !== schemaId) return
    schemaDetailError.value = errorMessage(error, '온톨로지 스키마 상세를 불러오지 못했습니다.')
  } finally {
    if (sequence === metadataSequence) schemaDetailLoading.value = false
  }
}

async function retrySchemas(): Promise<void> {
  await loadSchemas()
  if (!schemaListError.value) await nextTick(() => schemaSelect.value?.focus())
}

async function retrySchemaDetail(): Promise<void> {
  await loadSchemaDetail(selectedSchemaId.value)
  if (!schemaDetailError.value) await nextTick(() => nodeTypeSelect.value?.focus())
}

function resetDraft(): void {
  metadataSequence += 1
  schemas.value = []
  nodeTypes.value = []
  selectedSchemaId.value = ''
  selectedNodeType.value = ''
  selectedIdColumn.value = ''
  selectedNameColumn.value = ''
  createMaterializedView.value = true
  materializedViewName.value = `mv_${Date.now()}`
  schemaListLoading.value = false
  schemaListError.value = null
  schemaDetailLoading.value = false
  schemaDetailError.value = null
  createPending.value = false
  createError.value = null
  createResult.value = null
}

function requestClose(): void {
  if (!createPending.value) emit('close')
}

useDialogFocusLifecycle({
  active: () => Boolean(props.source),
  dialog,
  requestClose,
  initialFocus: () => closeButton.value,
  canClose: () => !createPending.value,
})

async function createInstances(): Promise<void> {
  const source = props.source
  if (!source || !canCreate.value) return

  const datasource = datasourcesStore.selectedDatasource?.name
  if (!datasource) {
    createError.value = '데이터소스를 선택해주세요.'
    return
  }

  createPending.value = true
  createError.value = null
  createResult.value = null
  try {
    const result = await createOntologyInstancesFromSql({
      datasource,
      sourceSql: source.sql,
      schemaId: selectedSchemaId.value,
      nodeType: selectedNodeType.value,
      idColumn: selectedIdColumn.value,
      nameColumn: selectedNameColumn.value || selectedIdColumn.value,
      sourceQuestion: source.question,
      materializedView: {
        enabled: createMaterializedView.value,
        viewName: materializedViewName.value,
        description: `온톨로지 인스턴스 동기화: ${selectedNodeType.value}`,
      },
    })
    createResult.value = {
      createdCount: result.createdCount,
      warning: result.warning ?? null,
    }
  } catch (error: unknown) {
    createError.value = errorMessage(error, '온톨로지 인스턴스를 생성하지 못했습니다.')
  } finally {
    createPending.value = false
  }
}

watch(() => props.source, source => {
  if (source) {
    resetDraft()
    void loadSchemas()
    return
  }
  metadataSequence += 1
})

watch(selectedSchemaId, schemaId => {
  selectedNodeType.value = ''
  selectedIdColumn.value = ''
  selectedNameColumn.value = ''
  nodeTypes.value = []
  schemaDetailError.value = null
  if (schemaId) void loadSchemaDetail(schemaId)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="instance-dialog">
      <div
        v-if="source"
        class="instance-dialog-overlay"
        @click.self="requestClose"
      >
        <section
          ref="dialog"
          class="ontology-modal instance-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="instance-dialog-title"
          :aria-busy="busy"
          tabindex="-1"
        >
          <header class="dialog-header">
            <h3 id="instance-dialog-title">🔮 감시 에이전트 등록</h3>
            <button ref="closeButton" type="button" class="close-dialog" aria-label="감시 에이전트 등록 닫기" :disabled="createPending" @click="requestClose">
              ✕
            </button>
          </header>

          <div class="dialog-body">
            <div class="info-section">
              <div><strong>질문</strong><span>{{ source.question }}</span></div>
              <div><strong>결과 행 수</strong><span>{{ source.rowCount }}개</span></div>
            </div>

            <div class="form-section">
              <label for="instance-schema">온톨로지 스키마</label>
              <select ref="schemaSelect" id="instance-schema" v-model="selectedSchemaId" :disabled="schemaListLoading || Boolean(createResult)">
                <option value="">{{ schemaListLoading ? '스키마 불러오는 중…' : '스키마 선택...' }}</option>
                <option v-for="schema in schemas" :key="schema.id" :value="schema.id">
                  {{ schema.name }} ({{ schema.nodeCount }}개 노드)
                </option>
              </select>
              <div v-if="schemaListError" class="inline-error" role="alert">
                <span>{{ schemaListError }}</span>
                <button type="button" @click="retrySchemas">다시 시도</button>
              </div>
            </div>

            <div v-if="selectedSchemaId" class="form-section">
              <label for="instance-node-type">노드 타입 (인스턴스 종류)</label>
              <select ref="nodeTypeSelect" id="instance-node-type" v-model="selectedNodeType" :disabled="schemaDetailLoading || Boolean(createResult)">
                <option value="">{{ schemaDetailLoading ? '노드 타입 불러오는 중…' : '노드 타입 선택...' }}</option>
                <option v-for="node in nodeTypes" :key="node.id" :value="node.name">
                  {{ node.name }} - {{ node.description }}
                </option>
              </select>
              <div v-if="schemaDetailError" class="inline-error" role="alert">
                <span>{{ schemaDetailError }}</span>
                <button type="button" @click="retrySchemaDetail">다시 시도</button>
              </div>
            </div>

            <div v-if="selectedNodeType && source.columns.length" class="form-section">
              <label for="instance-id-column">ID 컬럼 (인스턴스 식별자)</label>
              <select id="instance-id-column" v-model="selectedIdColumn" :disabled="Boolean(createResult)">
                <option value="">컬럼 선택...</option>
                <option v-for="column in source.columns" :key="column" :value="column">{{ column }}</option>
              </select>
            </div>

            <div v-if="selectedIdColumn" class="form-section">
              <label for="instance-name-column">이름 컬럼 (표시 이름)</label>
              <select id="instance-name-column" v-model="selectedNameColumn" :disabled="Boolean(createResult)">
                <option value="">ID 컬럼과 동일</option>
                <option v-for="column in source.columns" :key="column" :value="column">{{ column }}</option>
              </select>
            </div>

            <div class="form-section">
              <label class="checkbox-label">
                <input v-model="createMaterializedView" type="checkbox" :disabled="Boolean(createResult)" />
                <span>Materialized View 생성 (데이터 동기화용)</span>
              </label>
              <input
                v-if="createMaterializedView"
                v-model="materializedViewName"
                type="text"
                aria-label="Materialized View 이름"
                placeholder="뷰 이름 (예: mv_plant_list)"
                :disabled="Boolean(createResult)"
              />
            </div>

            <div v-if="source.sampleData.length" class="sample-preview">
              <strong>샘플 데이터 (상위 5개)</strong>
              <div class="sample-table-wrapper">
                <table>
                  <thead>
                    <tr><th v-for="column in source.columns" :key="column">{{ column }}</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in source.sampleData" :key="index">
                      <td v-for="column in source.columns" :key="column">{{ row[column] }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="createError" class="create-status error" role="alert">{{ createError }}</div>
            <div v-if="createResult" class="create-status success" role="status">
              <strong>{{ createResult.createdCount }}개의 인스턴스가 생성되었습니다.</strong>
              <span v-if="createResult.warning">주의: {{ createResult.warning }}</span>
            </div>
          </div>

          <footer class="dialog-footer">
            <button type="button" class="cancel-dialog" :disabled="createPending" @click="requestClose">
              {{ createResult ? '완료' : '취소' }}
            </button>
            <button v-if="!createResult" type="button" class="create-instances" :disabled="!canCreate" @click="createInstances">
              {{ createPending ? '생성 중…' : createError ? '다시 시도' : '🔮 인스턴스 생성' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.instance-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.instance-dialog {
  display: flex;
  flex-direction: column;
  width: min(600px, 100%);
  max-height: min(85dvh, 860px);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-lg);
  color: var(--color-text);
}

.dialog-header,
.dialog-footer {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  padding: 16px 20px;
}

.dialog-header {
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);

  h3 { margin: 0; color: var(--color-text-bright); }
}

.close-dialog {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 18px;
}

.dialog-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  overflow-y: auto;
}

.dialog-footer {
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--color-border);
}

.info-section {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);

  div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 10px; }
  strong { color: var(--color-text-light); font-size: 13px; }
  span { overflow-wrap: anywhere; }
}

.form-section {
  display: grid;
  gap: 8px;

  label { color: var(--color-text-light); font-size: 13px; font-weight: 600; }
  select,
  input[type="text"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 9px;
}

.inline-error,
.create-status {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
}

.inline-error,
.create-status.error {
  border: 1px solid color-mix(in srgb, var(--color-error) 50%, transparent);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
}

.inline-error button {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 700;
  cursor: pointer;
}

.create-status.success {
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--color-success) 50%, transparent);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
}

.sample-preview {
  display: grid;
  gap: 8px;

  strong { color: var(--color-text-light); font-size: 13px; }
}

.sample-table-wrapper {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);

  table { min-width: 100%; border-collapse: collapse; font-size: 12px; }
  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    text-align: left;
  }
  th { background: var(--color-bg-tertiary); color: var(--color-text-light); }
}

.cancel-dialog,
.create-instances {
  padding: 10px 18px;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
}

.cancel-dialog {
  border: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text);
}

.create-instances {
  border: 0;
  background: linear-gradient(135deg, #a78bfa, #7c3aed);
  color: white;
}

button:disabled,
select:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.instance-dialog-enter-active,
.instance-dialog-leave-active { transition: opacity 0.2s ease; }
.instance-dialog-enter-from,
.instance-dialog-leave-to { opacity: 0; }

@media (max-width: 480px) {
  .instance-dialog-overlay { padding: 8px; }
  .instance-dialog { max-height: calc(100dvh - 16px); border-radius: 12px; }
  .dialog-header,
  .dialog-footer { padding: 12px 14px; }
  .dialog-body { gap: 14px; padding: 14px; }
  .dialog-footer {
    align-items: stretch;
    flex-direction: column-reverse;

    button { width: 100%; }
  }
  .info-section div { grid-template-columns: 1fr; gap: 3px; }
}
</style>
