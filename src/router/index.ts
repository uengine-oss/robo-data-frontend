import { createRouter, createMemoryHistory } from 'vue-router'

// host(robo-architect)에 임베드될 때 브라우저 URL 을 건드리지 않도록 메모리 히스토리 사용.
// 이 앱은 라우터 네비게이션을 쓰지 않고(탭은 session.activeTab), '/' 한 라우트만 RouterView 로 렌더하므로
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
