# Implementation Plan: Data Fabric 메타데이터 UX 제거

`DataSourceManager.vue`의 extraction state/action/template/style과 `datasources.ts`의 extraction API/state를
세로로 제거한다. 새 대체 flag나 호환 shim은 만들지 않는다. 기존 사용자 WIP와 origin 선행 커밋을 먼저
안전하게 병합한 후 typecheck/build/Playwright로 검증한다.
Schema table-data 조회는 Data Fabric의 구조화 read-only 계약으로 함께 이동한다. UI는 schema/table
식별자로 대상 SELECT만 만들고 datasource와 max_rows를 request field로 분리한다.

