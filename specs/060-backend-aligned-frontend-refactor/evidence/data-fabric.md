# Data Fabric slice evidence

검증일: 2026-07-22

- `node contracts/test-data-fabric-client.mjs`: 8개 endpoint의 method/path/session header/body/error propagation 통과
- `npx tsc -p tsconfig.data-fabric.json`: Data Fabric domain strict boundary 통과
- `npm run build:docker`: Vite production build 통과, 4,722 modules
- 전체 `npm run type-check`: baseline과 같은 208 errors, `src/domains/data-fabric` 오류 0
- 기존 057 panel projection, 059 area graph 계약 통과
- `node contracts/verify-data-fabric-ui.mjs`: 1920×1080 Chromium에서 통과
  - Gateway list 200, 기존 `shopmall` 렌더
  - `shopmall` health 200, tables 200
  - 추가 modal과 87개 connector catalog 렌더
  - 강제 503을 빈 목록이 아닌 오류로 표시
  - 오류 상세 표시와 재시도 후 200 복구
- 기존 `shopmall`은 생성·수정·삭제하지 않음

화면 증거:

- `data-fabric-normal-1920x1080.png`
- `data-fabric-failure-1920x1080.png`

## 2026-07-23 operation-state isolation addendum

- The datasource store previously reused one `loading/error` pair for datasource-list loading, selected-datasource
  table loading, create, and delete. A table request initiated by embedded Text2SQL could therefore leave
  `Internal Server Error` in the store, and a later ObjectType Direct SQL dialog displayed it as a datasource-list
  failure beside the real Text2SQL failure.
- The store now exposes independent datasource-list, table-list, and mutation pending/error states. List refresh
  failure retains a prior successful list. Table responses are generation- and selected-datasource-aware, so a late
  response for a previous selection cannot overwrite the current table list. Create/delete failures do not replace
  either catalog.
- `DataSourceManager` uses the corresponding state at each surface. Initial list failure remains distinct from empty;
  refresh failure with existing data is nonblocking; table failure stays in the selected datasource detail panel with
  an in-place retry; create/delete errors use the mutation surface. The ObjectType dialog reads only
  `datasourceListError`.
- Domain contracts prove state isolation, prior-list preservation, mutation separation, and rejection of a late table
  response. The architecture contract rejects the old mixed `error/loading/clearError` consumer API.
- The actual live-mode Data Fabric browser run was attempted first but the local list endpoint did not return 200, so
  it was not reported as live success and T052 remains open. The runner's explicit
  `DETERMINISTIC_DATA_FABRIC=1` mode passed list/table rendering, connector catalog, list 503→retry, and table
  503→retry without changing the default live-mode behavior.
- Inspected `data-fabric-table-failure-1920x1080.png`: the `shopmall` datasource card remains visible while the lower
  detail panel shows the table-specific error and retry action. It is not presented as an empty table list, clipped,
  or overlapped.
- Full type-check, domain contracts, the architecture contract across 348 TypeScript/Vue sources, `git diff --check`,
  and the 4,786-module production build passed after the state split.

## 2026-07-23 management UI responsibility split

- `DataSourceManager.vue` previously mixed a 111-entry presentation map, connector search/grouping, connection draft,
  connection testing/creation, an unmanaged success timer, native delete confirmation, datasource cards, and table
  details in one 1,685-line SFC. It had no responsive rule, cards were mouse-only `div` elements, and neither modal
  had a named dialog/focus/Escape contract.
- The management surface is now separated into:
  - `application/connectionDraft.ts`: connector grouping, defaults, and exact connection-test payload policy.
  - `catalog/connectorPresentation.ts`: the existing icon/color/gradient and category presentation policy.
  - `AddDataSourceDialog.vue`: connector discovery, form, test/create failure and managed success lifetime.
  - `DataSourceCard.vue`: native keyboard-selectable card and independent delete action.
  - `DataSourceDetailsPanel.vue`: selected datasource table lifecycle and in-place retry.
  - `DeleteDataSourceDialog.vue`: named alertdialog, destructive focus, Escape, pending and retryable failure.
  - `DataSourceManager.vue`: list search/load, mode-specific selection, and child orchestration only.
- `test-data-fabric-connection-draft.mjs` proves catalog-wide grouping, Korean description search, PostgreSQL defaults,
  numeric port normalization, optional empty values, and presentation lookup/fallback.
- The deterministic Chromium contract passes at 1920×1080 and 390×844:
  - keyboard datasource selection and table request;
  - exact connection-test payload with visible 503;
  - create 503 followed by same-form retry and an identical POST payload;
  - add-dialog automatic close and trigger focus restoration;
  - delete Escape with zero requests, visible 503, same-dialog retry and successful removal;
  - list/table failure isolation and in-place retry retained from the previous contract;
  - 87-connector desktop/mobile catalog and a mobile connection form with page/dialog horizontal overflow ≤ 1px.
- The first mobile form capture exposed a real defect: sticky actions covered the Database/Schema fields. The actions
  now remain in document flow; the repeated capture shows both fields and the full action row without overlap.
- Inspected evidence:
  - `data-fabric-normal-1920x1080.png`
  - `data-fabric-failure-1920x1080.png`
  - `data-fabric-table-failure-1920x1080.png`
  - `data-fabric-catalog-390x844.png`
  - `data-fabric-form-390x844.png`
- Final verification passed: full type-check, 9-endpoint Data Fabric client contract, operation-state domain contracts,
  upload workflow regression, Parser browser regression, protected 057/059 graph contracts, 355-source architecture
  contract, `git diff --check`, 4,801-module production build, and remote/lazy build boundary inspection.
- These mutation scenarios use deterministic intercepted endpoints and do not delete or create a live datasource.
  A real backend normal/failure mutation run remains part of T052.
