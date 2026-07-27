# What-If mobile session drawer evidence

## Scope and invariant

- Changed only the 768px-and-below presentation and focus lifecycle of the standalone What-If session sidebar.
- Desktop retains the 280px expanded and 50px collapsed sidebar behavior.
- Session repository parsing, current-session storage, restore/new-session results, workflow requests, step
  transitions, and the single workflow scroll owner remain intact.

## Root cause and correction

- At 390x844 the app content area was 338px wide while the fixed sidebar remained a 280px flex child. The workflow
  received only 64px and its padded inner content collapsed to 0px.
- The mobile sidebar is now a default-closed overlay drawer inside the What-If layout. The closed drawer is
  visibility-hidden, pointer-disabled, and `aria-hidden`; it no longer consumes workflow flex width.
- A mobile-only session trigger opens the drawer and focuses its dedicated close button. Close, Escape, and backdrop
  restore trigger focus. Session restore and new-session actions close the drawer after preserving their existing
  state results.
- Desktop collapse and mobile drawer state are separate. Viewport media state owns only presentation/ARIA behavior,
  and the obsolete unused `showSessionPanel` state was removed.
- The drawer and backdrop sit above the sticky workflow steps. This prevents the existing `z-index: 100` step rail
  from intercepting drawer controls.

## Verification

- `verify-whatif-mobile-drawer-ui.mjs`: PASS at 1280x720 and 390x844.
  - desktop sidebar remains 280px expanded and 50px collapsed;
  - mobile app content layout width: 338px;
  - closed mobile workflow width: 338px, up from the defective 64px;
  - mobile workflow content width: 306px, up from the defective 0px;
  - open drawer bounds: left 52px, right 332px, fully within the 52–390px app content viewport;
  - open focuses close; Escape and backdrop restore trigger focus;
  - restored session retains its saved Ontology step and closes the drawer;
  - new session returns to Scenario Definition and closes the drawer;
  - document horizontal overflow is zero.
- Existing `verify-whatif-ui.mjs`: PASS across all 17 real-service failure, causal graph, comparison fallback,
  payload, persistence, reload, and keyboard session-switching flows.
- Existing `verify-feature-scroll-ui.mjs`: PASS; single workflow owner, sticky behavior, session/feature top reset,
  SideNav scroll preservation, and horizontal overflow remain intact.
- Direct inspection of `whatif-mobile-session-drawer-open-390x844.png`: drawer header, new-session action, both session
  cards, close control, and internal vertical space are visible; sticky workflow steps no longer cover the drawer.
- Direct inspection of `whatif-mobile-session-drawer-390x844.png`: the closed drawer leaves a readable 306px workflow
  content area; the session trigger, five steps, and scenario card align without horizontal clipping.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 425 TypeScript/Vue source files, including semantic drawer, viewport,
  Escape/focus, and obsolete-state gates.
- `npm run build`: PASS, 4,885 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-BiN2zswr.js` is 2,752,143 bytes and keeps UploadTab, GraphTab, and Cytoscape graph
  runtime outside the entry boundary.
- `git diff --check`: PASS apart from existing line-ending conversion notices.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
