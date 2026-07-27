# Ontology What-If simulation evidence

## Backend contract source

- Read-only source: `uengine-oss/robo-insight-domain-layer`
- Inspected commit: `11de76785213296dd1dda06d182c2c78b8054efa`
- `app/routers/whatif.py`
  - `POST /snapshot` returns the committed date, available dates, flat and node-grouped snapshots, timeseries,
    field descriptions, and applied filters.
  - `POST /simulate` returns the schema/scenario identity, interventions, traces, timeline, baseline/final state,
    deltas, execution time, and propagation wave count.
  - `POST /scenarios` returns the saved profile identity, schema, interventions, timestamps, prior result, and
    output fields.
- `app/services/simulation_engine.py`
  - `SimulationResult.to_dict()` is the authority for the snake-case simulation response fields.

The frontend validates these runtime envelopes and the returned schema identity. The backend repository was not
modified.

## Refactored ownership

- `domains/ontology/api/whatIfModeling.ts`
  - strict snapshot/simulation/profile response parsers
  - request/response schema identity checks
  - `AbortSignal` support for all three operations
- `domains/ontology/application/simulationPolicy.ts`
  - immutable changed-variable and intervention projection
  - frozen simulation/profile request snapshots
  - trace/timeline deduplication and delta-table projection
- `domains/ontology/application/useWhatIfSimulation.ts`
  - schema/filter/date cancellation and stale-response rejection
  - last-valid snapshot/date/draft preservation after failed date loads
  - operation-specific snapshot/simulation/profile state
  - reactive failed targets and exact frozen retry
  - managed profile-success lifetime and scope cleanup
- `domains/ontology/ui/extraction/whatif/StepSimulation.vue`
  - presentational date, snapshot, simulation, result, and profile UI
  - no direct API, raw timer, native dialog, template cast, or dead animation state
  - labeled/disabled fields, visible operation errors, and explicit same-request retry
  - narrow cards/actions/forms and an internally scrolling result table

## Verification

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-ontology-simulation.mjs`
  - passed malformed snapshot/simulation/profile parsing, request immutability, invalid intervention keys,
    failed-date preservation, exact simulation/profile retry, schema abort, and late-response rejection.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - passed across 399 TypeScript/Vue sources.
- `npm run type-check`
  - passed.
- `verify-ontology-simulation-ui.mjs`
  - date 503 preserves the prior date and edited value, then exact retry commits the requested snapshot
  - simulate 503 and profile 503 repeat byte-equivalent JSON payloads
  - profile success is committed only after the validated response
  - runtime session headers, page-error zero, and 390×844 containment passed
- Existing `test-ontology-model-manager.mjs` and `verify-ontology-model-manager-ui.mjs`
  - passed after the shared What-If API change.
- Existing `verify-ontology-observability-ui.mjs`
  - all 46 scenarios passed.
  - its pointer-resize check now waits for the existing 0.1-second panel-width transition to settle before
    measuring the 4-pixel handle; product resize code was unchanged.
- `npm run build`
  - type-check and production build passed; 4,859 modules transformed.
- `check-build-boundaries.mjs`
  - passed; remote asset `__federation_expose_Remote-app-DwZPYDU5.js` was 2,718,900 bytes.
- Scoped `git diff --check`
  - passed.

## Visual evidence

- `ontology-simulation-lifecycle-1920x1080.png`
- `ontology-simulation-390x844.png`
- `ontology-simulation-profile-390x844.png`

The screenshots were inspected directly. Desktop preserves the existing canvas and bottom-panel composition. On
390×844, the What-If step strip remains contained, the summary table scrolls inside its card, and the profile fields,
status, and 44-pixel actions stay within the panel without document horizontal overflow.

## Remaining integration scope

The browser contract intercepts the real backend paths with responses shaped from the inspected backend source.
A live schema with Neo4j data, trained MindsDB models, and persisted scenario storage was not available, so live
service success remains under T052 and is not claimed by this evidence.
