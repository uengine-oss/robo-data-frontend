# Tasks: 스키마 탭 전면 고도화

**Feature**: 043-schema-tab-overhaul | **Plan**: [plan.md](./plan.md)

빌드·재분석 금지. 검증은 vite dev(3000) + Playwright. 최종에만 빌드.

## Phase 1: Setup / 사실확정
- [ ] T001 구현 전 확인(코드 정독): 프로시저·함수 노드의 `code_text`, `start_line`, `end_line` 계약과 화면 표시 경로를 확인한다. (추측 금지)

## Phase 2: Stream A — 노드 원문 코드뷰 (US1, P1)
**Goal**: 업로드·파일 재조회 의존을 폐기하고 그래프 노드의 줄번호 포함 `code_text`를 그대로 표시한다. **Independent test**: 참조 클릭 → 해당 노드 범위의 실제 코드.
- [ ] T002 [US1] Catalog 참조 응답에 노드의 `code_text`, `start_line`, `end_line`을 포함한다.
- [ ] T003 [US1] frontend 참조 타입에서 원문과 실제 줄 범위를 검증한다.
- [ ] T004 [US1] `openSourceCodePanel`에 노드 `code_text`와 실제 시작 줄을 전달한다.
- [ ] T005 [US1] 원문이 없으면 가짜 "//코드" 대신 정직한 빈 상태를 표시한다.
- [ ] T006 [US1] 디스크 파일을 다시 읽는 별도 백엔드·게이트웨이 경로가 없음을 확인한다.
- [ ] T007 [US1] 소스 패널(SchemaCanvas/schemaCanvas store openSourceCodePanel) — "소스 없음" 정직 빈 상태 렌더 분기(코드가 아님이 명확). 가짜 placeholder 문자열 생성 제거.

## Phase 3: Stream B — 잔여물 제거 (US2, P2)
- [ ] T008 [US2] `TableNode.vue`에서 ✓ 방문 마커 **완전 제거**: `visitedReferences` ref, `isReferenceVisited`/`isFrameworkReferenceVisited`, `.add()` 호출(2곳), `:class="{visited:...}"`(3곳), `.references-popup__item.visited`/`content:'✓'` CSS.
- [ ] T009 [US2] 죽은 코드 점검(전수 grep 후에만 제거): 후보별 호출처 0 확인된 것만 제거. (updateRelationshipInfo는 SchemaCanvas.vue:539에서 호출 → 유지.)

## Phase 4: Stream C — UI 일관화 (US3, P2)
- [ ] T010 [US3] 닫기(X) 단일화: 공통 클래스/소형 컴포넌트 1개(IconX + 동일 크기·호버·radius)로 스키마 탭 모든 닫기 버튼 교체 — SchemaCanvas(검색clear·소스패널·behavior), TableDetailPanel, TableNode(참조팝업), CardinalityModal, EditRelationshipDialog.
- [ ] T011 [US3] '상위 10개'+'전체 테이블 보기' → `tableViewMode`(기본/상위10/전체) 단일 보기모드 컨트롤(그래프식)로 통합. 논리명/물리명 토글 중복 렌더(2곳) → 1곳으로 통합.
- [ ] T012 [US3] remove-chip 일관화: '캔버스에 있는 테이블' 칩 빨간 X 정렬·간격·호버를 공통 패턴으로(관계 목록 제거버튼 포함). 빈상태/간격 등 눈에 띄는 어긋남 정돈.

## Phase 5: 검증·배포
- [ ] T013 vite dev(3000)+Playwright로 US1~US3 자가검증(실제 코드 표시·가짜N/A 0·✓ 0·닫기단일·보기단일·칩정렬) 스샷 Read. 스크립트는 .unittest/에 두고 실행 후 제거.
- [ ] T014 전부 통과 후 **최종 1회 빌드·재기동**: frontend 커밋·push→서브모듈 ff→architect bump→build-desktop-frontend.mjs→dev-desktop -Stop→-SkipBuild(analyzer/gateway/catalog 변경도 재기동으로 반영). 내 파일만 커밋(사용자 WIP 보호).

## Dependencies
- A: T002→T003→(T005,T006,T007), T004 독립. B: T008,T009 독립. C: T010~T012 독립(같은 파일 다수라 순차 권장).
- A·B·C는 서로 독립이나 TableNode.vue를 A(T006)·B(T008)·C(T010)가 공유 → 순차 편집.
- 검증(T013)은 A·B·C 후. 빌드(T014) 맨 끝.

## Implementation Strategy
MVP = US1(A) 먼저(핵심 기능 복구) → US2(B) → US3(C). 각 스트림 후 부분 검증, 마지막에 통합 검증+빌드.
