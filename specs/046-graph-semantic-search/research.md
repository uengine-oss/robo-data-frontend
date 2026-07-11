# Research: 그래프 탭 의미 기반 코드 검색

프론트 표시 계층 설계 결정. 각 항목 = 결정 / 근거 / 기각한 대안.

## R1. FR-005 근본해결 — 검색 맥락 소실 (역할 분리)

**문제(실측)**: Overview 검색 결과를 클릭하면 `selectedNode`가 세팅되고 패널 헤더가 `Overview → Node`로 바뀐다. 검색 UI(검색칸·이름결과·의미결과)는 Overview 렌더 안에 있어 함께 사라진다. 40초 걸린 의미검색 결과를 하나 눌러 보면 나머지 결과와 검색칸이 통째로 소실된다.

**결정**: 두 검색칸의 역할을 코드에서도 분리한다.
- **검색 = 캔버스로 가져오기(retrieve)**: 결과(이름·뭉치 공통) 클릭 = 해당 노드를 캔버스에 add/focus. 패널은 **Overview 유지**(`selectedNode` 세팅 안 함).
- **캔버스 클릭 = 노드 상세(inspect)**: 캔버스의 노드를 클릭하면(기존 NvlGraph node-select) 그때 `selectedNode` 세팅 → Node 뷰.

**근거**: spec의 "숲" 정합(왼쪽=좁히기 / 오른쪽=가져오기)과 일치. 검색은 발견·수집이고 상세보기는 검사다. 한 규칙으로 이름·의미 결과가 동일하게 동작해 이중화가 사라진다. SC-003(검색 맥락 소실 0)·SC-004(캔버스 유실 0)를 구조로 보장.

**기각**: (a) 검색 상태를 패널에 상시 오버레이로 겹쳐 렌더 → 시각 혼잡·모드 이중화. (b) selectedNode 세팅은 유지하되 검색 상태를 별도 스토어에 백업했다가 복원 → 상태 왕복·타이밍 버그 소지. 근본은 "결과 클릭이 상세로 전환한다"는 전제 자체를 제거하는 것.

## R2. 스트림 소비 — streamFetch 재사용 + AbortSignal

**결정**: 기존 `shared/services/http.ts`의 `streamFetch(url, body, headers, onEvent)`에 optional 5번째 인자 `signal?: AbortSignal` 추가. 내부 `fetch(url, {..., signal})`로 전달. abort 시 reader 루프가 예외로 종료되고, 호출부가 AbortError를 무시(취소는 정상 흐름)한다.

**근거**: NDJSON 파서(`\n` 라인 분해·손상줄 방어·stream_end)가 이미 검증됨(analyze가 씀). 시그니처 확장은 optional이라 기존 호출 전부 무변경(하위호환). 취소 = fetch 끊기 = 백엔드 계약과 일치(별도 control 엔드포인트 없음).

**기각**: EventSource/SSE → POST 불가·세션헤더(X-Neo4j-*) 부착 불가. 별도 스트림 유틸 신설 → DRY 위반(streamFetch와 중복).

## R3. 진행 단계 label — 서버 문구 그대로

**결정**: progress 이벤트의 `label`(한국어) 문자열을 프론트가 **그대로** 표시. stage(영문 식별자)는 키/중복제거용으로만. detail(선택)이 있으면 우측에 부가 표시.

**근거**: 실제 검색 파이프라인 단계(rewrite/recall/rerank/expand/judge)는 백엔드가 소유·확정한다. 프론트가 단계명을 자체 매핑하면 백엔드 변경 시 어긋난다(해피패스·추측 금지). analyze의 STEP_SUBLABEL은 프론트가 가졌지만 그건 analyze 계약이 고정이라 그런 것 — 검색은 서버 주도.

**기각**: 프론트 stage→라벨 매핑 테이블 → 백엔드 단계 변경에 취약, 추측.

## R4. 노드 매칭 — node.id 논리 속성

**결정**: result.nodes[].id(= node.id 논리 속성)로 `canvasStore.addNodeToCanvas(id)`. element_id는 무시.

**근거(코드 확인)**: `analyzer.ts` `convertNeo4jNode` = `id: (properties.id) || node['Node ID']` → 스토어 nodeMap 키·캔버스 식별 모두 논리 id. 링크 끝점도 elemToLogical로 논리 id 정규화. 백엔드가 id·element_id 둘 다 보내지만 프론트는 id만 소비 → 무변경 매칭.

**주의**: 뭉치 노드가 현재 nodeMap에 없을 수 있다(부분 그래프). add 실패 시 조용히 누락 금지(FR Edge) — add 결과를 확인해 최소한 로깅/카운트. 상세는 data-model.

## R5. 진행 배지 위치 — TopToolbar

**결정**: 상단 툴바(TopToolbar.vue)에 진행 배지("의미검색 중 · N초"). `semanticSearch` 스토어의 status==='running'·elapsedSec 구독. Overview 패널 밖(다른 노드·탭)에서도 보임.

**근거**: 분석 진행을 상단에 띄우던 관례(project-status 영역) 재사용 = 새 관례 0. 하단 콘솔/분석 진행 패널은 "코드 분석 전체" 의미라 검색 진행을 섞으면 의미 혼선(spec FR-008).

**기각**: 하단 콘솔 재사용 → 의미 혼선·시선 분산.

## R6. 경과초 타이머

**결정**: run() 시작 시 1초 간격 setInterval로 elapsedSec 증가, done/error/cancel 시 clearInterval. 특정 상한(40)을 하드코딩하지 않음(계속 증가; 배지·인라인 모두 실제 경과 표시).

**근거**: "약 40초"는 설계 근거일 뿐 계약값 아님(Assumptions). 실제 소요는 백엔드 종속 — 초를 박으면 느린 그래프에서 거짓.

## R7. ⌘K 라우팅

**결정**: TopToolbar.handleSearch에서 activeTab==='graph'이면 질의를 **Overview 의미검색 입력으로 전달**(현재는 navigatorStore.searchQuery=트리필터). 트리 검색은 사용자가 왼쪽 칸에서 직접.

**근거**: ⌘K = "찾아줘"(retrieve) → 가져오기 칸으로. FR-011. 현재 배선이 거꾸로(트리 필터).

**미결(구현 시 확정)**: Overview 검색칸은 NodeDetailPanel 내부 상태다. ⌘K가 값을 넘기려면 (a) 검색 질의를 semanticSearch 스토어의 query로 올려 NodeDetailPanel이 구독하거나 (b) 이름검색 질의를 담는 공유 ref를 둔다. → data-model에서 query를 스토어 소유로 승격해 해결(단일 출처).
