# Schema tree disclosure identity evidence

## Root cause and change

- Schema Canvas keyed schema expansion state by schema name alone. Consequently, `warehouse.sales` and
  `lakehouse.sales` shared one disclosure state and could not be expanded independently.
- Datasource and schema headers were click-handled `div` elements, so their disclosure semantics and keyboard
  behavior were implicit.
- Schema expansion now uses a datasource-qualified composite key. Datasource/schema headers are native buttons
  with deterministic `aria-controls`, `aria-expanded`, accessible labels, and visible keyboard focus.
- The tree starts from its existing default-expanded behavior instead of hard-coded demo datasource/schema names.
- Existing table drag payloads, canvas selection/removal, Catalog loading, semantic search, column loading, and
  retry ownership remain unchanged.

## Browser and contract verification

`node specs/060-backend-aligned-frontend-refactor/contracts/verify-schema-catalog-discovery-ui.mjs`

- Passed with two same-name schemas: `warehouse.sales.orders` and `lakehouse.sales.customers`.
- Space collapsed only `warehouse.sales`; `lakehouse.sales.customers` remained visible.
- Enter reopened the warehouse schema without changing the lakehouse branch.
- Enter collapsed the warehouse datasource while the lakehouse datasource remained visible; Space reopened it.
- Existing table-list failure/retry, semantic-search retry, malformed table drop rejection, column failure with a
  frozen target, and exact column retry all remained operational.
- The 1440×900 capture `schema-tree-disclosure-identity-1440x900.png` was inspected directly. Both independent
  branches, their tables, and the focused disclosure are visible with no apparent overlap or horizontal overflow.

`node specs/060-backend-aligned-frontend-refactor/contracts/test-schema-canvas-drop.mjs`

- Passed the existing Schema Canvas drop contract.

## Static, type, and build gates

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - Passed across 425 TypeScript/Vue source files.
  - Rejects restored click-handled datasource/schema `div` headers, schema-name-only expansion identity, or missing
    disclosure controls.
- `npm.cmd run type-check`: passed.
- `npm.cmd run build`: passed; 4,885 modules transformed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`: passed.
  - Remote asset: `__federation_expose_Remote-app-DdRtcRgx.js`
  - Remote bytes: 2,753,769
  - UploadTab, GraphTab, and Cytoscape remain outside the entry boundary.
- `git diff --check`: passed with only existing line-ending conversion warnings.

## Protected work

This slice did not edit `package.json`, spec 057/059 graph work, `panelGraphProjection.ts`,
`src/features/code-analysis/components/graph/*`, or `tsconfig.panel-projection.json`.
