# Object Explorer row ownership evidence

## Root cause and change

- An ObjectType row was a click-handled `div` containing an expand button. Selection depended on parent bubbling and
  expansion depended on stopping that bubble.
- The row now contains two sibling native controls:
  - a labelled disclosure button owns only `expandedTypes`, `aria-expanded`, and its deterministic detail ID;
  - a labelled selection button owns only the existing `type-select` emit and selected `aria-pressed` state.
- The visual row, filter, MV badge, details transition, object type key, graph, and chart projection remain unchanged.

## Browser verification

`node specs/060-backend-aligned-frontend-refactor/contracts/verify-object-chart-disclosure-ui.mjs`

- Passed at 1280x720 against gateway-shaped ObjectType and object-data responses.
- Enter opened ObjectType details and Space closed them while selection remained false and object-data requests
  remained exactly zero.
- Space selected the ObjectType, changed selected state, and issued exactly one object-data request.
- The same request still projected the existing graph and bar chart. The chart disclosure then passed its own
  Space-collapse and Enter-expand contract.
- The capture was taken after the 200ms CSS transition plus a 50ms settling margin and inspected directly:
  `object-search-row-ownership-1280x720.png`. Description, column count, and both column chips are visible with no
  horizontal overflow.

## Static, type, and build gates

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - Passed across 425 TypeScript/Vue source files.
  - Rejects a restored row click, missing native selection/disclosure state, or event-stop expansion signature.
- `npm.cmd run type-check`: passed.
- `npm.cmd run build`: passed; 4,885 modules transformed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`: passed.
  - Remote asset: `__federation_expose_Remote-app-C4EFPJqY.js`
  - Remote bytes: 2,752,711
  - UploadTab, GraphTab, and Cytoscape remain outside the entry boundary.
- `git diff --check`: passed with only existing line-ending conversion warnings.

## Protected work

This slice did not edit `package.json`, spec 057/059 graph work, `panelGraphProjection.ts`,
`src/features/code-analysis/components/graph/*`, or `tsconfig.panel-projection.json`.
