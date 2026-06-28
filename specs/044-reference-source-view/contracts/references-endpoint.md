# Contract: 테이블 참조 조회 응답 (catalog)

**Endpoint**: `GET /robo/schema/tables/{table}/references?schema=&column_name=`
**Service**: catalog (게이트웨이 `/robo/**`→5503). 권위표=api-gateway 라우트.
**Consumer**: robo-data-frontend `features/schema/api.ts roboSchemaApi.getTableReferences`.
**Producer**: catalog `service/schema_query_service.py fetch_table_references`.

## 변경 = 필드 추가 (하위호환, 기존 소비 무회귀)

응답의 두 배열 항목에 슬라이스/강조용 줄 정보를 추가한다.

### references[] (DBMS 프로시저 전략)

```jsonc
{
  "procedure_name": "string",     // 오너 루틴 이름 (p.name)
  "procedure_type": "string",     // labels(p)[0]
  "access_type": "string",        // FROM(읽기)/WRITES
  "statement_type": "string|null",
  "statement_line": 0,            // 접근 구문 줄 = 강조 기준 (s.start_line)  ← 기존
  "start_line": 0,                // ★신규: 오너 루틴 시작 줄 (p.start_line) = 슬라이스 시작
  "end_line": 0,                  // ★신규: 오너 루틴 끝 줄  (p.end_line)   = 슬라이스 끝
  "file_name": "string|null",
  "file_directory": "string|null",
  "file_path": "string|null"      // 소스 슬라이스 키 (p.file_path)
}
```

### framework_references[] (프레임워크 전략)

```jsonc
{
  "source_name": "string",        // src.name | src.id
  "source_type": "string",        // labels(src)[0] = FUNCTION/METHOD…
  "access_type": "string",        // type(r): READS/WRITES, 또는 REFER_TO
  "start_line": 0,                // 함수 시작 줄 (src.start_line) = 슬라이스 시작  ← 기존
  "end_line": 0,                  // ★신규: 함수 끝 줄 (src.end_line)            = 슬라이스 끝
  "evidence_line": 0,             // ★신규: 테이블 접근 정확한 줄 (r.evidence_line) = 강조 기준
  "file_name": "string|null",
  "file_path": "string|null",
  "file_directory": "string|null",
  "module_name": "string|null"
}
```

## 의미 규약

- **슬라이스 범위** = `[start_line, end_line]` (그 루틴 코드만). 프론트가 `GET /robo/source?file_path&start_line&end_line`로 호출.
- **강조 줄** = framework `evidence_line` / DBMS `statement_line`. 0/누락 시 `start_line` 폴백.
- `start_line ≤ 강조줄 ≤ end_line` 기대. 위반 시 강조 생략(응답은 그대로, 표시 측 방어).
- REFER_TO(모듈 참조)는 evidence_line이 없을 수 있음 → start_line 강조 폴백.

## 무회귀 근거

- 기존 소비자(프론트)는 추가 필드를 무시해도 동작 → 점진 적용.
- catalog 외 소비자 없음(이 엔드포인트는 프론트 전용). architect/text2sql 무관.

## 라이브 검증 (구현 시)

- framework(현 zapamcom): `evidence_line`이 실제 접근 줄, `end_line`이 함수 끝인지 Neo4j 직접쿼리로 대조.
- DBMS: dbms 재분석 후 `p.start_line/p.end_line`·`s.start_line` 채워짐 확인.
