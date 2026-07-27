# Ontology and observability verification

- Verified at 1920×1080 against the running frontend and real Gateway-backed services.
- Opened domain schema modeling, multi-layer ontology, object explorer, data quality, and watch-agent surfaces through the real navigation.
- Confirmed the physical moves to `domains/ontology`, `workflows/ontology`, and `workflows/observability` introduce no browser runtime errors.
- Evidence screenshots: `ontology-workflow-1920x1080.png`, `observability-workflow-1920x1080.png`.
- Contract: `contracts/verify-ontology-observability-ui.mjs`.

## 2026-07-22 contract-hardening addendum

- All Ontology schema, object-explorer, agent, and domain-WhatIf requests now carry current session headers, including
  Electron-injected Neo4j connection context.
- Auto-link SSE rejects malformed frames, requires an explicit result, and no longer retries a possibly partial
  mutation through the non-stream endpoint.
- Multi-layer generation requires an explicit `complete` or `error` terminal event; schema generation rejects malformed
  and malformed-final NDJSON instead of skipping it.
- Operator-supplied external Behavior test URLs use `globalThis.fetch` without ROBO session/LLM/Neo4j headers and send
  only operator-entered JSON. GET tests do not send an illegal request body.
- Chart configuration loads actual ObjectType rows; dummy preview rows and random map coordinates were removed.
- The unreachable empty-data Behavior execution path and its dead dialog were removed. Explicit TableNode execution via
  the instance-selection workflow remains intact.
- Full type-check, runtime contract parsers, 300-source architecture validation, and the 1920x1080 ontology browser
  regression passed.
- Node data failures no longer auto-switch to Text2SQL while discarding ontology filters or restore stale prior-node
  results. The ontology failure stays visible and the existing Text2SQL raw-table lookup remains available only as an
  explicit operator action with its different data semantics disclosed.
- The follow-up type-check, 301-source architecture validation, and 1920x1080 ontology browser regression passed.

## 2026-07-23 component-health addendum

- Split the 15,094-line multi-layer SFC into an independently compiled scoped stylesheet, causal-brush contract,
  direct-SQL node-data projection, chart-model builder, and node-agent monitoring composable. The remaining SFC is
  7,663 lines; further UI/controller decomposition remains part of T042.
- Every delayed UI callback is registered and cancelled on unmount. Chart resize now has one stable listener, and all
  document mouse/click listeners are removed even when a panel is closed during drag.
- Node visual-effect failures are visible. A later empty effect frame now restores the original label, color, opacity,
  alert, and badge instead of leaving stale server-owned presentation on the graph.
- Brush event normalization covers direct areas, batch areas, selected areas, 1D/2D coordinate ranges, pixel ranges,
  object ranges, invalid data, and reverse dragging. Node data projection rejects invalid date-looking strings and
  preserves array/object row mappings.
- Direct production `console` calls were replaced by the common logger: verbose state/body traces are development-only;
  warnings and errors retain the production observability path.
- Type-check, domain contract parsers, 306-source architecture rules, production build, and the 1920×1080 ontology /
  observability browser regression passed. `ontology-workflow-1920x1080.png` was inspected after external scoped-style
  compilation and retained the original layout and visual result.

## 2026-07-23 generation-progress responsibility addendum

- Moved pipeline stage definitions, weights, progress/chunk projection, completion/failure transitions, and display
  messages from `MultiLayerOntologyViewer.vue` into `composables/useOntologyGenerationProgress.ts`.
- Preserved and contract-tested the existing BPMN dynamic stage, Merge 100% → 50%, Refinement 100% → 100%, progress
  clamping, Unified detail projection, layer totals, terminal completion, and in-progress failure behavior.
- Replaced the viewer's duplicate timeout registry with the shared lifecycle-owned `useManagedTimeouts` implementation
  while retaining independent concurrent callbacks through unique keys.
- The SFC is now 7,471 lines. Type-check, domain contract parsers, 318-source architecture rules, and the 1920×1080
  ontology / observability browser regression passed.

## 2026-07-23 ObjectType list failure addendum

- `ObjectTypeModeler` previously logged a failed `/ontology/object-types` request and then rendered the same empty-list
  UI used by a successful `{ objectTypes: [] }` response.
- The list now exposes a retryable error without discarding an already loaded list. A first-load failure no longer
  displays `ObjectType이 없습니다`.
- The delayed relationship-dialog handoff after ObjectType creation now uses the shared lifecycle-owned timeout
  manager, so it cannot reopen UI after the modeler unmounts.
- ObjectType-to-canvas table/column/Behavior/drag projection and related-type collection now live in the pure
  `model/objectTypeProjection.ts` boundary. Double-click and drag reuse the same projection instead of maintaining two
  payload builders; create/edit Behavior dialogs reuse the same relationship collector.
- Contract tests pin the type fallback, description/nullability fields, Behavior identity, drag payload, unrelated
  edge exclusion, missing ObjectType exclusion, and backend relationship-name precedence.
- The 1920×1080 browser contract returns ObjectType 503, verifies the distinct error state, clicks retry, returns one
  `Order` type, and verifies exactly two requests with no runtime errors. Evidence:
  `object-type-failure-1920x1080.png`, `object-type-retry-1920x1080.png`.

## SQL-backed instance creation addendum

- SQL-backed instance creation is now one Ontology application operation shared by the Text2SQL result modal and the
  Ontology instance panel. The operation owns the optional Materialized View → required bulk-create sequence and its
  partial-success result instead of duplicating the policy in two UI components.
- Materialized View failure no longer disappears behind a success-only message. The instance panel retains its
  successful result and renders a separate status warning; its normal delayed close is lifecycle-owned and is skipped
  for partial success so the warning remains readable.
- Type-check, domain contract parsers, 336-source architecture validation, and the full 1920×1080 Text2SQL history →
  Ontology instance browser path passed. Evidence: `text2sql-ontology-instance-1920x1080.png`.

## Hidden Ontology workflow and instance-canvas addendum

- The preserved hidden feature id `ontology` now has a browser contract covering app navigation → schema application →
  visible VueFlow node click → instance panel → Entity query → Text2SQL `/ask` → instance adoption → optional MV 503 →
  required bulk-create success.
- That path exposed a real broken wire: `InstancePanel.vue` rendered `<EntityQueryPanel>` without importing it, so Vue
  treated the intended panel as an unresolved custom element. The local component dependency is now explicit.
- All three SQL-backed instance-creation consumers use the same application policy. The Entity query surface retains
  the successful result and exposes the MV warning while sending `materialized_view: null` to bulk create.
- The same rendered evidence exposed overlapping instance cards: layout used a 60px step although the card could exceed
  120px. `model/instanceCanvasLayout.ts` now owns fixed card dimensions, 12px gaps, parent-centered grid projection,
  row spacing, and the existing 20-instance display limit. The UI card uses the same fixed width.
- Type-check, domain contract parsers, 337-source architecture validation, and
  `verify-ontology-observability-ui.mjs` passed. The inspected 1920×1080 evidence
  `ontology-entity-query-partial-success-1920x1080.png` shows two non-overlapping, equally sized instance cards and
  separate success/warning states.

## Saved ontology library responsibility addendum

- `MultiLayerOntologyViewer.vue` previously owned saved-schema filtering, recent ordering, node-count normalization,
  and sorting inline. A failed `/ontology/schemas` request was logged and then rendered as the same
  `저장된 온톨로지가 없습니다` state as a successful empty response.
- `domains/ontology/model/schemaLibrary.ts` now owns the pure projection. It preserves recent-schema order, sorts the
  remaining entries by valid update time, defaults a missing node count to zero, excludes entries that explicitly lack
  usable schema data, reports the excluded count, does not mutate the backend response, and selects only a recent ID
  that still exists in the projected list.
- The dropdown keeps a previously loaded list across refresh failure, distinguishes initial failure from a successful
  empty list, exposes a retry action, and shows damaged-entry exclusion as a separate non-blocking warning. Entries
  that cannot be loaded are no longer rendered as disabled/dead cards.
- The trigger publishes its expanded/busy state. Schema names are native buttons with visible focus, and keyboard
  selection performs the same activate → detail-load request sequence as pointer selection. Error, warning, focus,
  list, and metadata presentation is defined for both dark and light modes.
- `test-domain-contract-parsers.mjs` passed the recent/missing/duplicate/invalid-date/default-count/input-immutability
  cases. Full `npm.cmd run type-check` passed, and `check-architecture.mjs` passed across 341 TypeScript/Vue sources.
- `verify-ontology-observability-ui.mjs` used explicit 503 → retry fixtures because this slice tests deterministic
  failure semantics without mutating a real ontology. It verified that failure is not an empty state, the third request
  restores one valid entry while excluding one damaged entry, Enter selection sends exactly one activation and one
  detail request, and no page error occurs.
- Inspected 1920×1080 evidence:
  `ontology-library-failure-1920x1080.png`, `ontology-library-retry-1920x1080.png`. The dropdown remains within the
  header/canvas bounds, with distinct readable failure and partial-warning surfaces.

## Node datasource catalog responsibility addendum

- Backend source `uengine-oss/robo-data-text2sql` revision
  `25ab12a8b9129b99fa3e83519214e71e12962a9d`, `app/routers/meta.py`, confirms that
  `/meta/datasources`, datasource schemas/tables, and `/meta/objecttypes` are Text2SQL-owned metadata capabilities.
  `/meta/objecttypes` requires an actual MindsDB datasource even though the current backend query only echoes that
  value instead of filtering with it.
- The viewer previously used one `selectedDatasource` for natural-language search, physical-table selection, and the
  UI-only `__ontology__` option. It sent that sentinel to `/meta/objecttypes`, discarded the datasource while
  confirming the ObjectType, and therefore left later Direct SQL without its required datasource.
- `workflows/ontology/composables/useNodeDataSourceCatalog.ts` now owns datasource → schema → table/ObjectType loading,
  physical/ObjectType table projection, search/manual/ObjectType selections, stage-specific failures, retry, filtering,
  single-datasource auto-selection, and request-generation protection against stale responses.
- Natural-language search datasource, manual source kind, and ObjectType execution datasource are independent.
  ObjectType selection with multiple datasources requires an explicit execution choice. The actual value is sent to
  `/meta/objecttypes` and preserved in `candidate.datasource` and the node's `dataSourceSchema.datasource`; the UI
  sentinel cannot reach the backend.
- Datasource/schema/table/ObjectType failures are no longer logged and rendered as successful empty lists. The
  datasource error is visible from either tab, later-stage errors remain in the manual tab, and each exposes a retry
  action without inventing fallback data.
- Layer nodes and manual table/ObjectType entries are native buttons with `aria-pressed` and visible focus. The browser
  contract selects both with Enter and confirms the same payload as pointer input.
- `npm.cmd run type-check`, domain contract parsers, and the 342-source architecture contract passed. Unit contracts
  cover failure→retry, single-datasource selection, physical/ObjectType projections, sentinel exclusion, filtering,
  and late-response rejection.
- `verify-ontology-observability-ui.mjs` passed the actual component flow: saved schema → keyboard node selection →
  datasource-list 503 → retry → manual ObjectType → explicit `warehouse` datasource → keyboard selection → confirm.
  It observed exactly one `/meta/objecttypes?datasource=warehouse` request and a confirmation containing
  `table_name: mv_order`, `datasource: warehouse`, and `materializedView: mv_order`.
- Inspected 1920×1080 evidence:
  `ontology-node-datasource-failure-1920x1080.png`,
  `ontology-node-datasource-objecttype-1920x1080.png`. The error/retry row, three selection controls, ObjectType card,
  and footer remain inside the dialog without clipping or overlap.

## Saved ontology lifecycle responsibility addendum

- The current Ontology client boundary exposes `PATCH /ontology/schemas/{id}`, `DELETE /ontology/schemas/{id}`,
  `POST /ontology/schemas/{id}/activate`, and `GET /ontology/schemas/{id}`. The viewer previously called these inline,
  used `alert` as its only failure state, closed rename editing after failure, allowed Enter/blur duplicate submission,
  and wrote recent history before activation or detail retrieval succeeded.
- `domains/ontology/application/useOntologySchemaLifecycle.ts` now owns validation, mutual operation exclusion,
  pending schema IDs, stage-specific errors, response `success` checks, and retry state. Its discriminated result keeps
  the UI from treating ignored, failed, and successful requests as the same outcome.
- Schema-name PATCH moved from the broad `objectExplorerApi` into the schema CRUD client as `updateSchemaName`;
  consumers use the Ontology public boundary and the old misplaced method has no compatibility alias.
- Load order is now `activate → detail → viewer application → recent-history commit`. An activation failure leaves the
  prior viewer untouched. If activation succeeds but detail fails, the error explicitly reports that partial state and
  retry resumes at detail without repeating the activation mutation.
- Rename failure keeps the attempted value and edit control visible. Successful rename updates the loaded title,
  refreshes the authoritative library, and cannot be submitted again by the blur generated when the input closes.
- Delete failure keeps the named confirmation dialog and retry action. Successful deletion first removes the item from
  the retained local list, clears recent/selected history and the active canvas, then refreshes the list. A subsequent
  list-refresh failure therefore cannot resurrect the deleted entry or relabel the successful delete as failed.
- Pending controls publish busy/disabled state; rename, load, delete, partial-success, and success messages are inline
  live states rather than alerts. Dark/light error, info, success, disabled, and focus presentation share the existing
  dropdown/dialog geometry.
- `test-domain-contract-parsers.mjs` covers duplicate rename, blank validation, `success:false` delete, delete retry,
  activation failure/retry, and activation-success/detail-failure resume. `npm.cmd run type-check` passed and the
  architecture contract passed across 343 TypeScript/Vue sources. `npm.cmd run build` then passed with 4,779
  transformed modules and the federation remote artifact.
- `verify-ontology-observability-ui.mjs` passed one actual browser sequence with deterministic 503 fixtures:
  keyboard load → detail failure → detail-only retry → recent-history commit → rename failure/value preservation →
  rename retry without Enter/blur duplication → active-schema delete failure → delete retry → canvas/history clear.
- Inspected 1920×1080 evidence:
  `ontology-schema-detail-failure-1920x1080.png`,
  `ontology-schema-rename-failure-1920x1080.png`,
  `ontology-schema-delete-failure-1920x1080.png`,
  `ontology-schema-delete-success-1920x1080.png`. The dropdown states and confirmation remain readable without header,
  canvas, or footer overlap.
- Ports 9000 and 8002 were not listening during this verification, so real-backend rename/delete mutations remain
  explicitly unverified under T052. The browser fixture proves frontend request ordering, state transitions, payloads,
  retry counts, and rendered behavior; it is not reported as a live-backend success test.

## Ontology extraction schema selector responsibility addendum

- `domains/ontology/ui/extraction/SchemaSelector.vue` previously rebuilt list, activate, detail, and delete sequencing
  around the schema client. An initial list failure cleared the array and rendered the same surface as an authoritative
  empty response; activation success followed by detail failure was hidden; delete used the browser confirmation UI
  and had no pending or retry state.
- The selector now reuses the domain-owned `useOntologySchemaLifecycle`. A selection reaches the parent extraction
  store only after activation and detail both succeed. Activation-success/detail-failure keeps the prior store state,
  reports the partial state, and resumes at detail without repeating the activation mutation.
- Active status is captured before delete starts. A successful active-schema deletion removes the retained local
  entry and resets the extraction store even if later list state changes. A failed deletion remains in a named modal
  with the schema name, pending protection, and a retry action.
- List loading and failure remain selector-owned because they are query state rather than a schema mutation. A failed
  refresh preserves a prior list, an initial failure is distinct from an empty response, and retry restores the
  authoritative list without fabricated fallback data.
- Selection and deletion are separate native buttons rather than a clickable row with a nested action. The trigger
  and controls publish expanded, busy, current, disabled, live-error, focus, Escape, and modal-label state. The
  document listener is removed on unmount.
- Browser verification exposed an additional event-lifecycle defect: after a retry button initiated state replacement,
  the detached event target no longer had a `.schema-selector` ancestor and the document handler closed the dropdown.
  Outside-click detection now uses the component root and the event composed path, so the completed retry event remains
  internal even after its original button is removed.
- `npm.cmd run type-check`, domain contract parsers, and the architecture contract across 343 TypeScript/Vue sources
  passed. `verify-ontology-observability-ui.mjs` then passed list 503→retry, keyboard selection, activate success/detail
  503→detail-only retry, prior-store preservation, delete 503→retry, active-store reset, request counts, and zero page
  errors. `npm.cmd run build` passed with 4,779 transformed modules and the federation remote artifact.
- Inspected 1920×1080 evidence:
  `ontology-schema-selector-list-failure-1920x1080.png`,
  `ontology-schema-selector-detail-failure-1920x1080.png`,
  `ontology-schema-selector-delete-failure-1920x1080.png`,
  `ontology-schema-selector-delete-success-1920x1080.png`. The dropdown and modal remain readable without header,
  canvas, or footer overlap; the list-failure capture explicitly waits for the dropdown transition to finish.
- The Ontology service ports were still unavailable, so these deterministic fixtures prove frontend state, request
  order, retry counts, accessibility, and rendered behavior only. They do not close the real-backend T052 obligation.

## Ontology extraction wizard schema discovery addendum

- `OntologyWizard.vue` previously implemented another schema-list query independently from the toolbar selector. It
  cleared the list and logged when `/ontology/schemas` failed, making an outage indistinguishable from no saved
  ontology. Selecting a card fetched detail directly, skipped backend activation, had no pending/error/retry state,
  used a clickable `div`, and silently logged detail failures.
- `domains/ontology/application/useOntologySchemaLibrary.ts` now owns reusable list loading, previous-list and active-ID
  retention, duplicate refresh exclusion, local removal, and damaged-entry projection for both the Wizard and
  `SchemaSelector`. The API boundary parses the required response object, schema array, item identity, optional field
  types, and active ID before either UI consumes it.
- The shared query uses `model/schemaLibrary.ts`, so entries without usable schema JSON are excluded and counted instead
  of becoming dead selection controls. The model retains version and description metadata needed by the Wizard while
  preserving the existing recent-order behavior used by the larger ontology library.
- Wizard selection now reuses `useOntologySchemaLifecycle`: `activate → detail → store application → binding`. An
  activation or detail failure leaves the store and step untouched. Retry after activation failure repeats activation;
  the lifecycle already guarantees that activation-success/detail-failure resumes at detail only.
- Saved schema cards are native buttons with current/busy/disabled/focus state. List and selection failures are visible
  live states with retry. While a schema operation is pending, file, text, example, and generation controls cannot
  start a competing workflow. The unused `schema-selected` emit, the `OntologyTab` render log, and its permanently
  hidden debug DOM were removed.
- Visual inspection found a real follow-up defect: a long mixed Korean/English backend message consumed the error
  flex row's minimum width and pushed the retry control out of the captured surface. The message now owns a shrinkable,
  anywhere-wrapping flex item; the retry control remains visible. Error/warning colors use theme variables rather than
  hard-coded dark-theme foregrounds.
- Runtime contracts cover valid and malformed list responses, optional numeric validation, successful refresh followed
  by failure with list/active retention, active entry removal, and duplicate refresh suppression. `npm.cmd run
  type-check`, domain contract parsers, and the architecture contract across 344 TypeScript/Vue sources passed.
- The 1920×1080 browser path passed Wizard list 503→retry, exact keyboard card selection, activation 503→retry, zero
  store mutation before complete load, exactly two activation requests and one detail request, final binding commit,
  and then all existing selector/delete/SQL-instance scenarios with zero page errors. `npm.cmd run build` passed with
  4,780 transformed modules and the federation remote artifact.
- Inspected evidence:
  `ontology-wizard-list-failure-1920x1080.png`,
  `ontology-wizard-selection-failure-1920x1080.png`. Both failure and retry controls remain readable above the saved
  cards and new-ontology inputs without overlap.
- The live Ontology service remained unavailable, so deterministic browser fixtures prove frontend request order,
  state commits, retries, keyboard behavior, and rendering only. This slice does not close T052.

## Ontology wizard unreachable binding step addendum

- Reachability inspection found that `OntologyTab` replaces `OntologyWizard` with the canvas whenever a schema exists
  and `wizard.step === 'binding'`. Consequently, the Wizard's internal Step 3 template could never render: both saved
  schema selection and generated-schema confirmation unmounted it at the exact transition that its `v-if` required.
- The unreachable surface claimed “data source mapping complete,” “data source search,” Materialized View creation,
  CDC monitoring, and “monitoring start.” Its handlers called no backend API; they only logged, opened a browser
  confirmation, toggled a local checkbox, and contained a future-implementation comment. This was dead fake behavior,
  not a working feature to preserve.
- The unreachable template, local MV state, icon import, handlers, and Step 3-only styles were removed. No speculative
  auto-mapping algorithm or nonexistent monitoring-start capability was added. Real explicit datasource discovery and
  `PUT /ontology/nodes/{id}/datasource` binding remain owned by the mounted canvas `InstancePanel` and Ontology store.
- `check-architecture.mjs` now rejects reintroduction of the placeholder handlers, browser confirmation, or dead
  `.step-bind` markup in `OntologyWizard.vue`.
- The browser contract waits for a fully loaded schema, confirms the Wizard unmounts, and confirms the actual
  `.ontology-content` canvas becomes visible before continuing the existing selector, delete, node-query, and instance
  flows. Type-check, the 344-source architecture contract, the 1920×1080 regression, and production build all passed;
  the build transformed 4,780 modules and emitted the federation remote artifact.

## Ontology InstancePanel datasource binding addendum

- The mounted `InstancePanel` is the real owner of the explicit node binding path already exposed by the Ontology
  client: catalog `GET /ontology/datasources`, binding `PUT /ontology/nodes/{id}/datasource`, instance
  `GET /ontology/nodes/{id}/instances?limit=...`, and unbinding DELETE on the same node datasource resource. No
  speculative auto-mapping or monitoring capability was introduced.
- The previous panel caught a catalog failure, logged it, replaced it with `[]`, and rendered the same empty state as
  a successful empty catalog. It also retained a string-table compatibility branch although the API declared objects,
  discarded the schema part of table identity, ignored the store's bind/unbind failure result, and did not expose
  instance load failure even though the store recorded one.
- The API boundary now runtime-validates `{ tables: [{ schema, name, description? }] }` and the complete instance
  response identity, count, column, and row structure before either result reaches UI state.
  `useOntologyDataSourceCatalog` owns loading, visible error, previous-list retention, explicit retry, and concurrent
  refresh exclusion. Same-name `public.orders` and `archive.orders` remain separate selectable records.
- Binding sends both `{ dataSource, schema }`. The store actions throw on transport or missing-node failure and mutate
  the local node only after success. DELETE failure preserves binding and loaded instances; successful DELETE clears
  the selected node's instance data and error. The visible limit is passed to the request instead of silently using
  the API default.
- Instance loads use request generations. A response from an older node or limit cannot overwrite the latest request,
  and selection/reset/unbind invalidates an outstanding load. Instance failure is a retryable alert distinct from a
  successful zero-row response. Direct self-imports through the Ontology public barrel and console-only instance
  failure handling were removed.
- Table selection and retry/bind/unbind controls are native controls with pressed, busy, disabled, focus, and live-error
  state. The instance limit and refresh control have explicit accessible names. The architecture contract prevents
  reintroduction of string compatibility, implicit DOM-event forwarding to `loadData`, console-only handling, and the
  Ontology state self-barrel import.
- Runtime/domain contracts passed valid/malformed catalog parsing, successful refresh followed by retained failure,
  duplicate refresh suppression, schema-qualified duplicate names, and late instance response rejection. The full
  type-check and the architecture contract across 345 TypeScript/Vue sources passed.
- The 1920×1080 browser path passed catalog 503→retry, keyboard selection of `archive.orders`, binding 503→retry with
  store preservation and `{ dataSource: "orders", schema: "archive" }`, instance 503→retry, visible limit requests
  `20→10`, DELETE 503→retry with data preservation, and final clearing only after success. The existing Entity-query
  partial-success and schema-selector flows continued with zero page errors.
- Inspected evidence:
  `ontology-instance-catalog-failure-1920x1080.png`,
  `ontology-instance-bind-failure-1920x1080.png`,
  `ontology-instance-data-failure-1920x1080.png`, and
  `ontology-instance-unbind-failure-1920x1080.png`. Error/retry rows, same-name table choices, data controls, entity
  results, and instance cards remain readable without clipping or overlap.
- `npm.cmd run build` passed with 4,781 transformed modules and the federation remote artifact. The live Ontology
  service remained unavailable, so deterministic fixtures prove frontend contracts and rendering but do not close
  T052.

## Ontology SQL instance workflow ownership addendum

- `InstancePanel.vue` was still a 1,500-line Ontology domain component that directly imported Text2SQL, Data Fabric,
  and Object Explorer responsibilities. Besides the node binding/table surface, it owned a full embedded Text2SQL
  modal, the selected Data Fabric datasource, MV creation, bulk instance adoption, result-to-canvas projection, and a
  second natural-language query panel. This contradicted the backend ownership rule even though the UI worked.
- `EntityQueryPanel.vue` moved from `domains/ontology/ui/extraction` to `workflows/ontology/ui` with no re-export shim.
  The embedded search/adoption surface is now the workflow-owned `SqlInstanceExplorerModal.vue`. Both consume
  Text2SQL, Data Fabric, and Ontology through their public boundaries.
- The domain `InstancePanel` now owns only Ontology node metadata, datasource catalog/binding, instance retrieval, and
  table rendering. It emits a semantic `open-instance-explorer` event and exposes a query slot with a no-argument
  refresh callback. `OntologyTab` composes the workflow query panel in the same right-panel location and owns modal
  open/close state. The panel fell from 1,500 to 1,013 lines without removing visible features.
- Existing Entity-query behavior remained green: the natural-language `/ask` request, generated SQL, column mapping,
  optional MV 503, required bulk success, canvas instance projection, success plus warning, and bound-instance refresh
  all still execute from the original panel location.
- The AI explorer browser contract now opens the real embedded `Text2SqlTab`, observes its auto-executed `/react`
  request with `Order(주문)에 해당하는 모든 데이터를 조회해줘` and datasource `shopmall`, adopts the two-row result,
  cancels and reopens mapping, then verifies MV partial failure and a second bulk-create payload with the same schema,
  node, source question, and `materialized_view: null`. Escape closes the labeled native dialog.
- The modal close action is disabled only while the required creation is pending; controls have explicit labels,
  dialog semantics, busy state, and visible error/success/warning surfaces. The architecture contract rejects
  Text2SQL/Data Fabric imports or cross-domain components returning to `InstancePanel`, and asserts the old domain
  `EntityQueryPanel` path is absent.
- Full type-check, the architecture contract across 346 TypeScript/Vue sources, the extended 1920×1080 browser flow,
  and `npm.cmd run build` passed. The build transformed 4,784 modules and emitted the federation remote artifact.
- Inspected evidence: `ontology-sql-instance-explorer-partial-success-1920x1080.png`. The embedded result, input,
  mappings, success, MV warning, cancel, and create controls remain readable inside the modal without clipping or
  overlap. The live services remained unavailable, so this deterministic workflow proof does not close T052.

## DB schema Ontology generation workflow ownership addendum

- `SchemaBasedGenerator.vue` moved from the Ontology domain UI to `workflows/ontology/ui` because it composes
  Text2SQL metadata discovery with the Ontology `generate-from-schema` capability. The old domain export and path are
  absent; the workflow viewer imports the local workflow component directly.
- Text2SQL datasource and schema responses are handled as their declared `string[]` contract. The former string/object
  compatibility branch, invented datasource type, and fake zero table count were removed. Datasource and schema
  loading now distinguish failure from a successful empty list, expose retry controls, and invalidate late schema
  responses after datasource changes or back navigation.
- The Ontology API boundary runtime-validates generation success, optional error, nonnegative result counts, and any
  returned schema. The workflow commits to the Ontology store and emits completion only when the response contains an
  actual valid schema; a schema-less `success: true` response remains a visible retryable failure and leaves the store
  unchanged.
- Datasource/schema cards and navigation/actions use native controls with explicit labels, focus, disabled, and live
  failure state. The outer document-generation footer is rendered only in document mode, so Schema mode has one
  cancel/generate action row instead of duplicate controls.
- Visual inspection of the first successful generated schema exposed a second issue: Cose's animated layout performed
  a final automatic fit after the initial viewport adjustment, enlarging one 60px node until it filled most of the
  canvas. The shared viewport fit now runs on `layoutstop` and caps zoom only when the graph has one node. Multi-node
  fitting retains its previous behavior.
- Domain parser tests cover valid generation data and malformed counts/schema. Full type-check, the architecture
  contract across 346 TypeScript/Vue sources, and the 1920×1080 browser flow all passed. The browser exercised
  datasource 503→retry, keyboard datasource selection, schema 503→retry, keyboard schema selection, schema-less
  success→retry, final payload preservation, store commit, and zero page errors. It also asserts that the document
  footer is absent in Schema mode.
- Inspected evidence:
  `ontology-schema-generation-datasource-failure-1920x1080.png`,
  `ontology-schema-generation-schema-failure-1920x1080.png`,
  `ontology-schema-generation-response-failure-1920x1080.png`, and
  `ontology-schema-generation-success-1920x1080.png`. The failure states remain readable with one action row, and the
  successful single node is centered at its normal usable scale.
- `npm.cmd run build` passed with 4,784 transformed modules and the federation remote artifact. The live services
  remained unavailable, so deterministic frontend contract/rendering proof does not close T052.

## ObjectType creation workflow ownership and partial-failure addendum

- `CreateObjectTypeDialog.vue` moved from `domains/ontology/ui/modeling` to `workflows/ontology/ui` because it composes
  Text2SQL query adoption, Data Fabric datasource selection, Ontology ObjectType creation, and Ontology relationship
  creation. The old domain file/export is absent and `ObjectTypeModeler` imports the workflow component locally.
- `workflows/ontology/application/objectTypeCreation.ts` now owns manual/query request construction and the ordered
  primary-create → relationship-create sequence. Required columns are validated before transport. Match strategies and
  cardinalities use explicit backend unions; the workflow narrows only the subset its UI can create.
- The Ontology API boundary runtime-validates ObjectType list/core fields, optional chart configuration and Behaviors,
  plus AI name suggestions. It no longer spreads an unknown record and asserts it as `ObjectTypeInfo`. Relationship
  query parameters are serialized field by field instead of using a double type assertion.
- Primary ObjectType success and relationship success are not conflated. If a relationship POST fails after the
  ObjectType POST succeeds, the dialog keeps the real primary result, removes the primary create action, lists the
  failed relationship, and retries only that relationship. The user may explicitly complete without the relationship;
  closing after primary success still refreshes the parent list.
- ObjectType catalog, Data Fabric catalog, and AI-name failures are visible and retryable instead of being logged or
  represented as successful empty state. Catalog choices and collapsible controls are native controls with explicit
  dialog, busy, expanded, focus, and live-region semantics.
- The browser contract drove the actual flow: open creation → natural-language mode → relationship catalog 503 →
  retry → keyboard-select `Customer` → Text2SQL result → configure → primary ObjectType success → relationship 503.
  It asserted one primary POST, no primary action after success, the exact ObjectType/relationship payloads, retry of
  only the failed relationship, refreshed `Order` in the list, and zero page errors.
- Direct SQL datasource detection/precedence and stream row/column aggregation moved into
  `application/objectTypeDirectSql.ts`. Pure contracts cover explicit selection, SQL detection, store selection,
  single-datasource fallback, duplicate removal, result/error/empty streams, and exact row projection. The browser
  drove SQL 503→retry, verified `shopmall` detection and both transport payloads, adopted two returned columns, and
  created `DirectOrder` with the unchanged query.
- The first Direct SQL failure capture exposed a separate shared-state defect: a prior Data Fabric table failure was
  displayed as a datasource-list `Internal Server Error` beside the owning Text2SQL failure. Data Fabric operation
  states are now isolated; the recaptured `object-type-direct-sql-failure-1920x1080.png` contains only the owning
  Text2SQL error and retry action. `object-type-direct-sql-result-1920x1080.png` shows the two real result columns and
  preserved SQL without overlap.
- Visual inspection initially found the catalog error row vertically clipped even though the browser assertions
  passed. The cause was flex shrinking of the relationship section combined with its clipping boundary. The relation
  section now preserves content height while embedded Text2SQL owns the remaining space. Re-running and inspecting
  `object-type-create-catalog-failure-1920x1080.png`,
  `object-type-relationship-partial-failure-1920x1080.png`, and
  `object-type-relationship-retry-success-1920x1080.png` confirmed readable errors/actions and no dialog/footer overlap.
- Full type-check, domain contract parsers, the architecture contract across 348 TypeScript/Vue sources, the extended
  1920×1080 browser suite, and `npm.cmd run build` passed. The build transformed 4,786 modules and emitted the
  federation remote artifact. The live Ontology service remained unavailable, so deterministic frontend
  contract/rendering proof does not close T052.

## MultiLayer graph action and mutation lifecycle addendum

- Local node/relationship deletion identity, messages, connected-edge projection, and immutable results moved to
  `model/localGraphMutation.ts`. Detail, context-menu, and relation-editor deletion now share `ActionDialog`; a
  confirmed node delete writes one undo snapshot and removes its Cytoscape node/edges, while Escape leaves the graph
  unchanged and restores trigger focus.
- Relation field validation and datasource-column reconciliation moved to `model/relationFieldMapping.ts`. Validation
  remains inline without clearing the current draft. Missing ObjectType column metadata is explicitly “unverified”,
  not a verified empty schema, so datasource confirmation no longer destroys an existing field mapping; confirmed
  nonempty columns still remove invalid and consequently unpaired fields.
- Measure nodes without a datasource can now reach their Data tab and ObjectType action. The dialog freezes the node
  request snapshot, keeps HTTP failure in place for exact retry, commits datasource only after a validated
  `objectTypeName`, and reports a later node-data refresh failure as a separate warning without repeating creation.
- Ontology schema save now crosses `parseSaveOntologySchemaResponse`, requires `success: true` and a nonempty ID, and
  carries the runtime session headers through the Ontology API boundary. The header operation stack distinguishes
  validation, HTTP failure, exact graph retry, success, and ObjectType refresh warning without native alerts.
- The first 1920×1080 capture revealed a real sparse-graph viewport defect: automatic `fit()` magnified two 60px nodes
  to roughly 230px, clipped the lower node, and collided with the legend. `model/graphViewport.ts` now caps automatic
  fit zoom at 1.5 while leaving manual zoom independent. The recaptured graph is centered at a readable scale with no
  node/legend overlap.
- Pure contracts cover node/relationship deletion, input immutability, one-step connected-edge removal, field draft
  preservation, unverified-versus-verified column reconciliation, and viewport zoom limits. The browser drove
  relation inline validation, relation delete Escape and retry target, node delete Escape and undo, ObjectType
  503→same-payload retry→success plus refresh 503, and schema save 503→same-payload retry→success. It verified session
  headers, restored relationship presence in the saved graph, zero page errors, and no 390px document overflow.
- Inspected evidence:
  `ontology-local-graph-mutation-lifecycle-1920x1080.png` and
  `ontology-local-graph-action-390x844.png`. Desktop graph proportions, operation states, and mobile dialog geometry
  are readable and fully inside their viewports.
- `npm.cmd run type-check`, the local graph/field-mapping contract, the architecture contract across 384
  TypeScript/Vue sources, the extended browser suite, and `npm.cmd run build` passed. The build transformed 4,845
  modules and emitted `remoteEntry.js`. The live Ontology service remained unavailable, so deterministic frontend
  request/response and rendering evidence does not close T052.

## MultiLayer datasource mutation lifecycle addendum

- `/ontology/confirm-datasource` now crosses `parseDatasourceConfirmationResponse`; HTTP 200 with missing or false
  success is rejected before mapping status, node datasource, Cytoscape class, or relation mapping changes.
  `commitDataSourceMapping` no longer catches the failure and returns as if successful.
- `application/datasourceConfirmation.ts` freezes node/candidate payloads, selects only unconfirmed mappings for a
  bulk action, and projects succeeded nodes separately from failed retry targets. Candidate arrays and sample rows are
  cloned, so a dialog-open snapshot cannot change underneath a pending or retrying operation.
- Auto-link stream failure remains in the owning dialog with retry instead of becoming an empty mapping result or
  native alert. Natural-language node search likewise keeps its error and exact query/datasource retry rather than
  clearing the message on a timer.
- Candidate confirmation owns per-node pending/error and exact retry. The node datasource dialog freezes its target,
  stays open on failure, disables conflicting close while pending, and closes only after validated success. Column
  metadata absence remains a separate warning and never becomes an inferred empty schema.
- Bulk confirmation uses the shared `ActionDialog`. Escape sends zero requests. After one of two candidates succeeds,
  the dialog reports the partial result, removes the successful node from its retry set, and sends only the failed
  node on retry. Success and field-reconciliation warnings remain visible outside the dialog.
- The extended browser fixture drove auto-link 503→retry, candidate 503→same payload retry, bulk Escape→zero requests,
  Driver success plus Resource 503→Resource-only retry, node search 503→same query retry, and manual ObjectType
  confirmation 503→same frozen payload retry. All confirmation requests carried the runtime language/API-key headers
  and the page emitted zero runtime errors.
- Inspected evidence:
  `ontology-datasource-auto-link-failure-1920x1080.png`,
  `ontology-datasource-bulk-partial-failure-1920x1080.png`,
  `ontology-node-datasource-confirmation-failure-1920x1080.png`, and
  `ontology-datasource-bulk-confirm-390x844.png`. Error/retry controls, partial-success wording, selected candidate,
  and mobile confirmation actions are readable without clipping or document overflow.
- Full type-check, response/parser contracts, target/projection contracts, the architecture contract across 385
  TypeScript/Vue sources, the extended browser suite, and `npm.cmd run build` passed. The build transformed 4,846
  modules and emitted `remoteEntry.js`. The live Ontology service remained unavailable, so deterministic frontend
  contract/rendering evidence does not close T052.

## MultiLayer document generation and dead-overlay addendum

- PDF selection validation is now owned by the generation dialog. A non-PDF selection is rejected without committing
  `uploadedFile`, the file input is reset, and a persistent inline `role="alert"` message explains the accepted type.
  Selecting a valid PDF clears that error and replaces the input in the same dialog.
- Generation transport/stream failure continues to use the existing visible result and retry state. The component no
  longer opens a native alert in parallel, and its dialog now exposes an accessible label, modal semantics, busy
  state, and a labeled close control.
- The former model-overlay selectors, Cytoscape event branch, state, delete path, and transient-element exceptions had
  no activation control, state producer, or data-loading path. They were removed instead of retaining an unreachable
  compatibility branch or inventing a producer. Normal graph-node handling now targets the graph elements that are
  actually created.
- The architecture contract verifies zero native `alert`/`confirm` calls and zero model-overlay identifiers across
  `MultiLayerOntologyViewer`, while requiring the inline file-validation state. The extended browser suite selected
  `not-a-pdf.txt`, verified the alert and absence of a committed file, selected `ontology-fixture.pdf`, verified that
  the error cleared, and closed the dialog through its labeled control with zero page errors.
- Inspected evidence: `ontology-document-pdf-validation-1920x1080.png`. The inline error, upload surface, terminology
  selection, and action footer are readable without clipping or overlap; the dialog remains fully inside the desktop
  viewport.
- `npm.cmd run type-check`, the architecture contract across 385 TypeScript/Vue sources, the extended Ontology
  browser suite, and `npm.cmd run build` passed. The build transformed 4,846 modules and emitted `remoteEntry.js`.
  The live Ontology service remained unavailable, so deterministic frontend contract/rendering evidence does not
  close T052.

## MultiLayer managed panel-resize addendum

- Detail width and What-If height no longer maintain two copies of drag coordinates, flags, document listeners, and
  body-style cleanup inside the viewer. `shared/composables/useResizablePanel.ts` owns bounded projection and one
  pointer lifecycle; the viewer now supplies only initial value, limits, axis, direction, and cursor.
- Pointer completion commits the projected size. Pointer cancellation and Escape restore the drag-start size. Every
  path, including scope disposal, detaches move/up/cancel/keydown listeners and restores the exact pre-drag body
  cursor and selection styles.
- Both handles now expose accessible separator labels, orientation, minimum, maximum, and current values. Arrow keys
  resize by a deterministic step, Home and double-click restore the configured default, focus is visible, and pointer
  behavior remains available with touch-action isolation.
- Pure contracts cover in-range, lower, and upper clamp behavior plus negative-axis width/height projection. The
  architecture contract requires the shared composable and separator semantics while rejecting the former duplicate
  state names and raw move/up/cancel listeners in the viewer.
- The extended browser suite drove detail ArrowLeft→Home, pointer drag→Escape, exact body-style restoration, and
  What-If ArrowUp→Home. It reported zero page errors. Inspected evidence:
  `ontology-managed-panel-resize-1920x1080.png`; the focused separator, graph, legend, node detail, and 366px What-If
  panel remain readable without clipping or overlap, while the unavailable What-If API is shown as a real retryable
  failure rather than hidden.
- Full type-check, panel projection/local graph contracts, the architecture contract across 386 TypeScript/Vue
  sources, the extended Ontology browser suite, and `npm.cmd run build` passed. The build transformed 4,847 modules
  and emitted `remoteEntry.js`. The live Ontology service remained unavailable, so deterministic frontend
  contract/rendering evidence does not close T052.

## MultiLayer causal-analysis lifecycle addendum

- Brush selection/request construction, progress reduction, report-chunk accumulation, metric/range policy, and
  incoming-network highlight projection moved to `application/causalAnalysisLifecycle.ts`.
  `composables/useCausalAnalysis.ts` now owns the frozen schema/node/brush target, AbortController, request sequence,
  partial warning, retry state, and report reveal timer. The viewer only starts ECharts brush interaction, switches
  tabs, and projects the current highlight into Cytoscape.
- Incoming-network responses now cross a runtime parser. Both network and analysis API calls accept the owning
  AbortSignal. HTTP failure uses the shared HTTP error contract instead of trying to parse a FastAPI `detail` body as
  a successful analysis result, and the NDJSON reader is terminated after its final result.
- Incoming-network failure is a visible partial warning and does not suppress the analysis request. Transport/parser
  failure, backend `success: false` result, explicit user cancellation, and complete result are separate states.
  Cancel aborts the active fetch, clears the stale graph highlight, preserves the brush selection, and exposes an
  exact retry. Node/schema reset and scope disposal also abort and increment the sequence, so an abort-ignoring late
  response cannot overwrite the new context.
- The presentational result panel removed its producer-less `analysis-complete` event and now emits only explicit
  cancel/retry actions. The chart header exposes a labeled, focusable `aria-pressed` brush-mode control instead of
  requiring interaction with ECharts canvas toolbox icons. Detail tabs remain single-line and use local horizontal
  overflow when more tabs exist, preventing the observed `데이터` label wrap at the default 440px width.
- `test-ontology-causal-analysis.mjs` covers incoming-network parsing, request shape, chunk accumulation, highlight
  dedupe, range/metric selection, late-result rejection after reset, exact retry, AbortSignal cancellation with
  selection preservation, and partial network failure followed by result success.
- The extended browser suite clicked the real brush-mode button, dragged the rendered chart, and sent three identical
  analysis payloads with runtime language/API-key headers. It verified one network 503 partial warning, one
  requestfailed cancellation, one transport 503 retaining `Causal analysis fixture outage`, and one streamed
  progress/report/result success. Request range, `sales` metric, `max_lag: 7`, result, and graph highlight all matched.
- Inspected evidence:
  `ontology-causal-analysis-partial-warning-1920x1080.png`,
  `ontology-causal-analysis-cancelled-1920x1080.png`,
  `ontology-causal-analysis-failure-1920x1080.png`, and
  `ontology-causal-analysis-lifecycle-1920x1080.png`. Warning, cancel/retry, failure/retry, 82% result, tab labels,
  graph highlight, legend, and panel geometry remain readable without clipping or overlap.
- Full type-check, causal lifecycle/runtime contracts, the architecture contract across 388 TypeScript/Vue sources,
  the extended Ontology browser suite, and `npm.cmd run build` passed. The build transformed 4,849 modules and emitted
  `remoteEntry.js`. The live Ontology service remained unavailable, so deterministic frontend contract/rendering
  evidence does not close T052.

## MultiLayer node-filter lifecycle addendum

- Ontology-only schema/node/relationship/filter/generation types moved from `shared/types` to
  `domains/ontology/model/schema.ts`; all domain internals and workflow consumers now use the owning domain boundary.
  A structure rule prevents those contracts from returning to shared.
- `application/ontologyFilterProjection.ts` owns nested node→field direct filters and rebuilds effective/cascading
  state from direct input plus relationship field mappings on every change. Direct values win over derived values;
  competing derived values are explicit conflicts; cycles terminate without mutating inputs; node IDs containing
  dots no longer depend on lossy flat-key parsing.
- `useOntologyNodeFilters.ts` owns the dialog draft, commit/cancel/reset, distinct-value target snapshot,
  AbortController, request sequence, late-response rejection, and exact retry. Closing/backdrop/Escape discards the
  draft without a data request. Confirmation commits once and triggers one node-data reload; clear-all reloads once
  without `filter_*`.
- `/ontology-nodes/{id}/filter-values` now carries runtime headers and an AbortSignal and crosses
  `parseOntologyNodeFilterValues`. Malformed 200 responses are failures rather than empty choices. The public backend
  source for date/range query representation is unavailable, so those controls are visibly disabled instead of
  accepting values that never reach the query.
- The layer-node context menu is reachable by right-click from the native node button and its actions are native
  menuitem buttons. The filter editor is a named modal with labeled controls, Escape, explicit cancel/confirm, visible
  distinct retry, and a labeled close control.
- Pure contracts cover normalization, `0`/`false`, input immutability, bidirectional cascade, cycles, direct conflict
  precedence, stale-state rebuild, dotted node IDs, malformed distinct values, draft cancellation, target switching,
  abort, late response, frozen retry columns, and confirmation.
- The 1920×1080 browser flow drove distinct 503→same URL retry, runtime headers, disabled date/range reasons,
  cancel→zero data requests, confirm→one `filter_region=east` request and direct chip, then clear→one filter-free
  request and chip removal. The 390×844 flow asserted viewport-contained geometry and document horizontal overflow 0.
  The same run completed all existing Ontology schema, datasource, node-data, causal, graph-mutation, and instance
  workflows with zero page errors.
- Inspected evidence:
  `ontology-node-filter-contract-1920x1080.png`,
  `ontology-node-filter-lifecycle-1920x1080.png`, and
  `ontology-node-filter-390x844.png`. Dialog fields, disabled reasons, footer actions, applied chip, graph, detail
  panel, and mobile surface are readable without overlap or clipping.
- `npm.cmd run type-check`, domain parsers, node-data and filter contracts, the 393-source architecture contract,
  the extended Ontology browser suite, and `npm.cmd run build` passed. The production build transformed 4,853
  modules and emitted the federation remote. The public Domain Layer source and live dataset are unavailable, so
  deterministic request/rendering evidence does not close T052.
