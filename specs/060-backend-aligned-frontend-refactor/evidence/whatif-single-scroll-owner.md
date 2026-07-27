# What-If single scroll-owner evidence

## Scope and invariant

- Changed only the What-If workflow container ownership and its scroll-reset lifecycle.
- Step content, session persistence, request payloads, response projections, retry/error behavior, comparison cards,
  causal graph, and desktop visual hierarchy remain intact.
- The app SideNav remains an independent scroll region; feature navigation does not overwrite its scroll position.

## Root cause and correction

- `WhatIfSimulator.vue` nested two elements with the same `.main-content` class. Two CSS rule sets consequently gave
  both elements `height: 100%`, vertical scrolling, padding, and width behavior, producing nested scroll owners and
  duplicated spacing.
- The outer container is now the semantic `workflow-scroll` and is the only vertical scroll owner and sticky-step
  event source. The centered `workflow-content` owns only the content width constraint.
- `resetWorkflowScroll()` runs after step changes, session restore/new-session actions, and component remounts. It
  resets the real owner to top zero and clears sticky state, including actions where the numeric step does not
  change.
- The existing keyed feature mount in `HomeView` provides a fresh top-zero owner on feature re-entry. The removal of
  the nested generic `.main-content` also removes ambiguity with the app shell's own main-content selector.

## Verification

- `verify-feature-scroll-ui.mjs`: PASS at 1280x520.
  - `workflow-scroll`: `overflow-y: auto`, client height 464px, scroll height 765px;
  - `workflow-content`: `overflow-y: visible`;
  - legacy nested `.main-content` owners: zero;
  - sticky state derives from the sole workflow owner;
  - new session resets scroll top and sticky state;
  - Schema Modeling navigation followed by What-If re-entry creates a top-zero owner;
  - independent SideNav scroll position is preserved;
  - document horizontal overflow is zero.
- Existing `verify-whatif-ui.mjs`: PASS across all 17 flows, including actual upstream HTTP 500 failure honesty,
  causal graph behavior, fallback rendering, payloads, reload persistence, and keyboard session switching.
- Direct inspection of `whatif-single-scroll-owner-1280x520.png`: the workflow starts at the correct top position,
  content has one consistent padding layer, the step rail and content align, and no nested scrollbar is visible.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 425 TypeScript/Vue source files, including semantic container, reset, watcher,
  and legacy-class exclusion gates.
- `npm run build`: PASS, 4,885 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-CUbTK_sq.js` is 2,752,143 bytes and keeps UploadTab, GraphTab, and Cytoscape graph
  runtime outside the entry boundary.
- `git diff --check`: PASS apart from existing line-ending conversion notices.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
