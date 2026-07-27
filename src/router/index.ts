import { createRouter, createMemoryHistory } from 'vue-router'

// host(robo-architect)에 임베드될 때 브라우저 URL 을 건드리지 않도록 메모리 히스토리 사용.
// 이 앱은 URL 라우팅 대신 app navigation의 activeFeatureId로 화면을 전환하고, RouterView는 '/' 한 경로만 렌더한다.
// 단독 실행에서도 동작이 동일하다.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue')
    }
  ]
})

export default router
