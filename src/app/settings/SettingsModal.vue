<script setup lang="ts">
/**
 * Application settings modal.
 * 전역 설정 모달 컴포넌트
 *
 * 설정 항목:
 * - 애플리케이션 타이틀 / 테마
 * - LLM API Key
 * - UML 다이어그램 깊이
 * - 데이터 관리
 */

import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRuntimeStore, type ApiProvider } from '@/shared/stores/runtime'
import { useAppNavigationStore } from '@/app/navigation/state'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { storeToRefs } from 'pinia'
import SettingsActionDialog, { type SettingsDangerAction } from './SettingsActionDialog.vue'
import {
  IconSettings,
  IconX,
  IconBarChart,
  IconAlertTriangle,
  IconRefresh,
  IconTrash,
  IconEdit,
  IconKey
} from '@/shared/icons'
import { getAppTitle, setAppTitle, DEFAULT_APP_TITLE } from '@/shared/config/appSettings'
import {
  createSettingsDraft,
  normalizeAppTitle,
  UML_DEPTH_STORAGE_KEY,
} from './application/settingsDraft'

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  'close': []
  'update:umlDepth': [value: number]
}>()

// ============================================================================
// Store 연결
// ============================================================================

const navigationStore = useAppNavigationStore()
const runtimeStore = useRuntimeStore()
const projectStore = useAnalyzerStore()

const { theme: storeTheme, apiKey: storeApiKey, apiProvider: storeApiProvider } = storeToRefs(runtimeStore)

// ============================================================================
// 설정 상태
// ============================================================================

/** UML 다이어그램 기본 깊이 (임시값) */
const tempUmlDepth = ref(3)

/** 테마 (dark/light) */
const tempTheme = ref<'dark' | 'light'>('dark')

/** 앱 타이틀 */
const tempAppTitle = ref(DEFAULT_APP_TITLE)

/** LLM API Key */
const tempApiKey = ref('')
const tempApiProvider = ref<ApiProvider>('openai')
const showApiKey = ref(false)
const modalContainer = ref<HTMLElement | null>(null)
const dangerAction = ref<SettingsDangerAction | null>(null)
const dangerActionPending = ref(false)
const dangerActionError = ref<string | null>(null)
let previouslyFocused: HTMLElement | null = null
let previousBodyOverflow = ''

/** 활성 설정 섹션 */
const activeSection = ref<'general' | 'api' | 'display' | 'danger'>('general')

// ============================================================================
// 핸들러
// ============================================================================

function handleClose() {
  if (dangerActionPending.value) return
  emit('close')
}

function openDangerAction(action: SettingsDangerAction): void {
  dangerActionError.value = null
  dangerAction.value = action
}

function closeDangerAction(): void {
  if (dangerActionPending.value) return
  dangerAction.value = null
  dangerActionError.value = null
}

async function confirmDangerAction(): Promise<void> {
  if (!dangerAction.value || dangerActionPending.value) return

  if (dangerAction.value === 'new-session') {
    navigationStore.resetNavigation()
    projectStore.reset()
    dangerAction.value = null
    await nextTick()
    emit('close')
    return
  }

  dangerActionPending.value = true
  dangerActionError.value = null
  try {
    await projectStore.deleteAllData()
    dangerAction.value = null
    await nextTick()
    emit('close')
  } catch (error: unknown) {
    dangerActionError.value = error instanceof Error ? error.message : '서버 데이터를 삭제하지 못했습니다.'
  } finally {
    dangerActionPending.value = false
  }
}

function handleModalKeydown(event: KeyboardEvent) {
  if (!props.isOpen) return
  if (dangerAction.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    handleClose()
    return
  }
  if (event.key !== 'Tab' || !modalContainer.value) return

  const focusable = [...modalContainer.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  )].filter(element => element.offsetParent !== null)
  if (focusable.length === 0) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => window.addEventListener('keydown', handleModalKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', handleModalKeydown)
  document.body.style.overflow = previousBodyOverflow
})

// ============================================================================
// 저장 및 적용
// ============================================================================

/** 저장 및 적용 */
function handleSaveAndApply() {
  localStorage.setItem(UML_DEPTH_STORAGE_KEY, String(tempUmlDepth.value))

  runtimeStore.setTheme(tempTheme.value)
  runtimeStore.setApiKey(tempApiKey.value)
  runtimeStore.setApiProvider(tempApiProvider.value)

  emit('update:umlDepth', tempUmlDepth.value)
  window.dispatchEvent(new CustomEvent('umlDepthChange', { detail: tempUmlDepth.value }))

  setAppTitle(normalizeAppTitle(tempAppTitle.value, DEFAULT_APP_TITLE))

  emit('close')
}

// ============================================================================
// 초기화
// ============================================================================

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    activeSection.value = 'general'
    dangerAction.value = null
    dangerActionPending.value = false
    dangerActionError.value = null

    const draft = createSettingsDraft({
      appTitle: getAppTitle(),
      theme: storeTheme.value,
      apiKey: storeApiKey.value,
      apiProvider: storeApiProvider.value,
      storedUmlDepth: localStorage.getItem(UML_DEPTH_STORAGE_KEY),
    })
    tempUmlDepth.value = draft.umlDepth
    tempTheme.value = draft.theme
    tempAppTitle.value = draft.appTitle
    tempApiKey.value = draft.apiKey
    tempApiProvider.value = draft.apiProvider
    showApiKey.value = false
    void nextTick(() => modalContainer.value?.querySelector<HTMLElement>('.close-btn')?.focus())
  } else {
    document.body.style.overflow = previousBodyOverflow
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
        <div ref="modalContainer" class="modal-container" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <!-- 헤더 -->
          <div class="modal-header">
            <h2 id="settings-title">
              <span class="header-icon">
                <IconSettings :size="20" />
              </span>
              설정
            </h2>
            <button type="button" class="close-btn" aria-label="설정 닫기" @click="handleClose">
              <IconX :size="18" />
            </button>
          </div>

          <!-- 사이드바 + 컨텐츠 -->
          <div class="modal-body">
            <!-- 사이드바 -->
            <nav class="settings-nav">
              <button 
                type="button"
                :class="{ active: activeSection === 'general' }"
                :aria-current="activeSection === 'general' ? 'page' : undefined"
                @click="activeSection = 'general'"
              >
                <IconEdit :size="16" />
                일반 설정
              </button>
              <button
                type="button"
                :class="{ active: activeSection === 'api' }"
                :aria-current="activeSection === 'api' ? 'page' : undefined"
                @click="activeSection = 'api'"
              >
                <IconKey :size="16" />
                API Key
              </button>
              <button
                type="button"
                :class="{ active: activeSection === 'display' }"
                :aria-current="activeSection === 'display' ? 'page' : undefined"
                @click="activeSection = 'display'"
              >
                <IconBarChart :size="16" />
                표시 설정
              </button>
              <button 
                type="button"
                :class="{ active: activeSection === 'danger' }"
                :aria-current="activeSection === 'danger' ? 'page' : undefined"
                @click="activeSection = 'danger'"
              >
                <IconAlertTriangle :size="16" />
                데이터 관리
              </button>
            </nav>

            <!-- 컨텐츠 영역 (스크롤 가능) -->
            <div class="settings-content-wrapper">
              <div class="settings-content">
              <!-- 일반 설정 -->
              <div v-if="activeSection === 'general'" class="settings-section">
                <h3>일반 설정</h3>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">애플리케이션 타이틀</span>
                    <span class="label-desc">
                      상단 헤더에 표시되는 애플리케이션 이름입니다.
                      브라우저 탭 제목에도 반영됩니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <input 
                      id="settings-app-title"
                      type="text" 
                      v-model="tempAppTitle" 
                      :placeholder="DEFAULT_APP_TITLE"
                      class="title-input"
                      aria-label="애플리케이션 타이틀"
                    />
                  </div>
                </div>
              </div>

              <!-- API Key 설정 -->
              <div v-if="activeSection === 'api'" class="settings-section">
                <h3>API Key 설정</h3>

                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">LLM Provider</span>
                    <span class="label-desc">
                      사용할 LLM API 제공자를 선택합니다.
                    </span>
                  </div>
                  <div class="setting-control provider-control">
                    <button
                      type="button"
                      class="provider-btn"
                      :class="{ active: tempApiProvider === 'openai' }"
                      :aria-pressed="tempApiProvider === 'openai'"
                      @click="tempApiProvider = 'openai'"
                    >
                      OpenAI
                    </button>
                    <button
                      type="button"
                      class="provider-btn"
                      :class="{ active: tempApiProvider === 'anthropic' }"
                      :aria-pressed="tempApiProvider === 'anthropic'"
                      @click="tempApiProvider = 'anthropic'"
                    >
                      Anthropic
                    </button>
                  </div>
                </div>

                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">API Key</span>
                    <span class="label-desc">
                      {{ tempApiProvider === 'openai' ? 'OpenAI' : 'Anthropic' }} API Key를 입력합니다.
                      입력하지 않으면 서버 환경변수의 키를 사용합니다.
                    </span>
                  </div>
                  <div class="setting-control api-key-control">
                    <div class="api-key-input-wrapper">
                      <input
                        :type="showApiKey ? 'text' : 'password'"
                        v-model="tempApiKey"
                        :placeholder="tempApiProvider === 'openai' ? 'sk-...' : 'sk-ant-...'"
                        class="api-key-input"
                        :aria-label="`${tempApiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key`"
                      />
                      <button
                        class="toggle-visibility-btn"
                        @click="showApiKey = !showApiKey"
                        type="button"
                        :aria-label="showApiKey ? 'API Key 숨기기' : 'API Key 보기'"
                        :aria-pressed="showApiKey"
                      >
                        {{ showApiKey ? '숨기기' : '보기' }}
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="tempApiKey" class="api-key-status">
                  <span class="status-dot status-set"></span>
                  <span>API Key가 설정되어 있습니다</span>
                </div>
                <div v-else class="api-key-status">
                  <span class="status-dot status-unset"></span>
                  <span>API Key 미설정 (서버 환경변수 사용)</span>
                </div>
              </div>

              <!-- 표시 설정 -->
              <div v-if="activeSection === 'display'" class="settings-section">
                <h3>표시 설정</h3>

                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">UML 기본 깊이</span>
                    <span class="label-desc">
                      클래스 다이어그램의 기본 탐색 깊이입니다.
                      선택한 클래스로부터 몇 단계까지 관계를 표시할지 설정합니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="range" 
                      v-model.number="tempUmlDepth" 
                      min="1" 
                      max="10" 
                      step="1"
                      aria-label="UML 기본 깊이"
                    />
                    <span class="value">{{ tempUmlDepth }}</span>
                  </div>
                </div>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">테마</span>
                    <span class="label-desc">
                      화면 테마를 선택합니다. 다크 모드 또는 라이트 모드를 선택할 수 있습니다.
                    </span>
                  </div>
                  <div class="setting-control theme-control">
                    <button
                      type="button"
                      class="theme-btn"
                      :class="{ active: tempTheme === 'dark' }"
                      :aria-pressed="tempTheme === 'dark'"
                      @click="tempTheme = 'dark'"
                    >
                      <span class="theme-icon">🌙</span>
                      <span>다크</span>
                    </button>
                    <button
                      type="button"
                      class="theme-btn"
                      :class="{ active: tempTheme === 'light' }"
                      :aria-pressed="tempTheme === 'light'"
                      @click="tempTheme = 'light'"
                    >
                      <span class="theme-icon">☀️</span>
                      <span>라이트</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 데이터 관리 -->
              <div v-if="activeSection === 'danger'" class="settings-section danger-zone">
                <h3>
                  <IconAlertTriangle :size="16" class="danger-icon" />
                  데이터 관리
                </h3>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">새 세션 시작</span>
                    <span class="label-desc">
                      새 세션을 시작합니다. 현재 업로드된 데이터와 그래프가 초기화됩니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <button
                      type="button"
                      class="btn btn--secondary"
                      data-settings-action="new-session"
                      @click="openDangerAction('new-session')"
                    >
                      <IconRefresh :size="14" />
                      새 세션
                    </button>
                  </div>
                </div>

                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">모든 데이터 삭제</span>
                    <span class="label-desc">
                      서버의 모든 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <button
                      type="button"
                      class="btn btn--danger"
                      data-settings-action="delete-all"
                      @click="openDangerAction('delete-all')"
                    >
                      <IconTrash :size="14" />
                      전체 삭제
                    </button>
                  </div>
                </div>
              </div>
              </div>
              
              <!-- 저장 버튼 (하단) -->
              <div class="modal-footer">
                <button type="button" class="btn btn--secondary" @click="handleClose">취소</button>
                <button type="button" class="btn btn--primary" @click="handleSaveAndApply">저장</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <SettingsActionDialog
      :action="dangerAction"
      :pending="dangerActionPending"
      :error="dangerActionError"
      @cancel="closeDangerAction"
      @confirm="confirmDangerAction"
    />
  </Teleport>
</template>

<style lang="scss" scoped>
// ============================================================================
// 모달 오버레이
// ============================================================================

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 700px;
  height: 600px;
  max-width: 90vw;
  max-height: 90vh;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

// ============================================================================
// 헤더
// ============================================================================

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin: 0;

    .header-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-accent);
    }
  }
}

// ============================================================================
// 바디 (사이드바 + 컨텐츠)
// ============================================================================

.modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

// ============================================================================
// 사이드바
// ============================================================================

.settings-nav {
  width: 180px;
  flex-shrink: 0;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 4px;

  button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-light);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;

    svg {
      flex-shrink: 0;
    }

    &:hover {
      background: var(--color-bg-elevated);
      color: var(--color-text);
    }

    &.active {
      background: var(--color-bg-secondary);
      color: var(--color-accent);
      font-weight: 600;
      
      &::before {
        content: '';
        position: absolute;
        left: 16px;
        width: 3px;
        height: 20px;
        background: var(--color-accent);
        border-radius: 2px;
      }
    }
  }
}

// ============================================================================
// 컨텐츠 영역
// ============================================================================

.settings-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  
  // 커스텀 스크롤바
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
    
    &:hover {
      background: var(--color-text-light);
    }
  }
  
  // Firefox
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.settings-section {
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin: 0 0 20px 0;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-border);
    
    .danger-icon {
      color: var(--color-warning);
    }
  }

  &.danger-zone {
    h3 {
      color: var(--color-text-bright);
      border-color: var(--color-border);
    }
  }
}

// ============================================================================
// 설정 항목
// ============================================================================

.setting-item {
  padding: 16px 0;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }

  &.readonly {
    .setting-control {
      background: var(--color-bg-tertiary);
      padding: 10px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
    }
  }
}

.setting-label {
  margin-bottom: 12px;

  .label-text {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 4px;
  }

  .label-desc {
    display: block;
    font-size: 12px;
    color: var(--color-text-light);
    line-height: 1.5;
  }
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 12px;

  input[type="number"],
  input[type="text"],
  input[type="password"] {
    width: 120px;
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 14px;
    color: var(--color-text-bright);
    background: var(--color-bg);
    transition: all 0.15s;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }
    
    &.title-input {
      width: 100%;
      max-width: 300px;
    }
  }

  input[type="range"] {
    flex: 1;
    max-width: 200px;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--color-bg-tertiary);
    border-radius: 3px;
    
    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: var(--color-accent);
      border-radius: 50%;
      cursor: pointer;
      transition: transform 0.15s;
      
      &:hover {
        transform: scale(1.1);
      }
    }
  }

  .unit, .value {
    font-size: 13px;
    color: var(--color-text-light);
    min-width: 30px;
  }

  .value {
    font-weight: 600;
    color: var(--color-accent);
    font-size: 14px;
  }

}

// ============================================================================
// 모달 푸터
// ============================================================================

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.copy-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--color-bg-elevated);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  
  .check-icon {
    color: var(--color-success);
  }
}

// ============================================================================
// 기타 스타일
// ============================================================================

.info-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

// ============================================================================
// API Key 설정
// ============================================================================

.provider-control {
  display: flex;
  gap: 8px;
}

.provider-btn {
  padding: 8px 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--color-accent);
    background: var(--color-bg-tertiary);
  }

  &.active {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: white;
  }
}

.api-key-control {
  flex-direction: column;
  align-items: stretch !important;
}

.api-key-input-wrapper {
  display: flex;
  gap: 8px;
  width: 100%;

  .api-key-input {
    flex: 1;
    width: auto !important;
    max-width: none !important;
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--color-text-bright);
    background: var(--color-bg);
    transition: all 0.15s;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }

    &::placeholder {
      color: var(--color-text-light);
      opacity: 0.5;
    }
  }

  .toggle-visibility-btn {
    flex-shrink: 0;
    padding: 8px 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-tertiary);
    color: var(--color-text-light);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
}

.api-key-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  font-size: 12px;
  color: var(--color-text-light);

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-set {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
  }

  .status-unset {
    background: var(--color-text-light);
    opacity: 0.5;
  }
}

// ============================================================================
// 테마 선택 버튼
// ============================================================================

.theme-control {
  display: flex;
  gap: 12px;
}

.theme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
  
  .theme-icon {
    font-size: 24px;
  }
  
  span:last-child {
    font-size: 13px;
    font-weight: 500;
  }
  
  &:hover {
    border-color: var(--color-accent);
    background: var(--color-bg-tertiary);
  }
  
  &.active {
    border-color: var(--color-accent);
    background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
    color: white;
    box-shadow: 0 4px 12px rgba(34, 139, 230, 0.3);
  }
}

// ============================================================================
// 애니메이션
// ============================================================================

.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;

  .modal-container {
    transition: all 0.25s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal-container {
    transform: scale(0.95) translateY(10px);
  }
}

@media (max-width: 720px) {
  .modal-container {
    width: calc(100vw - 16px);
    height: calc(100dvh - 16px);
    max-width: none;
    max-height: none;
    border-radius: 12px;
  }

  .modal-header {
    padding: 16px;
  }

  .modal-body {
    flex-direction: column;
    min-height: 0;
  }

  .settings-nav {
    width: 100%;
    padding: 8px;
    flex-direction: row;
    flex-shrink: 0;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
    scrollbar-width: thin;

    button {
      flex: 0 0 auto;
      white-space: nowrap;

      &.active::before {
        display: none;
      }
    }
  }

  .settings-content {
    padding: 16px;
  }

  .setting-item {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .setting-control {
    width: 100%;
    justify-content: flex-start;
  }

  .provider-control,
  .theme-control {
    flex-wrap: wrap;
  }

  .modal-footer {
    padding: 12px 16px;
  }
}
</style>
