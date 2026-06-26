# Feature Specification: 분석 진행 단계 라이브 전진 (processing_event 기반)

**Feature Branch**: `028-progress-live-step-advance`

**Created**: 2026-06-27

**Status**: Draft

**Input**: 진행 패널(spec 026 7단계)이 긴 단계(코드 분석 step6) 진행 중에도 직전 단계(분석 컨텍스트 구성 step5)에 계속 머문다 — 실제론 코드 분석 중(EXAMPLE 노드 생성 중)인데 표시가 안 따라옴.

## 배경 (왜)

spec 026 진행 패널은 단계를 **`phase_event`(node_done = 단계 완료)** 로만 전진시킨다(`applyPhaseEvent`). analyzer 는 단계(노드) **완료 시점에만** node_done 을 emit 하므로(executor astream "updates"), **수 분 걸리는 step6(analyze_code)** 동안에는 새 node_done 이 없어 **직전 완료(step5 fetch_table_samples = 분석 컨텍스트 구성)** 에 머문다. 사용자는 코드 분석이 도는데(EXAMPLE/RULE 노드 생성 중) 패널은 "컨텍스트 준비"로 보여 멈춘 듯 느낀다.

그러나 analyzer 는 단계 **진행 중** `processing_event` 를 라이브로 보낸다(실측 최신 로그): `step5.build_context`(26)·`step6.module_pre_analysis`(4)·**`step6.analyze_code`(268)**·`step7.build_components/enrich_table_description/summarize_module`. 각 `processing_event.step` = `"stepN.xxx"` → 단계 번호. 즉 진행 신호는 이미 오는데 **프론트가 안 쓰고 있었다**(026 은 node_done 만 사용).

→ `processing_event.step` 의 `stepN` 을 단계 인덱스(N-1)로 매핑해 **진행 중 단계를 라이브 전진**시키면, 긴 단계도 즉시 반영된다. node_done 전진(빠른 초반 단계용)은 유지 — 둘 다 maxPhaseSeen(단조 증가)으로 합산.

(7단계 = analysis_flow step1~7 → 인덱스 N-1: step1=0 DDL … step5=4 컨텍스트 … step6=5 코드분석 … step7=6 후처리.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 코드 분석 중 "코드 분석" 단계로 보인다 (Priority: P1)

분석 중 코드 분석(step6)이 시작되면 진행 패널이 즉시 **"코드 분석"** 단계로 전진한다(컨텍스트 준비에 머물지 않음).

**Why this priority**: 사용자가 지목한 핵심 증상(긴 단계 멈춤) 직접 해소.

**Independent Test**: analyzer 가 `processing_event {step:"step6.analyze_code"}` 를 보내는 동안 패널의 활성 단계 = "코드 분석"(index 5)인지 확인.

**Acceptance Scenarios**:

1. **Given** step6.analyze_code processing_event 수신, **When** 패널을 본다, **Then** 활성 단계가 "코드 분석"이다(컨텍스트 구성 아님).
2. **Given** step7.* processing_event 수신, **When** 본다, **Then** 활성 단계가 "후처리"다.
3. **Given** node_done 만 오는 빠른 초반 단계(step1~4), **When** 본다, **Then** 기존대로 정상 전진(무회귀).
4. **Given** 단계는 단조 증가, **When** 늦게 도착한 옛 단계 신호, **Then** 인덱스가 뒤로 가지 않는다.

### Edge Cases

- `processing_event` status=start/done 양쪽 모두에서 전진(가장 빠른 신호로). 
- step 파싱 실패(형식 다름)면 무시(전진 안 함, 깨지지 않음).
- 범위 밖 step 번호는 무시(0 ≤ phase < 7).

## Requirements *(mandatory)*

- **FR-001**: `processing_event.step`(`"stepN.*"`)에서 단계 번호 N 을 파싱해 단계 인덱스(N-1)로 매핑, 활성 단계를 전진시켜야 한다.
- **FR-002**: 전진은 **단조 증가**(현재보다 큰 단계로만) — 뒤로 가지 않는다.
- **FR-003**: 기존 node_done 전진(빠른 단계)·complete(전부 완료)·start(초기화) 동작은 유지(무회귀).
- **FR-004**: step 파싱 실패·범위 밖 값은 안전 무시(패널 안 깨짐).
- **FR-005**: 진행 패널의 기타 기능(세부 1줄·진행바·콘솔·그래프) 무회귀.

## Success Criteria *(mandatory)*

- **SC-001**: step6.analyze_code 진행 중 활성 단계 = "코드 분석"(index 5).
- **SC-002**: 분석 전 구간에서 활성 단계가 실제 진행 단계와 일치(긴 단계 멈춤 0).
- **SC-003**: 단계 인덱스 역행 0건.
- **SC-004**: 초반(step1~4)·완료 동작 무회귀.

## Assumptions

- 작업 = frontend `features/code-analysis/analyzer.ts` `applyProcessingEvent`(또는 처리부)에 단계 전진 추가. `AnalyzeEvent.step` 필드 존재(확인). 백엔드 무변경(이미 processing_event.step emit).
- 7단계 매핑은 spec 026 PHASES(step1~7) 그대로.
- 검증 = framework 재분석으로 step6 동안 "코드 분석" 표시 확인(또는 processing_event 주입).
- 루트 체크아웃 작업, 사용자 WIP 불가침. Electron 반영 = 서브모듈 sync + 빌드.
