# Phase 0 Research: 횡단 안전 리팩토링 배치 ①

실측 근거: catalog 5503 `GET /robo/graph/` 실그래프 1106노드(37 라벨종류)에 현재 세 이름 함수를 적용한 결과(`d:/tmp/name_*.mjs`).

## Decision 1 — 노드 표시이름 단일 결정처 설계

> **⚠️ 구현 중 supersede됨 (2026-06-22)**: 아래 "6옵션 단일함수" 안은 **막무가내 통합(옵션 지옥)**으로 **기각**되었다. 정확한 골든 실측 결과 세 화면의 차이는 대부분 **의도적**(가시노드 트리=패널 어긋남 0)이고 진짜 중복은 "조립 로직"뿐임이 드러났기 때문이다. **최종 채택안 = 공유 헬퍼 2개(`typeWithLine`·`applyLogicalMode`) 추출 + type 전략 화면별 유지** — 실제 계약은 `contracts/internal-apis.md §1` 참조. 아래 원안은 결정 과정의 기록으로 보존한다.

**(원안, 기각) Decision**: `graphDisplay.ts`에 단일 `getNodeDisplayName(node, opts)`를 두고, 세 호출측이 이를 호출하도록 수렴한다. 화면별 차이는 옵션(`logical`·`lineSuffix`)으로 표현하고 특수 처리를 단일 함수 내부에 모은다.

**(최종) Decision**: 진짜 복붙인 조립 로직만 공유 헬퍼로 추출한다.
- `typeWithLine(typeLabel, startLine, withLine)` — 이름 없는 노드의 `타입`/`타입 [line]` 조립(트리·패널·캔버스가 공유하던 줄번호 로직).
- `applyLogicalMode(node, physical, logical)` — 논리명 모드 위임(트리·캔버스 공유).
- type 산출 전략(트리 `pickDisplayLabel`/패널 `nodeTypeLabel`/캔버스 `labels[last]`), BL `[seq]`(트리), 특수본문·DB세그먼트(패널)는 **각 화면 함수에 얇게 유지**(의도적 차이, 통합하지 않음).

**Rationale**: [[principles]] "가독성 최우선 / 응집도 우선 / 막무가내 통합 금지". 6옵션 함수는 DRY를 달성하나 옵션 지옥으로 유지보수를 악화시킨다. 골든이 차이가 의도적임을 증명했으므로 헬퍼 추출이 정직한 최소 개입이다.

**핵심 사실(골든 정정)**: 초기에 "트리=패널 0 불일치"라 했으나, 이는 **골든 캡처의 `pickDisplayLabel` 복제 오류**(navigator `ROLE_LABELS` 14개를 2개로 착각)였다. 수정 후: 가시노드 기준 트리=패널은 실제로 일치(`pickDisplayLabel`이 첫 비역할 라벨 우선 → `nodeTypeLabel`과 동치, 의미역할 라벨이 거의 없는 spec 019 데이터에서). 진짜 차이 = 줄번호(캔버스 없음)·BL[seq](트리)·세그먼트/특수본문(패널). 골든 6,738 케이스 diff 0으로 보존 검증 완료.

**Alternatives considered**:
- (기각) `resolveCaption`에만 줄번호 추가하는 1줄 패치 — 규칙이 3곳에 남아 재발. [[principles]]§3 위배.
- (기각) 6옵션 단일함수 / `context` enum — 막무가내 통합, 옵션·결합 증가로 가독성 악화.

## Decision 2 — 스트림 조용한 실패 표면화

**Decision**: `http.ts`의 줄 단위 파싱을 "한 줄 손상이 스트림 전체를 죽이지 않게" 바꾼다.
- NDJSON `parseJsonLine`(현재 `return JSON.parse(line)` 무방어): 파싱 실패 시 `logger`로 원문 줄·에러를 기록하고, 그 줄을 **건너뛴다**(이후 줄 계속 처리). 호출부 `processBuffer`/`processFinalBuffer`가 "스킵" 신호를 받아 `onEvent`를 호출하지 않도록 한다.
- SSE `flushEvent`(현재 `JSON.parse(rawData)` 무방어): 동일하게 실패 줄 기록·스킵, 스트림 지속.

정상 경로(모든 줄이 유효)에서는 수신 이벤트·순서·종료(`complete`/`error`)·버퍼 처리가 **완전히 동일**해야 한다.

**Rationale**: 데이터 경로의 치명적 침묵 제거. "모든 오류는 원인을 알아야 수정 가능"(사용자 원칙). 스트림은 부분 손상에도 진행되어야 사용성이 유지된다.

**Alternatives considered**:
- (기각) 손상 줄에서 전체 중단을 유지하되 메시지만 친절화 — 부분 손상에 분석이 통째로 죽는 결함은 그대로.
- (범위 제외) MLOV·olap·text2sql·schema 등의 빈 `catch{}` 전수 — 본 배치는 code-analysis 스트림 경로로 한정(배치별 안전). 동일 원칙을 각 feature 배치에서 적용(spec Assumptions).

## Decision 3 — 골든 마스터 회귀 안전망

**Decision**: 리팩토링 **전** 상태에서 실그래프 전체 노드에 대해 `(node, screen∈{tree,canvas,panel}, mode∈{physical,logical})` → 표시이름 매핑을 캡처해 골든 파일로 고정한다. 리팩토링 **후** 동일 입력으로 단일 함수를 돌려 골든과 글자단위 대조 → **diff 0**이어야 통과. 스타일(US3)도 동일 패턴: 색/크기 함수 반환값을 전후 캡처해 대조. 스트림(US2)은 손상 줄 주입 입력의 전/후 동작 차이로 검증.

**Rationale**: "출력 100% 보존"을 사람이 눈으로 보장할 수 없다(1106노드 × 3화면 × 2모드 = 6636 케이스). 골든 마스터가 단일 진실 판정자. [[principles]]§6 실행검증.

**Alternatives considered**:
- (기각) 합성 노드 몇 개로 단위 테스트 — 종류 누락 위험(외부 stub·구조노드·다중라벨 등). 실데이터 전수가 우선.
- (보강) 합성 엣지 케이스(다중 라벨, BL이 캔버스에 뜨는 경우 등)를 골든에 **추가** 주입해 실데이터에 없는 분기까지 커버.

## 미해결(NEEDS CLARIFICATION) — 없음

사용자가 범위(UI 0변경)·조용한실패 범위(스트림 한정)·캐시 목표(반환값 동일+성능)를 모두 확정. 설계 결정은 위 3개로 닫힘.
