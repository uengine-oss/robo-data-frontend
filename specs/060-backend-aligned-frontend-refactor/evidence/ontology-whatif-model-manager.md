# Ontology What-If model manager evidence

## Backend contract source

- Read-only source: `uengine-oss/robo-insight-domain-layer`
- Inspected commit: `11de76785213296dd1dda06d182c2c78b8054efa`
- `app/routers/whatif.py`
  - `GET /model-status/{schema_id}` returns `success`, `schema_id`, `models_count`, `models`.
  - `GET /models/{schema_id}` returns the same model-list envelope.
  - `DELETE /models/{schema_id}/{model_id}` returns `success`, `model_id`.
- `app/services/schema_store.py`
  - model rows use `modelId`, `status`, optional model metadata, `inputs`, and `outputs`.
  - duplicate/null relationship projections are reconciled before the router returns them.

The frontend now validates the returned schema identity, model identity, model count, model fields, explicit delete
success, and returned delete target. The backend repository was not modified.

## Refactored ownership

- `domains/ontology/api/whatIfModeling.ts`
  - runtime list/delete parsers
  - request/response identity checks
  - list/delete `AbortSignal`
- `domains/ontology/application/modelManagerPolicy.ts`
  - safe metrics projection
  - immutable single/all delete snapshots
  - partial-result projection
- `domains/ontology/application/useWhatIfModelManager.ts`
  - schema-aware read cancellation and stale-response rejection
  - same-schema refresh error with prior-list preservation
  - operation-specific delete state and failed-target-only retry
  - abort/dispose cleanup
- `domains/ontology/ui/extraction/whatif/StepModelManager.vue`
  - presentational rows, native keyboard expansion, visible malformed-metrics warning
  - shared `ActionDialog`
  - no raw API, native dialog, or template-time JSON parsing
- `domains/ontology/ui/extraction/whatif/WhatIfPanel.vue`
  - narrow step navigation keeps horizontal labels in an internal scroll strip
  - active step is revealed after step/viewport changes
  - `ResizeObserver` is disconnected at scope end

## Verification

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-ontology-model-manager.mjs`
  - passed parser, metrics, input invariance, stale schema, refresh preservation, partial delete, failed-only retry,
    and late delete rejection.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - passed across 397 TypeScript/Vue sources.
- `npm run type-check`
  - passed.
- `verify-ontology-model-manager-ui.mjs`
  - initial model list
  - malformed metrics keyboard expansion
  - list 503 with old list preserved and exact retry
  - single delete Escape, 503, identical-target retry
  - all delete partial success and failed-target-only retry
  - runtime headers, focus restoration, 390×844 dialog/row/step-strip geometry, page-error zero
  - passed.
- Existing `verify-ontology-observability-ui.mjs`
  - all 46 scenarios passed.
- Existing `verify-agents-md-editor-ui.mjs`
  - passed.
- `npm run build`
  - type-check and production build passed; 4,857 modules transformed.
- `check-build-boundaries.mjs`
  - passed; lazy remote boundary remained valid.
- Scoped `git diff --check`
  - passed.

## Visual evidence

- `ontology-model-manager-list-390x844.png`
- `ontology-model-manager-390x844.png`
- `ontology-model-manager-lifecycle-1920x1080.png`

The screenshots were inspected directly. The first mobile capture exposed vertical step labels; the final capture
shows horizontal labels, the active model-management step inside the visible strip, contained model rows, and no
document horizontal overflow.

## Remaining integration scope

The browser contract deterministically intercepts the real backend paths and response schemas. A live model registry
with Neo4j/MindsDB data was not available in this environment, so live service integration remains under T052 rather
than being claimed as complete here.
