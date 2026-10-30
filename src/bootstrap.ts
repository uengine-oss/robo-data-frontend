/**
 * bootstrap.ts — Module Federation 진입점
 *
 * analyzer 앱을 "격리 실행"하는 mount/unmount 함수를 제공한다.
 * - host(robo-architect)가 remoteEntry 를 통해 mount(el) 을 호출하면
 *   analyzer 가 자기 Pinia·Router 를 가진 독립 앱 인스턴스로 el 안에서 동작한다.
 *   (host 와 router/pinia 충돌 없음 — 통짜 앱 통합의 표준 패턴)
 * - 단독 실행(main.ts)도 이 함수를 재사용한다.
 */
import { createApp, watch, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.scss'
import { initializeAppSettings } from '@/shared/config/appSettings'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { useRuntimeStore, type Neo4jConnection } from '@/shared/stores/runtime'
import { FEATURE_NAVIGATION_KEY } from '@/shared/navigation/featureNavigation'
import { createFeatureNavigationPort, useAppNavigationStore } from '@/app/navigation/state'

let app: VueApp | null = null
let nav: ReturnType<typeof useAppNavigationStore> | null = null
let stopFeatureWatch: (() => void) | null = null

/**
 * analyzer 앱을 주어진 DOM(셀렉터 또는 Element)에 마운트한다.
 * @param opts.embedded    host(architect) 안에 끼워질 때 true — analyzer 자체 상단바를 숨긴다.
 * @param opts.projectRoot host(architect, Electron)가 고른 로컬 폴더 경로 — 주면 경로 모드
 *                         (업로드 없이 그 폴더를 직접 분석). 없으면 브라우저 업로드 모드.
 * @param opts.neo4j       host(Electron)가 고른 Neo4j 연결 — 주면 요청 헤더로 백엔드에 override.
 *                         없으면(브라우저/테스트) 백엔드가 서버 env(ROBO_NEO4J_*) 사용.
 * @param opts.neo4jDatabase 프로젝트의 분석 graph — 번들 연결에서는 내부 URI와 함께 사용.
 * @param opts.hideNav     host 가 자기 레일에 메뉴를 그릴 때 true — analyzer 왼쪽 메뉴(SideNav)를 숨긴다.
 *                         메뉴 이동은 setFeature(id), 현재 메뉴는 onFeatureChange(id) 로 주고받는다.
 */
export function mount(
  el: string | Element,
  opts: {
    embedded?: boolean; projectRoot?: string; neo4j?: Neo4jConnection; neo4jDatabase?: string
    hideNav?: boolean; onFeatureChange?: (featureId: string) => void
  } = {},
): () => void {
  // 앱 설정 초기화 (document.title 등)
  initializeAppSettings()

  app = createApp(App)
  app.provide('isEmbedded', !!opts.embedded)  // MainLayout 이 상단바 표시 여부 결정
  app.provide('hideSideNav', !!opts.hideNav)  // MainLayout 이 왼쪽 메뉴 표시 여부 결정
  const pinia = createPinia()  // 이 앱 전용 Pinia 인스턴스 (host 와 격리)
  app.use(pinia)
  nav = useAppNavigationStore(pinia)
  if (opts.onFeatureChange) {
    const notify = opts.onFeatureChange
    stopFeatureWatch = watch(() => nav?.activeFeatureId, (id) => { if (id) notify(id) }, { immediate: true })
  }
  app.use(router)              // 이 앱 전용 Router 인스턴스 (host 와 격리)
  app.provide(
    FEATURE_NAVIGATION_KEY,
    createFeatureNavigationPort(useAppNavigationStore(pinia)),
  )

  // 경로 모드: host 가 넘긴 로컬 폴더를 store 에 주입 (analyzer 는 "경로를 받았나"만 본다).
  if (opts.projectRoot) {
    useAnalyzerStore(pinia).setProjectRoot(opts.projectRoot)
  }

  // Neo4j override: host(Electron)가 넘긴 연결을 session 에 주입 → getHeaders 가 X-Neo4j-* 헤더로 전달.
  if (opts.neo4j) useRuntimeStore(pinia).setNeo4jConnection(opts.neo4j)
  // The host's selected project pair wins over the connection's default DB.
  // It must also work when the host supplies a DB but no explicit connection.
  if (opts.neo4jDatabase) useRuntimeStore(pinia).setNeo4jDatabase(opts.neo4jDatabase)

  app.mount(el)

  return unmount
}

/** 마운트된 analyzer 앱을 해제한다. (host 가 탭을 떠날 때 호출) */
export function unmount(): void {
  stopFeatureWatch?.()
  stopFeatureWatch = null
  app?.unmount()
  app = null
  nav = null
}

/** host 레일에서 메뉴를 고를 때 — features.config 의 id (upload · datasources · graph · schema …). */
export function setFeature(featureId: string): void {
  nav?.setActiveFeature(featureId)
}

// remote-app 의 공개 API (host 는 federation 규약상 remote.default 로 받음). named export 는 단독 실행용.
export default { mount, unmount, setFeature }
