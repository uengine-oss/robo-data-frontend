# Contract: 의미검색 스트림 (프론트 소비 관점)

프론트가 소비하는 계약. 백엔드가 이 형식을 만족시키면 프론트 무변경. (백엔드 구현 세부는 별도 핸드오프.)

## 요청

```
POST {ROBO_BASE_URL}/search/semantic          # ROBO_BASE_URL = /api/gateway/robo → 게이트웨이 → analyzer(5502)
Headers:
  Content-Type: application/json
  X-Neo4j-Uri / X-Neo4j-User / X-Neo4j-Password / X-Neo4j-Database   # session.getHeaders()
Body:
  { "query": "<자연어 또는 키워드>", "limit": 10 }                     # limit 선택
```

- 대상 DB = 세션 헤더의 Database(사용자가 보는 그래프와 동일).
- 취소 = fetch AbortController.abort()(연결 끊기). 별도 control 엔드포인트 없음.

## 응답 = NDJSON 스트림

한 줄 = JSON 하나(`\n` 구분). `type` 필드 필수. 순서: `progress`* → `result`(1) → `stream_end`. 실패 시 `error` → `stream_end`.

### progress (0..N개)
```json
{"type":"progress","stage":"rerank","label":"관련도 채점 중","detail":"30개 정밀 채점"}
```
- `stage`(string): 안정 식별자. `label`(string): **화면에 그대로 표시**. `detail`(string, 선택): 진척 부가 문구.
- 프론트는 label을 자체 판정/치환하지 않는다.

### result (1개, 성공 시)
```json
{"type":"result",
 "clusters":[
   {"id":"c1","title":"결제·재고 원복 흐름","score":0.87,
    "nodes":[
      {"id":"<node.id 논리속성>","name":"payment_cancel","labels":["FUNCTION"],"relevance":0.91}
    ]}
 ],
 "elapsed_ms":38000}
```
- `clusters`: 관련도 내림차순 권장. 0건이면 `[]`(오류 아님).
- `nodes[].id`: **논리 node.id 속성**(캔버스 매칭 키). element_id도 있으면 무시.
- `score`·`relevance`: 0~1.

### error (실패 시)
```json
{"type":"error","message":"이 그래프에는 검색 임베딩이 없습니다 (분석을 다시 실행하세요)"}
```
- `message`: **사용자에게 그대로 표시**할 사유.

### stream_end (종결 센티넬)
```json
{"type":"stream_end"}
```
- 종결 신호. HTTP done으로도 종결 가능.

## 프론트 처리 요약

| type | 프론트 동작 |
|---|---|
| progress | phases에 append, 인라인 단계 표시 갱신 |
| result | clusters 렌더(뭉치 목록). 빈 배열 → "못 찾음" 안내 |
| error | message를 그 자리에 표시 |
| stream_end | 종결. 타이머 정지 |
| (HTTP done, result/error 없이) | status=error, 일반 사유 |
| (abort) | 조용히 종료(취소 정상) |

## 불변식

- progress는 result/error 이전에만 온다.
- result 또는 error 중 정확히 하나(성공 XOR 실패). 0건은 result(clusters:[]).
- 취소된 요청의 이벤트는 프론트가 무시(스토어 abort 가드).
