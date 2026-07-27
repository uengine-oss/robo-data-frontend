# Native interaction semantics evidence

## Scope and invariant

- Replaced click-only presentation elements with native controls for Text2SQL advanced settings, OLAP pivot removal,
  and Schema table/column description editing.
- Kept the existing Text2SQL `showSettings` result, OLAP store mutation methods and indices, Schema edit drafts and
  Catalog request/retry bodies, and surrounding visual layout.
- No backend path, request payload, success projection, retry policy, or protected graph WIP changed.

## Correction

- Text2SQL `settings-toggle` is now a button disclosure with `aria-expanded` and
  `aria-controls="text2sql-advanced-settings"`. Native button defaults are visually reset and `:focus-visible` is
  explicit.
- OLAP row, column, and measure remove glyphs are native buttons. Their accessible names include the dimension,
  level or measure and the exact target zone, while calls still use the original array index.
- Schema table and column description surfaces retain their full-surface mouse targets through transparent native
  buttons. Each button names the table or column and invokes the same draft transition as before.
- The architecture gate rejects the former click-only elements and missing disclosure/label contracts.

## Verification

- `verify-native-interaction-ui.mjs`: PASS at 1280x720.
  - Text2SQL Enter opens the controlled settings panel and exposes `aria-expanded=true`;
  - Space closes it after the leave transition, keeps focus on the trigger, and exposes `aria-expanded=false`;
  - an actual Time/Month dimension is added to the OLAP row zone through the existing UI;
  - the focused remove button is named `Time Month 행 제거`;
  - Space removes the exact row projection through the existing store mutation.
- Existing `verify-schema-relationship-ui.mjs`: PASS across all 16 desktop/mobile flows after table edit activation
  was changed to Enter and `created_by` column edit activation to Space. Catalog headers, failed draft preservation,
  exact retry, successful commit, relationship/query/source behavior, containment, and overflow remain green.
- Direct inspection of `native-text2sql-settings-1280x720.png`: the advanced-settings disclosure retains its original
  compact placement and has a visible keyboard focus outline without shifting the input layout.
- Direct inspection of `native-olap-pivot-remove-1280x720.png`: the Time/Month row chip retains its size and color;
  the remove glyph has a visible focus outline and the three pivot zones remain aligned.
- `check-architecture.mjs`: PASS across 425 TypeScript/Vue source files.
- `npm run type-check`: PASS.
- `npm run build`: PASS, 4,885 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-CyQx2gRl.js` is 2,752,711 bytes and keeps UploadTab, GraphTab, and Cytoscape graph
  runtime outside the entry boundary.
- `git diff --check`: PASS apart from existing line-ending conversion notices.
- A current full `verify-text2sql-ui.mjs` rerun stopped before UI assertions because the actual history endpoint did
  not answer within its 30-second evidence timeout. This is not recorded as a pass or attributed to the disclosure;
  the deterministic history fixture and new interaction verifier passed, while actual service availability remains
  under T052.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
