# Tasks: 횡단 안전 리팩토링 배치 ①

**Feature**: 024-cross-cutting-refactor | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**절대 제약**: 화면 픽셀·글자·동작 0변경. 모든 변경은 골든 마스터/반환값 대조로 보존 증명 후에만 커밋.

각 User Story는 독립 구현·검증·커밋 가능. 검증(골든 대조)이 곧 그 스토리의 "완료" 판정.

---

## Phase 1: Setup (공통 기반)

- [ ] T001 실그래프 스냅샷 확보 — `GET http://localhost:5503/robo/graph/` → `d:/tmp/graph_snapshot.json`(1106노드) 갱신 확인. analyzer(5502) 미기동 시 풀스택 기동.
- [ ] T002 `src/shared/utils/logger.ts`의 공개 API(`logger.warn`/`error`/`debug` 등) 시그니처 확인 — US2 표면화·US3 폴백이 동일 로거를 쓰도록 사실 확정.

---

## Phase 2: Foundational (블로킹 — 없음)

세 User Story는 서로 다른 파일을 건드리며 독립적이다. 공유 차단 작업 없음. 곧장 Phase 3 진행.

---

## Phase 3: User Story 1 — 노드 표시이름 단일 결정처 (P1)

**Goal**: 조립 로직 중복(`타입[line]`·논리명 위임)을 공유 헬퍼로 제거(화면별 의도적 차이는 유지). 화면 출력 100% 보존.

**Independent Test**: 골든 마스터 diff 0 (실그래프 전 노드 × {tree,canvas,panel} × {physical,logical}).

### 회귀 안전망 (구현 전 필수)

- [ ] T003 [US1] 골든 캡처 스크립트 작성 `d:/tmp/name_golden_capture.mjs` — **현행 3함수**(pickDisplayName/resolveCaption/technicalNodeName 로직 복제, 논리명 모드 분기 포함)를 실그래프 전 노드에 적용 → `d:/tmp/name_golden.json`에 `(nodeId, screen, mode)→string` 전수 기록.
- [ ] T004 [US1] 합성 엣지 케이스를 골든에 추가 — 다중 라벨(예 `['SELECT','Query']`), BusinessLogic(`sequence`/`title`), 외부 stub(`FUNCTION+EXTERNAL`), 구조 노드(`DECLARE`/`TRY`/`TRIGGER_BLOCK`), DB 점-구분 id, `start_line=0`, name/logical_name 공백.

### 구현

- [x] T005 [US1] `src/shared/utils/graphDisplay.ts`에 공유 헬퍼 2개 신설 — `typeWithLine(typeLabel, startLine, withLine)`(`타입`/`타입 [line]` 조립) + `applyLogicalMode(node, physical, logical)`(논리명 위임). *설계 진화: 6옵션 단일함수 기각, 진짜 중복만 추출(research Decision 1).*
- [x] T006 [US1] 화면별 의도적 차이는 **각 함수에 유지**(통합 X) — BL `[seq]`는 `navigator.pickDisplayName`, 특수본문·DB세그먼트는 `technicalNodeName`, type 전략 3종은 각 화면 고유. 골든이 보존 판정.
- [x] T007 [US1] `graphDisplay.technicalNodeName`의 로컬 `lineSuffix` 클로저를 `typeWithLine(kind, line, true)`로 교체 — 패널/peer 소비처 반환값 불변(RULE/QUESTION/EXAMPLE·DB세그먼트 분기는 그대로 유지).
- [x] T008 [US1] `src/shared/stores/navigator.ts` `pickDisplayName`: 물리명을 `typeWithLine(pickDisplayLabel(labels), start_line, true)`로, 논리명을 `applyLogicalMode(...)`로 수렴. BL `[seq]` 분기 유지. 트리 항목 `name`·`nodeType` 동일.
- [x] T009 [US1] `src/features/code-analysis/components/graph/NvlGraph.vue` `resolveCaption`을 `applyLogicalMode(node, physical, showLogicalNames.value)`로 수렴(`physical=name||labels[last]||id`). 캔버스 caption 동일.
- [x] T010 [US1] 심볼 변경 전수 grep — `pickDisplayName`/`resolveCaption`/`technicalNodeName`/`logicalModeName`/`typeWithLine`/`applyLogicalMode` 전 호출부 일관 확인, dangling import 0.

### 검증

- [x] T011 [US1] 골든 대조 — 리팩토링 후 헬퍼 기반 화면 함수로 동일 입력 재산출 → `name_golden.json`과 글자단위 diff. **6,738 케이스 diff 0** ✅(SC-001).
- [x] T012 [US1] 데드코드 제거 확인 — `lineSuffix` 클로저·중복 논리명 위임 제거, 미사용 import 0. 조립 로직 복붙 0(SC-005).

---

## Phase 4: User Story 2 — code-analysis 조용한 실패 전수 표면화 + 전체 인벤토리 (P1)

**Goal**: code-analysis 영역 침묵 0. 손상 줄이 스트림 전체를 죽이지 않게. 전 코드베이스 조용한 실패 인벤토리 박제.

**Independent Test**: 손상 줄 주입 시 비중단+로그 기록, 정상 스트림 동작 동일, code-analysis 침묵 0, 인벤토리 완성.

### (A) 스트림 경로 표면화

- [ ] T013 [US2] `src/shared/services/http.ts` `parseJsonLine` 표면화 — `JSON.parse` 실패 시 `logger`로 원문 줄·에러 기록 후 "스킵" 신호 반환(throw 금지).
- [ ] T014 [US2] `processBuffer`/`processFinalBuffer`가 스킵 신호를 받아 해당 줄 `onEvent` 미호출·계속 진행하도록 수정 — 정상 줄 처리·`complete`/`error` 종료·잔여 버퍼 동작 보존(FR-010).
- [ ] T015 [US2] SSE `flushEvent`의 `JSON.parse(rawData)` + `parseErrorMessage` catch + `response.text().catch(()=>'')` 표면화 — 실패 시 기록·스킵, 스트림 지속.
- [ ] T016 [US2] 손상 줄 주입 테스트 `d:/tmp/stream_resilience.mjs` — 정상 줄 사이 깨진 줄 1개(예: `{"type":"node_e` 잘림) 주입, 전(throw 중단) vs 후(스킵·지속·기록) 동작 대조(SC-003). 정상 전용 입력은 이벤트 시퀀스 동일 확인.

### (B) code-analysis 영역 빈 catch 전수 표면화

- [ ] T017 [US2] `src/features/code-analysis/components/graph/NvlGraph.vue` 라이브러리 가드 빈 `catch{}` 5곳(L418·477·484·486·495) + `catch(err)` L748 — `logger.debug`로 "무엇이 왜 던졌는지" 기록. 동작은 무해 처리 그대로 보존(FR-011).
- [ ] T018 [US2] `src/features/code-analysis/analyzer.ts`의 `catch` 13곳(L171·186·524·664·674·717·763·807·856·910·920·931·948) 전수 점검 — 로깅 없이 삼키는 곳만 `logger` 표면화, 이미 사용자 메시지/로깅 처리하는 곳은 보존. `node-detail/*Card.vue`의 `properties || {}`·`?? ''`는 안전 기본값이므로 **건드리지 않음**(FR-012).

### (C) 전 코드베이스 인벤토리

- [ ] T019 [US2] 전 코드베이스 조용한 실패 인벤토리 `specs/024-cross-cutting-refactor/silent-failures-inventory.md` — 빈 `catch{}` 22곳/6파일(NvlGraph 5·BpmnViewer 7·MLOV 5·whatif 4·domain/api 1) + `catch(e){}` 미사용 + `.catch(()=>…)` 삼킴을 파일·라인·성격(라이브러리가드/API삼킴/파싱삼킴)·담당 배치로 분류. MLOV·BpmnViewer·whatif 등은 "후속 배치" 표기로 빠짐없이 추적(FR-013).

---

## Phase 5: User Story 3 — 스타일 스토리지 캐시 (P2)

**Goal**: 렌더당 수백 회 `localStorage` 접근 → 변경당 1회. 반환값·반응성 보존.

**Independent Test**: 색/크기 반환값 동일 + `getItem` 호출 급감 + 변경 즉시 반영.

- [ ] T020 [US3] `src/shared/utils/graphStyleStorage.ts` `loadStyles`에 카테고리별 메모이즈 캐시 추가 — 동일 상태 반복 호출 시 `localStorage.getItem`/`JSON.parse` 1회로. 반환 맵 값 동일.
- [ ] T021 [US3] mutation(`saveStyles`/`removeStyle`/`clearStyles`)에 캐시 무효화 추가 — `storageVersion` bump 시점·횟수 보존, 다음 `loadStyles`가 새 값 반환(FR-015).
- [ ] T022 [US3] 캐시 검증 `d:/tmp/style_cache.mjs`(또는 dev 콘솔 계측) — `getNodeColor/getNodeSize/getRelationshipColor/getRelationshipWidth` 반환값 전후 동일 + `getItem` 호출 횟수 급감(SC-004). 변경→무효화→새값 경로 확인.

---

## Phase 6: Polish & 통합 시각 회귀

- [ ] T023 풀스택 기동 + frontend 3000 소스 분석 실행(~4분) → 그래프 생성.
- [ ] T024 Playwright 헤드리스 시각 회귀 — 전 보기모드(모듈간·협력군집·영역구조·건강) + 노드패널 종류별 + 콘솔 NDJSON 스트림 수신 캡처. 리팩토링 전/후 스샷 시각 동일 + `pageerror=0`(SC-002). [[manual]]§3 하니스, 내가 직접 수행.
- [ ] T025 `/speckit-analyze` 교차검증 — spec↔plan↔tasks↔contracts 정합, 보존계약 위반 0.
- [ ] T026 커밋·푸시(frontend main) — 작업보고를 spec 024에 소급 박제(SDD 정상화), 메모리 [[todo]] 갱신.

---

## Dependencies

- **US1 / US2 / US3 = 상호 독립**(다른 파일). 병렬 가능. 각자 단독 커밋 가능.
- 각 US 내부: 회귀 캡처(전) → 구현 → 대조(후) 순서 필수.
- Phase 6은 세 US 완료 후(통합 시각 회귀).

## Parallel Opportunities

- T003/T004(골든 캡처)는 T013·T020과 병렬 가능(독립 파일).
- T005~T009는 순차(같은 이름 파이프라인), 단 US2(T013~T019)·US3(T020~T021)와는 병렬.
- T017·T018·T019는 서로 다른 파일이라 병렬 가능.

## MVP Scope

**US1(이름 단일화)** 단독으로 MVP — 가장 큰 유지보수 부채 제거 + 회귀 하니스 확립. US2·US3는 증분 추가.

## Format Validation

전 태스크 `- [ ] TID [P?] [Story?] 설명 + 파일경로` 형식 준수. Setup/Foundational/Polish = 스토리 라벨 없음, US 단계 = [US1/2/3] 라벨. 총 26 태스크(US1:10, US2:7, US3:3, Setup:2, Polish:4).
