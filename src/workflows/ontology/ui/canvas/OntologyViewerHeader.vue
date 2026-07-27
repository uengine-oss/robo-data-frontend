<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type {
  OntologyLibraryEntry,
  OntologySchemaLifecycleError,
} from '@/domains/ontology'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import type { OntologyLibraryDeleteTarget } from '../../application/ontologyLibraryWorkspace'

const props = defineProps<{
  agentMonitorError: string
  visualEffectsError: string
  agentCount: number
  layout: string
  loading: boolean
  schemaLifecycleBusy: boolean
  dropdownOpen: boolean
  entries: readonly OntologyLibraryEntry[]
  listLoading: boolean
  listError: string | null
  listNotice: string | null
  loadErrorMessage: string | null
  operationNotice: string | null
  loadPendingId: string | null
  currentSchemaId: string | null
  editingSchemaId: string | null
  editingSchemaName: string
  renamePendingId: string | null
  renameError: OntologySchemaLifecycleError | null
  deleteTarget: OntologyLibraryDeleteTarget | null
  deletePendingId: string | null
  deleteError: OntologySchemaLifecycleError | null
  savePending: boolean
  saveError: string | null
  whatIfOpen: boolean
  nodeCount: number
}>()

const emit = defineEmits<{
  applyLayout: [layout: string]
  openGenerate: [mode: 'document' | 'schema']
  toggleDropdown: []
  retryList: []
  retryLoad: []
  loadSchema: [schemaId: string]
  saveSchemaName: [schemaId: string]
  cancelEditSchemaName: []
  clearRenameError: []
  startEditSchemaName: [schemaId: string, name: string]
  requestDeleteSchema: [schema: OntologyLibraryEntry]
  closeDeleteDialog: []
  confirmDeleteSchema: []
  save: []
  toggleWhatIf: []
  'update:editingSchemaName': [value: string]
}>()

const schemaNameInputs = ref<HTMLInputElement[]>([])
const deleteDialogRef = ref<HTMLElement | null>(null)
const deleteCancelRef = ref<HTMLButtonElement | null>(null)

function updateLayout(event: Event): void {
  emit('applyLayout', (event.target as HTMLSelectElement).value)
}

function updateEditingName(event: Event): void {
  emit('update:editingSchemaName', (event.target as HTMLInputElement).value)
}

function formatUpdatedAt(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

async function focusRenameInput(): Promise<void> {
  await nextTick()
  const input = schemaNameInputs.value[0]
  input?.focus()
  input?.select()
}

defineExpose({ focusRenameInput })

useDialogFocusLifecycle({
  active: () => Boolean(props.deleteTarget),
  dialog: deleteDialogRef,
  requestClose: () => {
    if (!props.deletePendingId) emit('closeDeleteDialog')
  },
  initialFocus: () => deleteCancelRef.value,
})
</script>

<template>
  <div class="viewer-header">
    <div class="viewer-title">
      <h2>🌐 온톨로지 관리</h2>
      <div v-if="agentMonitorError || visualEffectsError || agentCount > 0" class="agent-monitor-status" role="status">
        <span v-if="agentMonitorError" class="agent-monitor-connection-error" :title="agentMonitorError">
          노드 에이전트 모니터 연결 안 됨
        </span>
        <span v-else-if="visualEffectsError" class="agent-monitor-connection-error" :title="visualEffectsError">
          노드 시각효과 연결 안 됨
        </span>
        <span v-else>{{ agentCount }}개 노드 에이전트 감지</span>
      </div>
    </div>

    <div class="header-actions">
      <select class="layout-select header-layout-select" :value="layout" @change="updateLayout">
        <option value="hierarchical">계층형 (Hierarchical)</option>
        <option value="cose">물리 기반 (Cose)</option>
        <option value="circle">원형 (Circle)</option>
        <option value="grid">격자 (Grid)</option>
      </select>
      <button type="button" class="action-btn" @click="emit('openGenerate', 'document')">
        <span>📄</span> 문서에서 생성
      </button>
      <button type="button" class="action-btn" @click="emit('openGenerate', 'schema')">
        <span>🗃️</span> DB 스키마에서 생성
      </button>

      <div class="ontology-list-dropdown" :class="{ 'dropdown-open': dropdownOpen }">
        <button
          type="button"
          class="action-btn"
          :disabled="loading || schemaLifecycleBusy"
          :aria-expanded="dropdownOpen"
          aria-controls="ontology-library-menu"
          aria-haspopup="true"
          @click="emit('toggleDropdown')"
        >
          <span>📂</span> 온톨로지 목록
          <span class="dropdown-arrow">{{ dropdownOpen ? '▲' : '▼' }}</span>
        </button>
        <div
          v-if="dropdownOpen"
          id="ontology-library-menu"
          class="dropdown-menu"
          aria-label="저장된 온톨로지"
          :aria-busy="listLoading || schemaLifecycleBusy"
        >
          <div v-if="listLoading" class="dropdown-loading" role="status">
            <div class="loading-spinner small"></div>
            <span>로딩 중...</span>
          </div>
          <template v-else>
            <div v-if="listError" class="dropdown-state error" role="alert" aria-live="assertive">
              <span>{{ listError }}</span>
              <button type="button" @click.stop="emit('retryList')">다시 시도</button>
            </div>
            <div v-if="loadErrorMessage" class="dropdown-state error load-error" role="alert" aria-live="assertive">
              <span>{{ loadErrorMessage }}</span>
              <button type="button" :disabled="schemaLifecycleBusy" @click.stop="emit('retryLoad')">
                다시 시도
              </button>
            </div>
            <div v-if="loadPendingId" class="dropdown-state info" role="status" aria-live="polite">
              온톨로지 데이터를 불러오는 중입니다.
            </div>
            <div v-if="operationNotice" class="dropdown-state success" role="status" aria-live="polite">
              {{ operationNotice }}
            </div>
            <div v-if="listNotice" class="dropdown-state warning" role="status" aria-live="polite">
              {{ listNotice }}
            </div>
            <div v-if="entries.length === 0 && !listError" class="dropdown-empty">
              <p>{{ listNotice ? '불러올 수 있는 온톨로지가 없습니다.' : '저장된 온톨로지가 없습니다.' }}</p>
            </div>
            <div v-if="entries.length > 0" class="dropdown-list">
              <div
                v-for="schema in entries"
                :key="schema.id"
                class="dropdown-item"
                :class="{ editing: editingSchemaId === schema.id, active: currentSchemaId === schema.id }"
              >
                <div class="dropdown-item-info">
                  <input
                    v-if="editingSchemaId === schema.id"
                    ref="schemaNameInputs"
                    class="schema-name-input"
                    :value="editingSchemaName"
                    :disabled="renamePendingId === schema.id"
                    :aria-invalid="renameError?.schemaId === schema.id ? 'true' : undefined"
                    :aria-describedby="renameError?.schemaId === schema.id ? `schema-rename-error-${schema.id}` : undefined"
                    @input="updateEditingName"
                    @blur="emit('saveSchemaName', schema.id)"
                    @keydown.enter.prevent="emit('saveSchemaName', schema.id)"
                    @keydown.esc.prevent="emit('cancelEditSchemaName')"
                    @click.stop
                  />
                  <button
                    v-else
                    type="button"
                    class="dropdown-item-name schema-load-button"
                    :aria-current="currentSchemaId === schema.id ? 'true' : undefined"
                    :aria-busy="loadPendingId === schema.id"
                    :disabled="schemaLifecycleBusy"
                    @click.stop="emit('loadSchema', schema.id)"
                  >
                    {{ loadPendingId === schema.id ? '불러오는 중…' : schema.name }}
                  </button>
                  <button
                    v-if="editingSchemaId !== schema.id"
                    type="button"
                    class="edit-name-btn-small"
                    :disabled="schemaLifecycleBusy"
                    :aria-label="`${schema.name} 온톨로지 이름 편집`"
                    @click.stop="emit('startEditSchemaName', schema.id, schema.name)"
                  >
                    ✏️
                  </button>
                </div>
                <p
                  v-if="renameError?.schemaId === schema.id"
                  :id="`schema-rename-error-${schema.id}`"
                  class="schema-inline-error"
                  role="alert"
                >
                  이름 변경 실패: {{ renameError.message }}
                </p>
                <div class="dropdown-item-meta">
                  <span class="node-count-small">{{ schema.nodeCount }} 노드</span>
                  <span v-if="schema.updatedAt" class="updated-at-small">{{ formatUpdatedAt(schema.updatedAt) }}</span>
                  <button
                    type="button"
                    class="delete-schema-btn"
                    :disabled="schemaLifecycleBusy"
                    title="온톨로지 삭제"
                    @click.stop="emit('requestDeleteSchema', schema)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <button type="button" class="action-btn" :disabled="loading || savePending" @click="emit('save')">
        <span>💾</span>
        {{ savePending ? '저장 중…' : saveError ? '저장 다시 시도' : '저장' }}
      </button>
      <button
        type="button"
        class="action-btn whatif-toggle-btn"
        :class="{ active: whatIfOpen }"
        :disabled="loading || nodeCount === 0 || !currentSchemaId"
        @click="emit('toggleWhatIf')"
      >
        <span>🔬</span> What-if 분석
      </button>
    </div>

    <div v-if="deleteTarget" class="dialog-overlay" @click.self="emit('closeDeleteDialog')">
      <div
        ref="deleteDialogRef"
        class="delete-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-schema-dialog-title"
        :aria-busy="deletePendingId === deleteTarget.id"
        tabindex="-1"
      >
        <h3 id="delete-schema-dialog-title">온톨로지 삭제 확인</h3>
        <p class="delete-confirm-message">
          다음 온톨로지를 삭제하시겠습니까?<br />
          <strong class="delete-schema-name">「{{ deleteTarget.name }}」</strong>
        </p>
        <p class="delete-confirm-warning">삭제된 온톨로지는 복구할 수 없습니다.</p>
        <p v-if="deleteError?.schemaId === deleteTarget.id" class="delete-confirm-error" role="alert">
          삭제 실패: {{ deleteError.message }}
        </p>
        <div class="delete-confirm-actions">
          <button
            ref="deleteCancelRef"
            type="button"
            class="cancel-btn"
            :disabled="deletePendingId === deleteTarget.id"
            @click="emit('closeDeleteDialog')"
          >
            취소
          </button>
          <button
            type="button"
            class="delete-confirm-btn"
            :disabled="deletePendingId === deleteTarget.id"
            @click="emit('confirmDeleteSchema')"
          >
            {{ deletePendingId === deleteTarget.id ? '삭제 중…' : deleteError ? '다시 삭제' : '삭제' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./OntologyViewerHeader.scss" lang="scss"></style>
