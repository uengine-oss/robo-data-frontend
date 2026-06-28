# Contract: 소스 파일 서빙 엔드포인트 (analyzer → gateway → frontend)

**Feature**: 043-schema-tab-overhaul
**생산자**: robo-data-analyzer (5502) · **경유**: api-gateway (9000) · **소비자**: robo-data-frontend

근거(타당성 조사, file:line 검증됨):
- 소스는 디스크 `ENV.data.dir/source/<타깃>/...`에 존재 (`env_catalog.py:174-190`, `analyze_data_dir.py:151-154`).
- 노드 `file_path`는 **절대경로** (`antlr_json_reader.py:488-491`, `graph_nodes.py:132,158`).
- 재사용: `SourceFileCache.slice(file_path, start_line, end_line)` (`shared/source_file_cache.py:24-36`).

## 엔드포인트 (analyzer)

```
GET /robo/source?file_path=<절대경로>&start_line=<int=1>&end_line=<int=0>
```

- `file_path` (required): 그래프 노드의 절대 파일 경로.
- `start_line` (optional, default 1, ≥1): 1-기준 시작 줄.
- `end_line` (optional, default 0=EOF, ≥0): 1-기준 끝 줄(0이면 끝까지).

**응답 200**:
```json
{
  "file_path": "<absolute>",
  "content": "<파일 전체 또는 슬라이스 텍스트>",
  "line_count": <총 줄수>,
  "start_line": <요청 시작>,
  "end_line": <실제 끝>,
  "found": true
}
```

**못 읽음/경로이탈/없음**: 정직한 신호를 준다(가짜 코드 금지).
- `400`: file_path 미지정 또는 소스 루트 밖(경로 이탈 차단).
- `404`: 디스크에 파일 없음.
- 프론트는 400/404를 받으면 코드 패널에 **코드가 아닌 "소스 없음" 빈 상태**를 렌더.

**보안(FR-002)**: `Path(file_path).resolve()`가 `ENV.data.dir/source`(resolve) 하위인지 검사, 아니면 400.

## gateway 라우트 (application.yml)

catalog catch-all(`/api/gateway/robo/**` → 5503)보다 **위**에 명시 라우트 추가:
```yaml
- id: api-gateway-robo-source
  uri: http://127.0.0.1:5502
  predicates:
    - Path=/api/gateway/robo/source/**
  filters:
    - RewritePath=/api/gateway/robo/(?<segment>.*), /robo/${segment}
    - RemoveRequestHeader=Origin
```

## catalog 보강 (참조쿼리)

`schema_query_service.py` 프로시저 참조쿼리(proc_query)에 `p.file_path AS file_path` 추가 → 프로시저 참조도 절대경로 확보(FR-004). 프레임워크 참조는 이미 `src.file_path` 반환.

## frontend 소비 (roboSchemaApi)

신규 `getSourceContent(filePath, { startLine, endLine })` → `GET ${ROBO_BASE_URL}/source?...`. 단, `/source`는 게이트웨이에서 analyzer로 라우팅되므로 base가 catalog가 아닌 analyzer로 가야 함 → ROBO_BASE_URL(=`/api/gateway/robo`) 그대로 사용하고 게이트웨이가 `/source`만 5502로 분기(위 라우트). 핸들러(`handleProcedureClick`/`handleFrameworkClick`)는 uploadedFiles 조회를 폐기하고 이 API 결과로 `openSourceCodePanel` 호출. 실패 시 정직한 빈 상태.
