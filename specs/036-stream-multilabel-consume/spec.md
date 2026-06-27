# Feature Specification: 스트림 멀티라벨 소비 — 역할 라이브 렌더

**Feature Branch**: `main`
**Created**: 2026-06-27
**Status**: Draft

**Input**: analyzer가 node_event에 `labels` 배열(타입+stereotype)을 싣기 시작(spec 034). 프론트가 이를 소비해 분석 중 역할 라벨을 라이브로 렌더(필터 역할 섹션·캔버스 멀티라벨이 분석 끝까지 안 기다림).

## 배경 (왜)
- `mergeStreamNode`(analyzer.ts)가 단일 `label`만 받아 `labels=[label]`로 노드 생성 → 스트림 노드는 종류 라벨만. 역할은 전체 로드(getGraphData) 후에만 보였다.
- analyzer가 이제 `node_event.labels`(=[타입,stereotype])를 보냄(spec 034). 프론트가 `labels`를 쓰면 라이브로 역할 라벨 반영.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 분석 중 역할 라벨 라이브 반영 (Priority: P1)
스트림 node_event가 `labels` 배열을 실으면 그 노드의 labels에 그대로 반영 → 필터 역할 섹션·패널 역할이 분석 중에도 보인다.

**Independent Test**: node_event{labels:[FUNCTION,Command]} 수신 → store nodeMap의 그 노드 labels=[FUNCTION,Command].

**Acceptance Scenarios**:
1. **Given** node_event{label:'FUNCTION', labels:['FUNCTION','Command']}, **When** mergeStreamNode, **Then** node.labels=['FUNCTION','Command'].
2. **Given** 구버전 node_event{label:'FUNCTION'} (labels 없음), **When** merge, **Then** node.labels=['FUNCTION'] (폴백, 회귀 0).

### Edge Cases
- `labels` 미존재(구 백엔드) → `[label]` 폴백.
- `labels` 빈배열 → `[label]` 폴백(label 있으면).

## Requirements *(mandatory)*
- **FR-001**: `mergeStreamNode`는 `labels` 배열을 받아 노드 labels로 설정.
- **FR-002**: `labels` 없으면 `[label]` 폴백(back-compat, 회귀 0).
- **FR-003**: AnalyzeEvent 타입에 `labels?: string[]` 추가.
- **FR-004**: 위치 계약 일관 — labels[0]=종류(기존 035 소비 로직 그대로 동작).

## Success Criteria *(mandatory)*
- **SC-001**: 멀티라벨 node_event 수신 시 노드 labels에 역할 포함.
- **SC-002**: labels 없는 이벤트도 정상(폴백) — 회귀 0.
- **SC-003**: vue-tsc 변경파일 새 에러 0. 라이브 분석서 역할 필터 섹션이 분석 중 등장.

## Assumptions
- 생산자 spec 034 적용(node_event.labels 발신). gateway 패스스루.
- 035의 위치기반 소비(kindOf/rolesOf, 필터 종류/역할)는 그대로 — 이 spec은 스트림 입력만 멀티라벨화.
