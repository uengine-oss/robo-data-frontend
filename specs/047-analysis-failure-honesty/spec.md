# Feature Specification: 분석 실패를 완료로 표시하지 않기

**Feature Branch**: `047-analysis-failure-honesty`
**Created**: 2026-07-14
**Status**: Draft

## Problem

`/robo/analyze`는 HTTP 200 스트림 안에서 파이프라인 실패를 `error` 이벤트로 보낸다. 현재 UI는 이를 콘솔 로그로만 처리한 뒤 완료 메시지·100%·기존 그래프 조회를 실행해 실패를 성공으로 표시한다. 또한 analyzer `error`는 `message` 필드를 쓰지만 UI는 `content`만 읽어 오류 문구도 사라진다.

## User Story 1 - 실패는 실패로 보인다 (P1)

**Acceptance**:
1. `error(fatal=true)` 수신 후 완료 메시지와 그래프 재조회가 실행되지 않는다.
2. 화면 상태는 `처리 실패`가 되고 서버의 `message`, `component`, `operation`, `run_id`가 사용자 콘솔과 개발 로그에 드러난다.
3. `warning`과 `error(fatal=false/없음)`은 스트림에서 계속 소비되며 종결로 오인하지 않는다(spec 031 회귀 없음).
4. `phase_event complete`를 받은 정상 분석만 완료 메시지·100%·그래프 재조회를 수행한다.

## Requirements

- **FR-001**: `AnalyzeEvent`는 `fatal`, `component`, `operation`을 wire와 동일하게 표현한다.
- **FR-002**: `message`와 `content` 양쪽 오류 문구를 표시한다.
- **FR-003**: `fatal=true` 이벤트를 기억해 스트림 종료 직후 예외로 전파한다.
- **FR-004**: 성공은 `phase_event(event=complete)` 수신으로 확인한다. 완료 이벤트 없이 HTTP 스트림만 닫히면 실패한다.
- **FR-005**: 실패 시 완료 문구, 100%, `getGraphData` 호출을 금지한다.

## Success Criteria

- Analyzer 중복 id 실패 재현 시 화면에 실패 원인이 보이고 완료 문구가 0건이다.
- 정상 분석은 기존 완료 흐름과 동일하다.
- `npm run type-check`와 실제 Electron 분석 정상/실패 화면 검증을 통과한다.
