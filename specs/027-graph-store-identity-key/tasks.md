# Tasks: 그래프 스토어 식별키 단일화 + 일관 초기화

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

변경 = `src/features/code-analysis/analyzer.ts` 1파일. 응답형·소비처·백엔드 무변경.

## 핵심 (그래프 2벌 제거)
- [ ] **T001** `convertNeo4jNode`: `id: node['Node ID']` → `id: (properties.id as string) ?? node['Node ID']`(논리 id, 폴백 elementId). [FR-001/002]
- [ ] **T002** `updateGraphData`: 노드 루프에서 `elemToLogical`(elementId→논리id) 맵 구축. 관계 변환을 이 맵으로(끝점 elementId→논리id, 없으면 폴백). `convertNeo4jRelationship`에 맵 전달(또는 인라인). [FR-002/003]
- [ ] **T003** dedup 확인: fetch 논리키 = 스트림 논리키 → 병합 시 같은 노드 1개. (post-fetch merge는 유지, 키 통일로 2벌 안 됨.) [FR-003]

## 일관 초기화
- [ ] **T004** `clearGraphData`에 `nodeNameCache.clear()` 추가. [FR-005]
- [ ] **T005** 신규/재분석 시작 초기화: `executeUploadPipeline`(append 아님)·`executeRestartPipeline` 시작부 `clearGraphData()` 호출. append는 제외(의도 누적, dedup이 중복 방지). [FR-004]

## 검증 (무회귀 ★)
- [ ] **T006** 빌드: `vue-tsc --noEmit` 내 파일 0에러. 심볼 grep: `convertNeo4jRelationship` 호출부·`nodeNameCache`·`clearGraphData` 호출부 정합(dangling 0). [원칙 §5]
- [ ] **T007** 라이브 검증(vite dev + Playwright, framework 재분석 또는 store 주입): 네비 노드수 = `/robo/graph` 고유 논리 id 수(2배 아님)(SC-001), 패키지/모듈 1벌(SC-002), 그래프 캔버스·노드상세·검색·트리펼침 무회귀·콘솔에러 0(SC-004). 재분석 후 누적 0(SC-003).
- [ ] **T008** 커밋(root frontend main, 내 파일만: analyzer.ts + specs/027 + .specify/feature.json. 사용자 WIP 제외) → fetch→rebase→push. Electron 반영: 서브모듈 sync + 빌드 + architect 포인터 bump(기존 절차).

## 의존
T001→T002→T003 (핵심) → T004→T005 (초기화) → T006→T007→T008.
