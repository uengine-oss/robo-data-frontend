/**
 * storageKeys.ts
 * localStorage 키 단일 진실 소스.
 *
 * 같은 키를 여러 모듈이 직접 쓰면 typo / 키 변경 누락이 회귀로 이어진다.
 * 모든 localStorage 접근은 여기 정의된 상수를 참조한다.
 */

export const STORAGE_KEYS = {
  // 그래프 스타일 영속화
  NODE_STYLES: 'robo-analyzer-node-styles',
  RELATIONSHIP_STYLES: 'robo-analyzer-relationship-styles',
  SEED_COLORS: 'robo-analyzer-style-seed-colors',
  HUE_COUNTER: 'robo-analyzer-style-hue-counter',

  // 프로젝트/세션
  PROJECT_STATE: 'robo-analyzer-project-state',
  THEME: 'robo-analyzer-theme',

  // 앱 설정
  APP_TITLE: 'appTitle',
  UML_DEPTH: 'umlDepth',
} as const
