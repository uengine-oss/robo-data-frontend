# Agents.md context-group ownership evidence

## Root cause and ownership

- The connected-model header invoked `toggleBuiltinGroup('_models')`, but `_models` was not a built-in group and no
  connected-model expanded state existed. The click therefore had no result while the list remained permanently
  visible. The header is now a static group label.
- Built-in method groups already owned real `expanded` values. Their headers are now native disclosure buttons whose
  `aria-expanded` and `aria-controls` point to the conditional item list.
- ProcessGPT previously placed its add button inside a click-handled header. The group toggle and add action are now
  sibling native buttons, so adding a process cannot also change group expansion and no stop-propagation dependency
  remains.
- Content IDs are deterministic from the current node type and group key. Existing mention insertion and
  ProcessGPT mutation methods were not changed.

## Contract and browser verification

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-agents-md-editor.mjs`
  - Passed the existing Agents.md state and request contracts.
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-agents-md-editor-ui.mjs`
  - Passed against a real connected-model projection and the existing gateway-shaped Agents.md, context,
    Agent Scheduler, and Ontology Behavior responses.
  - Confirmed the connected model remains visible under a non-interactive group label.
  - Confirmed built-in Enter-open/Space-close and ProcessGPT Space-open/Enter-close with matching controlled content.
  - Re-ran ProcessGPT list failure/retry, Behavior creation failure/exact retry, mention insertion, dialog
    Escape/focus, and 390x844 containment.
  - Capture inspected directly: `ontology-agents-md-context-disclosures-1920x1080.png`.
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-ontology-observability-ui.mjs`
  - Passed all 47 reported Ontology flows without browser runtime errors.

## Static, type, and build gates

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - Passed across 425 TypeScript/Vue source files.
  - Rejects `_models` toggle restoration, click-handled subgroup header divs, nested ProcessGPT add handling,
    or missing expanded state.
- `npm.cmd run type-check`: passed.
- `npm.cmd run build`: passed; 4,885 modules transformed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`: passed.
  - Remote asset: `__federation_expose_Remote-app-CvuVxuPq.js`
  - Remote bytes: 2,752,711
  - UploadTab, GraphTab, and Cytoscape remain outside the entry boundary.
- `git diff --check`: passed with only existing line-ending conversion warnings.

## Protected work

This slice did not edit `package.json`, spec 057/059 graph work, `panelGraphProjection.ts`,
`src/features/code-analysis/components/graph/*`, or `tsconfig.panel-projection.json`.
