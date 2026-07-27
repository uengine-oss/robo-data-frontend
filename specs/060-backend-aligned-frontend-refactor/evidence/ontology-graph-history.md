# Ontology local graph history evidence

## Refactored ownership

- `workflows/ontology/model/graphHistory.ts`
  - deep node/relationship snapshots without JSON serialization or reactive-proxy failures
  - nested array/object/date cloning with reference isolation
  - bounded stack append and Ctrl/Cmd+Z/Y/Shift+Z action projection
  - form and contenteditable target exclusion
- `workflows/ontology/composables/useOntologyGraphHistory.ts`
  - maximum-50 undo and redo stacks
  - mutation checkpoint and branch-change redo invalidation
  - empty-stack no-op, schema-transition clear, and one renderer callback per successful restore
  - native editable undo preservation
- `workflows/ontology/ui/MultiLayerOntologyViewer.vue`
  - mutation sites retain the same pre-change checkpoint calls
  - Viewer no longer owns history types, stacks, JSON clone, undo/redo algorithms, or shortcut branching
  - loaded schema changes clear both stacks through one lifecycle method

This is a local graph editing concern and does not change or call a backend route.

## Verification

- `test-ontology-graph-history.mjs`
  - passed nested snapshot immutability, maximum-size eviction, invalid limit rejection, all shortcut mappings,
    empty-stack no-op, undo/redo restore, branch redo invalidation, clear, renderer call count, and editable exclusion.
- Extended `verify-ontology-observability-ui.mjs`
  - local relationship and node delete confirmations still preserve frozen targets.
  - node delete was exercised through Ctrl+Z restore, Ctrl+Shift+Z redo, Ctrl+Z restore, Ctrl+Y redo, and final
    Ctrl+Z restore against actual Vue/Cytoscape UI.
  - Ctrl+Z inside the node-name input performed native text undo while the graph node and editor stayed mounted.
  - all 46 Ontology/Observability scenarios passed with zero browser runtime errors.
- `check-architecture.mjs`
  - passed across 403 TypeScript/Vue sources and prevents history stacks/algorithms from returning to the Viewer.
- `npm run type-check`
  - passed.
- `npm run build`
  - type-check and production build passed; 4,863 modules transformed.
- `check-build-boundaries.mjs`
  - passed; remote asset `__federation_expose_Remote-app-DRhKltin.js` was 2,724,088 bytes.

## Visual evidence

- `ontology-local-graph-mutation-lifecycle-1920x1080.png`
- `ontology-local-graph-action-390x844.png`

The existing visual evidence remains valid because this slice changes local state ownership and keyboard behavior,
not the graph or dialog presentation.
