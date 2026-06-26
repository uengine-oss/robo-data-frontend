# Tasks: 분석 진행 메시지 친절화 (개수+이름, 전략 무관 공통)

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Branch**: `029-progress-message-friendly`

**유일 변경 파일**: `src/features/code-analysis/analyzer.ts` (모든 작업이 이 파일 내부 — 대부분 직렬 의존, [P] 거의 없음)

**테스트 정책**: 별도 단위테스트 프레임워크 없음 → 타입검사 + 라이브/주입 검증(quickstart)으로 대체. TDD 미요청.

---

## Phase 1: Setup

- [x] T001 `src/features/code-analysis/analyzer.ts`를 열어 현재 `applyProcessingEvent`(≈632-663), `PROCESSING_KIND_KO`(≈620), `PROGRESS_THROTTLE`(≈351), `extractSubLabel`(≈49), `nodeMap`·`processedIds` 위치 확인(변경 지점 고정).

## Phase 2: Foundational (모든 US의 선행 — 룩업 테이블·헬퍼)

- [x] T002 `src/features/code-analysis/analyzer.ts`에 `LABEL_KIND_KO: Record<string,string>` 추가(FUNCTION=함수, FILE=파일, PACKAGE=패키지, MODULE=모듈, GLOBAL_VARIABLE=전역변수, TABLE=테이블, PROCEDURE=프로시저, TRIGGER=트리거, METHOD=메서드) — data-model.md 표 그대로.
- [x] T003 `src/features/code-analysis/analyzer.ts`의 `PROCESSING_KIND_KO` 수정: `Component:'구성요소'` 추가, `Question` 제거, `Batch:'코드 묶음'` 유지/명시(CodeNode='코드').
- [x] T004 `src/features/code-analysis/analyzer.ts`에 `STEP_VERB: Record<string,string>` 추가(step5.build_context=분석 중, step6.analyze_code=분석 중, step6.module_pre_analysis=살펴보는 중, step7.summarize_module=정리 중, step7.enrich_table_description=설명 채우는 중, step7.build_components=묶는 중), 기본 '처리 중'.
- [x] T005 `src/features/code-analysis/analyzer.ts`의 `PROGRESS_THROTTLE` 수정: `Batch:5`, `Component:1` 추가, `Question` 제거(`{CodeNode:5,Batch:5,Module:1,Table:1,Component:1}`).
- [x] T006 `src/features/code-analysis/analyzer.ts`에 종류/이모지/단위 해석 헬퍼 추가: `resolveKind(node, entityKind)`(라벨→LABEL_KIND_KO, 없으면 entityKind→PROCESSING_KIND_KO, 최종 '항목'), `kindEmoji(...)`(🧠/📦/🗂️/🧩/🔹), `unitOf(entityKind)`(Batch→'건', 그 외 '개'). `extractSubLabel`로 주 라벨 선택.

## Phase 3: User Story 1 — 무엇을·어떻게(개수+이름+동작) (P1)

**목표**: framework 진행 메시지를 `{종류} {개수}{단위} {동작} — '{이름}'`로. **독립 테스트**: framework 실데이터/주입에서 함수·테이블 이름이 단계별 동작·증가하는 개수와 함께 표시.

- [x] T007 [US1] `applyProcessingEvent`의 메시지 조립부(현 662줄 `🧠 ${kind} ${count}개째 분석 중${ctx}`)를 data-model.md 규칙으로 재작성: `node=nodeMap.get(id)`, `종류=resolveKind(node,rawKind)`, `동작=STEP_VERB[event.step?.split... ] ?? '처리 중'`(step 전체 키로 매칭), `단위=unitOf(rawKind)`, `이름=node?.properties?.name`, 출력 `${emoji} ${종류} ${count}${단위} ${동작}${name? " — '"+name+"'":""}`. 원시 id 미노출.
- [x] T008 [US1] `STEP_VERB` 조회 키를 실제 `event.step`(예 `step6.analyze_code`) 전체로 일치시키고, 미등록 step은 '처리 중' 폴백 확인(역행·오류 없이). `src/features/code-analysis/analyzer.ts`.

## Phase 4: User Story 2 — dbms Batch 무음 제거 (P1)

**목표**: `Batch` 신호도 메시지·카운트. **독립 테스트**: Batch 신호 주입 시 `🧠 코드 묶음 N건 분석 중`이 뜨고 N 증가, 노드 있으면 이름 부착.

- [x] T009 [US2] `applyProcessingEvent`에서 `if (rawKind === 'Batch') return`(현 646줄) **제거**. `src/features/code-analysis/analyzer.ts`.
- [x] T010 [US2] Batch 카운트 단위 보장: `Batch`는 배치마다 +1(부모 id 공유로 dedup 과소 방지) — `processedIds`의 Batch 집합 키를 배치 고유키(`entity_id + (sub_action??'') + 순번` 또는 별도 누적 카운터)로 처리하되 **단조 증가** 불변식 유지. 종류명='코드 묶음', 단위='건', 이미지=🧠. `src/features/code-analysis/analyzer.ts`.

## Phase 5: User Story 3 — 카운트 단조·중복 제거 (P2)

**목표**: framework 같은 함수 다중 신호 1회만, "코드" 줄기 단조. **독립 테스트**: 같은 함수 id 다중 주입 시 카운트 1회만.

- [x] T011 [US3] framework `CodeNode` dedup 유지 확인(step5 one_liner + step6 analyze + sub_action 다중 done → 함수 1회). 새 종류(Component) 및 Batch가 카운트를 감소/리셋시키지 않음 보장. `src/features/code-analysis/analyzer.ts`.
- [x] T012 [US3] throttle가 새 종류(Batch/Component)에도 적용돼 도배되지 않음 확인(`PROGRESS_THROTTLE` 기본 5/지정값). `src/features/code-analysis/analyzer.ts`.

## Phase 6: Polish & 검증

- [x] T013 `npx vue-tsc --noEmit` 실행 → **analyzer.ts 0에러** 확인(프로젝트 전역 기존 에러는 무관).
- [x] T014 [P] 028 회귀 점검: `applyProcessingEvent` 맨 앞 `/^step(\d+)/` 단계전진 블록이 그대로이고 메시지 변경에 영향 없는지 코드 확인(`currentPhaseIndex` 전진).
- [x] T015 framework 라이브/주입 검증(quickstart 시나리오 1·2·4·5): `logs/analysis.run/latest/analyzer.log`의 node_event+processing_event를 store에 순서대로 주입(또는 vite+Playwright) → 콘솔에 `함수 N개 분석 중 — '실제명'`·`테이블 N개 설명 채우는 중 — '실제명'`·`구성요소 N개 묶는 중`, 카운트 단조, 원시 id 미노출 확인. 결과를 quickstart에 기록.
- [x] T016 [P] dbms 신호 주입 검증(시나리오 3): `entity_kind:'Batch'` done 신호 다건 주입 → `🧠 코드 묶음 N건 분석 중`(무음 아님), 노드 유/무에 따라 이름 유/무. 라이브 실증 불가는 "미검증(dbms 소스 시)"로 명시.
- [x] T017 [P] 문서 드리프트 정리: 백엔드 `shared/log/processing_progress.py` docstring의 미사용 `"Split"` 표기 정정 메모(코드 변경 아님이면 spec/research에 기록). 프론트 `Question` 제거가 코드에 반영됐는지 최종 확인.

---

## Dependencies

- Phase 2(T002-T006) = **모든 US 선행**(룩업/헬퍼).
- US1(T007-T008) → 헬퍼 사용. US2(T009-T010) → US1 메시지 조립 위에 Batch 허용. US3(T011-T012) → 카운터 불변식.
- Polish(T013-T017) = 구현 후.
- 한 파일이라 대부분 **직렬**. [P]는 검증/문서(T014/T016/T017)만 — 코드 변경과 독립.

## Parallel 예시
- T014, T016, T017은 코드 구현(T007-T012) 완료 후 서로 독립 → 병렬 가능.

## MVP
- **US1 + 필수 Foundational(T002-T008)** = framework 친절 메시지 = 체감 개선 핵심. US2(dbms)·US3(단조)는 증분.

## 형식 검증
- 모든 작업 = `- [ ] [TID] [P?] [US?] 설명 + 파일경로` 준수. Setup/Foundational/Polish=US 라벨 없음, US 단계만 [US#].
