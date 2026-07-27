import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'

const STORAGE_KEY_THEME = 'robo-analyzer-theme'
const STORAGE_KEY_API_KEY = 'robo-analyzer-api-key'
const STORAGE_KEY_API_PROVIDER = 'robo-analyzer-api-provider'
const THEME_FADE_MS = 250

export type Theme = 'dark' | 'light'
export type ApiProvider = 'openai' | 'anthropic'

/** Electron host가 mount 시 주입하는 연결 override. 브라우저에서는 backend env를 사용한다. */
export interface Neo4jConnection {
  uri: string
  user: string
  password: string
  database?: string
}

function loadFromStorage(key: string, defaultValue: string): string {
  return localStorage.getItem(key) || defaultValue
}

function saveToStorage(key: string, value: string): void {
  localStorage.setItem(key, value)
}

/**
 * 실행 환경과 모든 backend 요청이 공유하는 사용자 설정/헤더 컨텍스트.
 * 앱 탭이나 도메인 간 화면 전달 상태는 소유하지 않는다.
 */
export const useRuntimeStore = defineStore('runtime', () => {
  const timers = useManagedTimeouts()
  const theme = ref<Theme>(loadFromStorage(STORAGE_KEY_THEME, 'dark') as Theme)
  const apiKey = ref(loadFromStorage(STORAGE_KEY_API_KEY, ''))
  const apiProvider = ref<ApiProvider>(loadFromStorage(STORAGE_KEY_API_PROVIDER, 'openai') as ApiProvider)
  const neo4jConnection = ref<Neo4jConnection | null>(null)

  watch(theme, newTheme => {
    saveToStorage(STORAGE_KEY_THEME, newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }, { immediate: true })

  watch(theme, () => {
    const root = document.documentElement
    root.classList.add('theme-transitioning')
    timers.schedule('theme-transition', () => root.classList.remove('theme-transitioning'), THEME_FADE_MS)
  })

  function setTheme(newTheme: Theme): void {
    theme.value = newTheme
  }

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function setApiKey(key: string): void {
    apiKey.value = key
    saveToStorage(STORAGE_KEY_API_KEY, key)
  }

  function setApiProvider(provider: ApiProvider): void {
    apiProvider.value = provider
    saveToStorage(STORAGE_KEY_API_PROVIDER, provider)
  }

  function setNeo4jConnection(connection: Neo4jConnection | null): void {
    neo4jConnection.value = connection
  }

  function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Accept-Language': 'ko' }
    if (apiKey.value) headers['X-LLM-Api-Key'] = apiKey.value

    const connection = neo4jConnection.value
    if (connection?.uri) {
      headers['X-Neo4j-Uri'] = connection.uri
      headers['X-Neo4j-User'] = connection.user
      headers['X-Neo4j-Password'] = connection.password
      if (connection.database) headers['X-Neo4j-Database'] = connection.database
    }

    return headers
  }

  return {
    theme,
    apiKey,
    apiProvider,
    neo4jConnection,
    setTheme,
    toggleTheme,
    setApiKey,
    setApiProvider,
    setNeo4jConnection,
    getHeaders,
  }
})
