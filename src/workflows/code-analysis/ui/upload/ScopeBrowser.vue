<script setup lang="ts">
/**
 * ScopeBrowser.vue — 경로 모드 로컬 파일 브라우저 (IDE 스타일).
 *
 * 호스트(Electron)의 로컬 폴더를 트리로 보여주고, 파일을 미리보고 편집·저장하며,
 * 이름변경/복사/삭제(휴지통)/새폴더 같은 파일 작업을 한다. FS 접근은 데스크톱
 * IPC(window.desktop.fs) 경유. 분석은 폴더 전체를 대상으로 한다.
 *
 * 인터랙션은 아키텍트 FileTreePane 모델을 따른다:
 *   - 이름변경 = 행에서 인라인 입력 (Electron 은 window.prompt 미지원이므로 필수)
 *   - 새 폴더 = 기본명 생성 후 즉시 인라인 명명 (VS Code 식)
 *   - 파일 편집 = 미리보기 textarea 직접 편집 + 저장(dirty 시)
 *
 * 상태는 이 컴포넌트에 중앙집중, 트리는 평탄 리스트(visibleRows)로 렌더한다.
 */
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { logger } from '@/shared/utils/logger'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import {
  getDesktopFileSystemBridge,
  type DesktopFileEntry as FsEntry,
} from '@/shared/browser/desktopFileSystem'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'

const props = defineProps<{ root: string; isProcessing?: boolean }>()
const emit = defineEmits<{ analyze: [] }>()

/** 루트 폴더명(헤더 표시용) — 전체 경로는 tooltip 으로. */
const rootName = computed(() => props.root.split(/[\\/]/).filter(Boolean).pop() || props.root)

// ── 데스크톱 FS 브리지 ────────────────────────────────────────────────
const bridge = getDesktopFileSystemBridge

// ── 경로 헬퍼 (OS 구분자 무관) ────────────────────────────────────────
function parentOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i > 0 ? p.slice(0, i) : props.root
}
function basenameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}
function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir.endsWith(sep) ? dir + name : dir + sep + name
}

// ── 트리 상태 ─────────────────────────────────────────────────────────
const childrenByPath = ref<Map<string, FsEntry[]>>(new Map())
const expanded = ref<Set<string>>(new Set())
const loadingPaths = ref<Set<string>>(new Set())
const loadError = ref<string>('')
const failedLoadPath = ref<string | null>(null)

async function loadDir(dirPath: string): Promise<void> {
  if (childrenByPath.value.has(dirPath) || loadingPaths.value.has(dirPath)) return
  const fs = bridge()
  if (!fs) {
    loadError.value = '데스크톱 파일 접근을 사용할 수 없습니다 (Electron 전용).'
    failedLoadPath.value = dirPath
    return
  }

  loadingPaths.value = new Set(loadingPaths.value).add(dirPath)
  try {
    const res = await fs.listDir({ root: props.root, path: dirPath })
    if (res.ok) {
      const next = new Map(childrenByPath.value)
      next.set(dirPath, res.data)
      childrenByPath.value = next
      if (failedLoadPath.value === dirPath) {
        loadError.value = ''
        failedLoadPath.value = null
      }
    } else {
      loadError.value = res.error.message || '폴더 목록을 불러오지 못했습니다.'
      failedLoadPath.value = dirPath
      logger.warn('[ScopeBrowser] listDir 실패:', res.error.message)
    }
  } catch (cause: unknown) {
    loadError.value = cause instanceof Error ? cause.message : '폴더 목록을 불러오지 못했습니다.'
    failedLoadPath.value = dirPath
    logger.warn('[ScopeBrowser] listDir 예외:', cause)
  } finally {
    const s = new Set(loadingPaths.value); s.delete(dirPath); loadingPaths.value = s
  }
}

async function retryLoad(): Promise<void> {
  const path = failedLoadPath.value
  if (!path) return
  loadError.value = ''
  failedLoadPath.value = null
  await loadDir(path)
}

async function reloadDir(dir: string): Promise<void> {
  const next = new Map(childrenByPath.value)
  next.delete(dir)
  childrenByPath.value = next
  await loadDir(dir)
}

interface Row { entry: FsEntry; depth: number }
const visibleRows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (dirPath: string, depth: number) => {
    const kids = childrenByPath.value.get(dirPath)
    if (!kids) return
    for (const e of kids) {
      out.push({ entry: e, depth })
      if (e.type === 'dir' && expanded.value.has(e.path)) walk(e.path, depth + 1)
    }
  }
  walk(props.root, 0)
  return out
})

function toggleExpand(entry: FsEntry): void {
  if (entry.type !== 'dir') return
  const next = new Set(expanded.value)
  if (next.has(entry.path)) next.delete(entry.path)
  else { next.add(entry.path); loadDir(entry.path) }
  expanded.value = next
}

// ── 트리 선택(커서) — 새 폴더 등 작업의 "기준 폴더"가 된다(VS Code 식) ─────────────
const selectedEntry = ref<FsEntry | null>(null)
/** 새 폴더 생성 기준 — 선택이 폴더면 그 폴더, 파일이면 그 부모, 선택 없으면 루트. */
const targetDir = computed(() =>
  selectedEntry.value
    ? (selectedEntry.value.type === 'dir' ? selectedEntry.value.path : parentOf(selectedEntry.value.path))
    : props.root,
)
/** 행 클릭 — 선택(하이라이트) + 폴더면 펼침/접힘, 파일이면 미리보기. */
function onRowClick(entry: FsEntry): void {
  selectedEntry.value = entry
  if (entry.type === 'dir') toggleExpand(entry)
  else selectFile(entry)
}

// ── 미리보기 + 편집 ───────────────────────────────────────────────────
// 활성 파일은 "단순 ref"로 textarea 에 직접 바인딩(검증된 방식). 다른 파일의 미저장 편집은
// 별도 stash 에 보존 → 전환해도 안 잃는다(멀티버퍼). 활성 편집 경로를 건드리지 않아 안전.
interface Buf { content: string; original: string; eol: '\n' | '\r\n' }
const selectedFile = ref<string | null>(null)
const preview = ref<{ state: 'empty' | 'loading' | 'text' | 'binary' | 'too-large' | 'error'; note?: string }>(
  { state: 'empty' },
)
const editContent = ref('')      // 활성 파일 내용 (LF) — textarea 직접 바인딩
const originalContent = ref('')  // 활성 파일 저장본 (LF)
const fileEol = ref<'\n' | '\r\n'>('\n')  // 활성 파일 원래 줄바꿈 — 저장 시 복원
const saving = ref(false)
// 비활성(다른) 파일의 미저장 편집 보존 — 전환 직전 stash, 다시 열면 복원.
const stash = ref<Map<string, Buf>>(new Map())

// 인앱 확인/안내 UI — ★이 Electron 호스트는 네이티브 window.confirm/alert/prompt 가
// 호출 후 렌더러 키보드 포커스를 깨뜨린다(편집 불가 회귀의 진짜 원인). 절대 쓰지 말 것.
const confirmBox = ref<{ message: string; resolve: (v: boolean) => void } | null>(null)
function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => { confirmBox.value = { message, resolve } })
}
function answerConfirm(v: boolean): void {
  confirmBox.value?.resolve(v)
  confirmBox.value = null
}
const toast = ref('')
const toastTimers = useManagedTimeouts()
function showToast(msg: string): void {
  toast.value = msg
  toastTimers.schedule('scope-toast', () => { toast.value = '' }, 4000)
}
function dismissToast(): void {
  toastTimers.cancel('scope-toast')
  toast.value = ''
}

// textarea 는 입력 시 CRLF→LF 로 정규화한다. dirty 비교가 어긋나지 않도록 편집·비교는 LF 로
// 통일하고(로드 시 정규화), 저장 때 원래 EOL 로 되돌린다(줄바꿈 스타일 보존).
function toLf(s: string): string { return s.replace(/\r\n?/g, '\n') }
function fromLf(s: string, eol: '\n' | '\r\n'): string { return eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s }

const isDirty = computed(() => preview.value.state === 'text' && editContent.value !== originalContent.value)
/** 그 경로가 미저장(dirty)인지 — 활성은 직접 비교, 그 외는 stash 비교(여러 파일 동시 마커). */
function isDirtyPath(p: string): boolean {
  if (p === selectedFile.value) return isDirty.value
  const b = stash.value.get(p)
  return !!b && b.content !== b.original
}

/** 전환 직전, 현재 활성 파일의 미저장 상태를 stash 에 보존. */
function stashActive(): void {
  const p = selectedFile.value
  if (!p || preview.value.state !== 'text') return
  const next = new Map(stash.value)
  next.set(p, { content: editContent.value, original: originalContent.value, eol: fileEol.value })
  stash.value = next
}
function dropStash(p: string): void {
  if (!stash.value.has(p)) return
  const next = new Map(stash.value); next.delete(p); stash.value = next
}

async function selectFile(entry: FsEntry): Promise<void> {
  if (entry.type !== 'file') return
  if (entry.path === selectedFile.value) return   // 이미 활성
  stashActive()                                    // 현재 파일 미저장분 보존
  selectedFile.value = entry.path
  // stash 에 있으면 디스크 재로드 없이 복원(미저장 편집 보존).
  const st = stash.value.get(entry.path)
  if (st) {
    editContent.value = st.content
    originalContent.value = st.original
    fileEol.value = st.eol
    dropStash(entry.path)                           // 이제 활성 → stash 에서 제거
    preview.value = { state: 'text' }
    return
  }
  const fs = bridge()
  if (!fs) return
  preview.value = { state: 'loading' }
  try {
    const res = await fs.readFile({ root: props.root, path: entry.path })
    if (!res.ok) {
      preview.value = { state: 'error', note: res.error.message || '읽기 실패' }
      return
    }
    const d = res.data
    if (d.kind === 'text') {
      fileEol.value = d.content.includes('\r\n') ? '\r\n' : '\n'
      const lf = toLf(d.content)
      editContent.value = lf
      originalContent.value = lf
      preview.value = { state: 'text' }
    } else if (d.kind === 'binary') {
      preview.value = { state: 'binary', note: '바이너리 파일 — 미리보기/편집을 표시하지 않습니다.' }
    } else {
      preview.value = { state: 'too-large', note: `파일이 너무 큽니다 (${Math.round(d.size / 1024)} KB) — 미리보기/편집을 표시하지 않습니다.` }
    }
  } catch (e) {
    preview.value = { state: 'error', note: String(e) }
  }
}

async function saveFile(): Promise<void> {
  if (!selectedFile.value || !isDirty.value || saving.value) return
  const fs = bridge(); if (!fs) return
  saving.value = true
  try {
    const res = await fs.writeFile({ root: props.root, path: selectedFile.value, content: fromLf(editContent.value, fileEol.value) })
    if (!res.ok) { showToast(res.error?.message || '저장 실패'); return }
    originalContent.value = editContent.value   // dirty 해제 (둘 다 LF 기준)
  } finally {
    saving.value = false
  }
}

function clearPreview(): void {
  selectedFile.value = null
  preview.value = { state: 'empty' }
  editContent.value = ''
  originalContent.value = ''
}

// ── 우클릭 메뉴 ───────────────────────────────────────────────────────
const ctx = ref<{ visible: boolean; x: number; y: number; entry: FsEntry | null }>(
  { visible: false, x: 0, y: 0, entry: null },
)
const ctxMenuRef = ref<HTMLElement | null>(null)
let ctxTrigger: HTMLElement | null = null

async function positionAndFocusContextMenu(): Promise<void> {
  await nextTick()
  const menu = ctxMenuRef.value
  if (!menu) return
  const gutter = 8
  const rect = menu.getBoundingClientRect()
  ctx.value = {
    ...ctx.value,
    x: Math.max(gutter, Math.min(ctx.value.x, window.innerWidth - rect.width - gutter)),
    y: Math.max(gutter, Math.min(ctx.value.y, window.innerHeight - rect.height - gutter)),
  }
  await nextTick()
  menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
}

function openContextMenu(x: number, y: number, entry: FsEntry | null, trigger: HTMLElement | null): void {
  ctxTrigger = trigger
  ctx.value = { visible: true, x, y, entry }
  void positionAndFocusContextMenu()
}

function openCtx(e: MouseEvent, entry: FsEntry): void {
  e.preventDefault()
  e.stopPropagation()
  selectedEntry.value = entry   // 우클릭한 항목을 선택(=새 폴더 기준이 됨)
  openContextMenu(e.clientX, e.clientY, entry, e.currentTarget instanceof HTMLElement ? e.currentTarget : null)
}
function openCtxFromKeyboard(e: KeyboardEvent, entry: FsEntry): void {
  const trigger = e.currentTarget instanceof HTMLElement ? e.currentTarget : null
  const rect = trigger?.getBoundingClientRect()
  selectedEntry.value = entry
  openContextMenu(rect?.left ?? 8, rect?.bottom ?? 8, entry, trigger)
}
/** 트리 빈 곳 우클릭 → 루트 컨텍스트(entry=null): "새 폴더"만. */
function openRootCtx(e: MouseEvent): void {
  e.preventDefault()
  openContextMenu(e.clientX, e.clientY, null, e.currentTarget instanceof HTMLElement ? e.currentTarget : null)
}
function closeCtx(restoreFocus = true): void {
  ctx.value = { ...ctx.value, visible: false, entry: null }
  const focusTarget = ctxTrigger
  ctxTrigger = null
  if (restoreFocus) {
    void nextTick(() => {
      if (focusTarget?.isConnected) focusTarget.focus()
    })
  }
}
function handleContextMenuKeydown(event: KeyboardEvent): void {
  const menu = ctxMenuRef.value
  if (!menu) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeCtx()
    return
  }
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const activeIndex = items.indexOf(document.activeElement as HTMLElement)
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? items.length - 1
      : event.key === 'ArrowDown'
        ? (activeIndex + 1 + items.length) % items.length
        : (activeIndex - 1 + items.length) % items.length
  items[nextIndex]?.focus()
}

// ── 인라인 이름변경 ──────────────────────────────────────────────────
// 인라인 이름변경 — 텍스트는 별도 ref(중첩 .value 바인딩 꼬임 방지).
const renamingPath = ref<string | null>(null)
const renameValue = ref('')

function startRename(entry: FsEntry): void {
  closeCtx()
  renamingPath.value = entry.path
  renameValue.value = entry.name
  // v-for 안 template ref 는 불안정 → 단일 입력을 querySelector 로 포커스(IDE 식 선택).
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('.scope-browser .rename-input')
    if (!el) return
    el.focus()
    const dot = entry.type === 'file' ? el.value.lastIndexOf('.') : -1
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length)
  })
}

function cancelRename(): void { renamingPath.value = null }

async function commitRename(): Promise<void> {
  const path = renamingPath.value
  if (path === null) return
  renamingPath.value = null                 // 먼저 비워 blur·enter 이중 커밋 방지
  const newName = renameValue.value.trim()
  const oldName = basenameOf(path)
  if (!newName || newName === oldName || newName.includes('/') || newName.includes('\\')) return
  const fs = bridge(); if (!fs) return
  const to = joinPath(parentOf(path), newName)
  const res = await fs.rename({ root: props.root, from: path, to })
  if (!res.ok) { showToast(res.error?.message || '이름변경 실패'); return }
  // 미저장 편집도 새 경로로 따라가게: 활성이면 selectedFile만 갱신(편집 ref 유지), stash면 키 이동.
  const st = stash.value.get(path)
  if (st) { dropStash(path); const n = new Map(stash.value); n.set(to, st); stash.value = n }
  if (selectedFile.value === path) selectedFile.value = to
  if (selectedEntry.value?.path === path) selectedEntry.value = { ...selectedEntry.value, path: to, name: newName }
  await reloadDir(parentOf(path))
}

// ── 파일 작업 ─────────────────────────────────────────────────────────
async function doTrash(entry: FsEntry): Promise<void> {
  const focusTarget = ctxTrigger
  closeCtx(false)
  if (focusTarget?.isConnected) focusTarget.focus()
  if (!(await askConfirm(`'${entry.name}'을(를) 휴지통으로 보낼까요? (복구 가능)`))) return
  const fs = bridge(); if (!fs) return
  const res = await fs.trash({ root: props.root, path: entry.path })
  if (!res.ok) { showToast(res.error?.message || '삭제 실패'); return }
  // 삭제된 경로(파일, 또는 폴더면 그 하위)의 미저장 stash 정리.
  const under = (p: string) => p === entry.path || p.startsWith(entry.path + '/') || p.startsWith(entry.path + '\\')
  for (const p of [...stash.value.keys()]) { if (under(p)) dropStash(p) }
  // 활성 파일이 삭제 대상(또는 그 폴더 하위)이면 미리보기 비우기.
  if (selectedFile.value && under(selectedFile.value)) clearPreview()
  if (selectedEntry.value?.path === entry.path) selectedEntry.value = null
  await reloadDir(parentOf(entry.path))
}

async function doCopy(entry: FsEntry): Promise<void> {
  closeCtx()
  const fs = bridge(); if (!fs) return
  const dir = parentOf(entry.path)
  const dot = entry.name.lastIndexOf('.')
  const copyName = entry.type === 'file' && dot > 0
    ? `${entry.name.slice(0, dot)}_복사${entry.name.slice(dot)}`
    : `${entry.name}_복사`
  const res = await fs.copy({ root: props.root, from: entry.path, to: joinPath(dir, copyName) })
  if (!res.ok) { showToast(res.error?.message || '복사 실패'); return }
  await reloadDir(dir)
}

/** 새 폴더: 안 겹치는 기본명으로 생성 후 즉시 인라인 명명. */
async function doMkdir(dir: string): Promise<void> {
  closeCtx()
  const fs = bridge(); if (!fs) return
  const existing = new Set((childrenByPath.value.get(dir) || []).map(e => e.name))
  let name = '새 폴더'
  for (let n = 2; existing.has(name); n++) name = `새 폴더 ${n}`
  const newPath = joinPath(dir, name)
  const res = await fs.mkdir({ root: props.root, path: newPath })
  if (!res.ok) { showToast(res.error?.message || '새 폴더 실패'); return }
  expanded.value = new Set(expanded.value).add(dir)
  await reloadDir(dir)
  startRename({ name, path: newPath, type: 'dir' })
}

function refreshAll(): void {
  childrenByPath.value = new Map()
  expanded.value = new Set()
  loadError.value = ''
  failedLoadPath.value = null
  loadDir(props.root)
}

// ── 초기화 ────────────────────────────────────────────────────────────
watch(() => props.root, (root) => {
  childrenByPath.value = new Map()
  expanded.value = new Set()
  renamingPath.value = null
  loadError.value = ''
  failedLoadPath.value = null
  stash.value = new Map()   // 루트가 바뀌면 모든 미저장 편집 폐기
  selectedEntry.value = null
  clearPreview()
  if (root) loadDir(root)
}, { immediate: true })

onBeforeUnmount(() => {
  confirmBox.value?.resolve(false)
  confirmBox.value = null
})
</script>

<template>
  <div class="scope-browser">
    <!-- 좌: 트리 -->
    <div class="tree-pane">
      <div class="tree-header">
        <span class="tree-title" :title="root">📁 {{ rootName }}</span>
        <span class="tree-actions">
          <button class="tool-btn" title="새로고침" @click="refreshAll">↻</button>
        </span>
      </div>

      <div v-if="loadError" class="tree-error" role="alert">
        <span>{{ loadError }}</span>
        <button v-if="failedLoadPath" type="button" @click="retryLoad">다시 시도</button>
      </div>

      <div class="tree-body" role="tree" @contextmenu.self="openRootCtx">
        <div
          v-for="row in visibleRows"
          :key="row.entry.path"
          class="tree-row"
          :class="{ selected: selectedEntry?.path === row.entry.path }"
          :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          role="treeitem"
          tabindex="0"
          :aria-selected="selectedEntry?.path === row.entry.path"
          :aria-expanded="row.entry.type === 'dir' ? expanded.has(row.entry.path) : undefined"
          @click="onRowClick(row.entry)"
          @keydown.enter.self="onRowClick(row.entry)"
          @keydown.space.self.prevent="onRowClick(row.entry)"
          @keydown.shift.f10.prevent="openCtxFromKeyboard($event, row.entry)"
          @contextmenu="openCtx($event, row.entry)"
        >
          <button
            v-if="row.entry.type === 'dir'"
            class="twisty"
            :aria-label="expanded.has(row.entry.path) ? `${row.entry.name} 접기` : `${row.entry.name} 펼치기`"
            @click.stop="toggleExpand(row.entry)"
          >{{ expanded.has(row.entry.path) ? '▾' : '▸' }}</button>
          <span v-else class="twisty-spacer"></span>

          <span class="row-icon">{{ row.entry.type === 'dir' ? '📁' : '📄' }}</span>

          <!-- 인라인 이름변경 -->
          <input
            v-if="renamingPath === row.entry.path"
            class="rename-input"
            v-model="renameValue"
            @click.stop
            @mousedown.stop
            @keyup.enter="commitRename"
            @keyup.esc="cancelRename"
            @blur="commitRename"
          />
          <span v-else class="row-name" :class="{ 'is-dirty': isDirtyPath(row.entry.path) }">{{ row.entry.name }}</span>
          <span
            v-if="renamingPath !== row.entry.path && isDirtyPath(row.entry.path)"
            class="dirty-dot"
            title="저장되지 않은 변경"
          >●</span>
        </div>

        <div v-if="visibleRows.length === 0 && !loadError" class="tree-empty">불러오는 중…</div>
      </div>

      <button class="analyze-btn" :disabled="isProcessing" @click="emit('analyze')">
        {{ isProcessing ? '분석 중…' : '분석 시작' }}
      </button>
    </div>

    <!-- 우: 미리보기 + 편집 -->
    <div class="preview-pane">
      <div class="preview-header">
        <span class="preview-name">{{ selectedFile ? basenameOf(selectedFile) : '파일 미리보기' }}</span>
        <!-- 저장 버튼은 변경(dirty)이 있을 때만 — 되돌려서 원본과 같아지면 사라진다(IDE 식). -->
        <button
          v-if="preview.state === 'text' && (isDirty || saving)"
          class="save-btn"
          :disabled="saving"
          @click="saveFile"
        >{{ saving ? '저장 중…' : '저장' }}</button>
      </div>
      <div class="preview-body">
        <div v-if="preview.state === 'empty'" class="preview-placeholder">왼쪽 트리에서 파일을 클릭하면 내용이 표시됩니다.</div>
        <div v-else-if="preview.state === 'loading'" class="preview-placeholder">불러오는 중…</div>
        <textarea
          v-else-if="preview.state === 'text'"
          v-model="editContent"
          class="preview-editor"
          spellcheck="false"
          @keydown.ctrl.s.prevent="saveFile"
          @keydown.meta.s.prevent="saveFile"
        ></textarea>
        <div v-else class="preview-placeholder">{{ preview.note }}</div>
      </div>
    </div>

    <!-- 우클릭 파일 작업 메뉴 — 항목 위=전체 작업 / 빈 곳(entry=null)=루트에 새 폴더만 -->
    <template v-if="ctx.visible">
      <div class="ctx-backdrop" @click="closeCtx()" @contextmenu.prevent="closeCtx()"></div>
      <div
        ref="ctxMenuRef"
        class="ctx-menu"
        role="menu"
        aria-label="파일 작업"
        :style="{ left: `${ctx.x}px`, top: `${ctx.y}px` }"
        @keydown="handleContextMenuKeydown"
      >
        <template v-if="ctx.entry">
          <button type="button" role="menuitem" class="ctx-item" @click="startRename(ctx.entry)">이름변경</button>
          <button type="button" role="menuitem" class="ctx-item" @click="doCopy(ctx.entry)">복사</button>
          <button
            v-if="ctx.entry.type === 'dir'"
            type="button"
            role="menuitem"
            class="ctx-item"
            @click="doMkdir(targetDir)"
          >여기에 새 폴더</button>
          <button type="button" role="menuitem" class="ctx-item danger" @click="doTrash(ctx.entry)">
            삭제 (휴지통)
          </button>
        </template>
        <button v-else type="button" role="menuitem" class="ctx-item" @click="doMkdir(targetDir)">
          새 폴더 ({{ targetDir === root ? '루트' : basenameOf(targetDir) }})
        </button>
      </div>
    </template>

    <ActionDialog
      :open="confirmBox !== null"
      dialog-id="scope-trash-confirmation"
      title="휴지통으로 이동"
      :message="confirmBox?.message ?? ''"
      confirm-label="휴지통으로 이동"
      :pending="false"
      :error="null"
      @cancel="answerConfirm(false)"
      @confirm="answerConfirm(true)"
    />

    <!-- 인앱 토스트 (네이티브 alert 대체) -->
    <div v-if="toast" class="toast" role="status">
      <span>{{ toast }}</span>
      <button type="button" aria-label="알림 닫기" @click="dismissToast">×</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.scope-browser {
  display: flex;
  gap: 12px;
  height: 100%;
  min-height: 360px;
}

.tree-pane {
  flex: 0 0 340px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-secondary);
}

// IDE 파일트리 헤더 — 아키텍트 FileTreePane 스타일(대문자·muted·elevated)
.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
}
.tree-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-actions { display: flex; gap: 2px; flex-shrink: 0; }
.tool-btn {
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--color-text-light);
  font-size: 13px;
  line-height: 1;
  padding: 3px 6px;
  cursor: pointer;
  &:hover { background: var(--color-bg-hover, var(--color-bg-secondary)); color: var(--color-text-bright); }
}

.ctx-backdrop { position: fixed; inset: 0; z-index: 2000; }

.toast {
  position: fixed;
  z-index: 3100;
  left: 50%; bottom: 32px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  width: max-content;
  max-width: calc(100vw - 32px);
  background: #fa5252;
  color: #fff;
  padding: 8px 8px 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  button {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 18px;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: rgba(255, 255, 255, 0.2);
      outline: none;
    }
  }
}
.ctx-menu {
  position: fixed;
  z-index: 2001;
  min-width: 140px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.ctx-item {
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 5px;
  padding: 7px 10px;
  font-size: 12px;
  color: var(--color-text);
  cursor: pointer;
  &:hover,
  &:focus-visible {
    background: var(--color-bg-tertiary);
    outline: none;
  }
  &.danger { color: #fa5252; &:hover { background: rgba(250, 82, 82, 0.12); } }
}

.tree-error {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  font-size: 12px;
  color: var(--color-error);

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  button {
    flex: 0 0 auto;
    padding: 3px 7px;
    border: 1px solid currentColor;
    border-radius: 4px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
}

.tree-body { flex: 1; overflow: auto; padding: 4px 0; }

// IDE 행 — 컴팩트·chevron·아이콘
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  &:hover { background: var(--color-bg-hover, var(--color-bg-tertiary)); }
  &.selected { background: var(--color-bg-active, rgba(34, 139, 230, 0.14)); }
}

.twisty {
  width: 12px;
  min-width: 12px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 9px;
  padding: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.twisty-spacer { width: 12px; min-width: 12px; flex-shrink: 0; }
.row-icon { flex-shrink: 0; font-size: 13px; line-height: 1; opacity: 0.9; }
.row-name {
  flex: 1;            // 남는 폭을 채워 말줄임표가 자연스럽게 동작 + 점을 오른쪽 끝으로 밀어냄
  min-width: 0;       // flex 자식이 내용보다 작게 줄어들 수 있어야 ellipsis 가 작동
  overflow: hidden;
  text-overflow: ellipsis;
  &.is-dirty { color: var(--color-accent); }   // VS Code 식 — 수정된 파일명은 강조색
}
// 미저장(dirty) 마커 — IDE(VS Code) 식: 행 맨 오른쪽 고정 점. 저장/원복 시 사라짐.
.dirty-dot {
  flex-shrink: 0;
  align-self: center;
  margin-left: 6px;
  color: var(--color-accent);
  font-size: 8px;
  line-height: 1;
}
.rename-input {
  flex: 1;
  min-width: 0;
  background: var(--color-bg);
  color: var(--color-text-bright);
  border: 1px solid var(--color-accent);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  user-select: text;   // 행의 user-select:none 상속 차단(입력 가능)
}

.analyze-btn {
  margin: 8px;
  padding: 8px 12px;
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;

  &:hover:not(:disabled) { filter: brightness(1.08); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-secondary);
  min-width: 0;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-bright);
}
.preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.save-btn {
  flex-shrink: 0;
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  &:hover:not(:disabled) { filter: brightness(1.08); }
  &:disabled { opacity: 0.45; cursor: default; background: var(--color-bg-secondary); color: var(--color-text-muted); }
}
.preview-body { flex: 1; min-height: 0; display: flex; }
.preview-placeholder {
  flex: 1;
  padding: 24px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}
.preview-editor {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: 12px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  overflow: auto;
  tab-size: 4;
}

@media (max-width: 720px) {
  .scope-browser {
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }

  .tree-pane {
    flex: 0 0 min(300px, 42%);
    width: 100%;
    min-height: 180px;
  }

  .preview-pane {
    flex: 1 1 0;
    min-height: 180px;
  }
}
</style>
