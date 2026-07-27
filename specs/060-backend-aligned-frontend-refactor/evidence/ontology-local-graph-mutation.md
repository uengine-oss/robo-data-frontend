# Ontology local graph mutation evidence

## Refactored ownership

- `workflows/ontology/model/localGraphMutation.ts`
  - deterministic node ID/default-name creation from explicit layer, position, and clock input
  - immutable node rename, layer/label change, and position projection
  - missing/self/directed-duplicate relationship draft rejection
  - immutable relationship draft commit and existing relationship edit with trimmed optional fields
  - explicit blank, invalid, missing, duplicate, unchanged, and changed outcomes
  - existing node/relationship delete target and immutable delete projection remain in the same owner
- `workflows/ontology/ui/MultiLayerOntologyViewer.vue`
  - coordinates history checkpoint, dialog draft, selection, and Cytoscape projection
  - edgehandles and context-menu creation both call `openNewRelationDraft`
  - relation drafts stay out of the graph array until confirmation
  - cancel removes only transient UI/Cytoscape state; confirmation checkpoints and commits once
  - node list clicks also complete the existing two-click relation workflow

This is local graph state. It sends no new backend request and does not change the saved Ontology payload schema.

## Contract verification

- `test-ontology-local-graph-mutation.mjs`
  - passed node ID/default-name/position creation and invalid/duplicate input handling
  - passed trimmed rename, blank/missing/unchanged rename, layer/label atomic change, and immutable position move
  - passed missing/self/directed-duplicate relationship rejection
  - passed relationship commit/edit trim, blank/not-found/no-op, and input immutability
  - retained all delete, relation field mapping, datasource confirmation, viewport, and panel-resize contracts
- `test-ontology-graph-history.mjs`
  - passed graph checkpoint, undo/redo, branch invalidation, and editable-target exclusion.
- `check-architecture.mjs`
  - passed across 403 TypeScript/Vue sources.
  - prevents direct node/relation `push` and indexed assignment from returning to the Viewer.
  - requires all local mutation policy consumers and prohibits `Date.now`, Vue, or Cytoscape inside the policy.
- `npm.cmd run type-check`
  - passed.

## Browser verification

The extended `verify-ontology-observability-ui.mjs` passed all 46 Ontology/Observability scenarios with no browser
runtime error. The same real Vue/Cytoscape page exercised:

1. node-name native input undo without graph-history interception;
2. trimmed node rename, Ctrl+Z restore, Ctrl+Y reapply, and final restore;
3. Measure→Driver layer move and Ctrl+Z restore;
4. context-menu relation draft cancellation with no graph relationship;
5. relation confirmation followed by Ctrl+Z, Ctrl+Y, and final restore;
6. canvas Process node creation followed by Ctrl+Z, Ctrl+Y, and final restore;
7. existing frozen relationship/node delete targets, field validation, graph save, API failure/retry, mobile geometry,
   node data, filters, causal analysis, and ObjectType workflows.

## Build and visual evidence

- `npm.cmd run build`
  - passed type-check and production build; 4,863 modules transformed.
- `check-build-boundaries.mjs`
  - passed with `__federation_expose_Remote-app-BXAuAtgS.js` at 2,724,088 bytes.
- `ontology-local-graph-mutation-1920x1080.png`
  - directly inspected: the committed `INFLUENCES` relation appears in both Cytoscape and the selected node's
    relationship list.
  - the header, layer panel, canvas, legend, and detail panel remain non-overlapping at 1920×1080.

No real backend integration is claimed by this slice; the browser uses route/method/header/payload/response fixtures
grounded in the existing Ontology contracts.
