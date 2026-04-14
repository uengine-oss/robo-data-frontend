import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY_THEME = 'robo-analyzer-theme'
const STORAGE_KEY_API_KEY = 'robo-analyzer-api-key'
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

  // LLM API Key - 로컬스토리지에서 로드
  const apiKey = ref<string>(loadFromStorage(STORAGE_KEY_API_KEY, ''))
  const apiProvider = ref<ApiProvider>(
    (loadFromStorage(STORAGE_KEY_API_PROVIDER, 'openai') as ApiProvider)
  )
  
  // 현재 활성 탭 - 새로고침 시 항상 업로드 탭으로 시작
  const activeTab = ref<string>('upload')
  
  // OLAP으로 전달할 SQL 정보
  interface OlapTransferData {
    question: string
    sql: string
    fromHistory?: boolean
  }
  const olapTransferData = ref<OlapTransferData | null>(null)
  
  // 감시 에이전트로 전달할 쿼리 정보
  interface WatchAgentTransferData {
    question: string
    sql: string
    rowCount?: number | null
    executionTimeMs?: number | null
  }
  const watchAgentTransferData = ref<WatchAgentTransferData | null>(null)
  
  // 스키마 검색으로 전달할 검색어
  const pendingSchemaSearch = ref<string | null>(null)
  
  // 자연어(Text2SQL) 검색으로 전달할 질문
  const pendingNLSearch = ref<string | null>(null)
  
  // 소스 파일로 이동할 정보 (파일명 + 라인 번호 + 파일 경로)
  interface SourceNavigation {
    procedureName: string
    lineNumber: number
    fileName?: string
    fileDirectory?: string
  }
  const pendingSourceNavigation = ref<SourceNavigation | null>(null)
  
  // 온톨로지(도메인 스키마)로 전달할 SQL 정보
  interface OntologyTransferData {
    question: string
    sql: string
  }
  const ontologyTransferData = ref<OntologyTransferData | null>(null)

  
  // 테마 변경 시 로컬스토리지에 저장 및 DOM에 적용
  watch(theme, (newTheme) => {
    saveToStorage(STORAGE_KEY_THEME, newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }, { immediate: true })
  
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
  
  // OLAP으로 SQL 전달하며 이동
  const navigateToOlapWithSQL = (question: string, sql: string) => {
    olapTransferData.value = {
      question,
      sql,
      fromHistory: true
    }
    activeTab.value = 'olap'
  }
  
  // OLAP 전달 데이터 소비 (사용 후 초기화)
  const consumeOlapTransferData = () => {
    const data = olapTransferData.value
    olapTransferData.value = null
    return data
  }
  
  // 감시 에이전트로 쿼리 정보 전달하며 이동
  const navigateToWatchAgentWithQuery = (data: WatchAgentTransferData) => {
    watchAgentTransferData.value = data
    activeTab.value = 'watch-agent'
  }
  
  // 감시 에이전트 전달 데이터 소비 (사용 후 초기화)
  const consumeWatchAgentTransferData = () => {
    const data = watchAgentTransferData.value
    watchAgentTransferData.value = null
    return data
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
  
  // 자연어(Text2SQL) 검색으로 이동
  const navigateToNLSearch = (query: string) => {
    pendingNLSearch.value = query
    activeTab.value = 'text2sql'
  }
  
  // 자연어 검색 데이터 소비 (사용 후 초기화)
  const consumeNLSearch = () => {
    const query = pendingNLSearch.value
    pendingNLSearch.value = null
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
  
  // 온톨로지(도메인 스키마)로 SQL 전달하며 이동
  const navigateToOntologyWithSQL = (question: string, sql: string) => {
    ontologyTransferData.value = {
      question,
      sql
    }
    activeTab.value = 'schema-modeling'
  }
  
  // 온톨로지 전달 데이터 소비 (사용 후 초기화)
  const consumeOntologyTransferData = () => {
    const data = ontologyTransferData.value
    ontologyTransferData.value = null
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
  
  // API Key 설정
  const setApiKey = (key: string) => {
    apiKey.value = key
    saveToStorage(STORAGE_KEY_API_KEY, key)
  }

  // API Provider 설정
  const setApiProvider = (provider: ApiProvider) => {
    apiProvider.value = provider
    saveToStorage(STORAGE_KEY_API_PROVIDER, provider)
  }

  // 헤더 생성 (API Key 포함)
  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Accept-Language': 'ko'
    }

    if (apiKey.value) {
      if (apiProvider.value === 'anthropic') {
        headers['Anthropic-Api-Key'] = apiKey.value
      } else {
        headers['OpenAI-Api-Key'] = apiKey.value
      }
    }

    return headers
  }
  
  return {
    activeTab,
    theme,
    apiKey,
    apiProvider,
    olapTransferData,
    watchAgentTransferData,
    pendingSchemaSearch,
    pendingNLSearch,
    pendingSourceNavigation,
    ontologyTransferData,
    createNewSession,
    clearSession,
    setTheme,
    toggleTheme,
    setApiKey,
    setApiProvider,
    setActiveTab,
    goHome,
    getHeaders,
    navigateToOlapWithSQL,
    consumeOlapTransferData,
    navigateToWatchAgentWithQuery,
    consumeWatchAgentTransferData,
    navigateToSchemaSearch,
    consumeSchemaSearch,
    navigateToNLSearch,
    consumeNLSearch,
    navigateToSourceWithLine,
    consumeSourceNavigation,
    navigateToOntologyWithSQL,
    consumeOntologyTransferData,
  }
})

