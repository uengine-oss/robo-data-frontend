/**
 * main.ts — 단독 실행 진입점
 *
 * 진입 로직(createApp·Pinia·Router·mount)은 bootstrap 에 단일화돼 있고,
 * 여기서는 그것을 #app 에 마운트하기만 한다. (Module Federation 의 mount 함수와 동일 경로)
 */
import { mount } from './bootstrap'

mount('#app')
