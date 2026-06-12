<script setup lang="ts">
/**
 * BpmnViewer.vue
 * - 인라인: 읽기 전용 뷰어 (편집 차단, 패널 숨김)
 * - 팝업(확대): 에디터 모드 (편집 가능, 패널/컨텍스트 패드 표시, 저장 버튼)
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import BpmnModeler from 'bpmn-js/lib/Modeler'

// BPMN CSS
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import 'bpmn-js/dist/assets/bpmn-js.css'

// Auto-layout
import { applyAutoLayout } from './autoLayout/bpmnAutoLayout.js'

// Custom renderer (process-gpt color scheme)
import customBpmnModule from './customBpmn/index.js'

// API
import { ontologyApi } from '@/services/api'

const props = defineProps<{
  modelValue?: string  // BPMN XML
  title?: string       // 다이어그램 제목
  horizontal?: boolean // 가로 방향 레이아웃
  nodeId?: string      // Process 노드 ID (저장 시 사용)
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', xml: string): void
  (e: 'saved', xml: string): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const popupContainerRef = ref<HTMLDivElement | null>(null)
const errorMessage = ref('')
const isLoading = ref(false)
const isPopupOpen = ref(false)
const isSaving = ref(false)
const saveMessage = ref('')

let viewer: any = null
let popupViewer: any = null
let resizeObserver: ResizeObserver | null = null

// ── Blocker module: block all editing interactions (inline viewer only) ──

function createBlockerModule() {
  const Blocker = function (eventBus: any) {
    const ignoreEvent = (event: any) => {
      event.preventDefault()
    }
    eventBus.on('shape.move.start', ignoreEvent)
    eventBus.on('shape.move.move', ignoreEvent)
    eventBus.on('shape.move.end', ignoreEvent)
    eventBus.on('connect.start', ignoreEvent)
    eventBus.on('connect.move', ignoreEvent)
    eventBus.on('connect.end', ignoreEvent)
    eventBus.on('resize.start', ignoreEvent)
    eventBus.on('dragger.create', ignoreEvent)
    eventBus.on('preview.move', ignoreEvent)
    eventBus.on('drag.start', ignoreEvent)
    eventBus.on('drag.move', ignoreEvent)
    eventBus.on('drag.end', ignoreEvent)
    eventBus.on('directEditing.activate', ignoreEvent)
    eventBus.on('directEditing.deactivate', ignoreEvent)
    eventBus.on('directEditing.cancel', ignoreEvent)
  }
  ;(Blocker as any).$inject = ['eventBus']

  return {
    __init__: ['blocker'],
    blocker: ['type', Blocker],
  }
}

// ── Create viewer (read-only) ──

function createViewer(container: HTMLElement): any {
  return new BpmnModeler({
    container,
    keyboard: { bindTo: document },
    additionalModules: [
      createBlockerModule(),
      customBpmnModule,
      { __init__: ['contextPadProvider'], contextPadProvider: ['value', {}] },
    ],
  })
}

// ── Create editor (full editing) ──

function createEditor(container: HTMLElement): any {
  return new BpmnModeler({
    container,
    keyboard: { bindTo: document },
    additionalModules: [
      customBpmnModule,
    ],
  })
}

// ── Zoom helpers ──

function fitWidth(modeler: any, containerEl: HTMLElement) {
  try {
    const canvas = modeler.get('canvas')
    canvas.zoom('fit-viewport')
    const vb = canvas.viewbox()
    if (!vb.inner || vb.inner.width <= 0) return
    const containerWidth = containerEl.clientWidth
    if (containerWidth <= 0) return
    const PAD = 20
    const targetZoom = (containerWidth - PAD) / vb.inner.width
    const requiredHeight = vb.inner.height * targetZoom + PAD * 2
    containerEl.style.height = `${Math.max(requiredHeight, 300)}px`
    canvas.resized()
    canvas.viewbox({
      x: vb.inner.x - PAD / (2 * targetZoom),
      y: vb.inner.y - PAD / targetZoom,
      width: containerWidth / targetZoom,
      height: requiredHeight / targetZoom,
    })
  } catch (err) {
    console.warn('[BpmnViewer] fitWidth failed:', err)
  }
}

function deferredAction(fn: () => void, retries = 3) {
  const delays = [60, 250, 600]
  delays.slice(0, retries).forEach((ms) => {
    setTimeout(() => { try { fn() } catch { /* ignore */ } }, ms)
  })
}

// ── Load BPMN XML into modeler + apply auto-layout ──

async function loadBpmn(
  modeler: any,
  xml: string,
  horizontal?: boolean,
  mode: 'inline' | 'popup' = 'inline',
  containerEl?: HTMLElement | null,
): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''

  const useHorizontal = horizontal ?? props.horizontal ?? false

  try {
    const result = await modeler.importXML(xml)
    if (result.warnings?.length) {
      console.warn('[BpmnViewer] Import warnings:', result.warnings)
    }

    try {
      applyAutoLayout(modeler, { horizontal: useHorizontal })
    } catch (layoutErr) {
      console.warn('[BpmnViewer] Auto-layout failed (diagram still usable):', layoutErr)
    }

    if (mode === 'inline' && containerEl) {
      fitWidth(modeler, containerEl)
      deferredAction(() => fitWidth(modeler, containerEl))
    } else {
      const canvas = modeler.get('canvas')
      canvas.zoom('fit-viewport')
      deferredAction(() => {
        try { modeler.get('canvas').zoom('fit-viewport') } catch {}
      })
    }
  } catch (err: any) {
    console.error('[BpmnViewer] Failed to render BPMN:', err)
    errorMessage.value = err?.message || 'BPMN 다이어그램을 표시할 수 없습니다.'
  } finally {
    isLoading.value = false
  }
}

// ── Inline viewer ──

async function initViewer() {
  if (!containerRef.value || !props.modelValue) return

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (viewer) {
    viewer.destroy()
    viewer = null
  }

  await nextTick()

  viewer = createViewer(containerRef.value)
  await loadBpmn(viewer, props.modelValue, undefined, 'inline', containerRef.value)

  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  resizeObserver = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (viewer && containerRef.value) {
        fitWidth(viewer, containerRef.value)
      }
    }, 200)
  })
  resizeObserver.observe(containerRef.value)
}

function fitToViewport() {
  if (!viewer || !containerRef.value) return
  fitWidth(viewer, containerRef.value)
}

function zoomIn() {
  if (!viewer) return
  try { viewer.get('canvas').zoom(viewer.get('canvas').zoom() * 1.2) } catch {}
}

function zoomOut() {
  if (!viewer) return
  try { viewer.get('canvas').zoom(viewer.get('canvas').zoom() / 1.2) } catch {}
}

// ── Popup (editor) ──

async function openPopup() {
  isPopupOpen.value = true
  saveMessage.value = ''
  await nextTick()
  await new Promise((r) => setTimeout(r, 100))

  if (!popupContainerRef.value || !props.modelValue) return

  if (popupViewer) {
    popupViewer.destroy()
    popupViewer = null
  }

  // 에디터 모드로 생성 (편집 가능)
  popupViewer = createEditor(popupContainerRef.value)
  await loadBpmn(popupViewer, props.modelValue, true, 'popup')

  document.addEventListener('keydown', handleEscKey)
  document.addEventListener('keydown', handleSaveKey)
}

function closePopup() {
  isPopupOpen.value = false
  saveMessage.value = ''
  if (popupViewer) {
    popupViewer.destroy()
    popupViewer = null
  }
  document.removeEventListener('keydown', handleEscKey)
  document.removeEventListener('keydown', handleSaveKey)
}

function handleEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closePopup()
}

function handleSaveKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    saveBpmn()
  }
}

async function saveBpmn() {
  if (!popupViewer || isSaving.value) return

  isSaving.value = true
  saveMessage.value = ''

  try {
    // 현재 에디터 상태에서 XML 추출
    const { xml } = await popupViewer.saveXML({ format: true })
    if (!xml) throw new Error('BPMN XML 추출 실패')

    // Neo4j에 저장 (nodeId가 있는 경우)
    if (props.nodeId) {
      await ontologyApi.updateBpmnXml(props.nodeId, xml)
      saveMessage.value = '✅ 저장 완료'
    } else {
      saveMessage.value = '⚠️ 노드 ID 없음 (로컬만 반영)'
    }

    // 부모에게 업데이트 알림
    emit('update:modelValue', xml)
    emit('saved', xml)

    // 인라인 뷰어도 갱신
    if (viewer && containerRef.value) {
      await loadBpmn(viewer, xml, undefined, 'inline', containerRef.value)
    }

    setTimeout(() => { saveMessage.value = '' }, 3000)
  } catch (err: any) {
    console.error('[BpmnViewer] Save failed:', err)
    saveMessage.value = `❌ 저장 실패: ${err.message || err}`
    setTimeout(() => { saveMessage.value = '' }, 5000)
  } finally {
    isSaving.value = false
  }
}

function popupFit() {
  if (!popupViewer) return
  try { popupViewer.get('canvas').zoom('fit-viewport') } catch {}
}

function popupZoomIn() {
  if (!popupViewer) return
  try { popupViewer.get('canvas').zoom(popupViewer.get('canvas').zoom() * 1.2) } catch {}
}

function popupZoomOut() {
  if (!popupViewer) return
  try { popupViewer.get('canvas').zoom(popupViewer.get('canvas').zoom() / 1.2) } catch {}
}

defineExpose({ fitToViewport, zoomIn, zoomOut, openPopup })

watch(
  () => props.modelValue,
  async (newXml) => {
    if (newXml) {
      await initViewer()
      if (isPopupOpen.value && popupContainerRef.value) {
        if (popupViewer) { popupViewer.destroy(); popupViewer = null }
        popupViewer = createEditor(popupContainerRef.value)
        await loadBpmn(popupViewer, newXml, true, 'popup')
      }
    }
  }
)

onMounted(() => {
  if (props.modelValue) initViewer()
})

onUnmounted(() => {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (viewer) { viewer.destroy(); viewer = null }
  if (popupViewer) { popupViewer.destroy(); popupViewer = null }
  document.removeEventListener('keydown', handleEscKey)
  document.removeEventListener('keydown', handleSaveKey)
})
</script>

<template>
  <div class="bpmn-viewer-container view-mode">
    <!-- Toolbar -->
    <div class="bpmn-toolbar">
      <span class="bpmn-toolbar-title">{{ title || 'BPMN Diagram' }}</span>
      <div class="bpmn-toolbar-actions">
        <button class="bpmn-btn" @click="zoomOut" title="축소">−</button>
        <button class="bpmn-btn" @click="fitToViewport" title="화면에 맞추기">⊡</button>
        <button class="bpmn-btn" @click="zoomIn" title="확대">+</button>
        <div class="bpmn-toolbar-separator"></div>
        <button class="bpmn-btn expand-btn" @click="openPopup" title="편집기 열기 (전체 화면)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="bpmn-loading">
      <div class="bpmn-spinner"></div>
      <span>BPMN 로딩 중...</span>
    </div>

    <!-- Error -->
    <div v-else-if="errorMessage" class="bpmn-error">
      <span class="bpmn-error-icon">⚠️</span>
      <span>{{ errorMessage }}</span>
    </div>

    <!-- No data -->
    <div v-else-if="!modelValue" class="bpmn-empty">
      <span>BPMN 데이터가 없습니다</span>
    </div>

    <!-- Canvas -->
    <div ref="containerRef" class="bpmn-canvas"></div>
  </div>

  <!-- ── 팝업 (에디터 모드) ── -->
  <Teleport to="body">
    <Transition name="bpmn-popup">
      <div v-if="isPopupOpen" class="bpmn-popup-overlay" @click.self="closePopup">
        <div class="bpmn-popup-modal bpmn-editor-mode">
          <!-- 팝업 헤더 -->
          <div class="bpmn-popup-header">
            <div class="bpmn-popup-header-left">
              <span class="bpmn-popup-title">{{ title || 'BPMN Editor' }}</span>
              <span class="editor-badge">편집 모드</span>
            </div>
            <div class="bpmn-popup-actions">
              <button class="bpmn-btn" @click="popupZoomOut" title="축소">−</button>
              <button class="bpmn-btn" @click="popupFit" title="화면에 맞추기">⊡</button>
              <button class="bpmn-btn" @click="popupZoomIn" title="확대">+</button>
              <div class="bpmn-toolbar-separator"></div>
              <button
                class="bpmn-btn save-btn"
                @click="saveBpmn"
                :disabled="isSaving"
                title="저장 (Ctrl+S)"
              >
                <span v-if="isSaving" class="bpmn-spinner-sm"></span>
                <span v-else>💾</span>
              </button>
              <div class="bpmn-toolbar-separator"></div>
              <button class="bpmn-btn close-btn" @click="closePopup" title="닫기 (ESC)">✕</button>
            </div>
          </div>
          <!-- 팝업 캔버스 -->
          <div ref="popupContainerRef" class="bpmn-popup-canvas"></div>
          <!-- 팝업 하단 힌트 -->
          <div class="bpmn-popup-footer">
            <span v-if="saveMessage" class="save-message">{{ saveMessage }}</span>
            <span v-else>드래그: 요소 이동 · 마우스 휠: 확대/축소 · Ctrl+S: 저장 · ESC: 닫기</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bpmn-viewer-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  overflow: visible;
  border: 1px solid #e0e0e0;
}

.bpmn-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.bpmn-toolbar-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #555;
}

.bpmn-toolbar-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.bpmn-toolbar-separator {
  width: 1px;
  height: 18px;
  background: #ddd;
  margin: 0 4px;
}

.bpmn-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: #555;
  transition: all 0.15s;
}

.bpmn-btn:hover {
  background: #e8e8e8;
  border-color: #999;
}

.bpmn-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.expand-btn {
  background: #f0f4ff;
  border-color: #a0b4ff;
  color: #3b5bdb;
}

.expand-btn:hover {
  background: #dbe4ff;
  border-color: #5c7cfa;
}

.save-btn {
  background: #f0fff0;
  border-color: #86efac;
  color: #16a34a;
  width: auto;
  padding: 0 10px;
  font-size: 0.85rem;
}

.save-btn:hover {
  background: #dcfce7;
  border-color: #4ade80;
}

.bpmn-canvas {
  width: 100%;
  min-height: 300px;
  position: relative;
}

.bpmn-loading,
.bpmn-error,
.bpmn-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: #888;
  font-size: 0.9rem;
}

.bpmn-error {
  color: #d32f2f;
}

.bpmn-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #ddd;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: bpmn-spin 0.8s linear infinite;
}

.bpmn-spinner-sm {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #ddd;
  border-top-color: #16a34a;
  border-radius: 50%;
  animation: bpmn-spin 0.8s linear infinite;
}

@keyframes bpmn-spin {
  to { transform: rotate(360deg); }
}

/* ── 팝업 (에디터 모달) ── */

.bpmn-popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.bpmn-popup-modal {
  width: calc(100vw - 48px);
  height: calc(100vh - 48px);
  max-width: 1600px;
  max-height: 1000px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bpmn-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.bpmn-popup-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bpmn-popup-title {
  font-size: 1rem;
  font-weight: 700;
  color: #333;
}

.editor-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: #dbeafe;
  color: #2563eb;
  letter-spacing: 0.02em;
}

.bpmn-popup-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.close-btn {
  background: #fff0f0;
  border-color: #fca5a5;
  color: #dc2626;
  font-size: 0.85rem;
}

.close-btn:hover {
  background: #fecaca;
  border-color: #f87171;
}

.bpmn-popup-canvas {
  flex: 1;
  width: 100%;
  min-height: 0;
  position: relative;
}

.bpmn-popup-footer {
  padding: 6px 20px;
  background: #f8f9fa;
  border-top: 1px solid #e0e0e0;
  text-align: center;
  font-size: 0.75rem;
  color: #999;
  flex-shrink: 0;
}

.save-message {
  font-weight: 600;
  color: #333;
}

/* ── 팝업 애니메이션 ── */
.bpmn-popup-enter-active {
  animation: popup-in 0.25s ease-out;
}

.bpmn-popup-leave-active {
  animation: popup-in 0.2s ease-in reverse;
}

@keyframes popup-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

<style>
/* ── View-mode global overrides (unscoped, inline viewer only) ── */

/* Hide palette in read-only view */
.view-mode .djs-palette {
  display: none !important;
}

/* Hide direct editing */
.view-mode .djs-direct-editing-content {
  display: none !important;
}

.view-mode .djs-direct-editing-parent {
  pointer-events: none !important;
  background-color: inherit !important;
  border: none !important;
  border-radius: 8px;
}

/* Prevent label editing in view mode */
.view-mode .djs-element .djs-label {
  pointer-events: none !important;
  user-select: none !important;
}

/* Background styling + ensure full size */
.bpmn-viewer-container .djs-container,
.bpmn-popup-modal .djs-container {
  background: #fafbfe !important;
}

.bpmn-viewer-container .bpmn-canvas .djs-container {
  width: 100% !important;
  height: 100% !important;
}

/* Hide context pad in view mode only */
.view-mode .djs-context-pad {
  display: none !important;
}

/* Hide popup menu in view mode only */
.view-mode .djs-popup {
  display: none !important;
}

/* ── Editor mode: style the palette ── */
.bpmn-editor-mode .djs-palette {
  background: #f8f9fa !important;
  border-right: 1px solid #e0e0e0 !important;
  box-shadow: 2px 0 8px rgba(0,0,0,0.06) !important;
}

/* ── BPMN element color overrides (both modes) ── */

/* Lane / Participant backgrounds */
.djs-visual > rect[style*="lane"],
[data-element-id*="Lane"] .djs-visual > rect {
  fill: #f4f8fc;
  stroke: #4e72be;
}

/* Highlight selected shape border */
.djs-shape.selected .djs-outline {
  stroke: #68369A !important;
  stroke-width: 2px !important;
}

/* Sequence flow colors */
.djs-connection .djs-visual > path {
  stroke: #333333 !important;
  stroke-width: 2px !important;
}

/* Sequence flow arrow marker */
.djs-connection .djs-visual > defs > marker > path {
  fill: #333333 !important;
  stroke: #333333 !important;
}

/* Label text styling */
.djs-label text,
.djs-label tspan {
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
  font-size: 12px !important;
}
</style>
