# Independent What-if domain evidence

- Gateway responsibility: `/api/gateway/whatif/**` targets the independent What-if service on port 8005.
- Frontend boundary: `src/domains/whatif`.
- The old `src/features/whatif` boundary was removed and is rejected by the architecture contract.
- `/ttm/compare` and `/mindsdb/compare` are different capabilities, not aliases. The TTM response compares the
  ontology model with Granite TTM; the MindsDB response compares it with MindsDB AutoML.
- `application/compareModels.ts` owns their orchestration: it uses the TTM result when available, falls back to
  MindsDB only after an explicit TTM failure, records which service produced the result, and preserves both
  failures when neither service responds.
- TTM fields are no longer copied into MindsDB fields. The UI renders only models present in the successful
  response and shows a non-blocking warning when the fallback was used.
- The comparison screen no longer fabricates the exchange-rate/profit scenario, a linear-regression algorithm,
  `granite-timeseries-ttm-v1`, 80/20 train/test ratios, absent-model score zeroes, or cards for models that were
  not part of the response.
- TTM and MindsDB endpoint failures have capability-specific error contexts, so a failed TTM request is not
  presented as an outage of the whole What-If service while a MindsDB fallback is visible.
- `createWhatIfClient` now owns base URL, runtime headers, and fetch injection while preserving the public
  `whatifApi` singleton. All 18 JSON, FormData, GET, and DELETE methods carry the runtime `Accept-Language`,
  LLM, and `X-Neo4j-*` headers; FormData requests do not fabricate a multipart Content-Type.
- Comparison charts are destroyed on component teardown; the dead, unmounted R² chart and delayed chart timer
  were removed. Detail toggles are native keyboard-operable buttons with `aria-expanded`.
- Saved-session contracts now live in `model/session.ts` and `application/sessionRepository.ts`, not in the
  1,500-line simulator component or shared storage-key configuration. Stored JSON and every optional nested
  API result are parsed before use; one damaged session field is omitted with a warning instead of crashing or
  discarding every valid session.
- Restoring a session now resets fields absent from that session. The previous implementation retained another
  session's comparison or report. Auto-save now observes selected tables, SQL, comparison, and literacy results,
  so a result survives an immediate reload without requiring a later step transition.
- Storage read/write/quota failures and corrupt JSON are rendered in an accessible, dismissible warning stack
  instead of being written only to `console.error`. Session selection and workflow steps are native keyboard
  controls with pressed/current state semantics.
- Stale saved-session fields were corrected to the stored `discoveryResult.tables` and `causalResult.edges` contracts.
- Invalid Cytoscape selected-node shadow styling was removed; the working selected border remains.
- Dead model-selection and label-map code was removed.
- `DataLiteracy.vue` no longer contains fixed exchange-rate/demand/cost scenarios, frontend-generated forecasts,
  random metrics, local synthetic A/B profiles, or hard-coded decision recommendations.
- Actual `causalResult.edges` now feed a pure `model/explainability.ts` graph/path projection and a dedicated
  `CausalExplainabilityModal.vue`; negative direction is represented with a signed strength instead of being
  displayed as a positive value.
- The old Causal Discovery editor was removed because its edits were never sent to a backend and its “save”
  action stored the original session while announcing success. The remaining Neo4j action checks the service's
  `saved` flag before showing success.
- Comparison loading is now indeterminate and honest; the previous random percentage, fixed MySQL table names,
  fixed IBM model steps, and estimated completion time were not real service progress.
- The report language control is now passed to `/literacy/explain` instead of always sending Korean.
- Report markdown escapes server-provided HTML before applying the supported formatting subset, preventing the
  previous raw `v-html` injection path.
- All What-if API response types were moved out of the transport client to `model/contracts.ts`. Seventeen JSON
  response boundaries now use runtime parsers in `api/contracts.ts`, including nested causal edges, comparison
  charts, session, Neo4j, literacy, and health responses.
- Verification:
  - What-if explicit `any`: 0
  - What-if synthetic scenario/random progress/static simulation searches: 0
  - whole-project `npm run type-check`: passed
  - production `npm run build`: passed (4,753 modules)
  - domain contract parser tests: passed
  - application contract covers TTM success, TTM→MindsDB fallback, and dual failure: passed
  - client contract invoked all 18 API methods and checked method, path, JSON/FormData body, language header,
    and injected `X-Neo4j-Database`: passed
  - session repository contracts cover malformed JSON, storage denial, invalid entries, partially invalid nested
    data, normalized TTM result restoration, timestamp preservation, upsert ordering, and ten-session limit: passed
  - architecture contract passed across 338 TypeScript/Vue files
  - actual `POST /api/gateway/whatif/agent/analyze` returned 500
  - `verify-whatif-ui.mjs` confirmed the failure remains on the scenario step and is not rendered as success
  - the same 1920×1080 verifier restored a contract-valid session and confirmed actual edge labels/path projection,
    escaped report HTML, English request payload, graph modal rendering, and no browser page errors
  - the verifier also clicked the real comparison button, observed TTM 503 then MindsDB 200, checked both request
    payloads and runtime headers, the visible fallback warning, absent TTM card, real MindsDB metrics, and absence
    of fabricated defaults
  - the same browser flow reloaded immediately after comparison, restored the result, switched sessions by
    keyboard without stale comparison state, and surfaced corrupt local storage without page errors
  - screenshots: `whatif-actual-failure-1920x1080.png`, `whatif-contract-literacy-1920x1080.png`,
    `whatif-comparison-fallback-1920x1080.png`, `whatif-session-storage-warning-1920x1080.png`

No live What-if mutation completed because the service is unavailable.
