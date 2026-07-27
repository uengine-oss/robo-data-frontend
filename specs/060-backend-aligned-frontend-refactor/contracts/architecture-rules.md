# Frontend Architecture Contract

## Ownership

- `src/domains/<backend>` owns one backend's contracts, same-backend use cases, state, and UI.
- `src/workflows/<flow>` owns orchestration that intentionally crosses backend boundaries.
- `src/app` owns shell, registration, navigation, and host integration.
- `src/shared` owns only domain-independent infrastructure and UI.
- Text2SQL metadata and ReAct request/stream/response contracts belong to `domains/text2sql/model`, not `shared/types`.
- `shared/services/http.ts` owns only the Gateway root and transport primitives; each backend domain owns its service
  base URL and environment override.
- Gateway is transport infrastructure, never a domain group.
- Catalog TABLE relationships (`/robo/schema/relationships`) and Ontology ObjectType relationships
  (`/ontology/relationships`) are separate resources. Schema state must not merge or double-write them.
- Runtime request context and theme settings are independent from app navigation state.
- Domains and workflows navigate through a shared port contract; the app provides the implementation.
- Ontology schema/node/relationship/filter contracts belong to `domains/ontology/model`, not `shared/types`.
- MultiLayer Ontology node filtering is owned by `useOntologyNodeFilters` plus a pure projection. The viewer must not
  restore flat `activeFilters`, incremental cascade mutation, UI-owned distinct fetch, or projected-state assignment.
- Distinct filter values cross a runtime parser, carry runtime headers, and accept the workflow-owned AbortSignal.
- Date/range filter controls remain disabled with a visible contract reason until the producing backend request
  representation is verified.
- Object Explorer rows separate ObjectType selection from detail expansion as sibling native controls. Expanding a
  row must not emit selection or request object data; selecting it preserves the existing graph/chart request flow.
- Schema Canvas datasource/schema tree headers are native disclosures. Schema expansion state is keyed by the
  datasource+schema pair so same-name schemas in different datasource boundaries remain independent.
- Agents.md authoring is a cross-domain Ontology workflow because it composes Ontology Agents.md/context/Behavior
  contracts with Agent Scheduler ProcessGPT contracts. Ontology domain UI must not import Agent Scheduler.
- Agents.md responses cross runtime parsers. Read/rewrite requests accept workflow AbortSignals; editor mutation state
  is operation-specific, target-frozen, and committed only after validated backend success.
- Enabled-only edits are persisted independently from document dirtiness. Delete and dirty template reset use the
  shared action dialog; context/process-list failures remain visible and retryable rather than becoming empty state.
- The enabled control is a native button switch with `aria-checked`. ProcessGPT selection is teleported to the viewport
  so narrow detail panels cannot clip it. Auxiliary node metadata and delayed selection restoration must not remount an
  active detail editor or replace a user-selected tab.
- Agents.md built-in and ProcessGPT context groups use native disclosure buttons with matching expanded/controls state.
  The ProcessGPT add action is a sibling control. The always-visible connected-model group is a static label and must not
  call a synthetic `_models` toggle.

## Dependency Direction

```text
app → workflows → domain public entrypoints → shared
app → domain public entrypoints → shared
domain internal modules → same domain + shared
shared → external libraries only
```

Forbidden:

- domain A importing domain B internals
- shared importing a domain or workflow
- shared/domain/workflow importing an app implementation
- UI owning a backend base URL or raw fetch
- a workflow importing domain internal paths
- compatibility re-export from an old `src/features/*` path

## Behavior Preservation

Unless a defect is explicitly specified, refactoring MUST preserve:

- feature id, label, menu grouping, visibility, embedded availability
- API method, path, query, headers, body, response parsing
- streaming event order, cancellation, completion and error behavior
- Pinia state observable by UI and host
- component props, emits, interaction result and empty/error states
- standalone and Module Federation mount/unmount behavior

## Slice Gate

A domain move is incomplete until all producers and consumers use the new path, old paths and
aliases are zero, contract/strict type/build checks pass, adjacent tests pass, and actual service
and browser behavior is verified or explicitly recorded as unverified with evidence.

## OLAP Operation Ownership

- OLAP UI does not use native dialogs, raw timers, console-only failures, or native `EventSource`.
- Single-cube deletion never infers owned DW tables from a cube name or the unfiltered DW table list. The application
  deletion policy owns primary versus cleanup results, and only explicit all-cube deletion can request all DW tables.
- Cube, ETL, and Airflow `success` flags are checked before UI commit. Cube provisioning retains a same-input checkpoint
  so retry resumes at the failed step instead of repeating completed mutations.
- Cube list, selection, query, preview, and direct-sync state remain separate and sequence-protected.
- OLAP generation and execution streams use fetch-SSE with runtime headers and AbortController cancellation.
- Cube delete, full reload, and DAG redeploy use the OLAP alertdialog boundary; Pivot timers and stream handles are
  disposed with the component.
- Pivot ETL script generation, saved-script reads, frozen save retry, download generation, execution events, and
  cancellation belong to `domains/olap/composables/useEtlScriptLifecycle.ts`. The Vue UI owns no script API call,
  stream control, or duplicate script-operation ref.
- Script HTTP operations accept AbortSignal. The lifecycle rejects stale callbacks and Promise completions after a new
  request, cancellation, cube transition, editor close, or scope disposal while preserving the last valid saved script
  on refresh failure.

## Observability Mutation Ownership

- Agent Scheduler profiles and Text2SQL event rules keep their separate domain API owners; the Observability workflow
  may coordinate only their public boundaries.
- WatchAgent and EventDetection do not use native dialogs. Target-specific deletion state and exact retry live in the
  workflow action-dialog boundary.
- Backend mutation succeeds before local list state changes. A later list-refresh failure preserves the successful
  local delete/toggle commit and is shown as a separate refresh warning.
- Profile selection, toggle, and deletion are sibling native buttons rather than nested interactive controls.

## Shared Destructive Dialog

- Domain-independent destructive-action focus, Escape, pending/error, option, and mobile layout policy belongs to
  `shared/components/ActionDialog.vue`.
- Security, OLAP, and Observability pass their own action identity and mutation state to the shared primitive; they do
  not retain domain-specific copies or compatibility wrappers.

## Data Lineage Workflow Ownership

- `workflows/data-lineage` may coordinate only the public Catalog and OLAP boundaries. Backend response projection,
  deduplication, partial-source failure, and stale-load policy belong to workflow application code rather than Vue UI.
- Catalog lineage JSON is runtime-validated at the Catalog API boundary.
- The lineage detail panel uses the shared action dialog for a target-frozen OLAP DAG redeploy. It has no native
  dialog, raw timer, direct service URL, or success commit before a validated backend success response.
- Lineage graph viewport scheduling and transient success status use managed component lifetimes.

## Schema Modeling Catalog Ownership

- Schema Modeling uses a `datasource + schema + name` identity for nodes, caches, selection, and relationship
  projection. A backend response that omits enough identity fields is never assigned to the first same-named table.
- Catalog table-list, semantic-search, and canonical column-cache state belongs to
  `workflows/schema-modeling/composables/useSchemaCatalogDiscovery.ts`. The canvas store projects discovery into
  nodes and panels but owns no duplicate read refs, request controllers, or direct calls to those three APIs.
- Schema Modeling owns its table/column view types rather than borrowing Text2SQL UI contracts. Catalog read requests
  accept AbortSignal, preserve last valid list/search results on refresh failure, reject stale responses, dedupe
  same-identity column requests, and cache a successful empty column list.
- Schema canvas `application/json` drag intake belongs to
  `workflows/schema-modeling/application/schemaCanvasDrop.ts`. It accepts the existing wrapped table, direct table,
  and ObjectType payloads, validates table/column metadata, and reuses the public Ontology behavior runtime parser.
  SchemaCanvas owns only DataTransfer/position projection plus visible pending/error/frozen retry; malformed data never
  mutates the canvas or triggers fit, and raw `JSON.parse`/shape guessing does not return to the Vue file.
- Schema canvas multi-table add uses a frozen `schemaCanvasBatch` attempt and visible exact retry. Top-table append is
  a store-owned canvas transaction with rollback; all-table replacement loads every column and projects every grid
  node before a single commit. Full-view mode and viewport fit change only after a committed attempt.
- Schema canvas node metadata/defaults and deterministic full-grid positions belong to
  `model/schemaCanvasNodeProjection.ts`; the store and Vue UI must not maintain parallel node/grid literals.
- Schema canvas automatic and manual fit uses `model/schemaCanvasViewport.ts` to combine the existing numeric base
  padding with measured top controls, right legend/minimap, and bottom toolbar extents. Vue code measures DOM bounds
  and invokes Vue Flow only; no success-time fit may bypass this projection, and failed related loads do not fit.
- At 720px and below, Schema canvas table discovery is an overlay drawer rather than a fixed flex column. It owns an
  explicit trigger, focused close control, Escape/backdrop close and trigger-focus restoration. The closed drawer is
  visibility-hidden, the legend starts collapsed, the minimap is absent, and successful table add returns to canvas.
- What-If uses one `.workflow-scroll` element for workflow vertical scrolling and sticky-step state.
  `.workflow-content` only centers and constrains width; nested `.main-content` scroll owners are forbidden. Step and
  session transitions reset the owner after render, while keyed app feature remount resets re-entry without touching
  the independent SideNav scroll.
- At 768px and below, the What-If session sidebar leaves the workflow flex flow and becomes a default-closed overlay
  drawer. Its mobile trigger, focused close control, Escape/backdrop handling, `aria-hidden`, and trigger-focus
  restoration are presentation state only. Desktop 280px/50px collapse and session repository state remain
  independent; the obsolete parallel `showSessionPanel` state is forbidden.
- State-changing UI uses native controls: Text2SQL advanced settings is a button disclosure with
  `aria-expanded`/`aria-controls`; OLAP pivot row, column, and measure removal uses target-labelled buttons; Schema
  table and column description surfaces expose labelled edit buttons. Click-only `div`/`span` equivalents are
  forbidden, and native focus styling must not alter the underlying domain mutation.
- Code Analysis upload tabs separate tab activation from close as sibling native buttons and expose the active tab
  through selected state. Schema detail Behavior cards expose a labelled native edit hitbox. Schema Canvas table-node
  column reference and column expansion are native buttons, while each Behavior exposes always-discoverable sibling
  edit/run buttons; mouse-only double-click and hover-only actions are forbidden. Reference popups use pointer
  coordinates for pointer input, control bounds for keyboard synthetic clicks, and clamp both axes to the viewport.
- What-If table selection has one checkbox activation path and file intake has one native picker/drop owner. Invalid
  extensions are visible and non-mutating, the same local `File` remains available for exact retry after failure, and
  pre-success state is labelled selected rather than uploaded. OLAP dimension/measure drag sources preserve their
  JSON payload while exposing target-labelled native add buttons instead of mouse-only double-click. Security
  datasource/schema disclosures and permission-node selection are sibling native controls: disclosure owns only
  expanded/controls and selection owns only pressed/current detail state. Effective Security rules are projected
  root-to-leaf with the most-specific principal rule winning; inherited source metadata never replaces the actual
  access level shown to the user.
- Ontology disclosure ownership is explicit. Object chart sections own only their toggle; the previously unconsumed
  `configure-chart` control is forbidden because actual chart configuration belongs to ObjectType modeler.
  Generation logs use a button controlling the log-list ID; datasource candidate info exposes a labelled transparent
  detail button while preview/confirm remain sibling actions above its hit area. Each disclosure mirrors its actual
  conditional content through `aria-expanded` and `aria-controls`; whole-header click handlers are forbidden.
- MultiLayer Ontology layer groups are native disclosures and selected-node layer changes use a native dropdown
  disclosure plus pressed option controls. Behavior model reads own a frozen schema/node attempt, AbortController,
  stale-sequence rejection, visible pending/error/exact retry, new-target clearing, and same-target last-valid result
  preservation. A console-only model-list failure or successful empty-state projection is forbidden.
- MultiLayer Ontology canvas and edge context actions are native menu items. Selected-node relations expose a
  target-labelled edit button instead of mouse-only double-click. Generation PDF intake has one native picker/drop
  owner and resets the file input on removal so the same file remains selectable. Datasource mappings use native
  disclosures whose expanded/controls state matches their details, while node datasource results keep preview and
  pressed selection as sibling native actions rather than a whole-card click owner.
- Schema Canvas catalog/semantic sources and ObjectType Modeler cards preserve drag wrappers while native sibling
  controls own selection, add, removal, Behavior, edit, and delete. Mouse-only double-click and hover-only action
  discovery are forbidden. Saved-schema and selected-node name editing use their existing labelled edit buttons;
  their information/load surfaces do not also own redundant double-click editing.
- Catalog Schema API responses are runtime-validated. Description editing and semantic search explicitly map the
  configured key to the backend-required `X-API-Key` header.
- The UI does not expose fields the Catalog relationship API ignores, such as `matchStrategy`; destructive actions use
  the shared action dialog and delayed UI work uses managed component lifetimes.

## MultiLayer Ontology Graph Actions

- Local node creation, rename, layer/position changes, relationship draft/commit/edit, deletion targets, and immutable
  graph projection belong to `workflows/ontology/model/localGraphMutation.ts`; the policy receives its clock and has no
  Vue/Cytoscape dependency. The viewer only coordinates history checkpoints, dialog state, and Cytoscape projection.
- Edgehandles and context-menu relationship creation share one draft policy. Draft cancellation changes neither graph
  nor history; confirmation checkpoints and commits exactly once. No-op edits do not checkpoint or touch the renderer.
- Document generation input/PDF target creation belongs to `application/documentGeneration.ts`; glossary and stream
  request identities, abort/stale rejection, and frozen exact retry belong to `useOntologyDocumentGeneration.ts`.
  The Viewer projects validated progress/completion events and must not rebuild request bodies, own FileReader or
  AbortController instances, or swallow glossary failures as empty lists.
- Document generation uses the Ontology API's session-header-merging transport and AbortSignal. Catalog glossary reads
  are abortable and preserve the last successful list when refresh fails.
- Relation field validation and verified-column reconciliation belong to
  `workflows/ontology/model/relationFieldMapping.ts`; unavailable column metadata never erases an existing mapping.
- Automatic graph fitting uses the workflow viewport policy and never magnifies a sparse graph beyond its readable
  zoom cap; manual user zoom remains independent.
- Datasource confirmation target snapshots and partial bulk-result projection belong to
  `workflows/ontology/application/datasourceConfirmation.ts`. The API requires explicit backend success; node,
  candidate, and bulk confirmation keep pending/error/exact retry in their owning dialog and use no native dialogs.
- Auto-link progress/mapping, candidate expansion, confirmation pending/error, backend-success application retry,
  and bulk failed-target retry belong to `useOntologyDatasourceMapping.ts`. The Viewer supplies only node snapshots
  and the post-confirmation local graph projection callback; it does not call auto-link/confirmation APIs or mutate
  mapping records. Auto-link streams carry AbortSignal and reject stale events after close, retry, or scope disposal.
- Document generation, DB-schema generation, and library load use
  `application/ontologyCanvasSchema.ts` for cloned node/relationship projection, deterministic invalid/duplicate
  relationship sanitation, source-specific field normalization, schema identity/name, and graph summary. A new
  generation without an id clears the previous canvas identity; the Viewer does not retain a local sanitizer or
  source-specific node/relationship mapping loops.
- Cytoscape presentation selectors and style values belong to
  `workflows/ontology/model/ontologyCanvasStyles.ts`. The pure model receives the current dark/light theme and
  returns fresh node, edge, relationship-type, edgehandles, agent, causal, and filter style objects in stable order.
  The Viewer only applies that projection during canvas creation and theme refresh; it owns no style literals.
- Canonical MultiLayer layer metadata and Cytoscape node/edge projection belong to
  `workflows/ontology/model/ontologyGraphElements.ts`. Layer id, display metadata, color, and rank are declared once.
  The pure projection preserves complete finite node positions and the existing horizontal/upward/inverse relationship
  rules; only a graph where every node has a finite x/y position may bypass layout. The Viewer owns neither duplicated
  layer ranks nor renderer element-construction loops.
- Hierarchical topology and position calculation belongs to
  `workflows/ontology/model/ontologyHierarchicalLayout.ts`. The renderer-independent projection receives only current
  node id/layer and normalized source/target snapshots, reuses the canonical layer rank, and returns finite positions
  for normal, disconnected, cyclic, missing-endpoint, Driver-only, and unknown-layer graphs. The Viewer only snapshots
  Cytoscape, applies returned positions once, and fits the viewport.
- The MultiLayer viewer contains no native dialogs. PDF validation and generation errors remain inside the generation
  dialog, and producer-less model-overlay selectors, events, state, and deletion code do not return.
- Detail and What-If panel sizing uses the shared managed resize lifecycle. Pointer listeners are detached on
  completion, cancellation, and scope disposal; Escape restores the drag-start size, and both separators expose
  keyboard sizing plus their current bounds through accessible separator semantics.
- The MultiLayer shell has an explicit narrow-screen layout: header actions stay in a contained wrapping grid, the
  layer panel overlays the canvas, node/relation detail fills the viewer content with a labeled close control, and
  the desktop detail resize separator is not exposed on mobile.
- Ontology What-If model management uses runtime-validated model/delete contracts, a pure metrics/deletion policy,
  and a schema-aware lifecycle. Its UI contains no native dialogs or template-time JSON parsing; destructive actions
  use the shared action dialog and bulk retries target only models that actually failed. The narrow What-If header
  keeps step labels horizontal inside its own scroll strip instead of compressing them into vertical text, and keeps
  the active step visible after step or viewport changes with a disposed resize observer.
- Ontology What-If simulation uses runtime-validated snapshot/simulate/profile contracts, pure request projections,
  and operation-specific abortable lifecycles. The Vue step owns no domain API, raw timer, dead animation state, or
  untyped filter; failed date loads preserve the last valid snapshot and retries reuse frozen simulation/profile
  targets. Narrow result tables scroll inside their own container rather than widening the document.
- Ontology Behavior authoring keeps draft validation, payload and prompt projection outside Vue UI. Generation,
  save, external test, and delete own separate abortable stale-safe state and frozen retry targets. Operator-supplied
  external endpoints never receive ROBO session headers, and destructive confirmation uses the shared action dialog.
- MultiLayer local graph history uses an isolated deep-snapshot lifecycle with bounded undo/redo stacks, branch
  invalidation, schema-transition clearing, and one renderer synchronization per restore. Graph shortcuts never
  intercept native undo inside form or contenteditable controls.
- Causal brush selection, request snapshots, progress/report accumulation, partial network warning, abort,
  late-response rejection, retry, and terminal state belong to `useCausalAnalysis` and its pure application policy.
  The viewer only projects the current highlight into Cytoscape and coordinates chart/tab interaction.
- Incoming causal networks are runtime-validated and both network and analysis requests carry an AbortSignal.
  The result panel is presentational: it emits explicit cancel/retry actions and contains no dead completion event.
- Context-menu, node-detail, and relationship-editor deletion use the shared action dialog. Field mapping validation is
  inline and preserves the editor draft.
- Measure ObjectType creation and Neo4j save expose pending/error/success as operation-specific UI state and never commit
  success before the owning backend mutation succeeds.
- Ontology schema save carries the runtime session headers and crosses a strict success/id response parser before the
  viewer updates the current schema identity or reports success.
- Selection-result layout does not own mouse-only activation. Schema Behavior attempts and table/column reference
  results use native buttons with explicit selected state where applicable; Ontology child selection is owned by
  labelled native checkboxes, including a filtered-scope select-all control. Existing keyboard-capable table/tree
  row patterns are not rewritten solely for visual uniformity.
- Transient reveal/status/context actions use native controls. Scope Browser reuses the shared action dialog, exposes
  keyboard menu semantics and cancels a toast timer on explicit dismissal; Text2SQL hidden-message reveal is a native
  button. Domain UI must not restore duplicate alertdialog markup for the same lifecycle.
