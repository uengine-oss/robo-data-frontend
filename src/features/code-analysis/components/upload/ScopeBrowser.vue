<script setup lang="ts">
/**
 * ScopeBrowser.vue — 경로 모드 로컬 파일 브라우저.
 *
 * 호스트(Electron)의 로컬 폴더를 트리로 보여주고 파일을 미리본다. FS 접근은
 * 데스크톱 IPC(window.desktop.fs) 경유. 분석은 폴더 전체를 대상으로 한다
 * (범위 선택/제외는 제거 — 입구 통일 계약 전까지 실효가 없어 폐기).
 *
 * 상태는 이 컴포넌트에 중앙집중하고 트리는 평탄 리스트(visibleRows)로 렌더한다.
 */
import { ref, computed, watch } from 'vue'
import { logger } from '@/shared/utils/logger'

interface FsEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}
type FsReadResult =
  | { kind: 'text'; content: string }
  | { kind: 'binary' }
  | { kind: 'too-large'; size: number }

const props = defineProps<{ root: string; isProcessing?: boolean }>()
const emit = defineEmits<{ analyze: [] }>()

// ── 상태 ──────────────────────────────────────────────────────────────
const childrenByPath = ref<Map<string, FsEntry[]>>(new Map())
const expanded = ref<Set<string>>(new Set())
const loadingPaths = ref<Set<string>>(new Set())
const loadError = ref<string>('')

const selectedFile = ref<string | null>(null)
const preview = ref<{ state: 'loading' | 'text' | 'binary' | 'too-large' | 'error'; content?: string; note?: string }>(
  { state: 'text', content: '' },
)

type Res<T> = { ok: boolean; data?: T; error?: { message: string } }
interface FsBridge {
  listDir(i: { root: string; path: string }): Promise<Res<FsEntry[]>>
  readFile(i: { root: string; path: string }): Promise<Res<FsReadResult>>
  rename(i: { root: string; from: string; to: string }): Promise<Res<{ ok: true }>>
  copy(i: { root: string; from: string; to: string }): Promise<Res<{ ok: true }>>
  trash(i: { root: string; path: string }): Promise<Res<{ ok: true }>>
  mkdir(i: { root: string; path: string }): Promise<Res<{ ok: true }>>
}
const bridge = (): FsBridge | undefined =>
  (window as unknown as { desktop?: { fs?: FsBridge } }).desktop?.fs

// ── 경로 헬퍼 (OS 구분자 무관) ────────────────────────────────────────
function parentOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i > 0 ? p.slice(0, i) : props.root
}
function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir.endsWith(sep) ? dir + name : dir + sep + name
}
async function reloadDir(dir: string): Promise<void> {
  const next = new Map(childrenByPath.value)
  next.delete(dir)
  childrenByPath.value = next
  await loadDir(dir)
}

// ── 로딩 ──────────────────────────────────────────────────────────────
async function loadDir(dirPath: string): Promise<void> {
  if (childrenByPath.value.has(dirPath) || loadingPaths.value.has(dirPath)) return
  const fs = bridge()
  if (!fs) { loadError.value = '데스크톱 파일 접근을 사용할 수 없습니다 (Electron 전용).'; return }

  loadingPaths.value = new Set(loadingPaths.value).add(dirPath)
  try {
    const res = await fs.listDir({ root: props.root, path: dirPath })
    if (res.ok && res.data) {
      const next = new Map(childrenByPath.value)
      next.set(dirPath, res.data)
      childrenByPath.value = next
    } else {
      logger.warn('[ScopeBrowser] listDir 실패:', res.error?.message)
    }
  } catch (e) {
    logger.warn('[ScopeBrowser] listDir 예외:', e)
  } finally {
    const s = new Set(loadingPaths.value); s.delete(dirPath); loadingPaths.value = s
  }
}

// ── 트리 평탄화(보이는 행만) ──────────────────────────────────────────
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

async function selectFile(entry: FsEntry): Promise<void> {
  if (entry.type !== 'file') return
  selectedFile.value = entry.path
  const fs = bridge()
  if (!fs) return
  preview.value = { state: 'loading' }
  try {
    const res = await fs.readFile({ root: props.root, path: entry.path })
    if (!res.ok || !res.data) { preview.value = { state: 'error', note: res.error?.message || '읽기 실패' }; return }
    const d = res.data
    if (d.kind === 'text') preview.value = { state: 'text', content: d.content }
    else if (d.kind === 'binary') preview.value = { state: 'binary', note: '바이너리 파일 — 미리보기를 표시하지 않습니다.' }
    else preview.value = { state: 'too-large', note: `파일이 너무 큽니다 (${Math.round(d.size / 1024)} KB) — 미리보기를 표시하지 않습니다.` }
  } catch (e) {
    preview.value = { state: 'error', note: String(e) }
  }
}

// ── 파일 작업 (이름변경·삭제·복사·새 폴더) ────────────────────────────
const ctx = ref<{ visible: boolean; x: number; y: number; entry: FsEntry | null }>(
  { visible: false, x: 0, y: 0, entry: null },
)
function openCtx(e: MouseEvent, entry: FsEntry): void {
  e.preventDefault()
  ctx.value = { visible: true, x: e.clientX, y: e.clientY, entry }
}
function closeCtx(): void { ctx.value = { ...ctx.value, visible: false, entry: null } }

async function doRename(entry: FsEntry): Promise<void> {
  closeCtx()
  const name = window.prompt('새 이름', entry.name)
  if (!name || name === entry.name) return
  const fs = bridge(); if (!fs) return
  const res = await fs.rename({ root: props.root, from: entry.path, to: joinPath(parentOf(entry.path), name) })
  if (!res.ok) { window.alert(res.error?.message || '이름변경 실패'); return }
  await reloadDir(parentOf(entry.path))
}

async function doTrash(entry: FsEntry): Promise<void> {
  closeCtx()
  if (!window.confirm(`'${entry.name}'을(를) 휴지통으로 보낼까요? (복구 가능)`)) return
  const fs = bridge(); if (!fs) return
  const res = await fs.trash({ root: props.root, path: entry.path })
  if (!res.ok) { window.alert(res.error?.message || '삭제 실패'); return }
  if (selectedFile.value === entry.path) { selectedFile.value = null; preview.value = { state: 'text', content: '' } }
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
  if (!res.ok) { window.alert(res.error?.message || '복사 실패'); return }
  await reloadDir(dir)
}

async function doMkdir(dir: string): Promise<void> {
  closeCtx()
  const name = window.prompt('새 폴더 이름')
  if (!name) return
  const fs = bridge(); if (!fs) return
  const res = await fs.mkdir({ root: props.root, path: joinPath(dir, name) })
  if (!res.ok) { window.alert(res.error?.message || '새 폴더 실패'); return }
  expanded.value = new Set(expanded.value).add(dir)
  await reloadDir(dir)
}

function refreshAll(): void {
  childrenByPath.value = new Map()
  expanded.value = new Set()
  loadDir(props.root)
}

// ── 초기화 ────────────────────────────────────────────────────────────
watch(() => props.root, (root) => {
  childrenByPath.value = new Map()
  expanded.value = new Set()
  selectedFile.value = null
  preview.value = { state: 'text', content: '' }
  loadError.value = ''
  if (root) loadDir(root)
}, { immediate: true })
</script>

<template>
  <div class="scope-browser">
    <!-- 좌: 트리 -->
    <div class="tree-pane">
      <div class="tree-header">
        <span class="tree-title">📁 로컬 폴더</span>
        <span class="tree-actions">
          <button class="tool-btn" title="새로고침" @click="refreshAll">↻</button>
          <button class="tool-btn" title="새 폴더 (루트)" @click="doMkdir(root)">＋📁</button>
        </span>
      </div>

      <div v-if="loadError" class="tree-error">{{ loadError }}</div>

      <div class="tree-body">
        <div
          v-for="row in visibleRows"
          :key="row.entry.path"
          class="tree-row"
          :class="{ selected: selectedFile === row.entry.path }"
          :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          @click="row.entry.type === 'dir' ? toggleExpand(row.entry) : selectFile(row.entry)"
          @contextmenu="openCtx($event, row.entry)"
        >
          <button
            v-if="row.entry.type === 'dir'"
            class="twisty"
            @click.stop="toggleExpand(row.entry)"
          >{{ expanded.has(row.entry.path) ? '▾' : '▸' }}</button>
          <span v-else class="twisty-spacer"></span>

          <span class="row-icon">{{ row.entry.type === 'dir' ? '📁' : '📄' }}</span>
          <span class="row-name">{{ row.entry.name }}</span>
        </div>

        <div v-if="visibleRows.length === 0 && !loadError" class="tree-empty">불러오는 중…</div>
      </div>

      <button class="analyze-btn" :disabled="isProcessing" @click="emit('analyze')">
        {{ isProcessing ? '분석 중…' : '분석 시작' }}
      </button>
    </div>

    <!-- 우: 미리보기 -->
    <div class="preview-pane">
      <div class="preview-header">{{ selectedFile ? selectedFile.split(/[\\/]/).pop() : '파일 미리보기' }}</div>
      <div class="preview-body">
        <div v-if="!selectedFile" class="preview-placeholder">왼쪽 트리에서 파일을 클릭하면 내용이 표시됩니다.</div>
        <div v-else-if="preview.state === 'loading'" class="preview-placeholder">불러오는 중…</div>
        <pre v-else-if="preview.state === 'text'" class="preview-text">{{ preview.content }}</pre>
        <div v-else class="preview-placeholder">{{ preview.note }}</div>
      </div>
    </div>

    <!-- 우클릭 파일 작업 메뉴 -->
    <template v-if="ctx.visible && ctx.entry">
      <div class="ctx-backdrop" @click="closeCtx" @contextmenu.prevent="closeCtx"></div>
      <div class="ctx-menu" :style="{ left: `${ctx.x}px`, top: `${ctx.y}px` }">
        <button class="ctx-item" @click="doRename(ctx.entry)">이름변경</button>
        <button class="ctx-item" @click="doCopy(ctx.entry)">복사</button>
        <button v-if="ctx.entry.type === 'dir'" class="ctx-item" @click="doMkdir(ctx.entry.path)">새 폴더</button>
        <button class="ctx-item danger" @click="doTrash(ctx.entry)">삭제 (휴지통)</button>
      </div>
    </template>
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

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 6px 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
}
.tree-actions { display: flex; gap: 4px; }
.tool-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-text-light);
  font-size: 12px;
  padding: 2px 7px;
  cursor: pointer;
  &:hover { background: var(--color-bg-tertiary); color: var(--color-text-bright); }
}

.ctx-backdrop { position: fixed; inset: 0; z-index: 2000; }
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
  &:hover { background: var(--color-bg-tertiary); }
  &.danger { color: #fa5252; &:hover { background: rgba(250, 82, 82, 0.12); } }
}

.tree-error { padding: 12px; font-size: 12px; color: var(--color-error); }

.tree-body { flex: 1; overflow: auto; padding: 4px 0; }

.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 0;
  font-size: 12px;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;

  &:hover { background: var(--color-bg-tertiary); }
  &.selected { background: rgba(34, 139, 230, 0.12); }
}

.twisty {
  width: 16px;
  background: transparent;
  border: none;
  color: var(--color-text-light);
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  flex-shrink: 0;
}
.twisty-spacer { width: 16px; flex-shrink: 0; }
.row-icon { flex-shrink: 0; }
.row-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-body { flex: 1; overflow: auto; }
.preview-placeholder {
  padding: 24px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}
.preview-text {
  margin: 0;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text);
  white-space: pre;
}
</style>
