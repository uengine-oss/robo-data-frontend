<script setup lang="ts">
/**
 * SettingsModal.vue
 * 전역 설정 모달 컴포넌트
 * 
 * 설정 항목:
 * - 노드 표시 제한 (MAX_DISPLAY_NODES)
 * - UML 다이어그램 깊이
 * - API Key
 * - 데이터 삭제
 */

import { ref, computed, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import { 
  IconSettings, 
  IconX, 
  IconBarChart, 
  IconKey, 
  IconAlertTriangle,
  IconRefresh,
  IconTrash,
  IconEdit
} from '@/components/icons'
import { getAppTitle, setAppTitle, DEFAULT_APP_TITLE } from '@/config/appSettings'

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  'close': []
  'update:nodeLimit': [value: number]
  'update:umlDepth': [value: number]
}>()

// ============================================================================
// Store 연결
// ============================================================================

const sessionStore = useSessionStore()
const projectStore = useProjectStore()

const { apiKey: storeApiKey, theme: storeTheme } = storeToRefs(sessionStore)
const { graphData } = storeToRefs(projectStore)

// ============================================================================
// 설정 상태
// ============================================================================

/** 노드 표시 제한 (임시값) */
const tempNodeLimit = ref(500)

/** UML 다이어그램 기본 깊이 (임시값) */
const tempUmlDepth = ref(3)

/** 테마 (dark/light) */
const tempTheme = ref<'dark' | 'light'>('dark')

/** API Key (마스킹) */
const tempApiKey = ref('')
const showApiKey = ref(false)

/** 앱 타이틀 */
const tempAppTitle = ref(DEFAULT_APP_TITLE)

/** 변경 여부 */
const hasChanges = ref(false)

// store의 apiKey와 동기화
watch(storeApiKey, (value) => {
  if (value) {
    tempApiKey.value = value
  }
}, { immediate: true })

/** 활성 설정 섹션 */
const activeSection = ref<'general' | 'display' | 'api' | 'danger'>('general')

// ============================================================================
// Computed
// ============================================================================

/** 현재 그래프 노드 수 */
const _currentNodeCount = computed(() => graphData.value?.nodes.length || 0)
void _currentNodeCount // suppress unused warning

/** 현재 그래프 관계 수 */
const _currentRelCount = computed(() => graphData.value?.links.length || 0)
void _currentRelCount // suppress unused warning

/** API Key 마스킹 */
const _maskedApiKey = computed(() => {
  if (!tempApiKey.value) return '설정되지 않음'
  if (showApiKey.value) return tempApiKey.value
  return tempApiKey.value.slice(0, 8) + '••••••••••••••••'
})
void _maskedApiKey // suppress unused warning

// ============================================================================
// 핸들러
// ============================================================================

function handleClose() {
  emit('close')
}

function handleNewSession() {
  if (confirm('새 세션을 시작하시겠습니까? 현재 데이터가 초기화됩니다.')) {
    sessionStore.createNewSession()
    projectStore.reset()
    emit('close')
  }
}

function handleDeleteAll() {
  if (confirm('정말로 모든 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
    projectStore.deleteAllData()
    emit('close')
  }
}

// ============================================================================
// 저장 및 적용
// ============================================================================

/** 저장 및 적용 */
function handleSaveAndApply() {
  // localStorage에 저장
  localStorage.setItem('nodeLimit', String(tempNodeLimit.value))
  localStorage.setItem('umlDepth', String(tempUmlDepth.value))
  
  // 테마 저장
  sessionStore.setTheme(tempTheme.value)
  
  // 이벤트 발생
  emit('update:nodeLimit', tempNodeLimit.value)
  emit('update:umlDepth', tempUmlDepth.value)
  window.dispatchEvent(new CustomEvent('nodeLimitChange', { detail: tempNodeLimit.value }))
  window.dispatchEvent(new CustomEvent('umlDepthChange', { detail: tempUmlDepth.value }))
  
  // API Key 저장
  if (tempApiKey.value) {
    sessionStore.setApiKey(tempApiKey.value)
  }
  
  // 앱 타이틀 저장
  setAppTitle(tempAppTitle.value || DEFAULT_APP_TITLE)
  
  hasChanges.value = false
  emit('close')
}

// ============================================================================
// 초기화
// ============================================================================

// 값 변경 감지 (저장 버튼 활성화용)
watch([tempNodeLimit, tempUmlDepth, tempApiKey, tempAppTitle, tempTheme], () => {
  if (props.isOpen) {
    hasChanges.value = true
  }
})

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    // 모달 열릴 때 현재 설정값 로드
    activeSection.value = 'general'
    hasChanges.value = false
    
    // localStorage에서 현재 값 로드
    const savedNodeLimit = localStorage.getItem('nodeLimit')
    if (savedNodeLimit) {
      tempNodeLimit.value = parseInt(savedNodeLimit)
    }
    const savedUmlDepth = localStorage.getItem('umlDepth')
    if (savedUmlDepth) {
      tempUmlDepth.value = parseInt(savedUmlDepth)
    }
    // 테마 로드
    if (storeTheme.value) {
      tempTheme.value = storeTheme.value
    }
    // API Key 로드
    if (storeApiKey.value) {
      tempApiKey.value = storeApiKey.value
    }
    // 앱 타이틀 로드
    tempAppTitle.value = getAppTitle()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
        <div class="modal-container">
          <!-- 헤더 -->
          <div class="modal-header">
            <h2>
              <span class="header-icon">
                <IconSettings :size="20" />
              </span>
              설정
            </h2>
            <button class="close-btn" @click="handleClose">
              <IconX :size="18" />
            </button>
          </div>

          <!-- 사이드바 + 컨텐츠 -->
          <div class="modal-body">
            <!-- 사이드바 -->
            <nav class="settings-nav">
              <button 
                :class="{ active: activeSection === 'general' }"
                @click="activeSection = 'general'"
              >
                <IconEdit :size="16" />
                일반 설정
              </button>
              <button 
                :class="{ active: activeSection === 'display' }"
                @click="activeSection = 'display'"
              >
                <IconBarChart :size="16" />
                표시 설정
              </button>
              <button 
                :class="{ active: activeSection === 'api' }"
                @click="activeSection = 'api'"
              >
                <IconKey :size="16" />
                API 설정
              </button>
              <button 
                :class="{ active: activeSection === 'danger' }"
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
                      type="text" 
                      v-model="tempAppTitle" 
                      :placeholder="DEFAULT_APP_TITLE"
                      class="title-input"
                    />
                  </div>
                </div>
              </div>

              <!-- 표시 설정 -->
              <div v-if="activeSection === 'display'" class="settings-section">
                <h3>표시 설정</h3>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">노드 표시 제한</span>
                    <span class="label-desc">
                      성능 최적화를 위해 한 번에 표시할 최대 노드 수를 설정합니다.
                      나머지 노드는 더블클릭으로 확장할 수 있습니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="number" 
                      v-model.number="tempNodeLimit" 
                      min="100" 
                      max="2000" 
                      step="100"
                    />
                    <span class="unit">개</span>
                  </div>
                </div>

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
                      class="theme-btn"
                      :class="{ active: tempTheme === 'dark' }"
                      @click="tempTheme = 'dark'"
                    >
                      <span class="theme-icon">🌙</span>
                      <span>다크</span>
                    </button>
                    <button 
                      class="theme-btn"
                      :class="{ active: tempTheme === 'light' }"
                      @click="tempTheme = 'light'"
                    >
                      <span class="theme-icon">☀️</span>
                      <span>라이트</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- API 설정 -->
              <div v-if="activeSection === 'api'" class="settings-section">
                <h3>API 설정</h3>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">OpenAI API Key</span>
                    <span class="label-desc">
                      코드 변환에 사용되는 OpenAI API 키입니다.
                      키는 브라우저에 안전하게 저장됩니다.
                    </span>
                  </div>
                  <div class="setting-control api-key-control">
                    <div class="input-wrapper">
                      <input 
                        :type="showApiKey ? 'text' : 'password'"
                        v-model="tempApiKey" 
                        placeholder="sk-..."
                      />
                      <button 
                        class="toggle-visibility" 
                        @click="showApiKey = !showApiKey"
                        :title="showApiKey ? '숨기기' : '보기'"
                      >
                        <svg v-if="showApiKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
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
                    <button class="btn btn--secondary" @click="handleNewSession">
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
                    <button class="btn btn--danger" @click="handleDeleteAll">
                      <IconTrash :size="14" />
                      전체 삭제
                    </button>
                  </div>
                </div>
              </div>
              </div>
              
              <!-- 저장 버튼 (하단) -->
              <div class="modal-footer">
                <button class="btn btn--secondary" @click="handleClose">취소</button>
                <button class="btn btn--primary" @click="handleSaveAndApply">저장</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
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

  &.api-key-control {
    flex-wrap: wrap;

    .input-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 250px;

      input {
        flex: 1;
        width: auto;
      }

      .toggle-visibility {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        color: var(--color-text-light);
        cursor: pointer;
        transition: all 0.15s;

        &:hover {
          background: var(--color-bg-elevated);
          color: var(--color-text);
        }
      }
    }
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
</style>
