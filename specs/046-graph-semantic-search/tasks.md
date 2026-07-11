# Tasks: 그래프 탭 의미 기반 코드 검색

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contract**: [contracts/search-stream.md](./contracts/search-stream.md)

파일 경로 = `project/robo-data-frontend/`. [P]=병렬 가능(다른 파일). 순서=의존 우선.

## Phase M1 — 통신·상태 토대 (Foundational)

- [x] T001 `src/shared/services/http.ts` — `streamFetch`에 optional `signal?: AbortSignal` 5번째 인자 추가, `fetch`에 전달. 기존 호출 무변경(하위호환) 확인.
- [x] T002 `src/features/code-analysis/api.ts` — `roboApi.searchSemantic(body, headers, onEvent, signal)` 추가. `POST {ROBO_BASE_URL}/search/semantic`, streamFetch 재사용. AnalyzeEvent와 별개인 SearchEvent 타입.
- [x] T003 `src/features/code-analysis/stores/semanticSearch.ts` [신규] — data-model §1 스토어(query/status/phases/elapsedSec/clusters/errorMessage/_abort/_timer + getters + run/cancel/reset/setQuery + abort 가드 + 이벤트 매핑 §2).

## Phase M2 — Overview 의미검색 UI (US1·US4)

- [x] T004 `src/features/code-analysis/components/graph/NodeDetailPanel.vue` — 이름 결과 아래 "의미 기반 관련 코드" 섹션. 뷰 상태머신(data-model §4): idle=버튼+한줄안내 / running=단계·경과초·취소 / done>0=뭉치목록 / done=0=못찾음 / error=사유. semanticSearch 스토어 구독. 버튼 클릭=store.run(getHeaders). 빈칸 한줄안내.
- [x] T005 `NodeDetailPanel.vue` — 뭉치 클릭 emit(`cluster-select`) → 노드 id 배열 전달. selectedNode 세팅 안 함(FR-005). 결과 유지.
- [x] T006 `NodeDetailPanel.vue` — 검색칸 placeholder를 이름·업무 말 둘 다 받는 문구로. 버튼 아래 항상 같은 한 줄("자세히 쓸수록 잘 찾습니다"). 예시칩·ⓘ 없음(FR-015).

## Phase M3 — 캔버스 배선 (US1, FR-005 근본해결)

- [x] T007 `src/features/code-analysis/components/graph/GraphTab.vue` — `cluster-select` 수신 → `canvasStore.addNodeToCanvas(id)` 반복. **selectedNode 세팅 안 함**(Overview 유지). nodeMap에 없는 id는 누락 카운트 → 사용자 표기(무반응 금지).
- [x] T008 `GraphTab.vue` — 이름검색 결과 클릭 동작 재검토(R1 역할분리). **판단: 기존 동작(클릭→노드상세) 유지**. 이름검색은 spec 042/045에서 확립된 UX라 변경 시 회귀 위험이 크고, spec 046 FR-005·US1-3은 명시적으로 "결과 뭉치"를 대상으로 함. 역할분리(retrieve vs inspect)는 **신규인 뭉치 클릭**에만 적용(handleClusterSelect=캔버스만·Overview 유지). 이름 결과는 범위 밖 = 무변경.

## Phase M4 — 진행 배지·⌘K·트리 문구 (US2·US3)

- [x] T009 `src/shared/components/TopToolbar.vue` — `semanticSearch.isSearching`·`elapsedSec` 구독 → project-status 영역에 "의미검색 중 · N초" 배지.
- [x] T010 `TopToolbar.vue` — `handleSearch`에서 activeTab==='graph'이면 `semanticSearch.setQuery(query)`로 Overview 검색에 전달(트리필터 아님, FR-011). query 단일출처 배선.
- [x] T011 `src/features/code-analysis/components/graph/NavigatorPanel.vue` — 트리 검색 placeholder "목록에서 좁히기…"(FR-012). 동작 무변경.

## Phase M5 — 검증 (SC 전수)

- [x] T012 `npx vite build` 컴파일 게이트 통과.
- [x] T013 Playwright 자가검증 — quickstart S1~S5(진행·뭉치·캔버스유지·취소·⌘K·실패·회귀·요청0). 스크린샷 직접 Read. 백엔드 미배포 시 스트림 스텁으로 UI 상태머신 검증 + 실배포 후 재검증.
- [x] T014 원칙 전수검증 — 해피패스 0(길이/형태 분기 없음)·회귀 0(트리·노드상세·analyze embed)·게이트웨이+세션헤더·목업 0.

## 의존

M1(T001→T002→T003) → M2(T004→T005→T006) → M3(T007→T008) → M4(T009→T010→T011, T011은 [P]) → M5.
T003이 T004~T010의 공통 의존(스토어). T001이 T002 의존.
