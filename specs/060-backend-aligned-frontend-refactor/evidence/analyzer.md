# Analyzer/code-analysis refactor evidence

- Backend responsibility: Analyzer owns source/search/analyze operations; Parser owns upload/parsing; Catalog owns persisted graph/schema/lineage.
- Frontend orchestration boundary: `src/workflows/code-analysis`.
- Extracted responsibilities:
  - `state/analyzer.ts`: upload → parse → analyze orchestration and public workflow state
  - `state/navigator.ts`: graph navigator state
  - `state/semanticSearch.ts`: Analyzer semantic-search state
  - `model/graphProjection.ts`: Neo4j-to-UI graph projection and graph-event model
  - `model/analysisProgress.ts`: backend leaf-step to user-visible phase projection
  - `ui/FloatingProgressPanel.vue`: workflow-owned progress UI
  - `ui/upload/*`: Parser input, optional Data Fabric datasource, Analyzer execution and graph handoff UI
  - `upload.ts`: app registry가 사용하는 upload 전용 lazy public entry
- Layer correction:
  - removed Analyzer imports from `shared`
  - moved application settings UI to `app/settings`
  - obsolete Analyzer/shared paths are rejected by the architecture contract
- Preservation:
  - graph WIP files `panelGraphProjection.ts` and spec 057/059 assets were not moved or edited
  - source NUL delimiter was rewritten as the equivalent `\u0000` escape so runtime keys are unchanged
- Verification:
  - architecture contract passed
  - Analyzer/code-analysis type errors: 0
  - `verify-analyzer-ui.mjs` passed at 1920×1080
  - upload guidance and graph navigator-empty state remained visible
  - no browser page errors
  - upload entry move 뒤 production remote entry에 UploadTab/GraphTab/Cytoscape가 포함되지 않음
  - upload→graph 자동 전환과 Electron path mode의 기존 props/emits/store 계약을 보존

No upload, analyze, delete, pause, or resume mutation was executed against the live service.
