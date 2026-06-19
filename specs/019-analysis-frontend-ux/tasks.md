---
description: "Task list — 분석 화면 UX 정합 (노드패널 친절화 + 업로드 타겟언어 자동탐지)"
---

# Tasks: 분석 화면 UX 정합

**Input**: `specs/019-analysis-frontend-ux/` (plan·spec)
**Tests**: 단위테스트 없음 — 재분석 그래프 + Playwright 스크린샷 검증.

## Phase 1: Setup
- [ ] T001 현재 NodeDetailBase·카드 6종·UploadModal 구조 확인(식별/subInfo/관계 영역·raw-id 표시 지점).

## Phase 2: Foundational
- [ ] T002 식별 표시 단일 헬퍼 확정: `nodeTypeLabel`(종류)·`logicalModeName`/`pickDisplayName`(이름·논리명)·소속(소유 그릇/패키지) 도출. raw-id(콜론 합성 id)는 표시 금지 — graphDisplay 방어 재사용.

## Phase 3: User Story 1 — 노드패널 보고서형 (P1)
- [ ] T003 [US1] `NodeDetailBase.vue` 식별부: 이름 + 논리명 + 종류(라벨) + 소속/패키지 경로 분리 표시. raw-id 노출 제거(이름 없으면 `종류[시작라인]`). 순서 = 식별→개요→(슬롯: 원문)→관계.
- [ ] T004 [US1] 개요: summary **전문** 표시(핵심 한 줄 자르기 제거).
- [ ] T005 [P] [US1] 원문코드 영역: 루틴/구문 카드(FunctionCard·SqlStatementCard)는 `code_text` 표시, 파일/그릇(FileCard·ModuleCard·DatatypeCard)은 원문 영역 생략.
- [ ] T006 [P] [US1] 관계 영역: `nodeRelationships` 그룹을 읽기/쓰기/호출/소속/포함 의미 라벨로. "멤버→"·"연결" 모호 표기 제거.
- [ ] T007 [P] [US1] 020 속성 반영: notes 표시, signature 미표시(params·return_type), 위험 risk_level/in_call_cycle만. (020에서 일부 반영 — 잔여 정합.)
- [ ] T008 [US1] 검증: Playwright — 파일·프로시저·구문·변수 노드패널 스크린샷(식별·원문·관계 명확, raw-id 0, 순서).

## Phase 4: User Story 2 — 업로드 타겟언어 자동탐지 (P2)
- [ ] T009 [US2] `UploadModal.vue`: 소스타입(타겟언어) 수동 선택 UI·관련 상태(sourceTypeOptions·수동 watch) 제거. antlr `detected` 자동감지에 위임. confirm emit 정합(sourceType 기본/자동).
- [ ] T010 [US2] `DropZone.vue`/안내문구: "소스타입 자동 감지" 문구 유지·수동 설정 흔적 제거. 회귀 0(파싱이 sourceType 채움).
- [ ] T011 [US2] 검증: Playwright — 업로드 설정에 소스타입 수동칸 없음 + .sql 업로드 자동 dbms 전략 동작.

## Phase 5: Polish & 검증
- [ ] T012 ★전수 grep: raw-id 표시 잔재 0·"멤버→"/"연결" 모호 표기 0·소스타입 수동 UI 잔재 0.
- [ ] T013 frontend 타입 무오류(변경 파일) 확인.
- [ ] T014 재분석 그래프(019+020)로 Playwright 전수 자가검증 — 노드패널 4종·업로드 모달·트리. ★분석 = 사용자 OK 후.
- [ ] T015 커밋(frontend main, 신원 ahnchiyoon87). 사용자 OK 후.

## Dependencies
- T002 → T003~T007. T003(Base) 후 카드(T005·T006·T007) 정합. US2(T009·T010) 독립.
- T014·T015 = 사용자 OK 후.

## MVP
- US1(노드패널 보고서형) = 핵심 불만 해소. US2(업로드) 증분.
