/**
 * bootstrap.ts — Module Federation 진입점
 *
 * analyzer 앱을 "격리 실행"하는 mount/unmount 함수를 제공한다.
 * - host(robo-architect)가 remoteEntry 를 통해 mount(el) 을 호출하면
 *   analyzer 가 자기 Pinia·Router 를 가진 독립 앱 인스턴스로 el 안에서 동작한다.
 *   (host 와 router/pinia 충돌 없음 — 통짜 앱 통합의 표준 패턴)
 * - 단독 실행(main.ts)도 이 함수를 재사용한다.
 */
import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.scss'
import { initializeAppSettings } from './config/appSettings'
import { useAnalyzerStore } from './stores/analyzer'
import { useSessionStore } from './stores/session'

let app: VueApp | null = null

/**
 * analyzer 앱을 주어진 DOM(셀렉터 또는 Element)에 마운트한다.
 * @param opts.embedded    host(architect) 안에 끼워질 때 true — analyzer 자체 상단바를 숨긴다.
 * @param opts.projectRoot host(architect, Electron)가 고른 로컬 폴더 경로 — 주면 경로 모드
 *                         (업로드 없이 그 폴더를 직접 분석). 없으면 브라우저 업로드 모드.
 * @param opts.neo4jDatabase host 가 고른 **프로젝트의 분석 graph**. 주면 모든 요청에
 *                         `X-Neo4j-Database` 로 실려, 분석 쓰기와 그래프 조회가 그
 *                         graph 안에서만 일어난다. 안 주면 백엔드가 자기 env 를 쓴다.
 *                         매 분석 run 이 대상 graph 를 통째로 비우므로, 이 값이
 *                         틀리면 남의 프로젝트 분석이 사라진다.
 * @param opts.onProjectRootChange 사용자가 이 화면에서 폴더를 바꿨을 때 host 에 알린다.
 *                         host 는 자기 저장소(localStorage / workdir ref)를 갱신해 다음
 *                         마운트에도 같은 값을 넘긴다. 주지 않으면 폴더 변경 UI 를 숨긴다 —
 *                         알릴 곳이 없는데 바꾸게 두면 다음 마운트에 조용히 되돌아간다.
 */
export function mount(
  el: string | Element,
  opts: {
    embedded?: boolean
    projectRoot?: string
    neo4jDatabase?: string
    onProjectRootChange?: (path: string) => void
  } = {},
): () => void {
  // 앱 설정 초기화 (document.title 등)
  initializeAppSettings()

  app = createApp(App)
  app.provide('isEmbedded', !!opts.embedded)  // MainLayout 이 상단바 표시 여부 결정
  const pinia = createPinia()  // 이 앱 전용 Pinia 인스턴스 (host 와 격리)
  app.use(pinia)
  app.use(router)              // 이 앱 전용 Router 인스턴스 (host 와 격리)

  // 경로 모드: host 가 넘긴 로컬 폴더를 store 에 주입 (analyzer 는 "경로를 받았나"만 본다).
  if (opts.projectRoot) {
    useAnalyzerStore(pinia).setProjectRoot(opts.projectRoot)
  }
  // host 가 고른 프로젝트의 분석 graph. 모든 요청 헤더에 실린다 — getHeaders() 한 곳.
  if (opts.neo4jDatabase) {
    useSessionStore(pinia).setNeo4jDatabase(opts.neo4jDatabase)
  }
  // 폴더 변경을 host 에 알릴 통로. 없으면 UploadTab 이 변경 UI 를 숨긴다.
  app.provide('onProjectRootChange', opts.onProjectRootChange ?? null)

  app.mount(el)

  return unmount
}

/** 마운트된 analyzer 앱을 해제한다. (host 가 탭을 떠날 때 호출) */
export function unmount(): void {
  app?.unmount()
  app = null
}

// remote-app 의 공개 API (host 는 federation 규약상 remote.default 로 받음). named export 는 단독 실행용.
export default { mount, unmount }
