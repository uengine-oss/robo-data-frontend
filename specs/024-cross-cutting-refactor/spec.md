# Feature Specification: 횡단 안전 리팩토링 배치 ① (이름 단일화·조용한 실패 표면화·스타일 캐시)

**Feature Branch**: `024-cross-cutting-refactor`

**Created**: 2026-06-22

**Status**: Draft

**Input**: 전 프론트엔드 유지보수 리팩토링 프로그램의 첫 안전 배치. 스타일/UI/화면 출력 **0변경**, 내부 구현만 재탄생(유지보수·성능·가독성). 견적=`refactor-estimate`, 보존계약=`refactor-contracts`.

## 개요 *(맥락)*

robo-data-frontend는 14개 기능을 담은 대형 SPA로, 횡단(cross-cutting) 코드에 **중복·조용한 실패·성능 부채**가 쌓여 있다. 본 배치는 그중 **위험이 낮고 가치가 높은 3개 횡단 부채**를 SDD로 제거한다. 핵심 제약은 단 하나: **사용자가 보는 화면(픽셀·글자·동작)이 단 1도 바뀌지 않는다.** 바뀌는 것은 오직 내부 코드의 구조·효율·추적성이다.

세 항목은 서로 독립적이며 각각 단독으로 구현·검증·배포할 수 있다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 노드 표시이름 규칙 단일화 (Priority: P1)

분석 그래프의 같은 노드를 **트리(목록)·캔버스(그래프 그림)·상세 패널** 세 화면이 각자 표시한다. 지금은 "표시이름을 짓는 규칙"이 세 곳 코드(`navigator.pickDisplayName`·`NvlGraph.resolveCaption`·`graphDisplay.technicalNodeName`)에 **복붙**돼 있어, 한 곳만 고치면 화면 간 이름이 어긋나는 유지보수 함정이 있다(`nodeClassify.logicalModeName`은 이미 논리명 모드를 공유). 이 규칙을 **단일 결정처 하나**로 합쳐, 앞으로 이름 규칙 변경이 한 곳에서만 일어나게 한다.

**Why this priority**: 향후 모든 그래프 작업의 기반. 중복이 남아 있으면 이후 배치(GraphTab 분해 등)마다 이름 불일치 회귀가 재발한다. 단일화가 먼저여야 한다.

**Independent Test**: 합치기 전/후로 동일한 실제 그래프(1106개 노드)를 세 화면 함수에 통과시켜 출력 문자열을 글자단위 대조 — 모든 노드·모든 화면에서 **diff 0**이면 통과. (회귀 안전망 하니스)

**Acceptance Scenarios**:

1. **Given** 이름 없는 SQL 구문 노드(예: 57번째 줄 SELECT), **When** 단일화 후 세 화면이 이름을 렌더, **Then** 출력이 단일화 전과 글자단위로 동일하다(트리/패널 `SELECT [57]`, 캔버스 `SELECT` — 현 동작 그대로 보존).
2. **Given** RULE/QUESTION/EXAMPLE 등 패널 전용 노드, **When** 패널이 이름을 렌더, **Then** 출력이 단일화 전과 동일하다(이 노드는 트리·캔버스에 렌더되지 않는 tri-channel 계약 유지).
3. **Given** 논리명 모드(`showLogicalNames`) on/off, **When** 트리·캔버스가 이름을 렌더, **Then** 두 모드 모두 출력이 단일화 전과 동일하다.
4. **Given** DB 노드(점 구분 id)·BusinessLogic(`[seq]`)·외부 stub 등 모든 노드 종류, **When** 각 화면이 렌더, **Then** 종류별 출력이 전부 보존된다.

---

### User Story 2 - code-analysis 조용한 실패 전수 표면화 + 전체 인벤토리 (Priority: P1)

"모든 오류는 원인을 알아야 수정이 가능하다"(사용자 원칙). 이 스토리는 두 겹이다.

**(A) code-analysis 영역 전수 표면화** — 이 배치에서 끝낸다:
- **스트림 파서**(`http.ts`의 `parseJsonLine`·SSE `flushEvent`)가 한 줄을 **무방어로 `JSON.parse`** 한다 — 줄 하나만 깨져도 예외가 전파돼 **분석 스트림 전체가 즉사**하고, 사용자는 원인도 모른 채 멈춘 화면만 본다. 가장 치명적.
- **NvlGraph 라이브러리 가드** 빈 `catch{}` 5곳(`/* 무해 */`)·`parseErrorMessage`의 `catch{}`·`response.text().catch(()=>'')`처럼 침묵하는 지점.
- **analyzer.ts의 `catch` 13곳 전수 점검** — 로깅 없이 삼키는 곳만 표면화(이미 사용자 메시지/로깅으로 처리하는 곳은 보존).

침묵을 `logger`로 기록·표면화하되 **동작은 보존**한다(스트림은 계속 진행, 라이브러리 가드는 여전히 무해 처리). 단, `node.properties || {}`·`?? ''` 같은 **정상 안전 기본값은 조용한 실패가 아니므로 건드리지 않는다**(보존계약).

**(B) 전 코드베이스 조용한 실패 인벤토리** — 박제만, 처리는 후속 배치:
- 빈 `catch{}` 전수(현재 22곳/6파일: NvlGraph 5·BpmnViewer 7·MLOV 5·whatif 4·domain/api 1) + 변수만 받고 안 쓰는 `catch(e){}` + `.catch(()=>…)` 삼킴을 **분류 목록**(파일·라인·성격·담당 배치)으로 spec에 남긴다. god-component(MLOV 14k·BpmnViewer)는 **지금 건드리면 회귀 폭발**이라 각 feature 분해 배치로 미루되, 목록으로 **빠짐없이 추적**한다.

**Why this priority**: 데이터 경로의 치명적 침묵 제거 + "모든 오류 추적 가능" 원칙의 전 코드베이스 적용 시작. 한 줄 손상에 분석이 통째로 죽는 것은 안정성 결함이다.

**Independent Test**: 정상 스트림 중간에 깨진 줄 1개를 섞은 입력을 파서에 주입 — 전에는 전체 throw로 중단, 후에는 그 줄만 기록·스킵하고 이후 이벤트가 계속 도착하면 통과. 정상 스트림은 동작·결과가 동일. code-analysis 침묵 지점이 0이 되고, 전체 인벤토리가 작성됨.

**Acceptance Scenarios**:

1. **Given** 완전히 정상인 NDJSON/SSE 스트림, **When** 파싱, **Then** 표면화 전과 수신 이벤트·순서·결과가 100% 동일하다(정상 경로 동작 보존).
2. **Given** 중간에 잘리거나 손상된 줄 1개가 섞인 스트림, **When** 파싱, **Then** 해당 줄은 `logger`로 원문과 함께 기록되고, 스트림은 멈추지 않고 다음 이벤트를 계속 처리한다.
3. **Given** NvlGraph의 NVL 라이브러리 호출이 던지는 경우, **When** 가드 catch, **Then** 동작은 전과 동일(무해 처리)하되 `logger`로 무엇이 왜 던졌는지 기록된다.
4. **Given** analyzer.ts의 각 catch, **When** 점검, **Then** 로깅 없이 삼키는 곳은 표면화되고, 이미 처리하는 곳은 보존된다.
5. **Given** 전 코드베이스의 조용한 실패, **When** 인벤토리 확인, **Then** 모든 빈 catch·삼킴이 파일·라인·성격·담당 배치와 함께 목록화되어 빠짐없이 추적된다.

---

### User Story 3 - 그래프 스타일 스토리지 캐시 (Priority: P2)

그래프의 노드 색·크기·관계 색·두께는 사용자가 스타일 패널에서 지정한 값을 `localStorage`에서 읽어 결정한다. 현재 `graphStyleStorage.loadStyles`는 **캐시가 없어** 호출마다 `localStorage.getItem` + `JSON.parse`를 실행한다. 색/크기 함수(`getNodeColor`/`getNodeSize`/`getRelationshipColor`/`getRelationshipWidth`)가 노드·관계마다 이를 호출하고, 캔버스와 군집 외곽선(`useGroupHulls`)이 **매 렌더 프레임** 전 노드를 순회하므로, 500노드 그래프에서 프레임당 수백~수천 회의 동기 스토리지 접근이 발생한다. 메모이즈 캐시 + 변경 시 무효화로 이를 제거한다.

**Why this priority**: 순수 성능. 큰 그래프의 렌더 지연을 줄인다. 위 둘보다 사용자 체감 위험이 낮아 P2.

**Independent Test**: 동일 스타일 상태에서 색/크기 함수를 N회 호출했을 때 `localStorage.getItem` 실제 호출 횟수가 캐시 적용 후 현저히 감소(매 호출 → 변경당 1회)하고, 모든 함수의 **반환값은 캐시 적용 전과 동일**하면 통과. 스타일 변경 시 즉시 새 값이 반영되어야 한다.

**Acceptance Scenarios**:

1. **Given** 동일한 저장 스타일, **When** 색/크기 함수를 여러 번 호출, **Then** 반환값은 캐시 전과 100% 동일하다.
2. **Given** 사용자가 스타일 패널에서 색을 변경, **When** 다음 렌더, **Then** `storageVersion` 반응성이 그대로 작동해 새 색이 즉시 화면에 반영된다(반응성 계약 보존).
3. **Given** 500노드 그래프의 한 렌더 프레임, **When** 색/크기 결정, **Then** `localStorage` 동기 접근 횟수가 캐시 적용 전 대비 크게 감소한다.

---

### Edge Cases

- **이름**: `name`·`logical_name`이 모두 빈 노드, `start_line=0`, 라벨이 `['INTERNAL'/'EXTERNAL']`뿐인 외부 stub, 점(`.`)과 콜론(`:`)이 섞인 id — 모두 단일화 전 출력을 보존한다.
- **스트림**: 빈 줄, 마지막 잘린 버퍼, `complete`/`error` 종료 이벤트 — 종료·버퍼 처리 동작이 보존된다.
- **캐시**: `localStorage` 자체가 던지는 환경(프라이빗 모드 등), 스타일 키 부재 — 기존 폴백 동작(빈 맵 반환·`logger.warn`)을 유지한다.

## Requirements *(mandatory)*

### Functional Requirements

**보존(불변) 요구 — 세 항목 공통**

- **FR-001**: 시스템은 모든 화면(트리·캔버스·패널·스타일 패널)의 **시각적 출력(색·크기·위치·글자)을 본 배치 전과 동일하게** 유지해야 한다. 단 1픽셀·1글자도 바뀌어서는 안 된다.
- **FR-002**: 시스템은 보존계약(`refactor-contracts`)의 외부·내부 계약을 유지해야 한다 — 백엔드 API, 스트림 tri-channel(`nodeMap`/`linkMap`/`semanticLinkMap`), MF 경계, 스토어 public API, 컴포넌트 props.
- **FR-003**: 본 배치는 새 기능·새 UI·새 옵션을 **추가하지 않는다**(순수 내부 리팩토링).

**US1 — 이름 단일화**

- **FR-004**: 노드 표시이름을 짓는 규칙은 **단일 결정처**에 존재해야 한다. 현재 세 곳에 복붙된 물리명/논리명 산출 로직(트리·캔버스·패널)은 그 단일 결정처를 호출하도록 수렴해야 한다.
- **FR-005**: 단일 결정처는 각 화면의 **현재 출력을 화면별로 정확히 재현**해야 한다(예: 캔버스는 줄번호를 붙이지 않는 현 동작을 유지). 화면별 차이는 단일 결정처의 명시적 옵션/파라미터로 표현한다.
- **FR-006**: 모든 노드 종류(이름 있는/없는 노드, DB 점-구분 id, BusinessLogic, RULE/QUESTION/EXAMPLE, 외부 stub, 구조 노드)와 논리명 모드 on/off에서, 단일화 후 출력이 단일화 전과 **글자단위로 동일**해야 한다.
- **FR-007**: 단일화로 인해 중복 함수가 제거되어야 한다(데드코드·복붙 잔재 0 — 가독성·DRY).

**US2 — 조용한 실패 표면화 (code-analysis 전수 + 전체 인벤토리)**

- **FR-008**: 데이터 스트림 파싱(NDJSON `parseJsonLine`, SSE 데이터 줄)에서 손상된 줄이 들어와도 **스트림 전체가 중단되어서는 안 된다**. 손상된 줄은 건너뛰고 이후 이벤트 처리를 계속한다.
- **FR-009**: 손상된 줄을 만나면 시스템은 **원인 식별이 가능한 형태로 기록(logger)** 해야 한다(어떤 줄이, 왜 실패했는지).
- **FR-010**: 정상 스트림에 대해서는 수신 이벤트·순서·종료(`complete`/`error`)·버퍼 처리가 표면화 적용 전과 **동일**해야 한다.
- **FR-011**: code-analysis 영역의 조용한 실패(NvlGraph 라이브러리 가드 빈 `catch{}` 5곳, `parseErrorMessage` catch, `analyzer.ts`의 삼키는 catch)는 **동작을 보존한 채** `logger`로 표면화되어야 한다. 이미 로깅/사용자 메시지로 처리하는 catch는 보존한다.
- **FR-012**: 정상 안전 기본값(`properties || {}`, `?? ''` 등 — 에러 처리가 아닌 부재 처리)은 **표면화 대상이 아니며 변경하지 않는다**(오탐 금지, 보존계약).
- **FR-013**: 전 코드베이스의 조용한 실패(빈 `catch{}`·`catch(e){}` 미사용·`.catch(()=>…)` 삼킴)는 **파일·라인·성격·담당 배치**가 명시된 인벤토리로 목록화되어야 한다. 본 배치에서 처리하지 않는 항목(MLOV·BpmnViewer·whatif 등 다른 feature)도 빠짐없이 기록한다.

**US3 — 스타일 캐시**

- **FR-014**: 스타일 스토리지 읽기(`loadStyles`)는 동일 상태에서 반복 호출 시 `localStorage`·`JSON.parse`를 **반복 실행하지 않아야** 한다(메모이즈).
- **FR-015**: 스타일이 변경(저장·삭제·초기화)되면 캐시는 **무효화**되어 다음 읽기가 새 값을 반환해야 하고, `storageVersion` 기반 Vue 반응성은 **그대로 작동**해야 한다.
- **FR-016**: 모든 스타일 결정 함수(`getNodeColor`/`getNodeSize`/`getRelationshipColor`/`getRelationshipWidth`/`getStyle`)의 반환값은 캐시 적용 전과 **동일**해야 한다.

### Key Entities *(데이터 관련)*

- **GraphNode**: 분석 노드. `id`·`labels`·`properties`(opaque 통과 — prune·rename 금지). 이름 산출의 입력.
- **표시이름(display name)**: 한 노드를 사람이 읽는 문자열. 화면별 변형(줄번호 유무 등)과 모드별 변형(물리명/논리명)을 갖는 단일 개념.
- **StyleMap / StyleConfig**: `localStorage`에 영속되는 사용자 지정 스타일(노드/관계의 색·크기). 캐시 대상.
- **StreamEvent**: 스트림 한 줄이 파싱된 이벤트. 손상 시 표면화 대상.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 실제 그래프(1106개 노드 이상) × 3화면 × 논리명 모드 on/off에 대해, 리팩토링 전/후 표시이름 출력 **diff = 0**(완전 일치).
- **SC-002**: 풀스택 기동 후 전 보기모드(모듈간·협력군집·영역구조·건강)·노드패널 종류별·콘솔 NDJSON 스트림 수신을 Playwright로 캡처했을 때, 리팩토링 전/후 스크린샷이 시각적으로 동일하고 `pageerror = 0`.
- **SC-003**: 스트림에 손상된 줄 1개를 주입했을 때, 리팩토링 전에는 스트림이 중단되고, 후에는 **중단 없이 이후 이벤트가 계속 수신**되며 손상 줄이 로그에 기록된다.
- **SC-004**: 동일 스타일 상태에서 색/크기 함수를 다수 호출할 때 `localStorage.getItem` 실제 호출 횟수가 캐시 적용 후 **변경당 1회 수준으로 감소**(매 호출 대비 대폭 감소).
- **SC-005**: 표시이름의 **조립 로직 중복**(`타입 [line]` 만들기·논리명 모드 위임)이 제거되어 공유 헬퍼(`typeWithLine`·`applyLogicalMode`) 단일 처리처로 모인다(복붙 0). 화면별 의도적 차이(type 전략·BL[seq]·세그먼트)는 보존. *구현 메모: 초기 "단일 함수" 안은 막무가내 통합으로 기각, 헬퍼 추출로 확정 — `research.md` Decision 1·`contracts §1` 참조.*

## Assumptions

- 검증은 실제 분석 데이터로 수행한다(catalog `GET /robo/graph/`에서 받은 실그래프 + 신규 분석 실행). 합성 노드만으로는 종류 누락 위험이 있어 실데이터 전수 대조를 우선한다.
- 본 배치의 "조용한 실패 표면화"는 **code-analysis 데이터 스트림 경로**로 범위를 한정한다. 다른 feature(MLOV·olap·text2sql·schema 등)의 빈 `catch{}`는 각 feature 리팩토링 배치에서 동일 원칙으로 다룬다(배치별 안전 진행). "모든 오류 표면화" 원칙은 전 배치에 적용되며, 본 배치는 그 시작이다.
- 후속 배치(GraphTab 분해, analyzer ProgressController 추출, 타입 안전화, feature god 분해, MLOV)는 별도 spec으로 누적된다. 본 spec은 그 기반인 횡단 안전 배치다.
- 기존 폴백·반응성 동작(빈 맵 반환, `logger.warn`, `storageVersion` bump)은 계약으로 간주하여 보존한다.
