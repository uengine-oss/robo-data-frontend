# Phase 1 Data Model: 044

신규 영속 스키마 0(헌법 III). 아래는 **화면/응답이 다루는 형태**(그래프는 이미 보유, 응답·state가 흘릴 필드).

## 참조 (Reference) — 접근 지점 단위

"어떤 코드가 이 테이블을 **이 줄에서** 읽/쓴다" 1건. 같은 함수가 여러 줄에서 만지면 줄마다 별개(접근 지점별 N행, clarify).

| 필드 | 의미 | 출처 |
|---|---|---|
| symbol_name | 가리키는 루틴 이름(함수/프로시저) | proc: `p.name` / fw: `src.name\|id` |
| source_type | 라벨(FUNCTION/PROCEDURE/METHOD…) | `labels(node)[0]` |
| access_type | READS/WRITES/REFER_TO(=읽기/쓰기/참조) | proc: FROM→읽기,WRITES / fw: `type(r)` |
| file_path | 원본 파일 경로(소스 슬라이스 키) | 노드 `file_path` |
| **start_line** | 루틴 코드 시작 줄(슬라이스 범위 시작) | 노드 `start_line`(proc=오너 `p.start_line`) |
| **end_line** *(신규 반환)* | 루틴 코드 끝 줄(슬라이스 범위 끝) | 노드 `end_line`(proc=오너 `p.end_line`) |
| **evidence_line** *(신규 반환)* | 테이블 접근 정확한 줄(강조 기준) | fw: `r.evidence_line` / proc: `s.start_line` |

- **검증규칙**: `start_line ≤ evidence_line ≤ end_line` 기대. 벗어나면 강조 생략(패널 비깨짐, edge case).
- **폴백**: evidence_line 없거나 0 → 강조 줄 = start_line.

## 코드 패널 상태 (sourceCodePanel) — 프론트 store

기존(`schemaCanvas.ts:259`)에 **`startLine` 추가**(슬라이스 줄번호 오프셋).

| 필드 | 의미 | 비고 |
|---|---|---|
| isOpen | 열림 | 기존 |
| fileName / fileDirectory / file_path | 파일 식별·소스 키 | 기존 |
| **startLine** *(신규)* | 슬라이스 콘텐츠의 첫 줄 = 실제 파일 줄번호 기준점 | 표시 줄번호 = `startLine + index` |
| fileContent | 슬라이스된 코드(노드 범위만) | 기존이나 이제 **부분** |
| highlightedLine | 강조할 실제 파일 줄(evidence_line) | 기존 의미 유지 |
| procedureName | 루틴 이름(헤더 표시) | 기존 |
| notFound | 원본 못 읽음 → 정직 빈상태 | 기존(FR-007) |
| **loadError** *(신규)* | 참조/소스 로드 실패(≠ 참조 없음) | FR-006, 재시도 트리거 |
| statements / isLoadingStatements | DBMS 구문 AI설명 오버레이 | 기존 |

## 참조 목록 상태 (TableNode) — 프론트

| 필드 | 의미 | 비고 |
|---|---|---|
| references[] / frameworkReferences[] | 접근 지점별 항목(각 evidence_line 포함) | 신규 필드 표면화 |
| referencesError *(신규)* | 로드 실패 플래그 | FR-006(없음 vs 실패) |
| referenceCount | 트리거에 표시할 건수 | R6 트리거(🔗 참조 N) |

## 노드(읽기 전용, 변경 없음)

코드 노드 = start_line·end_line 보유(R2). READS/WRITES 엣지 = evidence_line 보유(R1). 신규 속성/라벨/관계 **0**.
