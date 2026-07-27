# Ontology Agents.md authoring workflow evidence

Date: 2026-07-24

## Responsibility and contract findings

- Agents.md authoring composes Ontology-owned document, context, and Behavior endpoints with the Agent Scheduler
  ProcessGPT list. It is therefore owned by `workflows/ontology`, while response parsing remains in the producing
  domains.
- The public backend source survey did not expose a producer implementation for the frontend's Agents.md/context/
  rewrite routes. Those routes are not claimed as live-verified. The frontend now preserves the existing method,
  path, payload, and runtime session headers while rejecting malformed `200` responses and explicit unsuccessful
  mutations.
- The ProcessGPT list remains an Agent Scheduler contract. Ontology no longer imports Agent Scheduler from its domain
  UI; the workflow is the only cross-domain composition point.

## Refactoring completed

- Moved `AgentsMdEditor.vue` from the Ontology domain UI into `workflows/ontology/ui` and removed the old domain path.
- Added runtime parsers and AbortSignal propagation for Agents.md content, context, mutation, rewrite, ProcessGPT
  process-list, and Behavior creation boundaries.
- Added a pure editor policy for original/draft state, enabled-only dirtiness, frozen save/rewrite/Behavior snapshots,
  ProcessGPT mention projection, and changed-line projection.
- Added `useAgentsMdEditor` to own independent content/context/process reads, request sequences, cancellation,
  late-response rejection, operation-specific mutation state, exact retry, enabled rollback, and scope disposal.
- Replaced native confirmation and raw timers with the shared action dialog and managed timeout lifecycle. The enabled
  control is a native button switch with `aria-checked`.
- The ProcessGPT selector uses named dialog semantics, native selection buttons, focus trapping, Escape, trigger-focus
  restoration, visible list/add errors, and viewport-level Teleport placement.

## Browser-discovered lifecycle defects

- A late datasource metadata refresh forced `selectedNodeId` through `null` and remounted the entire detail panel.
  That could discard an Agents.md draft or open dialog. Reactive metadata now updates without detail-panel remount.
- A delayed recent-node restoration could reselect a node after the user had already opened Behavior, resetting the
  active tab to Information and destroying the editor. Restoration now exits when a current selection already exists.
- The ProcessGPT dialog was positioned relative to the desktop detail panel and rendered at `left=341`, `right=764`
  in a 390px viewport. It is now teleported to the viewport; the verified bounds are `left=8`, `right=382`.

## Verification

- `node contracts/test-agents-md-editor.mjs`: passed runtime parser, abort, stale response, rollback, frozen retry,
  reset, delete, rewrite, and ProcessGPT Behavior contracts.
- `node contracts/verify-agents-md-editor-ui.mjs` against isolated Vite:
  passed context failure/retry, enabled-only save rollback/exact retry, content save, reset Escape/focus/failure/retry,
  rewrite failure/exact retry, ProcessGPT list/add failure/exact retry, mobile dialog bounds, delete
  Escape/failure/retry, session headers, and browser page-error checks.
- `node contracts/verify-ontology-observability-ui.mjs`: passed all 46 existing Ontology/Observability browser
  scenarios after the editor lifecycle changes.
- `node contracts/check-architecture.mjs`: passed across 395 TypeScript/Vue sources.
- `npm.cmd run type-check`: passed.
- `npm.cmd run build`: passed with 4,855 transformed modules.
- Screenshots inspected:
  - `ontology-agents-md-process-390x844.png`
  - `ontology-agents-md-lifecycle-1920x1080.png`
  - `ontology-responsive-shell-390x844.png`

## Responsive shell follow-up

Visual inspection first confirmed that the surrounding MultiLayer Ontology desktop shell compressed its toolbar and
side panels into vertical text at 390×844 even though the ProcessGPT dialog itself fit. The follow-up changed only the
narrow-screen presentation:

- the header now uses a two-column wrapping action grid;
- the layer panel overlays the canvas and keeps its accessible collapse control;
- node/relation detail fills the viewer content, hides the desktop resize separator, and exposes labeled close
  controls;
- viewport resize updates Cytoscape and recenters existing nodes while preserving the current zoom;
- the graph toolbar and legend keep overflow inside their own containers.

The final screenshot was inspected directly: title and action labels remain horizontal, the collapsed 44px layer rail
does not reduce the 338px canvas, the existing node remains visible, and the document width remains 390px. The
existing desktop Ontology 46-scenario suite and production build passed again after this responsive change.
