# Research: 분석 진행 표시 7단계 재구성

## R1. 단계 그룹핑을 어디서 하나 — 프론트 정적 매핑 (채택)

**결정**: 프론트(`analyzer.ts`)에 `leaf 노드명 → 7단계` 정적 매핑을 둔다. analyzer(백엔드)는 변경하지 않는다.

**근거**:
- analyzer는 이미 `node_done` 이벤트에 leaf 노드명(`event.node`, 예 `link_calls_by_name_step`)을 실어 보낸다 — 단계 파생에 필요한 정보가 이미 프론트에 도착한다.
- 7단계 정의의 출처는 analyzer `analysis_flow/step1~step7` 디렉토리(안정적 구조). 프론트가 이 매핑을 정적으로 보유해도 진실과 일치한다.
- **blast radius 최소**: analyzer 이벤트 계약(노드명·페이로드)을 안 바꾸므로 cross-service contract 영향 0(constitution III, [[principles]] §1 계약 양쪽 정합 불필요).

**대안 기각 — analyzer가 단계 정보 emit**: analyzer가 `phase_event`에 상위 단계 번호/이름을 넣어 보내게 하면 프론트 매핑이 없어지지만, ① analyzer 코드 변경 + 이벤트 계약 변경(소비처 전파) ② antlr/gateway 경유 페이로드 변경 검증까지 필요 = 과한 범위. 표시 전용 변경에 백엔드 계약을 흔들지 않는다.

## R2. node_start가 없는데 "진행 중"을 어떻게 파악하나 — maxPhaseSeen 규칙 (채택)

**사실(전수조사)**: analyzer wire는 `node_done`(완료) + `complete`만 leaf/종료를 통지하고 **node_start 이벤트가 없다**. 즉 leaf의 "시작"은 모른다.

**결정**: leaf 이벤트가 도착하면 그 leaf의 단계 인덱스로 `maxPhaseSeen`을 갱신하고, 단계 상태를 이렇게 파생한다.
- index `< maxPhaseSeen` → **완료(done)**
- index `== maxPhaseSeen` → **진행중(active)**
- index `> maxPhaseSeen` → **대기(pending)**
- `complete` 이벤트 → `maxPhaseSeen`를 마지막 단계로 = 전부 done.

**근거**:
- 파이프라인은 step1→step7 **순차**다. 따라서 어떤 단계의 leaf가 도착했다면 그 앞 단계는 이미 끝난 것 = done으로 봐도 정확하다(순서 역전 불가).
- 이 규칙은 **skip된 leaf를 자연히 흡수**한다: framework 런에서 `fetch_table_samples_step`가 skip돼 그 leaf 이벤트가 안 와도, 다음 단계(코드 분석) leaf가 도착하면 "분석 컨텍스트 구성"은 done이 된다(FR-007). leaf가 0개인 단계도 뒤 단계 시작 시 done.
- 전략별 leaf 차이(dbms vs framework)도 흡수: 어떤 leaf 집합이 와도 단계 인덱스만 보면 되므로 7단계 표시는 동일(FR-008).

**주의(엣지)**: 한 leaf의 "완료"를 받는 시점에 그 단계를 active로 표시하므로, 표시상 "완료된 직후의 단계"가 active로 보인다(현재도 동일). `complete`에서 전 단계 done 보정으로 마무리. 마지막 단계(후처리)의 마지막 leaf 완료~`complete` 사이 짧은 구간만 active로 남는다 — 허용.

## R3. 미상/신규 leaf 처리 — 무해 흡수

**결정**: `STEP_TO_PHASE`에 없는 노드명이 오면 `maxPhaseSeen`을 낮추지 않고(현재 단계 유지) 무시하거나, 직전 `maxPhaseSeen` 단계의 진행으로 둔다. 7단계 표시는 깨지지 않는다(FR-009). analyzer가 새 step을 추가해도 안전.

## R4. 라벨 — 사용자 표현 (초안, 정확 문구는 clarify)

- 상위 7단계명: 비개발자도 흐름을 잡게. 초안 = DDL 파싱 / AST 적재 / 코드베이스 스캔 / 관계 연결 / 분석 컨텍스트 구성 / 코드 분석 / 후처리 (사용자가 직접 언급한 어휘 기반). 더 쉬운 부제 병기 가능.
- leaf 세부문구(active 단계 한 줄): 내부어 제거. 예 `link_calls_by_name_step` → "함수 호출 분석 중", `fetch_table_samples_step` → "테이블 예시 수집 중". 전체 매핑 = data-model.md.
- 정확한 단어 선택은 **clarify에서 사용자와 확정**(spec FR-006 단서). 본 plan은 구조를 고정하고 문구는 교체 가능한 매핑으로 분리한다.

## R5. 데드/정합 (원칙 §3·§5)

- `STEP_LABELS`의 `analyze_function_step` 키는 실제 emit 노드명 `analyze_code_step`과 불일치 = 현재도 미적중 → 새 매핑은 실제 노드명만 사용(FR-010).
- `dynamicSteps`, `totalPhases`(하드코딩 6)가 7단계 파생으로 대체되면 미사용 → 폐기. 폐기 전 store export 소비처 전수 grep(특히 `currentPhase`/`dynamicSteps`를 매칭한 `GraphTab.vue` 확인).
