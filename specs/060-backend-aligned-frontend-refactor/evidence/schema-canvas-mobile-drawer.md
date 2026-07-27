# Schema Canvas mobile table drawer evidence

## Scope and invariant

- Changed only the 720px-and-below presentation of Schema Modeling table discovery and space-consuming auxiliary
  canvas UI.
- Desktop table-panel width, table grouping/search, drag and double-click behavior, API requests, graph mutation,
  pan/zoom/manual fit, relationship editing, and detail panels remain intact.
- Mobile users retain full table search/add capability; the panel moved out of the canvas flex flow instead of being
  removed.

## Root cause and correction

- The 260px minimum-width table panel remained a normal flex child at 390px. Together with the app side navigation,
  it left only a narrow strip for the graph even though the relationship detail panel itself was responsive.
- At 720px and below the panel is now an absolute, viewport-contained drawer. It is visibility-hidden and
  pointer-disabled while closed, so its controls are absent from keyboard navigation.
- The canvas exposes an explicit `테이블 목록 열기` control. Opening focuses the drawer close button; close,
  backdrop, and Escape restore focus to the trigger. A successful table double-click closes the drawer before the
  existing overlay-safe fit shows the result.
- Mobile starts with the legend collapsed, hides the redundant minimap, wraps floating controls, and positions the
  collapsed legend above the bottom toolbar.

## Verification

- `verify-schema-canvas-batch-ui.mjs`: PASS at 1440x900 and 390x844.
  - closed table drawer no longer reduces canvas flow width; measured usable canvas width is at least 300px;
  - drawer left/right bounds remain inside the 390px viewport;
  - open focuses `테이블 목록 닫기`;
  - Escape hides the drawer and restores trigger focus;
  - table search and Order double-click close the drawer and render the node;
  - fitted mobile node width is at least 100px;
  - node intersection with controls/legend/toolbar is zero;
  - document horizontal overflow is zero.
- Existing `verify-schema-relationship-ui.mjs`: PASS after its mobile helper was updated to use the public drawer
  trigger; all 16 desktop/mobile relationship, query, source, retry, and detail-panel flows remain green.
- Existing `verify-schema-catalog-discovery-ui.mjs`: PASS.
- Direct inspection of `schema-canvas-mobile-drawer-open-390x844.png`: the drawer begins after the app side rail,
  stays within the viewport, shows the full datasource/schema/table hierarchy, and provides visible refresh/close
  controls without horizontal clipping.
- Direct inspection of `schema-canvas-mobile-drawer-390x844.png`: after Order add, the drawer is gone; the node is
  centered at a readable scale, controls wrap without clipping, the collapsed legend and toolbar remain separated,
  and the minimap is absent.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 425 TypeScript/Vue source files, including drawer and mobile CSS gates.
- `npm run build`: PASS, 4,885 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-CxMYbuvf.js` is 2,752,143 bytes and keeps UploadTab, GraphTab, and Cytoscape graph
  runtime outside the entry boundary.
- `git diff --check`: PASS apart from existing line-ending conversion notices.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
