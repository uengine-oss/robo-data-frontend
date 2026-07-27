# Parser slice evidence

검증일: 2026-07-23

- Parser API의 upload form, JSON parse, NDJSON stream 호출을 `src/domains/parser/api`로 분리
- Parser 전용 파일 경로·트리·선택 규칙을 `shared`에서 `src/domains/parser/application`으로 이동
- `node contracts/test-parser-client.mjs`: `/fileUpload`, `/parsing`, metadata/header/form filename/event 전달 통과
- `npx tsc -p tsconfig.parser.json`: Parser domain strict boundary 통과
- 업로드 UI 8개와 lazy public entry를 `src/workflows/code-analysis`로 옮기고
  `src/features/code-analysis/components/upload`, 옛 upload entry, re-export shim을 제거
- Data Fabric domain의 전체 connector catalog를 단일 진실로 사용하며 UI의 PostgreSQL/MySQL/Neo4j/
  MongoDB 4개 하드코딩 fallback 제거
- `node contracts/test-upload-workflow.mjs`: 파일 수집, 경로+파일명 우선순위, 정확 procedure stem,
  부분문자열 추론 금지, missing 결과, 전체 connector catalog 계약 통과
- `node contracts/check-architecture.mjs`: 349개 TS/Vue 파일에서 옛 경로, workflow domain 내부 import,
  upload `any`/강제 단언/native dialog/비관리 timer/fallback 재유입 차단 통과
- `npm run type-check`: 전체 오류 0
- `npm run build`: 4,787 modules production build 통과
- `node contracts/check-build-boundaries.mjs`: remote entry에서 UploadTab·GraphTab·Cytoscape 제외,
  upload lazy chunk 분리 통과
- 실제 Parser `http://127.0.0.1:8401/`: 200 `OK`
- 1920×1080 Chromium에서 코드 탭 lazy load, upload modal, datasource 목록 503→재시도, 87개 connector
  catalog, 생성 503→같은 입력 재시도→실제 성공 응답 선택, POST body와 요청 횟수 검증 통과
- 파일 전체 삭제의 alertdialog focus, Escape 취소, 확정 삭제와 페이지/예상 외 console 오류 0
- datasource 생성 form 하단 action 잘림을 flex body/scroll 구조로 수정한 뒤 오류·action 비중첩 확인
- 390×844에서 modal transition 완료 뒤 불투명 surface, 가로 overflow 0, body/footer 비중첩,
  파일/DDL 단일 열과 validation/action footer를 실물 캡처로 확인
- 실제 파일 upload/parse mutation은 현재 분석 workspace를 덮을 수 있어 이 슬라이스에서는 수행하지 않았고 completion live audit 대상으로 유지

화면 증거:

- `parser-upload-datasource-list-failure-1920x1080.png`
- `parser-upload-datasource-create-failure-1920x1080.png`
- `parser-upload-modal-1920x1080.png`
- `parser-upload-modal-390x844.png`
