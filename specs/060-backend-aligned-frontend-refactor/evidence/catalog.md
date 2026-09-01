# Catalog slice evidence

검증일: 2026-07-22

- Gateway 라우팅 원문을 기준으로 `/robo/schema`, `/robo/graph`, `/robo/lineage`는 Catalog, `/robo/analyze`, `/robo/search`, `/robo/pipeline`은 Analyzer 소유로 분리했다. 원문은 그래프 노드의 `code_text`를 사용한다.
- schema·graph·lineage transport를 `src/domains/catalog/api`에 통합하고 schema modeling·data lineage workflow는 domain public entrypoint만 소비하도록 변경했다.
- 실제 Catalog health 응답은 200, schema table 목록은 `audit_log` 등 5개, graph check는 3,379 nodes, lineage overview는 ETL 70/source 21/target 16/flow 128을 반환했다.
- `node contracts/verify-catalog-ui.mjs`: 1920×1080 Chromium에서 schema 목록/상세/canvas, lineage graph, Catalog+OLAP 전체 장애와 재시도 UI 통과.
- 대형 lineage graph는 전체 축소 대신 읽을 수 있는 배율에서 세 열을 같은 시작선에 배치한다. 작은 graph의 기존 fit-to-view 동작은 유지한다.
- `/robo/` 장애를 Analyzer로 단정하던 안내를 Analyzer/Catalog를 포괄하는 ROBO backend 안내로 수정했다.
- `node contracts/check-architecture.mjs`: 286개 TypeScript/Vue source 경계 검사 통과.
- Catalog/Analyzer/OLAP/schema-modeling/data-lineage 이동 경로의 TypeScript 오류는 0개이며, 전체 기존 오류는 baseline 208개에서 193개로 감소했다.
- `npm run build:docker`: Vite production build 통과, 4,730 modules.
- Data Fabric/Parser 계약과 기존 057 panel projection, 059 area graph 계약 통과.
- 운영 데이터를 바꾸는 graph delete와 ETL analyze mutation은 수행하지 않았다.

화면 증거:

- `catalog-schema-1920x1080.png`
- `catalog-lineage-1920x1080.png`
- `catalog-lineage-failure-1920x1080.png`

## Catalog 용어 대량 업로드 — 2026-07-23

구조와 계약:

- 기존 1,658줄 `TermBulkUploadModal`은 파일 선택, AI 매핑, 추출, 가상 preview, import/rollback,
  session 복원을 한 파일에서 수행했다. mapping/request/selection/filter/persistence 판정을
  `application/bulkUploadDraft.ts`의 순수 정책으로 이동하고 파일·매핑·preview 표시를 각각
  `BulkUploadFileStep`, `BulkUploadMappingStep`, `BulkUploadPreviewStep`으로 분리했다.
- 상위 modal은 workflow 상태, API 실행, 중단, session 영속화만 조정한다. 단계 template은 144줄이며
  status label과 confidence 표현은 `bulkUploadPresentation.ts` 한 곳에서 공유한다.
- upload/extract/import/rollback의 일반 JSON 응답과 SSE complete 응답은 모두 runtime parser를 거친다.
  malformed 200을 성공으로 받아들이지 않으며 동일 입력으로 다시 시도할 수 있다.
- session snapshot은 version, step, 중첩 mapping/join/transform/candidate/import 응답을 런타임에서 검증한다.
  손상·stale 상태는 화면에 이유를 표시하고 폐기하며, 200건 이하는 preview 자체를 보존하고 201건부터는
  서버 session에서 preview를 복원한다.
- native confirm 세 곳을 이름 있는 alertdialog 하나로 교체했다. 복원·import·rollback은 최초 focus,
  Escape 취소, 요청 중 닫기 차단, 오류 유지, 동일 dialog 재시도와 modal focus 복귀를 갖는다.
- 대량 업로드 UI 5개 파일의 `any`, `as unknown`, native alert/confirm, raw timer, 직접 `JSON.parse`,
  template event cast는 0건이다.

결정론적 프론트 검증:

- `test-catalog-bulk-upload-draft.mjs`: mapping hydration, exact extract/import payload, 후보 deep clone·편집,
  filter/sort/selection, 200/201 persistence 경계, 정상·손상 snapshot 판정 통과.
- `test-domain-contract-parsers.mjs`: bulk response parser 포함 domain 응답 경계 통과.
- `verify-catalog-bulk-upload-ui.mjs`: 손상 snapshot 폐기, 정상 snapshot의 Escape 취소와 이어하기,
  resume alertdialog 최초 focus, malformed upload 200 표시·재시도, editable preview, import/rollback
  Escape 무요청, 503 오류 유지·동일 dialog 재시도, exact 2건 import payload를 Chromium에서 통과했다.
- 390×844에서 modal이 viewport 안에 있고 document 가로 overflow는 0이다. 6열 preview는 칼럼을
  제거하지 않고 내부 가로 scroll을 사용하며 filter와 footer가 겹치지 않는다.
- `npm run type-check`, 361-source architecture contract, production build 4,812 modules가 통과했다.

화면 증거:

- `catalog-bulk-preview-390x844.png`

검증 경계:

- 위 브라우저 검증은 backend 원문에 맞춘 route/method/header/payload/response를 결정론적으로
  가로챈 프론트 계약 검증이다. 실제 데이터·인증·서버 조합이 필요한 live API 통합은 수행하지 않았고
  T052의 비차단 체크리스트로 분리했다. 이를 실서버 성공으로 간주하거나 가짜 성공으로 기록하지 않는다.

## Catalog 일반 용어 action — 2026-07-23

- `GlossaryTab`의 하나뿐인 오류 문자열과 무조건적인 glossary 목록 재조회 버튼을
  glossary list, term list, 선택 detail, 편집 detail retry identity로 분리했다. term detail 503 뒤
  “다시 시도”는 같은 detail을 두 번째로 요청하며 glossary list request 수는 증가하지 않는다.
- 용어집·용어 삭제의 native confirm을 Catalog 공용 `GlossaryActionDialog`로 교체했다. 대상 ID와
  glossary ID는 dialog 시작 시 고정되며 Escape는 요청 0건, 503은 dialog를 닫지 않고 오류를 표시하고,
  두 번째 확정 성공 뒤에만 목록과 선택을 갱신한다.
- glossary list/detail, term list/detail, 생성 identity 응답을 runtime parser에 연결했다. 잘못된
  id/name/type/termCount/status와 잘못된 nested owner/domain/tag는 빈 값·누락·Draft로 조용히
  정상화되지 않고 계약 오류가 된다. backend가 합법적으로 사용하는 문자열형 owner/domain/tag는
  기존처럼 보존한다.
- 용어 행은 Enter/Space로 선택하며 개별 설명과 전체 설명 펼치기는 실제 state와 `aria-expanded`를
  공유한다. 동작하지 않던 “더 보기”는 실제 확장으로 연결했고 제공되지 않는 활동 피드는 disabled로
  표시했다.
- 900px 이하에서는 glossary 목록을 가로 strip으로, main과 metadata를 세로 흐름으로 바꾼다.
  390×844에서 document/root 가로 overflow는 0이고 table 데이터는 전용 container의 가로 scroll로
  보존된다.

결정론적 검증:

- `verify-catalog-glossary-actions-ui.mjs`: 설명 확장, 키보드 term 선택, detail 503의 정확한 retry,
  term/glossary 삭제 Escape 0 request, 각각 503→같은 dialog retry→성공, 390×844 geometry,
  page error 0 통과.
- `test-catalog-bulk-upload-draft.mjs`: 일반 glossary/term parser의 정상 응답과 missing termCount,
  missing identity, unknown status, malformed owner 거부를 함께 검증한다.
- 최신 `npm run type-check`, 361-source architecture contract, production build 4,812 modules,
  remote entry 2,667,802B와 UploadTab/GraphTab/Cytoscape lazy boundary가 통과했다.

화면 증거:

- `catalog-glossary-390x844.png`

실서비스 API는 실제 데이터·인증 환경이 없으므로 호출하지 않았으며 위 결과를 live 통합 성공으로
표기하지 않는다.

## Catalog 영업일 캘린더 — 2026-07-23

- 42개 날짜 cell, 월 통계, 비영업일 save payload, 대한민국 고정일 병합을
  `application/businessCalendarDraft.ts`로 분리했다. 수동 지정 reason과 정렬된 날짜를 보존하며
  주말·공휴일·수동 날짜의 합집합으로 영업일 수를 계산한다.
- Business calendar 조회·저장·삭제·단일 날짜 확인·비영업일 목록 응답은 날짜/배열/boolean을 runtime에서
  검증한다. mutation `success=false`와 malformed 날짜는 성공으로 투영하지 않는다.
- 연도 load sequence가 늦은 과거 응답을 폐기한다. load 오류의 “다시 시도”는 GET만, save 오류의
  “다시 시도”는 편집 상태를 보존한 POST만 먼저 실행한다. POST 성공 뒤에만 GET refresh가 이어진다.
- raw success timeout을 managed lifetime으로 교체했다. 공휴일 dialog는 이름·label·date input 최초 focus,
  Escape와 trigger focus 복귀를 제공한다. 같은 날짜는 중복 항목 대신 교체한다.
- 실제 목록이 양력 고정일뿐이므로 “대한민국 공휴일 자동추가”를 “고정일 추가”로 정정했다.
- `verify-business-calendar-ui.mjs`: 최초 GET 503→GET retry, 날짜 선택, dialog focus/Escape/복귀,
  POST 503→POST retry→GET refresh, holiday와 nonBusinessDays exact payload, 390×844 document/root
  overflow 0, page error 0 통과.
- 순수 계약은 42-cell, 월 합계, reason 보존 payload, 중복 없는 고정일 병합, malformed date와
  `success=false` 거부를 통과했다. 최신 type-check, 362-source architecture contract,
  production build 4,813 modules와 remote entry 2,667,802B lazy boundary도 통과했다.

화면 증거:

- `catalog-business-calendar-390x844.png`

실서비스 데이터·인증 환경은 사용하지 않았으며 결정론적 프론트 계약 검증과 live 통합을 구분한다.

## Catalog 편집 modal — 2026-07-23

- Glossary/Term 편집 화면에 명명된 `role=dialog`, `aria-modal`, busy 상태, Escape, 명시적인 name input
  최초 focus와 pending close 차단을 추가했다. mobile safe margin과 viewport 높이도 제한했다.
- Term의 domain/owner/tag 병렬 조회는 한 요청 실패로 성공한 두 목록을 버리지 않는다.
  `Promise.allSettled`로 성공 결과를 유지하고 일부 실패를 visible status와 retry로 표시한다.
- metadata 세 응답은 id/name과 배열을 runtime에서 검증한다. malformed 항목을 빈 선택 목록으로
  위장하지 않는다.
- `verify-catalog-glossary-actions-ui.mjs`에서 두 editor의 최초 focus/Escape, domain 503의 visible
  partial failure와 retry를 기존 detail/delete/mobile 시나리오와 함께 통과했다.
- 최신 type-check, 362-source architecture contract, production build 4,813 modules와
  remote entry 2,667,802B lazy boundary가 통과했다.
