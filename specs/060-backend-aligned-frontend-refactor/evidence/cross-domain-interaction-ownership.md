# Cross-domain interaction ownership evidence

## What-If data selection and file retry

- The table card was a click-handled `div` containing a checkbox whose click propagation had to be stopped. It is now
  a label with one native checkbox activation path, so card, checkbox, Enter, and Space cannot double-toggle state.
- Existing table selection still projects `SELECT * FROM <table> LIMIT 1000` through the same selected-table state.
- The file drop target is now a native button. It supports keyboard picker activation, resets the input before opening
  so the same local file can be selected again, rejects non-CSV/XLSX drops visibly without issuing a request, and
  preserves the exact selected `File` for a failure retry.
- Pre-success state says `선택된 파일`; it no longer presents a failed request as an uploaded file.

The browser contract rejected `scenario.txt` with zero upload requests, uploaded `scenario.csv`, received a 503,
kept the selected file and retry action, then sent the same file name and contents exactly once more. The validated
200 response advanced to the existing Ontology Discovery step.

## OLAP field add and drag preservation

- Dimension and measure wrappers remain HTML drag sources with the original JSON payloads.
- Each wrapper now contains a target-labelled native add button instead of depending on mouse-only double-click.
- Enter added `Time / Month` to rows; repeating Enter kept one row through the existing store de-duplication.
- Space added `Revenue` as a measure. The existing labelled native remove button still removed the dimension with
  Space.
- The browser observed the exact prior drag payloads:
  - `{"type":"dimension","dimension":"Time","level":"Month"}`
  - `{"type":"measure","name":"Revenue"}`

## Security tree and cascade correctness

- Datasource/schema disclosure and node selection are sibling native buttons. Disclosure owns only
  `aria-expanded`/`aria-controls`; selection owns only `aria-pressed` and the permission detail projection.
- Table selection is a labelled native button. Enter/Space disclosure changes issued zero backend requests and did
  not select nodes; selection did not alter disclosure state.
- Effective rules now project root-to-leaf and overwrite the same principal with the most-specific rule.
  `warehouse/sales` `none` correctly overrides `warehouse` `read` for `warehouse/sales/orders`.
- Inherited projection preserves both the real `접근 불가` level and `warehouse/sales` source instead of replacing
  every level with a synthetic `inherited` value.
- Direct inspection of `native-security-permission-tree-390x844.png` found the inherited level chip compressed into
  vertical single characters. The row now wraps the source onto its own line and keeps the level chip unbroken; the
  recaptured 390×844 screen has no document horizontal overflow.

## Browser and visual evidence

`node specs/060-backend-aligned-frontend-refactor/contracts/verify-native-interaction-ui.mjs`

- Passed ten focused flows at 1280×720 and 390×844.
- Captures inspected directly:
  - `native-whatif-file-retry-1280x720.png`
  - `native-olap-pivot-remove-1280x720.png`
  - `native-security-permission-tree-390x844.png`
- What-If selected-file/retry controls, OLAP field add/remove layout, and the corrected Security inherited-level chip
  are readable without overlapping their owning panels.

## Static, type, and build gates

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - Passed across 425 TypeScript/Vue source files.
  - Rejects restored What-If bubbling/drop `div` paths, mouse-only OLAP field add, Security whole-row click,
    synthetic inherited-level replacement, or missing disclosure/selection state.
- `npm.cmd run type-check`: passed.
- `npm.cmd run build`: passed; 4,885 modules transformed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`: passed.
  - Remote asset: `__federation_expose_Remote-app-BWByyFrO.js`
  - Remote bytes: 2,753,769
  - UploadTab, GraphTab, and Cytoscape remain outside the entry boundary.
- `git diff --check`: passed with only existing line-ending conversion warnings.

## Verification batching and protected work

This batch ran focused contracts after the related component changes and ran type/build/lazy-boundary once at the
batch boundary. Previously passing Ontology and Schema browser suites were not rerun because no dependency or public
boundary used by those suites changed; they remain part of the final full regression.

This batch did not edit `package.json`, spec 057/059 graph work, `panelGraphProjection.ts`,
`src/features/code-analysis/components/graph/*`, or `tsconfig.panel-projection.json`.
