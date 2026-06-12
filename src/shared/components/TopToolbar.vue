<script setup lang="ts">
/**
 * TopToolbar.vue
 * 상단 헤더 - 로고, 검색바, 사용자 정보
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@/shared/stores/session'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import { storeToRefs } from 'pinia'
import SettingsModal from './SettingsModal.vue'
import { IconSearch, IconBell, IconSettings } from '@/shared/icons'
import { getAppTitle } from '@/shared/config/appSettings'

const sessionStore = useSessionStore()
const projectStore = useAnalyzerStore()

const { isProcessing, currentStep } = storeToRefs(projectStore)

const showSettings = ref(false)
const searchQuery = ref('')
const appTitle = ref(getAppTitle())

// 타이틀 변경 이벤트 핸들러
const handleAppTitleChange = (event: Event) => {
  const customEvent = event as CustomEvent<string>
  appTitle.value = customEvent.detail
}

onMounted(() => {
  window.addEventListener('appTitleChange', handleAppTitleChange)
})

onUnmounted(() => {
  window.removeEventListener('appTitleChange', handleAppTitleChange)
})

const handleUmlDepthChange = (value: number) => {
  localStorage.setItem('umlDepth', String(value))
  window.dispatchEvent(new CustomEvent('umlDepthChange', { detail: value }))
}

/**
 * 검색어가 자연어 질문인지 판단
 * - 한국어: 질문 형태, 동사 포함, 복잡한 조건
 * - 영어: what, how, show, find, get 등의 질문/명령
 */
const isNaturalLanguageQuery = (query: string): boolean => {
  const q = query.trim().toLowerCase()
  
  // 너무 짧으면 단순 키워드로 간주
  if (q.length < 5) return false
  
  // 단일 단어 (테이블명일 가능성 높음)
  if (!q.includes(' ')) return false
  
  // 한국어 자연어 패턴
  const koreanPatterns = [
    /\?$/, // 물음표로 끝남
    /(보여|알려|찾아|계산|조회|검색|분석|비교|확인)/,  // 동사
    /(해줘|해주세요|할래|할까|하자|인가|인지|는지|을까|를까)/,  // 어미
    /(얼마|몇|어떤|어느|무엇|왜|어디|언제|누가|누구)/,  // 의문사
    /(중에서|보다|이상|이하|사이|평균|합계|최대|최소|개수)/,  // 조건/집계
    /(가장|제일|모든|전체|각각|별로|기준)/  // 수식어
  ]
  
  // 영어 자연어 패턴
  const englishPatterns = [
    /^(what|how|show|find|get|list|give|tell|which|where|when|who|count|calculate|compare)/i,
    /(please|me|all|the|from|with|by|for|in|of|and|or)\b/i,
    /\?$/
  ]
  
  // 패턴 매칭
  for (const pattern of [...koreanPatterns, ...englishPatterns]) {
    if (pattern.test(q)) return true
  }
  
  // 공백으로 구분된 단어가 3개 이상이면 자연어일 가능성 높음
  const words = q.split(/\s+/).filter(w => w.length > 0)
  if (words.length >= 3) return true
  
  return false
}

const handleSearch = () => {
  if (!searchQuery.value.trim()) return
  
  const query = searchQuery.value.trim()
  
  if (isNaturalLanguageQuery(query)) {
    // 자연어 질문 → Text2SQL 탭으로 이동
    sessionStore.navigateToNLSearch(query)
  } else {
    // 단순 키워드 → 스키마 탭으로 이동
    sessionStore.navigateToSchemaSearch(query)
  }
  
  searchQuery.value = '' // 검색창 초기화
}
</script>

<template>
  <header class="top-header">
    <!-- 로고 영역 -->
    <div class="header-left">
      <button class="logo" @click="sessionStore.goHome()" title="홈으로 이동">
        <span class="logo-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </span>
        <span class="logo-text">{{ appTitle }}</span>
      </button>
    </div>
    
    <!-- 검색바 영역 -->
    <div class="header-center">
      <div class="search-container">
        <div class="search-type">
          All
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
        <div class="search-divider"></div>
        <input
          type="text"
          v-model="searchQuery"
          class="search-input"
          placeholder="Search for Classes, Methods, Tables, Packages..."
          @keyup.enter="handleSearch"
        />
        <div class="search-shortcut">
          <kbd>⌘</kbd><kbd>K</kbd>
        </div>
        <button class="search-btn" @click="handleSearch">
          <IconSearch :size="16" />
        </button>
      </div>
    </div>
    
    <!-- 우측 영역: 프로젝트 상태 + 사용자 정보 -->
    <div class="header-right">
      <!-- 프로젝트 상태 -->
      <div class="project-status" v-if="isProcessing">
        <div class="progress-indicator">
          <span class="spinner"></span>
          <span class="step-text">{{ currentStep }}</span>
        </div>
      </div>
      
      <!-- 테마 토글 -->
      <button 
        class="icon-btn theme-toggle" 
        @click="sessionStore.toggleTheme()"
        :title="sessionStore.theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'"
      >
        <span v-if="sessionStore.theme === 'dark'" class="theme-icon">☀️</span>
        <span v-else class="theme-icon">🌙</span>
      </button>
      
      <!-- 알림 -->
      <button class="icon-btn" title="알림">
        <IconBell :size="20" />
      </button>
      
      <!-- 설정 -->
      <button 
        class="icon-btn" 
        @click="showSettings = true"
        title="설정"
      >
        <IconSettings :size="20" />
      </button>
      
      <!-- 사용자 프로필 -->
      <div class="user-profile">
        <div class="avatar">
          <span>U</span>
        </div>
      </div>
    </div>
  </header>
  
  <SettingsModal
    :is-open="showSettings"
    @close="showSettings = false"
    @update:uml-depth="handleUmlDepthChange"
  />
</template>

<style lang="scss" scoped>
.top-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  height: 56px;
  padding: 0 var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

// ============================================================================
// 로고 영역
// ============================================================================
.header-left {
  display: flex;
  align-items: center;
  min-width: 180px;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  .logo-icon {
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-event) 100%);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  
  .logo-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-bright);
    letter-spacing: -0.3px;
  }
}

// ============================================================================
// 검색바 영역
// ============================================================================
.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: 600px;
  margin: 0 auto;
}

.search-container {
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: all 0.15s;
  
  &:focus-within {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    background: var(--color-bg-secondary);
  }
}

.search-type {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-light);
  cursor: pointer;
  white-space: nowrap;
  
  &:hover {
    color: var(--color-text);
  }
}

.search-divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
}

.search-input {
  flex: 1;
  height: 100%;
  padding: 0 12px;
  font-size: 13px;
  color: var(--color-text-bright);
  background: transparent;
  border: none;
  outline: none;
  
  &::placeholder {
    color: var(--color-text-muted);
  }
}

.search-shortcut {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    font-size: 11px;
    font-family: inherit;
    color: var(--color-text-light);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--color-text-light);
  cursor: pointer;
  transition: color 0.15s;
  
  &:hover {
    color: var(--color-accent);
  }
}

// ============================================================================
// 우측 영역
// ============================================================================
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  color: var(--color-text-light);
  
  .project-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(34, 139, 230, 0.15);
  border-radius: var(--radius-md);
  
  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .step-text {
    font-size: 11px;
    color: var(--color-accent);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.theme-toggle {
  .theme-icon {
    font-size: 18px;
    transition: transform 0.3s ease;
  }
  
  &:hover .theme-icon {
    transform: rotate(20deg) scale(1.1);
  }
}

.user-profile {
  cursor: pointer;
  
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%);
    border-radius: 50%;
    color: white;
    font-size: 14px;
    font-weight: 600;
    transition: transform 0.15s;
    
    &:hover {
      transform: scale(1.05);
    }
  }
}
</style>
