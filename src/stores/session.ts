import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY_THEME = 'robo-analyzer-theme'
const STORAGE_KEY_API_KEY = 'robo-analyzer-api-key'
const STORAGE_KEY_API_BASE = 'robo-analyzer-api-base'
const STORAGE_KEY_LLM_MODEL = 'robo-analyzer-llm-model'
const STORAGE_KEY_API_PROVIDER = 'robo-analyzer-api-provider'

export type Theme = 'dark' | 'light'
export type ApiProvider = 'openai' | 'anthropic'

// 로컬스토리지에서 값 로드
const loadFromStorage = (key: string, defaultValue: string): string => {
  const stored = localStorage.getItem(key)
  return stored || defaultValue
}

// 로컬스토리지에 값 저장
const saveToStorage = (key: string, value: string): void => {
  localStorage.setItem(key, value)
}

export const useSessionStore = defineStore('session', () => {
  // 테마 (dark/light) - 로컬스토리지에서 로드, 기본값 dark
  const theme = ref<Theme>(
    (loadFromStorage(STORAGE_KEY_THEME, 'dark') as Theme)
  )

  // LLM 설정 - 로컬스토리지에서 로드 (빈 값이면 서버 .env 사용)
  const apiKey = ref<string>(loadFromStorage(STORAGE_KEY_API_KEY, ''))
  const apiProvider = ref<ApiProvider>(loadFromStorage(STORAGE_KEY_API_PROVIDER, 'openai') as ApiProvider)
  const apiBase = ref<string>(loadFromStorage(STORAGE_KEY_API_BASE, ''))
  const llmModel = ref<string>(loadFromStorage(STORAGE_KEY_LLM_MODEL, ''))

  // 현재 활성 탭 - 새로고침 시 항상 업로드 탭으로 시작
  const activeTab = ref<string>('upload')

  // 스키마 검색으로 전달할 검색어 (TopToolbar → GraphTab)
  const pendingSchemaSearch = ref<string | null>(null)

  // 소스 파일로 이동할 정보 (파일명 + 라인 번호 + 파일 경로) → UploadTab
  interface SourceNavigation {
    procedureName: string
    lineNumber: number
    fileName?: string
    fileDirectory?: string
  }
  const pendingSourceNavigation = ref<SourceNavigation | null>(null)

  // 테마 적용 — 영속화 + DOM data-theme. 초기 마운트 포함 항상 실행.
  watch(theme, (newTheme) => {
    saveToStorage(STORAGE_KEY_THEME, newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }, { immediate: true })

  // 테마 전환 fade — 토글 순간만 0.25초 transition 활성화 (눈 피로 방지).
  // immediate: false 라 초기 마운트에는 적용 X (FOUC 방지).
  const THEME_FADE_MS = 250
  watch(theme, () => {
    const root = document.documentElement
    root.classList.add('theme-transitioning')
    setTimeout(() => root.classList.remove('theme-transitioning'), THEME_FADE_MS)
  })

  // 새 세션 생성
  const createNewSession = () => {
    activeTab.value = 'upload'
  }

  // 세션 초기화
  const clearSession = () => {
    activeTab.value = 'upload'
  }

  // 탭 변경
  const setActiveTab = (tab: string) => {
    activeTab.value = tab
  }

  // 홈으로 이동 (업로드 탭)
  const goHome = () => {
    activeTab.value = 'upload'
  }

  // 스키마 검색으로 이동
  const navigateToSchemaSearch = (query: string) => {
    pendingSchemaSearch.value = query
    activeTab.value = 'graph'
  }

  // 스키마 검색 데이터 소비 (사용 후 초기화)
  const consumeSchemaSearch = () => {
    const query = pendingSchemaSearch.value
    pendingSchemaSearch.value = null
    return query
  }

  // 소스 파일로 이동하며 특정 라인 하이라이팅
  const navigateToSourceWithLine = (
    procedureName: string,
    lineNumber: number,
    fileName?: string,
    fileDirectory?: string
  ) => {
    pendingSourceNavigation.value = {
      procedureName,
      lineNumber,
      fileName,
      fileDirectory
    }
    activeTab.value = 'upload'
  }

  // 소스 네비게이션 데이터 소비 (사용 후 초기화)
  const consumeSourceNavigation = () => {
    const data = pendingSourceNavigation.value
    pendingSourceNavigation.value = null
    return data
  }

  // 테마 설정
  const setTheme = (newTheme: Theme) => {
    theme.value = newTheme
  }

  // 테마 토글 (dark <-> light)
  const toggleTheme = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  // LLM 설정
  const setApiKey = (key: string) => {
    apiKey.value = key
    saveToStorage(STORAGE_KEY_API_KEY, key)
  }

  const setApiBase = (url: string) => {
    apiBase.value = url
    saveToStorage(STORAGE_KEY_API_BASE, url)
  }

  const setApiProvider = (provider: ApiProvider) => {
    apiProvider.value = provider
    saveToStorage(STORAGE_KEY_API_PROVIDER, provider)
  }

  const setLlmModel = (model: string) => {
    llmModel.value = model
    saveToStorage(STORAGE_KEY_LLM_MODEL, model)
  }

  // 헤더 생성 (LLM 설정 포함 — 빈 값은 전송하지 않아 서버 .env 폴백)
  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Accept-Language': 'ko'
    }

    if (apiKey.value) headers['X-LLM-Api-Key'] = apiKey.value
    if (apiBase.value) headers['X-LLM-Api-Base'] = apiBase.value
    if (llmModel.value) headers['X-LLM-Model'] = llmModel.value

    return headers
  }

  return {
    activeTab,
    theme,
    apiKey,
    apiProvider,
    apiBase,
    llmModel,
    pendingSchemaSearch,
    pendingSourceNavigation,
    createNewSession,
    clearSession,
    setTheme,
    toggleTheme,
    setApiKey,
    setApiProvider,
    setApiBase,
    setLlmModel,
    setActiveTab,
    goHome,
    getHeaders,
    navigateToSchemaSearch,
    consumeSchemaSearch,
    navigateToSourceWithLine,
    consumeSourceNavigation,
  }
})
