# Data Model: 그래프 탭 의미 기반 코드 검색 (프론트 상태/뷰)

표시 계층이므로 영속 엔티티 없음. 스트림 이벤트 → 스토어 상태 → 뷰 모델의 흐름을 정의한다.

## 1. 스토어: `useSemanticSearchStore` (features/code-analysis/stores/semanticSearch.ts)

### 상태

| 필드 | 타입 | 의미 |
|---|---|---|
| `query` | `string` | 현재 검색어(단일 출처 — Overview 입력·⌘K 진입 공용) |
| `status` | `'idle' \| 'running' \| 'done' \| 'error' \| 'cancelled'` | 검색 세션 상태 |
| `phases` | `SearchPhase[]` | 수신 순서대로 쌓인 진행 단계(마지막=현재) |
| `elapsedSec` | `number` | 실행 경과 초(1초 간격 증가, 종료 시 정지) |
| `clusters` | `Cluster[]` | 결과 뭉치(done 시 채워짐) |
| `errorMessage` | `string \| null` | 서버가 보낸 실패 사유(error 시) |
| `_abort` | `AbortController \| null` | 현재 검색의 취소 핸들(비노출 내부) |
| `_timer` | `number \| null` | 경과초 setInterval id(비노출 내부) |

### 파생(getter)

- `isSearching` = `status === 'running'` — 상단 배지·버튼 비활성 조건.
- `currentPhaseLabel` = `phases.at(-1)?.label ?? ''`.
- `hasResults` = `status === 'done' && clusters.length > 0`.
- `isEmpty` = `status === 'done' && clusters.length === 0`.

### 액션

- `run(headers: Headers)`: 
  1. 이전 `_abort?.abort()` + `_timer` clear(새 검색이 이전을 취소 — FR-010).
  2. status='running', phases=[], clusters=[], errorMessage=null, elapsedSec=0.
  3. 새 AbortController 생성 → `_abort`. 1초 setInterval → elapsedSec++.
  4. `roboApi.searchSemantic({query, ...}, headers, onEvent, _abort.signal)` 호출.
  5. onEvent 분기(아래 §2). 종료(done/error/stream_end) 시 `_timer` clear.
  6. catch: AbortError면 무시(취소 정상). 그 외 → status='error', errorMessage=네트워크 사유.
- `cancel()`: `_abort?.abort()` + `_timer` clear + status='cancelled'. 이후 도착 이벤트 무시(§2 가드).
- `reset()`: 전부 초기화(패널 초기 상태).
- `setQuery(q)`: query 갱신(입력·⌘K 공용).

### 이벤트 가드(취소 후 튐 방지 — SC-007)

각 run은 로컬 `myAbort` 캡처. onEvent 진입 시 `if (_abort !== myAbort) return`(이미 새 검색/취소로 교체됨). 취소된 스트림의 지연 이벤트가 상태를 오염시키지 않음.

## 2. 스트림 이벤트 → 상태 매핑

| 이벤트 `type` | 처리 |
|---|---|
| `progress` | `phases.push({stage,label,detail})` |
| `result` | `clusters = 정규화(clusters)`, status='done', 타이머 정지 |
| `error` | `errorMessage = message`, status='error', 타이머 정지 |
| `stream_end` | 종결 센티넬 — 이미 result/error 왔으면 무시. running인 채로 오면 방어적으로 done 처리 |

(streamFetch는 HTTP done으로도 종결. result/error를 못 받고 끝나면 status='error', 일반 사유 메시지.)

## 3. 엔티티(뷰 타입)

### SearchPhase
```
{ stage: string; label: string; detail?: string }
```
- `label` = 화면 표시 문구(서버 제공, 그대로). `stage` = 키.

### Cluster
```
{ id: string; title: string; score: number; nodes: ClusterNode[] }
```
- `score` = 0~1 유사도 → 표시 시 `Math.round(score*100)%`.
- `title` 없으면 대표 노드명 폴백.

### ClusterNode
```
{ id: string; name: string; labels: string[]; relevance?: number }
```
- `id` = 논리 node.id(캔버스 매칭 키 — R4).

## 4. 뷰 상태 머신 (NodeDetailPanel 의미 섹션)

```
idle      → [버튼 "의미로 더 찾기 · 약 40초"] + 한 줄 안내("자세히 쓸수록 잘 찾습니다")
running   → [단계 label · elapsedSec초 · 취소] (수신 단계 순차)
done+n>0  → [뭉치 목록: title · score% · 소속노드]  (+ "다시 찾기")
done+n=0  → [못 찾음 안내: 업무 용어로 · 자세히]
error     → [서버 사유 메시지]
```

- 빈 검색칸(query==='') → 짧은 한 줄 안내(FR-015). 예시 칩·ⓘ 없음.
- 버튼 비활성 = isSearching(중복 실행 방지). 실행 조건: query 비어있지 않음.

## 5. 뭉치 클릭 → 캔버스 (retrieve, R1)

`onClusterClick(cluster)`:
1. `cluster.nodes.forEach(n => canvasStore.addNodeToCanvas(n.id))`.
2. **selectedNode 세팅하지 않음** — 패널 Overview 유지(FR-005).
3. add 대상이 현재 nodeMap에 없으면(부분 그래프) 누락 카운트 → 사용자에게 "N개는 현재 그래프에 없어 추가 못 함" 최소 표기(무반응 금지, Edge).
4. 캔버스에서 그 노드를 클릭하면 기존 handleNodeSelect가 Node 상세를 연다(inspect).

## 6. 상단 배지 (TopToolbar)

`isSearching` 참이면 project-status 영역에 "의미검색 중 · {elapsedSec}초" 배지. status 변화로 자동 소멸.
