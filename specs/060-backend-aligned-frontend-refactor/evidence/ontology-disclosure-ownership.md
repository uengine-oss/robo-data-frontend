# Ontology disclosure ownership evidence

## Responsibility and behavior

- `ObjectChartPanel` owns only chart-section expansion. Its complete section header is no longer a click target;
  a native toggle button now exposes the matching content through `aria-expanded` and `aria-controls`.
- The chart configuration gear and `configure-chart` emit had no consumer. They were removed instead of retaining
  a dead control or compatibility event. ObjectType chart configuration remains owned by the ObjectType modeler.
- Document-generation logs use a native disclosure button while the real generation request is pending.
- Each datasource candidate uses a native detail toggle. Preview and confirmation remain separate sibling actions,
  so expanding a candidate cannot accidentally preview or mutate it.
- Expanded candidate details opt out of flex shrinking. The bounded mapping list, rather than an individual
  candidate body, owns vertical overflow.

## Browser evidence

`node specs/060-backend-aligned-frontend-refactor/contracts/verify-object-chart-disclosure-ui.mjs`

- Passed at 1280x720 against gateway-shaped ObjectType and object-data responses.
- Verified Space collapse, Enter expansion, matching controlled content, absence of the dead configuration control,
  and zero document horizontal overflow.
- Capture: `object-chart-disclosure-1280x720.png`.

`node specs/060-backend-aligned-frontend-refactor/contracts/verify-ontology-observability-ui.mjs`

- Passed all 47 reported Ontology flows at 1920x1080, with its existing 390x844 boundary scenarios.
- During a delayed real document-generation request, Enter opened the log list and Space closed it while
  `aria-expanded` remained synchronized.
- Enter opened and Space closed the datasource candidate detail. The verifier requires at least 80px rendered
  height, rendered height to cover `scrollHeight`, and the detail to begin inside the mapping-list boundary.
- The same candidate then exercised the existing confirmation failure and exact retry path, proving that disclosure
  ownership did not change the mutation target or duplicate the request.
- Captures inspected directly:
  - `ontology-generation-log-disclosure-1920x1080.png`
  - `ontology-candidate-disclosure-1920x1080.png`

## Static, type, and build gates

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - Passed across 425 TypeScript/Vue source files.
  - Rejects non-native disclosure regressions and any reintroduced `configure-chart` control/event.
- `npm.cmd run type-check`: passed.
- `npm.cmd run build`: passed; 4,885 modules transformed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`: passed.
  - Remote asset: `__federation_expose_Remote-app-DN9T0tvW.js`
  - Remote bytes: 2,752,711
  - UploadTab, GraphTab, and the Cytoscape runtime remain outside the entry boundary.
- `git diff --check`: passed; only existing line-ending conversion warnings were reported.

## Protected work

This slice did not edit `package.json`, spec 057/059 graph work, `panelGraphProjection.ts`,
`src/features/code-analysis/components/graph/*`, or `tsconfig.panel-projection.json`.
