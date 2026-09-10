import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY_THEME = 'robo-analyzer-theme'

export type Theme = 'dark' | 'light'

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

  /**
   * 이 화면이 다룰 Neo4j graph.
   *
   * host(robo-architect)가 어느 프로젝트를 보고 있는지 알려 준다. 분석 결과는
   * 프로젝트마다 다른 graph 에 사는데, 이걸 안 실으면 백엔드가 프로세스 환경에
   * 고정된 graph 하나를 본다 — **오류가 아니라 남의 분석이 자기 것처럼 나오고,
   * 분석을 돌리면 그 graph 를 통째로 비운다.**
   *
   * 단독 실행(host 없음)이면 비어 있고, 백엔드는 지금까지처럼 env 를 쓴다.
   */
  const neo4jDatabase = ref<string | null>(null)
  const setNeo4jDatabase = (name: string | null): void => {
    neo4jDatabase.value = name || null
  }

  // 요청 헤더 — LLM 키는 프론트에서 보내지 않는다(백엔드 .env 일관 사용).
  // 대상 graph 는 **여기 한 곳**에서만 붙인다. 호출부마다 챙기게 하면 한 곳만
  // 빠져도 그 경로가 조용히 다른 graph 를 본다.
  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Accept-Language': 'ko' }
    if (neo4jDatabase.value) headers['X-Neo4j-Database'] = neo4jDatabase.value
    return headers
  }

  return {
    activeTab,
    theme,
    pendingSchemaSearch,
    pendingSourceNavigation,
    createNewSession,
    setTheme,
    toggleTheme,
    setActiveTab,
    goHome,
    getHeaders,
    neo4jDatabase,
    setNeo4jDatabase,
    navigateToSchemaSearch,
    consumeSchemaSearch,
    consumeSourceNavigation,
  }
})
