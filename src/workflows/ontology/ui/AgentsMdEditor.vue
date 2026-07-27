<script setup lang="ts">
/**
 * AgentsMdEditor.vue
 * Context-aware Agents.md WYSIWYG-style markdown editor.
 * 
 * Uses a transparent textarea overlaid on a styled highlight layer
 * so @mentions render as colored chips and markdown syntax is styled
 * even while editing.
 */
import { ref, computed, nextTick, toRef, watch } from 'vue'
import type { ProcessGptProcess } from '@/domains/agent-scheduler'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import {
  computeChangedLineIndexes,
} from '../application/agentsMdEditorPolicy'
import { useAgentsMdEditor } from '../composables/useAgentsMdEditor'
import type { NodeBehaviorPresentation } from './canvas/nodeBehaviorPresentation'

const props = defineProps<{
  nodeTypeName: string
  behaviorModels?: NodeBehaviorPresentation[]
}>()

const emit = defineEmits<{
  (e: 'agentCreated'): void
  (e: 'agentDeleted'): void
}>()

const {
  content,
  enabled: agentEnabled,
  hasAgent,
  isDirty,
  isContentDirty,
  context,
  processList,
  processGptMethods,
  contentLoad,
  contextLoad,
  processListLoad,
  createOperation,
  saveOperation,
  deleteOperation,
  resetOperation,
  rewriteOperation,
  processAddOperation,
  anyMutationPending,
  loadContent,
  loadContext,
  loadProcesses,
  cancelProcessList,
  createAgent: createAgentMutation,
  saveAgent: saveAgentMutation,
  toggleEnabled,
  retrySave,
  deleteAgent: deleteAgentMutation,
  retryDelete,
  resetToTemplate: resetToTemplateMutation,
  retryReset,
  rewrite,
  retryRewrite,
  cancelRewrite,
  addProcess,
  retryProcessAdd,
  clearOperationError,
} = useAgentsMdEditor(
  toRef(props, 'nodeTypeName'),
  undefined,
  {
    onCreated: () => emit('agentCreated'),
    onDeleted: () => emit('agentDeleted'),
  },
)

const { schedule } = useManagedTimeouts()
const successMsg = ref('')
const showDeleteDialog = ref(false)
const showResetDialog = ref(false)

function showSuccess(message: string, duration = 3000): void {
  successMsg.value = message
  schedule('agents-md-success', () => {
    successMsg.value = ''
  }, duration)
}

// ------- Built-in method groups -------
interface BuiltinMethod {
  name: string           // dot-notation: visualization.setBadge
  label: string          // 표시명
  description: string
}

interface BuiltinMethodGroup {
  key: string
  label: string
  icon: string
  expanded: boolean
  methods: BuiltinMethod[]
}

const builtinMethodGroups = ref<BuiltinMethodGroup[]>([
  {
    key: 'visualization',
    label: 'Visualization',
    icon: '🎨',
    expanded: false,
    methods: [
      { name: 'visualization.setColor', label: '노드 색상 변경', description: '노드의 배경색을 지정 색상으로 변경' },
      { name: 'visualization.setBadge', label: '배지 표시', description: '노드 위에 텍스트/이모지 배지 표시' },
      { name: 'visualization.removeBadge', label: '배지 제거', description: '노드의 배지를 제거' },
      { name: 'visualization.setAlert', label: '알럿 표시', description: '노드에 경고 깜빡임 효과 적용' },
      { name: 'visualization.clearAlert', label: '알럿 해제', description: '노드의 경고 효과 해제' },
      { name: 'visualization.setOpacity', label: '투명도 변경', description: '노드의 투명도를 0~1 범위로 조절' },
      { name: 'visualization.highlight', label: '하이라이트', description: '노드를 일시적으로 강조 표시' },
      { name: 'visualization.setTooltip', label: '툴팁 설정', description: '마우스 호버 시 표시할 텍스트 설정' },
    ]
  },
  {
    key: 'notification',
    label: 'Notification',
    icon: '🔔',
    expanded: false,
    methods: [
      { name: 'notification.send', label: '알림 발송', description: '사용자에게 알림 메시지 전송' },
      { name: 'notification.log', label: '로그 기록', description: '에이전트 로그에 메시지 기록' },
      { name: 'notification.escalate', label: '에스컬레이션', description: '담당자에게 에스컬레이션 알림' },
    ]
  },
  {
    key: 'data',
    label: 'Data',
    icon: '📊',
    expanded: false,
    methods: [
      { name: 'data.query', label: '데이터 조회', description: '연결된 데이터소스에서 SQL 쿼리 실행' },
      { name: 'data.aggregate', label: '데이터 집계', description: '필드의 합계/평균/최대/최소 집계' },
      { name: 'data.getLatest', label: '최신 데이터', description: '가장 최근 데이터 행 조회' },
    ]
  },
])

function toggleBuiltinGroup(key: string) {
  const group = builtinMethodGroups.value.find(g => g.key === key)
  if (group) group.expanded = !group.expanded
}

function contextGroupId(groupKey: string): string {
  const nodeKey = encodeURIComponent(props.nodeTypeName).replace(/%/g, '_')
  return `agents-context-${nodeKey}-${groupKey}`
}

// ------- ProcessGPT methods -------
const processGptExpanded = ref(false)
const showProcessSelector = ref(false)
const selectedProcess = ref<ProcessGptProcess | null>(null)
const processTriggerCondition = ref('')
const processSaving = computed(() => processAddOperation.pending)
const processListLoading = computed(() => processListLoad.pending)
const processListError = computed(() => processListLoad.error)
const processDialogRef = ref<HTMLElement | null>(null)
const processDialogCloseRef = ref<HTMLButtonElement | null>(null)

async function openProcessSelector() {
  showProcessSelector.value = true
  selectedProcess.value = null
  processTriggerCondition.value = ''
  await loadProcesses()
}

function closeProcessSelector(): void {
  if (processSaving.value) return
  cancelProcessList()
  showProcessSelector.value = false
  selectedProcess.value = null
  processTriggerCondition.value = ''
  clearOperationError(processAddOperation)
}

useDialogFocusLifecycle({
  active: () => showProcessSelector.value,
  dialog: processDialogRef,
  requestClose: closeProcessSelector,
  initialFocus: () => processDialogCloseRef.value,
  canClose: () => !processSaving.value,
})

async function addProcessMethod() {
  if (!selectedProcess.value || processSaving.value) return
  const proc = selectedProcess.value
  const succeeded = processAddOperation.error
    ? await retryProcessAdd()
    : await addProcess(proc, processTriggerCondition.value)
  if (succeeded) {
    closeProcessSelector()
    showSuccess(`${proc.name} 프로세스가 메서드로 추가되었습니다`)
  }
}

// ------- View state -------
const loading = computed(() => contentLoad.pending)
const saving = computed(() => anyMutationPending.value)
const loadError = computed(() => contentLoad.error)
const contextLoading = computed(() => contextLoad.pending)

const editorRef = ref<HTMLTextAreaElement | null>(null)
const highlightRef = ref<HTMLDivElement | null>(null)
const showPreview = ref(false)
const showContextSidebar = ref(true)

// @mention autocomplete
const showMentionDropdown = ref(false)
const mentionQuery = ref('')
const mentionCursorPos = ref(0)
const mentionType = ref<'all' | 'field' | 'method' | 'node'>('all')
const selectedMentionIndex = ref(0)

// ------- Highlight rendering (the magic layer) -------
// Main highlight is now `highlightedHtmlWithDiff` (defined below, after diff helpers)

// Preview render (full HTML for preview tab)
function renderPreview(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/<!--(.+?)-->/g, '<span class="md-comment">&lt;!--$1--&gt;</span>')
    .replace(/@field:([\w\u3131-\uD79D]+)/g, '<span class="mention mention-field">📊 $1</span>')
    .replace(/@method:([\w\u3131-\uD79D]+)/g, '<span class="mention mention-method">⚙️ $1</span>')
    .replace(/@node:([\w\u3131-\uD79D\s\-()]+?)(?=\s*[\n\[\]`]|$)/g, '<span class="mention mention-node">🔗 $1</span>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
  return '<p>' + html + '</p>'
}

// ------- Scroll sync -------
function syncScroll() {
  if (editorRef.value && highlightRef.value) {
    highlightRef.value.scrollTop = editorRef.value.scrollTop
    highlightRef.value.scrollLeft = editorRef.value.scrollLeft
  }
}

// ------- Mention items -------
const mentionItems = computed(() => {
  const q = mentionQuery.value.toLowerCase()
  const items: Array<{ type: string; name: string; detail: string; insert: string }> = []
  if (!context.value) return items

  let filterType = mentionType.value
  let searchQ = q
  if (q.startsWith('field:')) { filterType = 'field'; searchQ = q.slice(6) }
  else if (q.startsWith('method:')) { filterType = 'method'; searchQ = q.slice(7) }
  else if (q.startsWith('node:')) { filterType = 'node'; searchQ = q.slice(5) }

  if (filterType === 'all' || filterType === 'field') {
    for (const f of context.value.fields) {
      if (!searchQ || f.name.toLowerCase().includes(searchQ))
        items.push({ type: 'field', name: f.name, detail: `${f.type}${f.description ? ' — '+f.description : ''}`, insert: `@field:${f.name}` })
    }
  }
  if (filterType === 'all' || filterType === 'method') {
    // User-defined methods
    for (const m of context.value.methods) {
      if (!searchQ || m.name.toLowerCase().includes(searchQ))
        items.push({ type: 'method', name: m.name, detail: `${m.behaviorType}${m.description ? ' — '+m.description : ''}`, insert: `@method:${m.name}` })
    }
    // Behavior models
    if (props.behaviorModels) {
      for (const bm of props.behaviorModels) {
        if (!searchQ || bm.name.toLowerCase().includes(searchQ))
          items.push({ type: 'method', name: bm.name, detail: `[${bm.status}] ${bm.description || bm.role}`, insert: `@method:${bm.name}` })
      }
    }
    // Built-in methods
    for (const group of builtinMethodGroups.value) {
      for (const bm of group.methods) {
        if (!searchQ || bm.name.toLowerCase().includes(searchQ) || bm.label.includes(searchQ))
          items.push({ type: 'method', name: bm.name, detail: `[${group.label}] ${bm.description}`, insert: `@method:${bm.name}` })
      }
    }
    // ProcessGPT methods
    for (const pm of processGptMethods.value) {
      if (!searchQ || pm.name.toLowerCase().includes(searchQ) || pm.processName.toLowerCase().includes(searchQ))
        items.push({ type: 'method', name: pm.name, detail: `[ProcessGPT] ${pm.processName}`, insert: `@method:${pm.name}` })
    }
  }
  if (filterType === 'all' || filterType === 'node') {
    for (const o of context.value.connectedObjects) {
      if (!searchQ || o.name.toLowerCase().includes(searchQ))
        items.push({ type: 'node', name: o.name, detail: `${o.type ? '['+o.type+'] ' : ''}via ${o.relationship}`, insert: `@node:${o.name}` })
    }
  }
  return items.slice(0, 15)
})

// ------- Actions -------
async function createAgent() {
  if (await createAgentMutation()) showSuccess('Agents.md가 생성되었습니다')
}

async function saveAgent() {
  if (await saveAgentMutation()) showSuccess('저장되었습니다')
}

async function changeAgentEnabled(nextEnabled: boolean): Promise<void> {
  if (await toggleEnabled(nextEnabled)) showSuccess('에이전트 실행 상태가 저장되었습니다')
}

async function retrySaveAgent(): Promise<void> {
  if (await retrySave()) showSuccess('저장되었습니다')
}

function requestDeleteAgent(): void {
  clearOperationError(deleteOperation)
  showDeleteDialog.value = true
}

async function confirmDeleteAgent(): Promise<void> {
  const succeeded = deleteOperation.error
    ? await retryDelete()
    : await deleteAgentMutation()
  if (!succeeded) return
  showDeleteDialog.value = false
  showSuccess('Agents.md가 삭제되었습니다')
}

function cancelDeleteAgent(): void {
  if (deleteOperation.pending) return
  showDeleteDialog.value = false
  clearOperationError(deleteOperation)
}

async function requestResetToTemplate(): Promise<void> {
  clearOperationError(resetOperation)
  if (isContentDirty.value) {
    showResetDialog.value = true
    return
  }
  if (await resetToTemplateMutation()) {
    showSuccess('템플릿으로 초기화됨 (저장 필요)')
  }
}

async function confirmResetToTemplate(): Promise<void> {
  const succeeded = resetOperation.error
    ? await retryReset()
    : await resetToTemplateMutation()
  if (!succeeded) return
  showResetDialog.value = false
  showSuccess('템플릿으로 초기화됨 (저장 필요)')
}

function cancelResetToTemplate(): void {
  if (resetOperation.pending) return
  showResetDialog.value = false
  clearOperationError(resetOperation)
}

// ------- @mention handling -------
function onEditorKeydown(e: KeyboardEvent) {
  if (showMentionDropdown.value) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedMentionIndex.value = Math.min(selectedMentionIndex.value + 1, mentionItems.value.length - 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedMentionIndex.value = Math.max(selectedMentionIndex.value - 1, 0) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionItems.value[selectedMentionIndex.value]) }
    else if (e.key === 'Escape') { showMentionDropdown.value = false }
  }
}

function onEditorInput() {
  const el = editorRef.value; if (!el) return
  const pos = el.selectionStart
  const textBefore = content.value.slice(0, pos)
  const atMatch = textBefore.match(/@([\w:\u3131-\uD79D]*)?$/)
  if (atMatch) { showMentionDropdown.value = true; mentionQuery.value = atMatch[1] || ''; mentionCursorPos.value = pos; selectedMentionIndex.value = 0 }
  else { showMentionDropdown.value = false }
}

function insertMention(item: { insert: string } | undefined) {
  if (!item || !editorRef.value) return
  const el = editorRef.value
  const textBefore = content.value.slice(0, mentionCursorPos.value)
  const atMatch = textBefore.match(/@([\w:\u3131-\uD79D]*)?$/)
  if (!atMatch) return
  const startPos = mentionCursorPos.value - atMatch[0].length
  const after = content.value.slice(mentionCursorPos.value)
  content.value = content.value.slice(0, startPos) + item.insert + ' ' + after
  showMentionDropdown.value = false
  nextTick(() => { const np = startPos + item.insert.length + 1; el.setSelectionRange(np, np); el.focus() })
}

function insertFromSidebar(type: string, name: string) {
  const mention = `@${type}:${name}`
  const el = editorRef.value
  if (el) {
    const pos = el.selectionStart
    content.value = content.value.slice(0, pos) + mention + ' ' + content.value.slice(pos)
    nextTick(() => { const np = pos + mention.length + 1; el.setSelectionRange(np, np); el.focus() })
  } else {
    content.value += '\n' + mention + ' '
  }
}

function mentionTypeIcon(type: string): string {
  switch (type) { case 'field': return '📊'; case 'method': return '⚙️'; case 'node': return '🔗'; default: return '📌' }
}

// ------- Diff highlight -------
const changedLines = ref<Set<number>>(new Set())

function flashChangedLines(oldText: string, newText: string) {
  const diff = computeChangedLineIndexes(oldText, newText)
  if (diff.size === 0) return

  changedLines.value = diff
  schedule('agents-md-diff', () => {
    changedLines.value = new Set()
  }, 4000)
}

// Enhance the highlight renderer to mark changed lines
const highlightedHtmlWithDiff = computed(() => {
  const lines = content.value.split('\n')
  const styledLines = lines.map((line, idx) => {
    const styled = renderStyledMarkdownLine(line)
    if (changedLines.value.has(idx)) {
      return `<span class="diff-highlight">${styled}</span>`
    }
    return styled
  })
  // Must end with newline so highlight layer matches textarea
  return styledLines.join('\n') + '\n'
})

function renderStyledMarkdownLine(line: string): string {
  let html = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // @mentions → chips
  html = html.replace(/@field:([\w\u3131-\uD79D]+)/g,
    '<span class="chip chip-field">@field:$1</span>')
  html = html.replace(/@method:([\w\u3131-\uD79D]+)/g,
    '<span class="chip chip-method">@method:$1</span>')
  html = html.replace(/@node:([\w\u3131-\uD79D\s\-()]+?)(?=\s*[\n\[\]()`]|$)/g,
    '<span class="chip chip-node">@node:$1</span>')

  // Markdown headings
  html = html.replace(/^(#{1,4})\s+(.+)$/, (_, hashes, text) => {
    const level = hashes.length
    return `<span class="md-h md-h${level}">${hashes} ${text}</span>`
  })

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<span class="md-bold">**$1**</span>')
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<span class="md-code">`$1`</span>')
  // List items
  html = html.replace(/^(- )(.+)$/, '<span class="md-list-marker">- </span><span class="md-list-text">$2</span>')
  // HTML comments
  html = html.replace(/(&lt;!--.*?--&gt;)/g, '<span class="md-comment">$1</span>')

  return html
}

// ------- AI Chat rewrite -------
const chatPrompt = ref('')
const chatLoading = computed(() => rewriteOperation.pending)
const chatHistory = ref<Array<{ role: 'user' | 'ai'; text: string }>>([])

async function sendChatRewrite() {
  const prompt = chatPrompt.value.trim()
  if (!prompt || chatLoading.value) return

  chatHistory.value.push({ role: 'user', text: prompt })
  chatPrompt.value = ''
  const result = await rewrite(prompt)
  if (result) {
    chatHistory.value.push({ role: 'ai', text: '✅ Agents.md가 수정되었습니다.' })
    showSuccess('AI가 수정 완료 (저장 필요)', 4000)
    nextTick(() => flashChangedLines(result.oldContent, result.newContent))
  } else if (rewriteOperation.error) {
    chatHistory.value.push({ role: 'ai', text: `❌ 오류: ${rewriteOperation.error}` })
  }
}

async function retryChatRewrite(): Promise<void> {
  const result = await retryRewrite()
  if (result) {
    chatHistory.value.push({ role: 'ai', text: '✅ Agents.md가 수정되었습니다.' })
    showSuccess('AI가 수정 완료 (저장 필요)', 4000)
    nextTick(() => flashChangedLines(result.oldContent, result.newContent))
  }
}

function stopChatRewrite(): void {
  cancelRewrite()
  chatHistory.value.push({ role: 'ai', text: '재작성을 취소했습니다.' })
}

watch(() => props.nodeTypeName, () => {
  chatHistory.value = []
  chatPrompt.value = ''
  showDeleteDialog.value = false
  showResetDialog.value = false
  showProcessSelector.value = false
})
</script>

<template>
  <div class="agents-md-editor">
    <!-- Loading -->
    <div v-if="loading" class="editor-loading">
      <div class="loading-spinner small"></div>
      <span>Agents.md 조회 중...</span>
    </div>

    <div v-else-if="loadError" class="agent-load-error" role="alert">
      <p>Agents.md를 불러오지 못했습니다: {{ loadError }}</p>
      <button type="button" class="create-agent-btn" @click="loadContent()">다시 시도</button>
    </div>

    <!-- No Agent — Create CTA + show existing models -->
    <div v-else-if="!hasAgent" class="agent-empty-container">
      <div class="agent-empty-state">
        <div class="empty-icon">🤖</div>
        <h4>Agents.md 없음</h4>
        <p>이 노드 타입에 자율 에이전트를 정의하려면 Agents.md를 생성하세요.</p>
        <p class="empty-hint">에이전트는 데이터 필드, 메서드, 연결된 객체를 참조하여 자율적으로 판단하고 실행합니다.</p>
        <div v-if="createOperation.error" class="operation-error" role="alert">
          {{ createOperation.error }}
        </div>
        <button type="button" class="create-agent-btn" @click="createAgent" :disabled="createOperation.pending">
          <span v-if="createOperation.pending">생성 중...</span>
          <span v-else>✨ Agents.md 생성</span>
        </button>
      </div>
      <!-- Show existing behavior models even when no Agent.md -->
      <div v-if="behaviorModels && behaviorModels.length > 0" class="fallback-models">
        <div class="fallback-models-header">🧠 연결된 모델</div>
        <div v-for="bm in behaviorModels" :key="bm.modelId" class="fallback-model-item">
          <span class="fallback-model-name">{{ bm.name }}</span>
          <span class="fallback-model-status" :class="bm.status">{{ bm.status }}</span>
        </div>
      </div>
    </div>

    <!-- Editor -->
    <div v-else class="editor-container">
      <!-- Toolbar -->
      <div class="editor-toolbar">
        <div class="toolbar-left">
          <button
            type="button"
            class="enabled-toggle"
            role="switch"
            :aria-checked="agentEnabled"
            :disabled="saving"
            @click="changeAgentEnabled(!agentEnabled)"
          >
            <span :class="{ active: agentEnabled }">{{ agentEnabled ? '🟢 활성' : '⚪ 비활성' }}</span>
          </button>
          <button type="button" class="toolbar-btn" :class="{ active: !showPreview }" :aria-pressed="!showPreview" @click="showPreview = false" title="편집 모드">✏️ 편집</button>
          <button type="button" class="toolbar-btn" :class="{ active: showPreview }" :aria-pressed="showPreview" @click="showPreview = true" title="미리보기">👁️ 미리보기</button>
          <button type="button" class="toolbar-btn" :class="{ active: showContextSidebar }" :aria-pressed="showContextSidebar" @click="showContextSidebar = !showContextSidebar" title="컨텍스트 사이드바">📋 컨텍스트</button>
        </div>
        <div class="toolbar-right">
          <span v-if="successMsg" class="success-msg">✅ {{ successMsg }}</span>
          <span v-if="isDirty" class="dirty-indicator">● 변경됨</span>
          <button type="button" class="toolbar-btn save" @click="saveAgent" :disabled="!isDirty || saving">{{ saveOperation.pending ? '저장 중...' : '💾 저장' }}</button>
          <button type="button" class="toolbar-btn" @click="requestResetToTemplate" :disabled="saving" title="템플릿으로 초기화">🔄 초기화</button>
          <button type="button" class="toolbar-btn danger" @click="requestDeleteAgent" :disabled="saving" title="Agents.md 삭제">🗑️ 삭제</button>
        </div>
      </div>

      <div v-if="saveOperation.error" class="error-banner" role="alert">
        <span>❌ {{ saveOperation.error }}</span>
        <span class="error-actions">
          <button type="button" :disabled="saveOperation.pending" @click="retrySaveAgent">다시 시도</button>
          <button type="button" aria-label="저장 오류 닫기" @click="clearOperationError(saveOperation)">✕</button>
        </span>
      </div>
      <div v-if="resetOperation.error && !showResetDialog" class="error-banner" role="alert">
        <span>❌ {{ resetOperation.error }}</span>
        <button type="button" aria-label="초기화 오류 닫기" @click="clearOperationError(resetOperation)">✕</button>
      </div>

      <!-- Editor body -->
      <div class="editor-body">
        <div class="editor-main">
          <!-- WYSIWYG edit mode: highlight layer + transparent textarea -->
          <div v-if="!showPreview" class="edit-area-wrapper">
            <div class="editor-layers">
              <!-- Highlight backdrop -->
              <div ref="highlightRef" class="highlight-layer" v-html="highlightedHtmlWithDiff" aria-hidden="true"></div>
              <!-- Transparent textarea on top -->
              <textarea
                ref="editorRef"
                v-model="content"
                class="md-textarea"
                placeholder="Agents.md 내용을 입력하세요... (@를 입력하면 필드/메서드/노드를 참조할 수 있습니다)"
                @input="onEditorInput"
                @keydown="onEditorKeydown"
                @scroll="syncScroll"
                spellcheck="false"
              ></textarea>
            </div>

            <!-- @mention dropdown -->
            <div v-if="showMentionDropdown && mentionItems.length > 0" class="mention-dropdown">
              <div class="mention-header">@ 참조 삽입</div>
              <button
                v-for="(item, idx) in mentionItems"
                :key="item.insert"
                type="button"
                class="mention-item"
                :class="{ selected: idx === selectedMentionIndex }"
                @click="insertMention(item)"
                @mouseenter="selectedMentionIndex = idx"
              >
                <span class="mention-icon">{{ mentionTypeIcon(item.type) }}</span>
                <span class="mention-name">{{ item.name }}</span>
                <span class="mention-type-badge" :class="'type-' + item.type">{{ item.type }}</span>
                <span class="mention-detail">{{ item.detail }}</span>
              </button>
            </div>
          </div>

          <!-- Preview mode -->
          <div v-else class="preview-area" v-html="renderPreview(content)"></div>
        </div>

        <!-- Context sidebar -->
        <div v-if="showContextSidebar" class="context-sidebar">
          <div v-if="contextLoading" class="sidebar-loading"><div class="loading-spinner small"></div></div>
          <div v-else-if="contextLoad.error" class="sidebar-error" role="alert">
            <span>{{ contextLoad.error }}</span>
            <button type="button" @click="loadContext()">다시 시도</button>
          </div>
          <template v-else-if="context">
            <div class="context-section">
              <div class="section-header"><span>📊 데이터 필드</span><span class="section-count">{{ context.fields.length }}</span></div>
              <div class="section-items">
                <button type="button" v-for="f in context.fields" :key="'f-'+f.name" class="context-item field-item" @click="insertFromSidebar('field', f.name)" :title="'클릭 → @field:'+f.name+' 삽입'">
                  <span class="item-name">{{ f.name }}</span><span class="item-type">{{ f.type }}</span>
                </button>
                <div v-if="context.fields.length === 0" class="empty-section">필드 없음</div>
              </div>
            </div>
            <div class="context-section">
              <div class="section-header"><span>⚙️ 메서드</span><span class="section-count">{{ context.methods.length }}</span></div>
              <div class="section-items">
                <!-- 사용자 정의 메서드 -->
                <button type="button" v-for="m in context.methods" :key="'m-'+m.name" class="context-item method-item" @click="insertFromSidebar('method', m.name)" :title="'클릭 → @method:'+m.name+' 삽입'">
                  <span class="item-name">{{ m.name }}</span><span class="item-type">{{ m.behaviorType }}</span>
                </button>
                <div v-if="context.methods.length === 0" class="empty-section">사용자 메서드 없음</div>
              </div>

              <!-- 연결된 모델 (서브그룹) -->
              <div v-if="behaviorModels && behaviorModels.length > 0" class="section-subgroup">
                <div class="subgroup-header subgroup-label">
                  <span>🧠 연결된 모델</span>
                  <span class="section-count">{{ behaviorModels.length }}</span>
                </div>
                <div class="section-items">
                  <button type="button" v-for="bm in behaviorModels" :key="'bm-'+bm.modelId" class="context-item model-item" @click="insertFromSidebar('method', bm.name)" :title="'클릭 → @method:'+bm.name+' 삽입'">
                    <span class="item-name">{{ bm.name }}</span>
                    <span class="item-type" :class="'model-' + bm.status">{{ bm.status }}</span>
                  </button>
                </div>
              </div>

              <!-- 빌트인 메서드 그룹 (트리) -->
              <div v-for="group in builtinMethodGroups" :key="group.key" class="section-subgroup builtin-group">
                <button
                  type="button"
                  class="subgroup-header subgroup-disclosure"
                  :aria-expanded="group.expanded"
                  :aria-controls="contextGroupId(`builtin-${group.key}`)"
                  @click="toggleBuiltinGroup(group.key)"
                >
                  <span class="subgroup-toggle">{{ group.expanded ? '▼' : '▶' }}</span>
                  <span>{{ group.icon }} {{ group.label }}</span>
                  <span class="section-count">{{ group.methods.length }}</span>
                </button>
                <div
                  v-if="group.expanded"
                  :id="contextGroupId(`builtin-${group.key}`)"
                  class="section-items builtin-items"
                >
                  <button
                    v-for="bm in group.methods" 
                    :key="bm.name"
                    type="button"
                    class="context-item builtin-method-item"
                    @click="insertFromSidebar('method', bm.name)"
                    :title="bm.description + ' — 클릭 → @method:' + bm.name + ' 삽입'"
                  >
                    <span class="item-name">{{ bm.label }}</span>
                    <span class="item-dotname">{{ bm.name }}</span>
                  </button>
                </div>
              </div>

              <!-- ProcessGPT 프로세스 메서드 그룹 -->
              <div class="section-subgroup builtin-group processgpt-group">
                <div class="subgroup-header subgroup-action-header">
                  <button
                    type="button"
                    class="subgroup-disclosure"
                    :aria-expanded="processGptExpanded"
                    :aria-controls="contextGroupId('processgpt')"
                    @click="processGptExpanded = !processGptExpanded"
                  >
                    <span class="subgroup-toggle">{{ processGptExpanded ? '▼' : '▶' }}</span>
                    <span>⚙️ ProcessGPT</span>
                    <span class="section-count">{{ processGptMethods.length }}</span>
                  </button>
                  <button
                    type="button"
                    class="add-process-btn"
                    aria-label="ProcessGPT 프로세스 메서드 추가"
                    title="프로세스 메서드 추가"
                    @click="openProcessSelector"
                  >+</button>
                </div>
                <div
                  v-if="processGptExpanded"
                  :id="contextGroupId('processgpt')"
                  class="section-items builtin-items"
                >
                  <button
                    v-for="pm in processGptMethods" 
                    :key="pm.name"
                    type="button"
                    class="context-item builtin-method-item"
                    @click="insertFromSidebar('method', pm.name)"
                    :title="pm.processName + ' — 클릭 → @method:' + pm.name + ' 삽입'"
                  >
                    <span class="item-name">{{ pm.processName }}</span>
                    <span class="item-dotname">{{ pm.name }}</span>
                  </button>
                  <div v-if="processGptMethods.length === 0" class="empty-section">+ 버튼으로 프로세스 추가</div>
                </div>
              </div>
            </div>
            <div class="context-section">
              <div class="section-header"><span>🔗 연결된 객체</span><span class="section-count">{{ context.connectedObjects.length }}</span></div>
              <div class="section-items">
                <button type="button" v-for="o in context.connectedObjects" :key="'n-'+o.name" class="context-item node-item" @click="insertFromSidebar('node', o.name)" :title="'클릭 → @node:'+o.name+' 삽입'">
                  <span class="item-name">{{ o.name }}</span><span class="item-type">{{ o.relationship }}</span>
                </button>
                <div v-if="context.connectedObjects.length === 0" class="empty-section">연결된 객체 없음</div>
              </div>
            </div>
          </template>
          <div v-else class="sidebar-empty">컨텍스트 정보가 없습니다.</div>
        </div>
      </div>

      <!-- Process Selector Dialog -->
      <Teleport to="body">
        <div v-if="showProcessSelector" class="process-selector-overlay" @click.self="closeProcessSelector">
          <section
            ref="processDialogRef"
            class="process-selector-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agents-process-dialog-title"
            :aria-busy="processListLoading || processSaving"
            tabindex="-1"
          >
          <div class="psd-header">
            <span id="agents-process-dialog-title">⚙️ ProcessGPT 프로세스 연결</span>
            <button
              ref="processDialogCloseRef"
              type="button"
              class="psd-close"
              aria-label="ProcessGPT 프로세스 연결 닫기"
              :disabled="processSaving"
              @click="closeProcessSelector"
            >✕</button>
          </div>
          <div class="psd-body">
            <!-- Process list -->
            <div v-if="processListLoading" class="psd-loading">
              <div class="loading-spinner small"></div>
              <span>프로세스 목록 조회 중...</span>
            </div>
            <div v-else-if="processListError" class="psd-empty" role="alert">
              {{ processListError }}
              <button type="button" @click="openProcessSelector">다시 시도</button>
            </div>
            <div v-else-if="processList.length === 0" class="psd-empty">
              등록된 ProcessGPT 프로세스가 없습니다.
            </div>
            <div v-else class="psd-list">
              <div class="psd-list-label">프로세스 선택:</div>
              <button
                v-for="proc in processList" 
                :key="proc.id"
                type="button"
                class="psd-process-item"
                :class="{ selected: selectedProcess?.id === proc.id }"
                :aria-pressed="selectedProcess?.id === proc.id"
                :disabled="processSaving || !!processAddOperation.error"
                @click="selectedProcess = proc"
              >
                <span class="psd-proc-name">{{ proc.name }}</span>
                <span v-if="proc.description" class="psd-proc-desc">{{ proc.description }}</span>
              </button>
            </div>

            <!-- Trigger condition -->
            <div v-if="selectedProcess" class="psd-condition">
              <label for="agents-process-trigger">트리거 조건 (언제 이 프로세스를 호출할 것인지):</label>
              <input 
                id="agents-process-trigger"
                v-model="processTriggerCondition" 
                type="text" 
                class="psd-condition-input"
                :disabled="processSaving || !!processAddOperation.error"
                placeholder="예: lead_time_days가 5일 이상인 제품이 발견되면"
              />
            </div>
            <div v-if="processAddOperation.error" class="psd-operation-error" role="alert">
              {{ processAddOperation.error }}
            </div>
          </div>
          <div class="psd-footer">
            <button type="button" class="psd-cancel" :disabled="processSaving" @click="closeProcessSelector">취소</button>
            <button 
              type="button"
              class="psd-confirm" 
              @click="addProcessMethod"
              :disabled="!selectedProcess || processSaving"
            >
              {{ processSaving ? '추가 중...' : processAddOperation.error ? '다시 시도' : '✅ 메서드로 추가' }}
            </button>
          </div>
          </section>
        </div>
      </Teleport>

      <!-- AI Chat Bar -->
      <div class="chat-bar">
        <!-- Chat history (collapsible) -->
        <div v-if="chatHistory.length > 0" class="chat-history">
          <div 
            v-for="(msg, idx) in chatHistory" 
            :key="idx" 
            class="chat-msg" 
            :class="msg.role"
          >
            <span class="chat-role">{{ msg.role === 'user' ? '👤' : '🤖' }}</span>
            <span class="chat-text">{{ msg.text }}</span>
          </div>
        </div>
        <!-- Input -->
        <div v-if="rewriteOperation.error" class="chat-error" role="alert">
          <span>{{ rewriteOperation.error }}</span>
          <button type="button" :disabled="chatLoading" @click="retryChatRewrite">같은 요청 다시 시도</button>
        </div>
        <div class="chat-input-row">
          <div class="chat-input-icon">✨</div>
          <input
            v-model="chatPrompt"
            type="text"
            class="chat-input"
            placeholder="AI에게 수정 요청... (예: 주기적 점검을 30분 간격으로 변경해줘)"
            @keyup.enter="sendChatRewrite"
            :disabled="chatLoading"
          />
          <button
            v-if="chatLoading"
            type="button"
            class="chat-send-btn cancel"
            @click="stopChatRewrite"
          >
            취소
          </button>
          <button 
            v-else
            type="button"
            class="chat-send-btn" 
            @click="sendChatRewrite" 
            :disabled="!chatPrompt.trim()"
          >
            <span>전송</span>
          </button>
        </div>
      </div>
    </div>

    <ActionDialog
      :open="showDeleteDialog"
      dialog-id="delete-agents-md"
      title="Agents.md 삭제"
      message="Agents.md를 삭제하면 이 노드 타입의 에이전트 실행이 비활성화됩니다."
      confirm-label="Agents.md 삭제"
      pending-label="삭제 중…"
      :pending="deleteOperation.pending"
      :error="deleteOperation.error || null"
      @cancel="cancelDeleteAgent"
      @confirm="confirmDeleteAgent"
    />
    <ActionDialog
      :open="showResetDialog"
      dialog-id="reset-agents-md"
      title="Agents.md 템플릿 초기화"
      message="저장하지 않은 변경 사항을 버리고 서버 템플릿으로 초기화합니다."
      confirm-label="변경 버리고 초기화"
      pending-label="초기화 중…"
      :pending="resetOperation.pending"
      :error="resetOperation.error || null"
      @cancel="cancelResetToTemplate"
      @confirm="confirmResetToTemplate"
    />
  </div>
</template>

<style lang="scss" scoped>
.agents-md-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-loading {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 40px; color: var(--color-text-muted); font-size: 13px;
}

.agent-load-error {
  margin: 16px;
  padding: 16px;
  border: 1px solid rgba(239, 68, 68, 0.45);
  border-radius: 8px;
  color: var(--color-error, #ef4444);
  background: rgba(239, 68, 68, 0.08);
  text-align: center;
}

.operation-error {
  max-width: 420px;
  margin-top: 14px;
  padding: 9px 12px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 7px;
  background: rgba(239, 68, 68, 0.08);
  color: var(--color-error, #ef4444);
  font-size: 12px;
  overflow-wrap: anywhere;
}

/* ── Empty container ── */
.agent-empty-container {
  display: flex; flex-direction: column; flex: 1; overflow-y: auto;
}

.agent-empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px 20px; text-align: center;
  .empty-icon { font-size: 48px; margin-bottom: 12px; }
  h4 { font-size: 16px; font-weight: 600; color: var(--color-text-bright); margin-bottom: 8px; }
  p { font-size: 13px; color: var(--color-text-muted); line-height: 1.6; max-width: 360px; }
  .empty-hint { font-size: 12px; margin-top: 4px; opacity: 0.7; }
  .create-agent-btn {
    margin-top: 20px; padding: 12px 28px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;
    border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    &:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
    &:disabled { opacity: 0.6; cursor: not-allowed; }
  }
}

/* ── Fallback models (no agent.md yet) ── */
.fallback-models {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  .fallback-models-header {
    font-size: 13px; font-weight: 600; color: var(--color-text-bright, #e2e8f0);
    margin-bottom: 8px;
  }
  .fallback-model-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 10px; background: var(--color-bg, #0f1019);
    border-radius: 6px; margin-bottom: 4px; font-size: 12px;
    .fallback-model-name { color: var(--color-text); font-weight: 500; }
    .fallback-model-status {
      font-size: 10px; padding: 2px 6px; border-radius: 8px; font-weight: 600;
      &.trained { background: rgba(34,197,94,0.15); color: #22c55e; }
      &.pending { background: rgba(245,158,11,0.15); color: #f59e0b; }
      &.training { background: rgba(99,102,241,0.15); color: #6366f1; }
      &.failed { background: rgba(239,68,68,0.15); color: #ef4444; }
    }
  }
}

/* ── Editor container ── */
.editor-container { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }

/* ── Toolbar ── */
.editor-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 10px; background: var(--color-bg-tertiary, #1e1e2e);
  border-bottom: 1px solid var(--color-border); gap: 8px; flex-wrap: wrap;
  .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 4px; }
  .toolbar-btn {
    padding: 4px 10px; background: transparent; border: 1px solid var(--color-border);
    border-radius: 4px; color: var(--color-text-muted); font-size: 11px; cursor: pointer; transition: all 0.15s;
    &:hover { background: var(--color-bg-secondary); color: var(--color-text); }
    &.active { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); color: #6366f1; }
    &.save { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.3); color: #22c55e;
      &:disabled { opacity: 0.4; cursor: not-allowed; } }
    &.danger:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); color: #ef4444; }
  }
  .enabled-toggle {
    display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer; color: var(--color-text-muted);
    padding: 4px 6px; border: 0; border-radius: 4px; background: transparent;
    &:disabled { cursor: not-allowed; opacity: 0.55; }
    span.active { color: #22c55e; }
  }
  .dirty-indicator { font-size: 11px; color: #f59e0b; font-weight: 600; }
  .success-msg { font-size: 11px; color: #22c55e; animation: fadeIn 0.3s; }
}

.error-banner {
  padding: 8px 12px; background: rgba(239,68,68,0.1); border-bottom: 1px solid rgba(239,68,68,0.2);
  color: #ef4444; font-size: 12px; display: flex; justify-content: space-between; align-items: center;
  button { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; }
  .error-actions { display: flex; align-items: center; gap: 8px; }
}

/* ── Editor body ── */
.editor-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }
.editor-main { flex: 1; position: relative; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

/* ── Overlay editor (highlight + textarea) ── */
.edit-area-wrapper { flex: 1; position: relative; display: flex; flex-direction: column; }

.editor-layers {
  position: relative; flex: 1; overflow: hidden;
}

/* Shared typography between highlight layer and textarea */
.highlight-layer,
.md-textarea {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%; height: 100%;
  padding: 14px 16px;
  margin: 0;
  border: none;
  font-family: 'Pretendard', 'Noto Sans KR', -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.75;
  tab-size: 2;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  box-sizing: border-box;
}

.highlight-layer {
  color: transparent; // text itself is invisible (textarea provides caret)
  pointer-events: none;
  z-index: 0;
  background: var(--color-bg);

  // ── Markdown styled spans ──
  :deep(.md-h) {
    font-weight: 700;
    color: var(--color-text-bright, #e2e8f0);
  }
  :deep(.md-h1) { font-size: 20px; }
  :deep(.md-h2) { font-size: 16px; }
  :deep(.md-h3) { font-size: 14px; }
  :deep(.md-h4) { font-size: 13px; }

  :deep(.md-bold) {
    font-weight: 700;
    color: var(--color-text-bright, #e2e8f0);
  }

  :deep(.md-code) {
    padding: 1px 4px;
    background: rgba(99,102,241,0.12);
    border-radius: 3px;
    color: #a78bfa;
    font-family: 'Fira Code', monospace;
    font-size: 12px;
  }

  :deep(.md-list-marker) {
    color: #6366f1;
    font-weight: 700;
  }

  :deep(.md-list-text) {
    color: var(--color-text, #cbd5e1);
  }

  :deep(.md-comment) {
    color: var(--color-text-muted, #475569);
    opacity: 0.5;
    font-style: italic;
  }

  // ── Mention chips ──
  :deep(.chip) {
    display: inline;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  :deep(.chip-field) {
    background: rgba(59,130,246,0.18);
    color: #60a5fa;
    border: 1px solid rgba(59,130,246,0.30);
  }
  :deep(.chip-method) {
    background: rgba(245,158,11,0.18);
    color: #fbbf24;
    border: 1px solid rgba(245,158,11,0.30);
  }
  :deep(.chip-node) {
    background: rgba(16,185,129,0.18);
    color: #34d399;
    border: 1px solid rgba(16,185,129,0.30);
  }

  // Diff change highlight — pulse glow then fade out
  :deep(.diff-highlight) {
    background: rgba(250, 204, 21, 0.18);
    border-left: 3px solid #facc15;
    margin-left: -3px;
    padding-left: 0px;
    animation: diffFade 4s ease-out forwards;
    display: inline;
  }
}

.md-textarea {
  color: var(--color-text, #cbd5e1);
  caret-color: var(--color-text-bright, #f1f5f9);
  background: transparent;
  resize: none;
  outline: none;
  z-index: 1;
  &::placeholder { color: var(--color-text-muted); opacity: 0.4; }
  // Hide the text visually — the highlight layer renders styled version
  // We keep a VERY subtle color so the user can still see cursor context
  -webkit-text-fill-color: transparent;
}

/* ── Preview ── */
.preview-area {
  flex: 1; padding: 16px; overflow-y: auto;
  font-family: 'Pretendard', 'Noto Sans KR', -apple-system, sans-serif;
  font-size: 13px; line-height: 1.75; color: var(--color-text);
  :deep(h2) { font-size: 18px; font-weight: 700; margin: 16px 0 8px; color: var(--color-text-bright); border-bottom: 1px solid var(--color-border); padding-bottom: 4px; }
  :deep(h3) { font-size: 15px; font-weight: 600; margin: 12px 0 6px; color: var(--color-text-bright); }
  :deep(h4) { font-size: 13px; font-weight: 600; margin: 10px 0 4px; }
  :deep(code) { padding: 1px 4px; background: rgba(99,102,241,0.1); border-radius: 3px; font-family: 'Fira Code', monospace; font-size: 11px; color: #a78bfa; }
  :deep(li) { margin-left: 16px; list-style: disc; }
  :deep(.mention) {
    display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 5px;
    font-size: 12px; font-weight: 600; white-space: nowrap;
    &.mention-field { background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.25); }
    &.mention-method { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.25); }
    &.mention-node { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.25); }
  }
  :deep(.md-comment) { color: var(--color-text-muted); opacity: 0.5; font-style: italic; font-size: 11px; }
}

/* ── @mention dropdown ── */
.mention-dropdown {
  position: absolute; left: 16px; bottom: 40px; width: 380px; max-height: 260px;
  overflow-y: auto; background: var(--color-bg-secondary); border: 1px solid var(--color-border);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); z-index: 100;
  .mention-header { padding: 6px 10px; font-size: 10px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--color-border); }
  .mention-item {
    display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; transition: background 0.1s;
    width: 100%; border: 0; background: transparent; color: inherit; text-align: left;
    &:hover, &.selected { background: rgba(99,102,241,0.12); }
    .mention-icon { font-size: 13px; flex-shrink: 0; }
    .mention-name { font-size: 12px; font-weight: 600; color: var(--color-text-bright); }
    .mention-type-badge {
      font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 600; text-transform: uppercase; flex-shrink: 0;
      &.type-field { background: rgba(59,130,246,0.2); color: #3b82f6; }
      &.type-method { background: rgba(245,158,11,0.2); color: #f59e0b; }
      &.type-node { background: rgba(16,185,129,0.2); color: #10b981; }
    }
    .mention-detail { font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
}

/* ── Context sidebar ── */
.context-sidebar {
  width: 200px; border-left: 1px solid var(--color-border); background: var(--color-bg-secondary);
  overflow-y: auto; flex-shrink: 0;
  .sidebar-loading, .sidebar-empty { padding: 20px; text-align: center; color: var(--color-text-muted); font-size: 12px; }
}
.sidebar-error {
  display: grid;
  gap: 10px;
  padding: 14px 10px;
  color: var(--color-error, #ef4444);
  font-size: 11px;
  overflow-wrap: anywhere;

  button {
    min-height: 30px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 5px;
    background: rgba(239, 68, 68, 0.08);
    color: inherit;
    cursor: pointer;
  }
}
.context-section {
  border-bottom: 1px solid var(--color-border);
  .section-header {
    display: flex; justify-content: space-between; align-items: center; padding: 8px 10px;
    font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase;
    letter-spacing: 0.3px; background: var(--color-bg-tertiary, rgba(0,0,0,0.1));
    .section-count { background: var(--color-bg); padding: 1px 6px; border-radius: 8px; font-size: 10px; }
  }
  .section-items { padding: 4px; }
  .context-item {
    display: flex; justify-content: space-between; align-items: center; padding: 4px 8px;
    border-radius: 4px; cursor: pointer; transition: background 0.1s; font-size: 11px;
    width: 100%; border: 0; background: transparent; color: inherit; text-align: left;
    &:hover { background: rgba(99,102,241,0.1); }
    .item-name { font-weight: 500; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-type { font-size: 9px; color: var(--color-text-muted); flex-shrink: 0; padding: 1px 4px; background: var(--color-bg); border-radius: 3px; }
    &.field-item .item-name { color: #3b82f6; }
    &.method-item .item-name { color: #f59e0b; }
    &.node-item .item-name { color: #10b981; }

    &.model-item .item-name { color: #a78bfa; }
  }
  .empty-section { padding: 8px; text-align: center; font-size: 11px; color: var(--color-text-muted); opacity: 0.6; }

  .section-subgroup {
    border-top: 1px dashed var(--color-border);
    margin-top: 2px;

    .subgroup-header {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 10px;
      font-size: 10px; font-weight: 600; color: var(--color-text-muted);
      letter-spacing: 0.2px;
      background: rgba(167, 139, 250, 0.06);
      transition: background 0.1s;

      .subgroup-toggle {
        font-size: 8px;
        width: 10px;
        flex-shrink: 0;
        color: var(--color-text-muted);
      }

      .section-count { margin-left: auto; }
    }

    .subgroup-disclosure {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      border: 0;
      background: rgba(167, 139, 250, 0.06);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover { background: rgba(167, 139, 250, 0.12); }
    }

    .subgroup-label {
      cursor: default;
    }

    .subgroup-action-header {
      padding: 0 10px 0 0;

      .subgroup-disclosure {
        flex: 1;
        min-width: 0;
        padding: 6px 10px;
      }
    }

    .model-trained { background: rgba(34,197,94,0.2); color: #22c55e; }
    .model-pending { background: rgba(245,158,11,0.2); color: #f59e0b; }
    .model-training { background: rgba(99,102,241,0.2); color: #6366f1; }
    .model-failed { background: rgba(239,68,68,0.2); color: #ef4444; }

    &.builtin-group {
      .subgroup-header {
        background: rgba(99, 102, 241, 0.04);
      }

      .builtin-items {
        padding-left: 6px;
      }

      .builtin-method-item {
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
        padding: 4px 8px;

        .item-name {
          color: var(--color-text);
          font-weight: 500;
          font-size: 11px;
        }

        .item-dotname {
          font-size: 9px;
          font-family: 'Fira Code', monospace;
          color: var(--color-text-muted);
          opacity: 0.7;
        }

        &:hover {
          .item-dotname { opacity: 1; color: #6366f1; }
        }
      }
    }
  }
}

/* ── AI Chat Bar ── */
.chat-bar {
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary, #1a1b2e);
  flex-shrink: 0;
}

.chat-history {
  max-height: 120px;
  overflow-y: auto;
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--color-border);

  .chat-msg {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 12px;
    line-height: 1.5;
    padding: 3px 0;

    .chat-role {
      flex-shrink: 0;
      font-size: 13px;
    }

    .chat-text {
      color: var(--color-text);
    }

    &.user .chat-text {
      color: var(--color-text-bright, #e2e8f0);
    }

    &.ai .chat-text {
      color: #a78bfa;
    }
  }
}

.chat-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;

  .chat-input-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .chat-input {
    flex: 1;
    padding: 8px 12px;
    background: var(--color-bg, #0f1019);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    color: var(--color-text);
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s;

    &:focus {
      border-color: #6366f1;
    }

    &::placeholder {
      color: var(--color-text-muted);
      opacity: 0.6;
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  .chat-send-btn {
    padding: 6px 16px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border: none;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    min-width: 52px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover:not(:disabled) {
      transform: scale(1.03);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .chat-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    &.cancel {
      background: rgba(239, 68, 68, 0.88);
    }
  }
}

.chat-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.08);
  color: var(--color-error, #ef4444);
  font-size: 11px;

  button {
    flex-shrink: 0;
    min-height: 28px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 5px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
}

/* ── ProcessGPT group ── */
.processgpt-group {
  .add-process-btn {
    flex: 0 0 auto;
    width: 18px; height: 18px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 4px;
    color: #6366f1;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
    &:hover { background: rgba(99, 102, 241, 0.35); transform: scale(1.1); }
  }
}

/* ── Process Selector Dialog ── */
.process-selector-overlay {
  position: fixed;
  inset: 0;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.process-selector-dialog {
  width: 420px;
  max-height: 70vh;
  background: var(--color-bg-secondary, #1e1e2e);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .psd-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px;
    font-size: 14px; font-weight: 600; color: var(--color-text-bright);
    border-bottom: 1px solid var(--color-border);
    .psd-close {
      background: none; border: none; color: var(--color-text-muted);
      font-size: 16px; cursor: pointer;
      &:hover { color: var(--color-text); }
    }
  }

  .psd-body {
    flex: 1; overflow-y: auto; padding: 14px 18px;
  }

  .psd-loading, .psd-empty {
    text-align: center; padding: 30px; color: var(--color-text-muted); font-size: 13px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }

  .psd-list-label {
    font-size: 11px; font-weight: 600; color: var(--color-text-muted);
    text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;
  }

  .psd-process-item {
    padding: 10px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    margin-bottom: 6px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex; flex-direction: column; gap: 2px;
    width: 100%;
    color: inherit;
    text-align: left;

    &:hover { border-color: #6366f1; }
    &.selected {
      border-color: #6366f1;
      background: rgba(99, 102, 241, 0.1);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }

    .psd-proc-name {
      font-size: 13px; font-weight: 600; color: var(--color-text-bright);
    }
    .psd-proc-desc {
      font-size: 11px; color: var(--color-text-muted); line-height: 1.4;
    }
  }

  .psd-condition {
    margin-top: 14px;
    label {
      display: block; font-size: 11px; font-weight: 600;
      color: var(--color-text-muted); margin-bottom: 6px;
    }
    .psd-condition-input {
      width: 100%; padding: 10px 12px;
      background: var(--color-bg); border: 1px solid var(--color-border);
      border-radius: 8px; color: var(--color-text); font-size: 12px;
      outline: none;
      &:focus { border-color: #6366f1; }
      &::placeholder { color: var(--color-text-muted); opacity: 0.5; }
    }
  }

  .psd-operation-error {
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(239, 68, 68, 0.42);
    border-radius: 7px;
    background: rgba(239, 68, 68, 0.08);
    color: var(--color-error, #ef4444);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .psd-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--color-border);

    .psd-cancel {
      padding: 8px 16px; background: transparent;
      border: 1px solid var(--color-border); border-radius: 6px;
      color: var(--color-text-muted); font-size: 12px; cursor: pointer;
      &:hover { background: var(--color-bg); }
    }
    .psd-confirm {
      padding: 8px 20px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none; border-radius: 6px;
      color: white; font-size: 12px; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
  }
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes diffFade {
  0%   { background: rgba(250, 204, 21, 0.25); border-left-color: #facc15; }
  60%  { background: rgba(250, 204, 21, 0.12); border-left-color: rgba(250, 204, 21, 0.5); }
  100% { background: transparent; border-left-color: transparent; }
}

.agents-md-editor :is(button, input, textarea):focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .editor-toolbar {
    align-items: stretch;
    flex-direction: column;

    .toolbar-left,
    .toolbar-right {
      flex-wrap: wrap;
    }
  }

  .editor-body {
    flex-direction: column;
  }

  .context-sidebar {
    width: 100%;
    max-height: 38%;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }

  .mention-dropdown {
    right: 8px;
    left: 8px;
    width: auto;
    max-height: 220px;
  }

  .process-selector-overlay {
    padding: 8px;
  }

  .process-selector-dialog {
    width: 100%;
    max-height: calc(100dvh - 16px);
  }

  .psd-footer {
    align-items: stretch;
    flex-direction: column-reverse;

    button {
      width: 100%;
      min-height: 40px;
    }
  }

  .chat-input-row {
    align-items: stretch;
    flex-wrap: wrap;

    .chat-input-icon {
      display: none;
    }

    .chat-input {
      min-width: 0;
    }
  }
}
</style>
