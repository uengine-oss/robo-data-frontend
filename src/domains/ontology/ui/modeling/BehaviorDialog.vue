<script setup lang="ts">
import {
  computed,
  ref,
} from 'vue'
import { IconCheck, IconPlay, IconX } from '@/shared/icons'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import type {
  EditableBehaviorType,
  OntologyBehavior,
} from '@/domains/ontology'
import {
  CUSTOM_OUTPUT_FIELD,
  resolveBehaviorOutputField,
  type RelatedBehaviorObjectType,
} from '../../application/behaviorDraft'
import { useBehaviorEditor } from '../../application/useBehaviorEditor'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import DmnEditor from './DmnEditor.vue'

const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  objectTypeName: string
  columns: string[]
  relatedObjectTypes?: RelatedBehaviorObjectType[]
  behavior?: OntologyBehavior
}>()

const emit = defineEmits<{
  close: []
  saved: [behavior: OntologyBehavior]
  deleted: [behaviorName: string]
}>()

const behaviorTypes: Array<{
  value: EditableBehaviorType
  label: string
  icon: string
}> = [
  { value: 'rest_api', label: 'REST API 호출', icon: '🌐' },
  { value: 'dmn', label: 'DMN 규칙', icon: '📊' },
  { value: 'python', label: 'Python 코드', icon: '🐍' },
  { value: 'javascript', label: 'JavaScript 코드', icon: '📜' },
]

const {
  draft,
  generationPending,
  generationError,
  generationCanRetry,
  savePending,
  saveError,
  saveCanRetry,
  testPending,
  testError,
  testCanRetry,
  testResultText,
  deleteDialogOpen,
  deletePending,
  deleteError,
  isBusy,
  toggleInputField,
  generatePythonCode,
  retryGeneration,
  saveBehavior,
  retrySave,
  testBehavior,
  retryTest,
  requestDelete,
  dismissDelete,
  confirmDelete,
} = useBehaviorEditor({
  visible: () => props.visible,
  mode: () => props.mode,
  objectTypeName: () => props.objectTypeName,
  columns: () => props.columns,
  relatedObjectTypes: () => props.relatedObjectTypes,
  behavior: () => props.behavior,
})

const dialogRef = ref<HTMLElement | null>(null)
const nameInputRef = ref<HTMLInputElement | null>(null)
const descriptionInputRef = ref<HTMLTextAreaElement | null>(null)
const dmnEditorRef = ref<InstanceType<typeof DmnEditor> | null>(null)

const dialogTitle = computed(() =>
  props.mode === 'create' ? 'Behavior 추가' : 'Behavior 편집',
)
const inputColumnsForDmn = computed(() =>
  draft.value.inputFields.map(name => ({ name, type: 'string' })),
)
const dmnOutputColumn = computed(() => resolveBehaviorOutputField(draft.value))
const canSave = computed(() =>
  Boolean(draft.value.name.trim()) && !isBusy.value,
)

function requestClose(): void {
  if (!isBusy.value && !deleteDialogOpen.value) emit('close')
}

useDialogFocusLifecycle({
  active: () => props.visible,
  dialog: dialogRef,
  requestClose,
  initialFocus: () => props.mode === 'create'
    ? nameInputRef.value
    : descriptionInputRef.value,
  canClose: () => !isBusy.value && !deleteDialogOpen.value,
  suspended: () => deleteDialogOpen.value,
})

async function saveFromDialog(): Promise<void> {
  let dmnXml: string | undefined
  if (draft.value.behaviorType === 'dmn') {
    dmnXml = (await dmnEditorRef.value?.exportXml()) ?? undefined
  }
  const saved = await saveBehavior(dmnXml)
  if (saved) emit('saved', saved)
}

async function retrySaveFromDialog(): Promise<void> {
  const saved = await retrySave()
  if (saved) emit('saved', saved)
}

async function deleteFromDialog(): Promise<void> {
  const deletedName = await confirmDelete()
  if (deletedName) emit('deleted', deletedName)
}

</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="behavior-dialog-overlay"
      @click.self="requestClose"
    >
      <section
        ref="dialogRef"
        class="behavior-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="behavior-dialog-title"
        :aria-busy="isBusy"
        tabindex="-1"
      >
        <header class="dialog-header">
          <div class="header-title">
            <span class="dialog-icon" aria-hidden="true">⚡</span>
            <h2 id="behavior-dialog-title">{{ dialogTitle }}</h2>
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label="Behavior 편집기 닫기"
            :disabled="isBusy"
            @click="requestClose"
          >
            <IconX :size="18" />
          </button>
        </header>

        <div class="dialog-body">
          <section class="form-section" aria-labelledby="behavior-basic-heading">
            <h3 id="behavior-basic-heading">기본 정보</h3>

            <div class="form-row">
              <label for="behavior-name">
                이름 <span class="required" aria-hidden="true">*</span>
              </label>
              <input
                id="behavior-name"
                ref="nameInputRef"
                v-model="draft.name"
                type="text"
                placeholder="예: calculateRisk, predict, transform"
                autocomplete="off"
                :disabled="mode === 'edit' || isBusy"
                required
              />
            </div>

            <div class="form-row">
              <label for="behavior-description">설명</label>
              <textarea
                id="behavior-description"
                ref="descriptionInputRef"
                v-model="draft.description"
                rows="3"
                :disabled="isBusy"
                placeholder="Behavior가 수행하는 일을 설명해주세요. AI 코드 생성은 이 설명을 사용합니다."
              />
            </div>

            <div v-if="draft.behaviorType !== 'processGPT'" class="generate-code-row">
              <button
                type="button"
                class="generate-button"
                :disabled="!draft.description.trim() || isBusy"
                @click="generatePythonCode"
              >
                <span v-if="generationPending" class="spinner" aria-hidden="true" />
                <span v-else aria-hidden="true">✨</span>
                {{ generationPending ? 'AI 코드 생성 중…' : 'AI로 Python 코드 생성' }}
              </button>
              <span class="generate-hint">
                현재 ObjectType의 필드와 관계 정보를 함께 전달합니다.
              </span>
            </div>
            <div
              v-if="generationError"
              class="operation-error"
              role="alert"
            >
              <span>{{ generationError }}</span>
              <button
                v-if="generationCanRetry"
                type="button"
                :disabled="isBusy"
                @click="retryGeneration"
              >
                같은 요청 다시 시도
              </button>
            </div>
          </section>

          <section class="form-section" aria-labelledby="behavior-type-heading">
            <h3 id="behavior-type-heading">실행 방식</h3>
            <div class="type-options" role="group" aria-labelledby="behavior-type-heading">
              <button
                v-for="type in behaviorTypes"
                :key="type.value"
                type="button"
                class="type-option"
                :class="{ selected: draft.behaviorType === type.value }"
                :aria-pressed="draft.behaviorType === type.value"
                :disabled="isBusy"
                @click="draft.behaviorType = type.value"
              >
                <span class="type-icon" aria-hidden="true">{{ type.icon }}</span>
                <span>{{ type.label }}</span>
              </button>
              <button
                v-if="draft.behaviorType === 'processGPT'"
                type="button"
                class="type-option selected"
                aria-pressed="true"
                disabled
              >
                <span class="type-icon" aria-hidden="true">⚙️</span>
                <span>ProcessGPT</span>
              </button>
            </div>
          </section>

          <section
            v-if="draft.behaviorType === 'rest_api'"
            class="form-section"
            aria-labelledby="behavior-rest-heading"
          >
            <h3 id="behavior-rest-heading">REST API 설정</h3>
            <div class="form-row">
              <label for="behavior-endpoint">
                엔드포인트 URL <span class="required" aria-hidden="true">*</span>
              </label>
              <input
                id="behavior-endpoint"
                v-model="draft.endpoint"
                type="url"
                placeholder="http://localhost:8003/execute-behavior"
                autocomplete="url"
                :disabled="isBusy"
                required
              />
            </div>
            <div class="form-row">
              <label for="behavior-http-method">HTTP 메서드</label>
              <select
                id="behavior-http-method"
                v-model="draft.httpMethod"
                :disabled="isBusy"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div class="form-row">
              <label for="behavior-test-input">테스트 입력 (JSON 객체)</label>
              <textarea
                id="behavior-test-input"
                v-model="draft.testInstanceJson"
                class="code-editor compact"
                rows="5"
                spellcheck="false"
                :disabled="isBusy"
                placeholder='{"field": "실제 테스트 값"}'
              />
              <p class="section-hint">
                이 값만 운영자가 입력한 외부 URL로 전송합니다.
              </p>
            </div>
            <div v-if="testError" class="operation-error" role="alert">
              <span>{{ testError }}</span>
              <button
                v-if="testCanRetry"
                type="button"
                :disabled="isBusy"
                @click="retryTest"
              >
                같은 요청 다시 시도
              </button>
            </div>
          </section>

          <section
            v-if="draft.behaviorType === 'python'"
            class="form-section"
            aria-labelledby="behavior-python-heading"
          >
            <h3 id="behavior-python-heading">Python 코드</h3>
            <p class="section-hint">
              <code>data</code>에 인스턴스가 전달됩니다. 결과는
              <code>result</code> 변수에 저장하세요.
            </p>
            <label class="visually-hidden" for="behavior-python-code">Python 코드</label>
            <textarea
              id="behavior-python-code"
              v-model="draft.pythonCode"
              class="code-editor"
              rows="10"
              spellcheck="false"
              :disabled="isBusy"
              placeholder="# result = {'status': 'ok'}"
            />
          </section>

          <section
            v-if="draft.behaviorType === 'dmn'"
            class="form-section dmn-section"
            aria-labelledby="behavior-dmn-heading"
          >
            <h3 id="behavior-dmn-heading">DMN 규칙 편집기</h3>
            <p class="section-hint">
              아래에서 선택한 입력 필드가 Decision Table 컬럼으로 전달됩니다.
            </p>
            <div class="dmn-editor-wrapper">
              <DmnEditor
                ref="dmnEditorRef"
                v-model="draft.dmnXml"
                :input-columns="inputColumnsForDmn"
                :output-column="dmnOutputColumn"
                @change="draft.dmnXml = $event"
              />
            </div>
          </section>

          <section
            v-if="draft.behaviorType === 'processGPT'"
            class="form-section"
            aria-labelledby="behavior-process-heading"
          >
            <h3 id="behavior-process-heading">ProcessGPT 연결</h3>
            <p class="section-hint">
              프로세스 연결 정보는 Agents.md 편집기에서 관리합니다. 여기서는 설명과 입출력 필드를
              수정하거나 Behavior를 삭제할 수 있습니다.
            </p>
            <div class="form-row">
              <label for="behavior-process-name">프로세스</label>
              <input
                id="behavior-process-name"
                :value="draft.processName"
                type="text"
                disabled
              />
            </div>
            <div class="form-row">
              <label for="behavior-trigger-condition">트리거 조건</label>
              <input
                id="behavior-trigger-condition"
                :value="draft.triggerCondition || '조건 없음'"
                type="text"
                disabled
              />
            </div>
          </section>

          <section
            v-if="draft.behaviorType === 'javascript'"
            class="form-section"
            aria-labelledby="behavior-javascript-heading"
          >
            <h3 id="behavior-javascript-heading">JavaScript 코드</h3>
            <p class="section-hint">
              <code>data</code>에 인스턴스가 전달됩니다. 결과를
              <code>return</code> 하세요.
            </p>
            <label class="visually-hidden" for="behavior-javascript-code">
              JavaScript 코드
            </label>
            <textarea
              id="behavior-javascript-code"
              v-model="draft.javascriptCode"
              class="code-editor"
              rows="10"
              spellcheck="false"
              :disabled="isBusy"
              placeholder="// return { status: 'ok' };"
            />
          </section>

          <section class="form-section" aria-labelledby="behavior-fields-heading">
            <h3 id="behavior-fields-heading">입출력 필드</h3>
            <div class="io-fields">
              <div class="io-group">
                <span id="behavior-input-fields-label" class="field-label">
                  입력 필드
                </span>
                <div
                  class="field-chips"
                  role="group"
                  aria-labelledby="behavior-input-fields-label"
                >
                  <button
                    v-for="column in columns"
                    :key="column"
                    type="button"
                    class="field-chip"
                    :class="{ selected: draft.inputFields.includes(column) }"
                    :aria-pressed="draft.inputFields.includes(column)"
                    :disabled="isBusy"
                    @click="toggleInputField(column)"
                  >
                    {{ column }}
                  </button>
                  <span v-if="!columns.length" class="empty-fields">
                    선택할 필드가 없습니다.
                  </span>
                </div>
              </div>

              <div class="io-group">
                <label for="behavior-output-field">출력 필드</label>
                <select
                  id="behavior-output-field"
                  v-model="draft.outputSelection"
                  :disabled="isBusy"
                >
                  <option value="">저장하지 않음</option>
                  <option
                    v-for="column in columns"
                    :key="column"
                    :value="column"
                  >
                    {{ column }}
                  </option>
                  <option :value="CUSTOM_OUTPUT_FIELD">새 필드 이름 입력</option>
                </select>
                <label
                  v-if="draft.outputSelection === CUSTOM_OUTPUT_FIELD"
                  class="visually-hidden"
                  for="behavior-custom-output-field"
                >
                  새 출력 필드 이름
                </label>
                <input
                  v-if="draft.outputSelection === CUSTOM_OUTPUT_FIELD"
                  id="behavior-custom-output-field"
                  v-model="draft.customOutputField"
                  type="text"
                  class="new-field-input"
                  placeholder="새 필드 이름"
                  :disabled="isBusy"
                />
              </div>
            </div>
          </section>

          <section
            v-if="testResultText"
            class="form-section"
            aria-labelledby="behavior-test-result-heading"
          >
            <h3 id="behavior-test-result-heading">테스트 결과</h3>
            <pre class="test-result" tabindex="0">{{ testResultText }}</pre>
          </section>

          <div v-if="saveError" class="operation-error" role="alert">
            <span>{{ saveError }}</span>
            <button
              v-if="saveCanRetry"
              type="button"
              :disabled="isBusy"
              @click="retrySaveFromDialog"
            >
              같은 저장 다시 시도
            </button>
          </div>
        </div>

        <footer class="dialog-footer">
          <button
            v-if="draft.behaviorType === 'rest_api'"
            type="button"
            class="test-button"
            :disabled="isBusy || !draft.endpoint.trim()"
            @click="testBehavior"
          >
            <span v-if="testPending" class="spinner" aria-hidden="true" />
            <IconPlay v-else :size="14" />
            {{ testPending ? '테스트 중…' : '테스트' }}
          </button>
          <button
            v-if="mode === 'edit'"
            type="button"
            class="delete-button"
            :disabled="isBusy"
            @click="requestDelete"
          >
            삭제
          </button>
          <span class="footer-spacer" />
          <button
            type="button"
            class="cancel-button"
            :disabled="isBusy"
            @click="requestClose"
          >
            취소
          </button>
          <button
            type="button"
            class="save-button"
            :disabled="!canSave"
            @click="saveFromDialog"
          >
            <span v-if="savePending" class="spinner" aria-hidden="true" />
            <IconCheck v-else :size="16" />
            {{ savePending ? '저장 중…' : '저장' }}
          </button>
        </footer>
      </section>
    </div>

    <ActionDialog
      :open="deleteDialogOpen"
      dialog-id="behavior-delete-dialog"
      title="Behavior 삭제"
      :message="`“${behavior?.name ?? draft.name}” Behavior를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`"
      confirm-label="삭제"
      pending-label="삭제 중…"
      :pending="deletePending"
      :error="deleteError || null"
      @cancel="dismissDelete"
      @confirm="deleteFromDialog"
    />
  </Teleport>
</template>

<style scoped lang="scss">
.behavior-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
}

.behavior-dialog {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: calc(100dvh - 48px);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52);
}

.dialog-header,
.dialog-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-color: var(--color-border);
  background: var(--color-bg-secondary);
}

.dialog-header {
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);
}

.header-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;

  h2 {
    margin: 0;
    color: var(--color-text-bright);
    font-size: 1.1rem;
  }
}

.dialog-icon {
  font-size: 1.4rem;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
    color: var(--color-text-bright);
  }
}

.dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px;
}

.form-section {
  margin: 0 0 26px;

  h3 {
    margin: 0 0 12px;
    color: var(--color-text-bright);
    font-size: 0.95rem;
  }
}

.form-row {
  margin-bottom: 14px;
}

.form-row label,
.field-label,
.io-group > label {
  display: block;
  margin-bottom: 7px;
  color: var(--color-text-light);
  font-size: 0.85rem;
}

input,
textarea,
select {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 13px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-bright);
  font: inherit;

  &:focus-visible {
    outline: 2px solid #00d4aa;
    outline-offset: 1px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
}

textarea {
  resize: vertical;
}

.required {
  color: #f87171;
}

.generate-code-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.generate-button,
.test-button,
.delete-button,
.cancel-button,
.save-button,
.operation-error button,
.type-option,
.field-chip {
  min-height: 38px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:focus-visible {
    outline: 2px solid #00d4aa;
    outline-offset: 2px;
  }
}

.generate-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border: 0;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.generate-hint,
.section-hint,
.empty-fields {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.55;
}

.section-hint {
  margin: 0 0 12px;

  code {
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--color-bg-tertiary);
    color: #00d4aa;
  }
}

.type-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.type-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 14px 8px;
  border: 2px solid var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text-light);

  &:hover:not(:disabled),
  &.selected {
    border-color: #00d4aa;
  }

  &.selected {
    background: rgba(0, 212, 170, 0.1);
    color: var(--color-text-bright);
  }
}

.type-icon {
  font-size: 1.35rem;
}

.code-editor {
  min-height: 160px;
  background: #171728;
  color: #6ee7c8;
  font-family: 'Fira Code', Consolas, monospace;
  font-size: 0.84rem;
  line-height: 1.55;

  &.compact {
    min-height: 110px;
  }
}

.dmn-editor-wrapper {
  width: 100%;
  height: 450px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fff;
}

.io-fields {
  display: grid;
  gap: 18px;
}

.field-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-chip {
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-light);

  &:hover:not(:disabled),
  &.selected {
    border-color: #a78bfa;
  }

  &.selected {
    background: rgba(167, 139, 250, 0.18);
    color: #c4b5fd;
  }
}

.new-field-input {
  margin-top: 9px;
}

.test-result {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 13px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: #6ee7c8;
  font: 0.82rem/1.55 'Fira Code', Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.operation-error {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 11px 12px;
  border: 1px solid rgba(248, 113, 113, 0.4);
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.1);
  color: #fca5a5;
  font-size: 0.86rem;
  overflow-wrap: anywhere;

  button {
    flex: 0 0 auto;
    min-height: 32px;
    padding: 5px 10px;
    border: 1px solid rgba(248, 113, 113, 0.55);
    background: transparent;
    color: inherit;
  }
}

.dialog-footer {
  border-top: 1px solid var(--color-border);
}

.footer-spacer {
  flex: 1;
}

.test-button,
.delete-button,
.cancel-button,
.save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 16px;
}

.test-button {
  border: 1px solid #a78bfa;
  background: rgba(167, 139, 250, 0.14);
  color: #c4b5fd;
}

.delete-button {
  border: 1px solid #ef4444;
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
}

.cancel-button {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-light);
}

.save-button {
  min-width: 94px;
  border: 0;
  background: linear-gradient(135deg, #00d4aa, #00a8cc);
  color: #fff;
  font-weight: 650;
}

.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .behavior-dialog-overlay {
    align-items: stretch;
    padding: 8px;
  }

  .behavior-dialog {
    width: 100%;
    max-height: calc(100dvh - 16px);
    border-radius: 12px;
  }

  .dialog-header,
  .dialog-footer,
  .dialog-body {
    padding-right: 16px;
    padding-left: 16px;
  }

  .dialog-body {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  .type-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .generate-code-row,
  .operation-error {
    align-items: stretch;
    flex-direction: column;
  }

  .generate-button,
  .operation-error button {
    width: 100%;
  }

  .dmn-editor-wrapper {
    height: 360px;
  }

  .dialog-footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .footer-spacer {
    display: none;
  }

  .dialog-footer button {
    width: 100%;
  }

  .save-button {
    grid-column: 2;
  }

  .cancel-button {
    grid-column: 1;
  }
}
</style>
