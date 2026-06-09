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

let app: VueApp | null = null

/** analyzer 앱을 주어진 DOM(셀렉터 또는 Element)에 마운트한다. */
export function mount(el: string | Element): () => void {
  // 앱 설정 초기화 (document.title 등)
  initializeAppSettings()

  app = createApp(App)
  app.use(createPinia())   // 이 앱 전용 Pinia 인스턴스 (host 와 격리)
  app.use(router)          // 이 앱 전용 Router 인스턴스 (host 와 격리)
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
