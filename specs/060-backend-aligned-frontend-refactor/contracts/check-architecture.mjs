import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sourceRoot = resolve(here, '../../../src')

async function walk(directory) {
  const paths = []
  for (const entry of await readdir(directory)) {
    const path = resolve(directory, entry)
    if ((await stat(path)).isDirectory()) paths.push(...await walk(path))
    else if (/\.(ts|vue)$/.test(entry)) paths.push(path)
  }
  return paths
}

const files = await walk(sourceRoot)
const violations = []

for (const file of files) {
  const path = relative(sourceRoot, file).replaceAll('\\', '/')
  const source = await readFile(file, 'utf8')

  if (path.startsWith('shared/') && /from\s+['"]@\/(?:domains|features|workflows)\//.test(source)) {
    violations.push(`${path}: shared must not import a domain, feature, or workflow`)
  }

  if (/^(?:shared|domains|workflows)\//.test(path) && /from\s+['"]@\/app\//.test(source)) {
    violations.push(`${path}: lower layers must not import app-owned implementation`)
  }

  if (path.endsWith('.vue') && /\bfetch\s*\(/.test(source)) {
    violations.push(`${path}: Vue UI must use a domain API instead of fetch`)
  }

  if (path.startsWith('domains/') && /from\s+['"]@\/(?:features|workflows)\//.test(source)) {
    violations.push(`${path}: a domain must not import a feature or workflow`)
  }

  if (
    path.startsWith('domains/ontology/')
    && /from\s+['"]@\/domains\/agent-scheduler(?:\/|['"])/.test(source)
  ) {
    violations.push(`${path}: cross-domain Agents.md and ProcessGPT authoring belongs to the Ontology workflow`)
  }

  if (
    path.startsWith('shared/')
    && /\b(?:Text2Sql(?:Table|Column)Info|React(?:SQLCompleteness|ToolCallModel|StepModel|ExecutionResult|ResponseModel|Request|PhaseData|StreamEvent|Status|Phase)|QueryQualityGate(?:Round)?)\b/.test(source)
  ) {
    violations.push(`${path}: Text2SQL contracts belong to domains/text2sql, not shared`)
  }

  if (
    path.startsWith('shared/')
    && /\b(?:OntologyDataSourceSchema|OntologyFilterField|OntologyLabelType|OntologyNodeProperty|OntologyRelationshipType|GenerateSchemaRequest|ApplyFeedbackRequest|NodeInstanceData)\b/.test(source)
  ) {
    violations.push(`${path}: Ontology contracts belong to domains/ontology, not shared`)
  }

  if (
    path === 'shared/services/http.ts'
    && /export const (?!API_GATEWAY_URL)[A-Z0-9_]+_BASE_URL\b/.test(source)
  ) {
    violations.push(`${path}: backend-specific base URLs belong to their owning domains`)
  }

  if (
    path === 'shared/services/http.ts'
    && /SERVICE_DOWN_GUIDANCE|response\.url\.includes|ANTLR 파서 서비스|ROBO 백엔드 서비스|Text2SQL 서비스|What-If 시뮬레이터 서비스/.test(source)
  ) {
    violations.push(`${path}: backend-specific error guidance belongs to the owning domain`)
  }

  if (path.startsWith('workflows/') && /\bfetch\s*\(/.test(source)) {
    violations.push(`${path}: workflow orchestration must use domain APIs instead of fetch`)
  }

  if (
    path.startsWith('workflows/code-analysis/ui/upload/')
    && (
      /\bany\b|as unknown/.test(source)
      || /\b(?:alert|confirm)\s*\(/.test(source)
      || /\b(?:setTimeout|clearTimeout)\s*\(/.test(source)
      || /defaultDatasourceTypes|API 연결 안될 때 사용/.test(source)
      || /from\s+['"]@\/domains\/[^'"]+\/(?:api|application|catalog|model|state|ui)\//.test(source)
      || /from\s+['"]@\/workflows\/code-analysis['"]/.test(source)
    )
  ) {
    violations.push(`${path}: upload workflow must use typed public boundaries and managed UI state`)
  }

  if (
    path === 'workflows/schema-modeling/state/schemaCanvas.ts'
    && /loadRelatedTablesByFKPattern|possibleTargets/.test(source)
  ) {
    violations.push(`${path}: related tables must come from Catalog relationships, not column-name inference`)
  }

  if (
    path === 'workflows/schema-modeling/state/schemaCanvas.ts'
    && /\brelationshipApi\b/.test(source)
  ) {
    violations.push(`${path}: Catalog TABLE state must not merge Ontology ObjectType relationship CRUD`)
  }

  if (
    path === 'domains/catalog/api/schema.ts'
    && (
      !source.includes('./schemaContracts')
      || /return\s+await\s+response\.json\s*\(\)/.test(source)
      || /['"]X-LLM-Api-Key['"]\s*:/.test(source)
      || !/getTables\([\s\S]{0,700}signal:\s*context\?\.signal/.test(source)
      || !/getTableColumns\([\s\S]{0,700}signal:\s*context\?\.signal/.test(source)
      || !/semanticSearch\([\s\S]{0,800}signal:\s*context\?\.signal/.test(source)
    )
  ) {
    violations.push(`${path}: Schema API responses, Catalog API-key headers, and abortable reads must follow the validated Catalog boundary`)
  }

  if (
    path === 'workflows/schema-modeling/state/schemaCanvas.ts'
    && (
      /getTableColumns\([^)]*\{\s*schema:\s*['"]['"]/.test(source)
      || /tableColumnsCache\.value\[\s*tableName\s*\]/.test(source)
      || /to_schema:\s*['"]public['"]/.test(source)
      || /\bmatchStrategy\b/.test(source)
      || /const nodeId = `table-\$\{tableName\}`/.test(source)
      || !source.includes('../composables/useSchemaCatalogDiscovery')
      || /\bcatalogSchemaApi\.(?:getTables|semanticSearch|getTableColumns)\b/.test(source)
      || /\bText2Sql(?:Table|Column)Info\b/.test(source)
      || /const\s+(?:allTables|tableListError|tableColumnsCache|tableColumnErrors|lastTableColumnError|isSemanticSearching|semanticSearchResults|semanticSearchError)\s*=\s*ref/.test(source)
    )
  ) {
    violations.push(`${path}: Schema Modeling must delegate Catalog discovery identity/state and use workflow-owned view models without guessed fallbacks`)
  }

  if (
    path === 'workflows/schema-modeling/composables/useSchemaCatalogDiscovery.ts'
    && (
      !source.includes('../application/schemaCatalogDiscovery')
      || !source.includes('tableListSequence')
      || !source.includes('semanticSequence')
      || !source.includes('columnRequests')
      || !source.includes('failedSemanticQuery')
      || !source.includes('onScopeDispose')
    )
  ) {
    violations.push(`${path}: Schema Catalog discovery must preserve operation identity, exact retry, in-flight dedupe, and scope disposal`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      /\bText2SqlTableInfo\b/.test(source)
      || !source.includes('store.retrySemanticSearch')
    )
  ) {
    violations.push(`${path}: Schema Canvas must use its workflow table model and expose semantic-search retry`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      /<div[\s\S]{0,100}class="(?:datasource|schema)-header"/.test(source)
      || !source.includes('schemaExpansionKey(datasource: string, schema: string)')
      || !source.includes('JSON.stringify([datasource, schema])')
      || !source.includes('isSchemaExpanded(ds, schema)')
      || !source.includes(':aria-controls="treeDisclosureId(\'datasource\', ds)"')
      || !source.includes(':aria-controls="treeDisclosureId(\'schema\', ds, schema)"')
      || /function isSchemaExpanded\(schema: string\)/.test(source)
    )
  ) {
    violations.push(`${path}: schema tree disclosures must be native and schema expansion must use datasource-qualified identity`)
  }

  if (
    (
      path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
      || path === 'workflows/schema-modeling/ui/TableDetailPanel.vue'
    )
    && (
      /\b(?:alert|confirm)\s*\(/.test(source)
      || /\b(?:setTimeout|clearTimeout)\s*\(/.test(source)
      || /\bmatchStrategy\b/.test(source)
      || !source.includes('ActionDialog')
    )
  ) {
    violations.push(`${path}: Schema Modeling UI must use managed lifetimes, shared action dialogs, and backend-supported controls`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      !source.includes('../composables/useSchemaCanvasTableIntake')
      || !source.includes('useSchemaCanvasTableIntake')
      || !source.includes('retryDroppedTable')
      || !source.includes('role="alert"')
      || /\bJSON\.parse\s*\(/.test(source)
      || /\bparsed\.(?:table|name|schema|_isObjectType|isObjectType)\b/.test(source)
    )
  ) {
    violations.push(`${path}: canvas drag intake must use validated targets and visible frozen retry instead of raw JSON shape guessing`)
  }

  if (
    path === 'workflows/schema-modeling/composables/useSchemaCanvasTableIntake.ts'
    && (
      !source.includes('../application/schemaCanvasDrop')
      || !source.includes('parseSchemaCanvasDropPayload')
      || !source.includes('cloneSchemaCanvasDropTarget')
      || /\bJSON\.parse\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: schema canvas intake lifecycle must delegate runtime validation and preserve frozen retry targets`)
  }

  if (
    path === 'workflows/schema-modeling/application/schemaCanvasDrop.ts'
    && (
      !source.includes('parseSchemaCanvasDropPayload')
      || !source.includes('cloneSchemaCanvasDropTarget')
      || !source.includes('parseOntologyBehaviorList')
      || !source.includes('Number.isFinite')
      || !source.includes("schema: 'ObjectType'")
      || /\b(?:ref|reactive|computed|watch)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: schema canvas drop parser must remain runtime-validated, snapshot-safe, and framework-free`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      !source.includes('../application/schemaCanvasBatch')
      || !source.includes('createSchemaCanvasBatchAttempt')
      || !source.includes('retryTableBatch')
      || !source.includes('store.addTablesToCanvasAtomically')
      || /for\s*\([^)]*tablesNotOnCanvas/.test(source)
      || /setFullViewMode\(true\)[\s\S]{0,200}addAllTablesToCanvas/.test(source)
    )
  ) {
    violations.push(`${path}: canvas batch add must use frozen attempts, atomic store actions, visible retry, and success-only full-view mode`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      !source.includes('../composables/useSchemaCanvasViewport')
      || !source.includes('useSchemaCanvasViewport')
      || !source.includes('fitCanvasView')
      || !source.includes('if (loaded) scheduleFitView')
      || /fitView\(\{\s*padding:\s*0\.[0-9]+\s*\}\)/.test(source)
    )
  ) {
    violations.push(`${path}: every schema canvas fit must use measured overlay-safe padding and skip failed related loads`)
  }

  if (
    path === 'workflows/schema-modeling/composables/useSchemaCanvasViewport.ts'
    && (
      !source.includes('../model/schemaCanvasViewport')
      || !source.includes('projectSchemaCanvasFitPadding')
      || !source.includes("options.schedule('fit-view'")
    )
  ) {
    violations.push(`${path}: schema canvas viewport lifecycle must own measured fit scheduling`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      !source.includes('mobileTablePanelOpen')
      || !source.includes('openMobileTablePanel')
      || !source.includes('closeMobileTablePanel')
      || !source.includes('aria-controls="schema-table-panel"')
      || !source.includes('@keydown.esc.prevent.stop="closeMobileTablePanel"')
      || !source.includes("window.matchMedia('(max-width: 720px)')")
    )
  ) {
    violations.push(`${path}: mobile schema table discovery must use a focused Escape-safe drawer and collapsed initial legend`)
  }

  if (
    path === 'domains/whatif/ui/WhatIfSimulator.vue'
    && (
      !source.includes('class="workflow-scroll"')
      || !source.includes('class="workflow-content"')
      || !source.includes('resetWorkflowScroll')
      || !source.includes('watch(currentStep')
      || /class="main-content"/.test(source)
      || /\.main-content\b/.test(source)
      || !source.includes('mobileSidebarOpen')
      || !source.includes('openMobileSidebar')
      || !source.includes('closeMobileSidebar')
      || !source.includes('aria-controls="whatif-session-sidebar"')
      || !source.includes('@keydown.esc="closeMobileSidebar()"')
      || !source.includes("window.matchMedia('(max-width: 768px)')")
      || /\bshowSessionPanel\b/.test(source)
    )
  ) {
    violations.push(`${path}: What-If must use one semantic workflow scroll owner and an Escape-safe mobile session drawer`)
  }

  if (
    path === 'domains/whatif/ui/DataSelector.vue'
    && (
      /<div[\s\S]{0,100}class="table-card"/.test(source)
      || /@click\.stop/.test(source)
      || /<div[\s\S]{0,100}class="dropzone"/.test(source)
      || /\buploadedFile\b/.test(source)
      || !source.includes('class="retry-upload-btn"')
      || !source.includes('function selectFile(file: File)')
      || !source.includes('/\\.(?:csv|xlsx)$/i')
      || !source.includes('fileInput.value.value = \'\'')
      || !source.includes('role="alert"')
    )
  ) {
    violations.push(`${path}: What-If data selection must use one native table activation path and a validated exact-file retry owner`)
  }

  if (
    path === 'domains/text2sql/ui/Text2SqlTab.vue'
    && (
      /<div\s+class="settings-toggle"/.test(source)
      || !source.includes('aria-controls="text2sql-advanced-settings"')
      || !source.includes(':aria-expanded="showSettings"')
      || !source.includes('id="text2sql-advanced-settings"')
    )
  ) {
    violations.push(`${path}: advanced settings must be a native disclosure with expanded and controls state`)
  }

  if (
    path === 'domains/olap/ui/PivotAnalysis.vue'
    && (
      /<span\s+class="remove"/.test(source)
      || !source.includes('행 제거`')
      || !source.includes('열 제거`')
      || !source.includes('측정값 제거`')
    )
  ) {
    violations.push(`${path}: pivot field removal must use labelled native buttons`)
  }

  if (
    path === 'domains/olap/ui/FieldList.vue'
    && (
      /@dblclick=/.test(source)
      || !source.includes('class="field-add-btn"')
      || !source.includes('행에 추가`')
      || !source.includes('측정값에 추가`')
      || !source.includes('@dragstart="onDragStartDimension')
      || !source.includes('@dragstart="onDragStartMeasure')
    )
  ) {
    violations.push(`${path}: OLAP field drag sources must expose labelled native add controls without mouse-only double-click`)
  }

  if (
    path === 'domains/security/ui/TablePermissions.vue'
    && (
      /class="node-header"[\s\S]{0,180}@click=/.test(source)
      || !source.includes('class="node-select"')
      || !source.includes(':aria-pressed="selectedNode?.path === ds"')
      || !source.includes(':aria-expanded="Boolean(expandedDatasources[ds])"')
      || !source.includes(':aria-controls="datasourceChildrenId(ds)"')
      || !source.includes(':aria-controls="schemaChildrenId(ds, schema)"')
      || !source.includes(':aria-label="`${table.name} 테이블 권한 선택`"')
      || source.includes("level: 'inherited' as AccessLevel")
      || !source.includes('{{ getLevelLabel(rule.level) }} · 상속됨')
    )
  ) {
    violations.push(`${path}: Security permission controls must be native siblings and cascade projection must retain the most-specific actual level`)
  }

  if (
    path === 'workflows/schema-modeling/ui/TableDetailPanel.vue'
    && (
      /class="detail-field__display"\s+@click/.test(source)
      || /class="column-item__desc"\s+@click/.test(source)
      || !source.includes('class="detail-field__edit-hitbox"')
      || !source.includes('class="column-item__desc-hitbox"')
      || !source.includes('테이블 설명 편집`')
      || !source.includes('컬럼 설명 편집`')
    )
  ) {
    violations.push(`${path}: table and column description editing must use labelled native buttons`)
  }

  if (
    path === 'domains/ontology/ui/explorer/ObjectSearchPanel.vue'
    && (
      /class="type-item"[\s\S]{0,180}@click=/.test(source)
      || !source.includes('class="type-select-btn"')
      || !source.includes(':aria-pressed="selectedType?.id === type.id"')
      || !source.includes(':aria-expanded="expandedTypes.has(type.id)"')
      || !source.includes(':aria-controls="typeDetailsId(type.id)"')
      || /handleTypeExpand\([^)]*,\s*\$event\)/.test(source)
    )
  ) {
    violations.push(`${path}: ObjectType selection and detail expansion must remain sibling native controls`)
  }

  if (
    path === 'domains/ontology/ui/explorer/ObjectChartPanel.vue'
    && (
      /class="section-header"\s+@click/.test(source)
      || !source.includes('class="section-title section-toggle"')
      || !source.includes(':aria-expanded="!isCollapsed(String(typeName))"')
      || !source.includes(':aria-controls="chartSectionId(String(typeName))"')
      || source.includes('configure-chart')
      || source.includes('class="config-btn"')
    )
  ) {
    violations.push(`${path}: chart section must use a native disclosure and leave chart configuration to the modeler`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyGenerationProgress.vue'
    && (
      /<div\s+class="logs-toggle"\s+@click/.test(source)
      || !source.includes('aria-controls="ontology-generation-log-list"')
      || !source.includes(':aria-expanded="logsExpanded"')
      || !source.includes("emit('update:logsExpanded'")
      || /(?:ontologyApi|objectExplorerApi|fetch\(|AbortController)/.test(source)
    )
  ) {
    violations.push(`${path}: generation progress and log disclosure must remain native, controlled, and presentation-only`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useOntologyNodeBehaviors')
      || !source.includes('retry: retryNodeBehaviors')
      || /\bwhatifDomainApi\b/.test(source)
      || /Behavior 로드 실패:[\s\S]{0,80}logger\.warn/.test(source)
    )
  ) {
    violations.push(`${path}: Ontology layer controls must be native and Behavior reads must stay behind their workflow lifecycle boundary`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyNodeBehaviors.ts'
    && (
      !source.includes('whatifDomainApi.listModels')
      || !source.includes('loadController?.abort()')
      || !source.includes('currentSchemaId.value !== schemaId')
      || !source.includes('selectedNodeId.value !== nodeId')
      || !source.includes('function retry()')
      || !source.includes('onScopeDispose(reset)')
    )
  ) {
    violations.push(`${path}: Behavior reads must expose target-frozen abortable retry and disposal state`)
  }

  if (
    path === 'workflows/schema-modeling/state/schemaCanvas.ts'
    && (
      !source.includes('../model/schemaCanvasNodeProjection')
      || !source.includes('addTablesToCanvasAtomically')
      || !source.includes('captureCanvasMutationSnapshot')
      || !source.includes('restoreCanvasMutationSnapshot')
      || /const\s+NODE_(?:WIDTH|HEIGHT)\b/.test(source)
      || /nodes\.value\s*=\s*\[\][\s\S]{0,500}loadTableColumns/.test(source)
    )
  ) {
    violations.push(`${path}: schema canvas store must rollback append batches and prepare full-grid nodes before one commit`)
  }

  if (
    (
      path === 'workflows/schema-modeling/application/schemaCanvasBatch.ts'
      || path === 'workflows/schema-modeling/model/schemaCanvasNodeProjection.ts'
      || path === 'workflows/schema-modeling/model/schemaCanvasViewport.ts'
    )
    && /\b(?:ref|reactive|computed|watch|defineStore)\s*\(/.test(source)
  ) {
    violations.push(`${path}: schema canvas batch attempts and node projection must remain framework-free`)
  }

  if (
    path === 'domains/ontology/api/objectExplorer.ts'
    && (
      /function\s+(?:isBehaviorType|parseBehaviorConfig)\b/.test(source)
      || !source.includes('parseOntologyBehaviorList')
    )
  ) {
    violations.push(`${path}: ObjectType API and drag intake must share the ontology behavior runtime parser`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../model/localGraphMutation')
      || !source.includes('../model/relationFieldMapping')
      || !source.includes('../application/datasourceConfirmation')
      || !source.includes('projectConfirmedDatasourceSchema')
      || !source.includes('../composables/useCausalAnalysis')
      || !source.includes('../composables/useOntologyNodeData')
      || !source.includes('../composables/useOntologyNodeFilters')
      || !source.includes('../composables/useOntologyRelationEditor')
      || !source.includes('../composables/useOntologyDatasourceMapping')
      || !source.includes('../application/ontologyCanvasSchema')
      || !source.includes('@/shared/composables/useResizablePanel')
      || !source.includes('../composables/useOntologyNodeDataChart')
      || !source.includes('../composables/useOntologyCanvasLayout')
      || !source.includes('useOntologyCanvasLayout')
      || !source.includes('@/shared/components/ActionDialog.vue')
      || /\b(?:alert|confirm)\s*\(/.test(source)
      || /model-overlay|showModelOverlay|modelOverlayData|deleteModelFromOverlay/.test(source)
      || !source.includes('fileUploadError')
      || !source.includes('role="separator"')
      || /document\.addEventListener\(['"](?:mousemove|mouseup|pointermove|pointerup|pointercancel)['"]/.test(source)
      || /\b(?:isResizingWhatIf|resizeStartX|resizeStartY|resizeStartWidth|resizeStartHeight|handleResize|onResizeWhatIf|stopResizeWhatIf)\b/.test(source)
      || /\b(?:AnalysisState|highlightedCausalNodeIds|highlightedCausalEdgePairs|runCausalAnalysisFromBrush|handleAnalysisComplete)\b/.test(source)
      || /\b(?:fetchDataViaText2SQL|filterParams|ontologyError)\b/.test(source)
      || /\b(?:activeFilters|propagateFiltersFromNode|loadFilterDistinctValues|onFilterChange)\b/.test(source)
      || /filterTargetNode\.value\s*=|nodeFilters\.value\s*=/.test(source)
      || /const\s+(?:nodeDataLoading|lastDataError|text2SqlFallbackAvailable|nodeDataResult)\s*=\s*ref/.test(source)
      || /nodeDataResult\.value\s*=/.test(source)
      || /@analysis-complete=/.test(source)
      || /showEdgeDeleteDialog|edgeToDelete|confirmDeleteEdge|cancelDeleteEdge/.test(source)
      || /function\s+(?:deleteEdgeFromContextMenu|confirmDeleteNode|deleteRelationFromEditor)\s*\([^)]*\)\s*\{[\s\S]{0,900}\bconfirm\s*\(/.test(source)
      || /function\s+saveRelationEditor\s*\([^)]*\)\s*\{[\s\S]{0,1800}\balert\s*\(/.test(source)
      || /function\s+createMeasureObjectType\s*\([^)]*\)\s*\{[\s\S]{0,1800}\b(?:confirm|alert)\s*\(/.test(source)
      || /async function\s+saveToNeo4j\s*\([^)]*\)\s*\{[\s\S]{0,1200}\balert\s*\(/.test(source)
      || /async function\s+(?:autoLinkDataSources|commitDataSourceMapping|confirmMappingCandidate|confirmBulkDatasourceMappings|searchNodeDataSource|confirmNodeDataSource)\s*\([^)]*\)\s*(?::[^{]+)?\{[\s\S]{0,5000}\b(?:confirm|alert)\s*\(/.test(source)
      || /\bobjectExplorerApi\.(?:autoLinkDatasourceStream|confirmDatasource)\s*\(/.test(source)
      || /const\s+(?:linkingProgress|dataSourceMappings|mappingConfirmPendingIds|mappingConfirmErrors|bulkConfirmTargets)\s*=\s*(?:ref|computed|shallowRef)\s*\(/.test(source)
      || /(?:async\s+)?function\s+(?:autoLinkDataSources|commitDataSourceMapping|confirmMappingCandidate|confirmBulkDatasourceMappings|setMappingConfirmPending|setMappingConfirmError)\s*\(/.test(source)
      || /dataSourceMappings\.value\[[^\]]+\]\.(?:status|selected_candidate)\s*=/.test(source)
      || /function\s+sanitizeRelationshipsForCanvas\s*\(/.test(source)
      || /function\s+generateOntologyName\s*\(/.test(source)
      || /generatedSchema\.nodes\.map\s*\(/.test(source)
      || !/function\s+handleSchemaBasedGenerated[\s\S]{0,500}projectOntologyCanvasSchema\(/.test(source)
      || !/function\s+handleStreamEvent[\s\S]{0,2200}projectOntologyCanvasSchema\(/.test(source)
      || !/function\s+applyLoadedSchemaToViewer[\s\S]{0,500}projectOntologyCanvasSchema\(/.test(source)
    )
  ) {
    violations.push(`${path}: graph actions, datasource confirmation, document errors, and panel resizing must keep explicit managed lifecycles`)
  }

  if (
    path === 'domains/ontology/ui/modeling/CausalAnalysisPanel.vue'
    && (
      /analysis-complete/.test(source)
      || !source.includes('cancel-analysis')
      || !source.includes('retry-analysis')
      || !source.includes('analysisWarning')
      || !source.includes('analysisNotice')
    )
  ) {
    violations.push(`${path}: causal results must remain presentational while cancellation, retry, and partial warning stay explicit`)
  }

  if (
    path === 'domains/ontology/api/objectExplorer.ts'
    && (
      !source.includes('parseCausalIncomingNetwork')
      || !/runCausalAnalysis\([\s\S]{0,400}signal\?: AbortSignal/.test(source)
      || !/getIncomingNetwork\([\s\S]{0,400}signal\?: AbortSignal/.test(source)
    )
  ) {
    violations.push(`${path}: causal network and stream APIs must validate responses and support abortable ownership`)
  }

  if (
    path === 'domains/ontology/api/objectExplorer.ts'
    && (
      !/getNodeData\([\s\S]{0,240}signal\?: AbortSignal/.test(source)
      || !/getNodeData\([\s\S]{0,500}headers:\s*sessionHeaders\(\)/.test(source)
    )
  ) {
    violations.push(`${path}: ontology node-data requests must preserve runtime headers and abort ownership`)
  }

  if (
    path === 'domains/ontology/api/objectExplorer.ts'
    && (
      !source.includes('parseOntologyNodeFilterValues')
      || !/getNodeFilterValues\([\s\S]{0,300}signal\?: AbortSignal/.test(source)
      || !/getNodeFilterValues\([\s\S]{0,800}parseOntologyNodeFilterValues\(await response\.json\(\)\)/.test(source)
    )
  ) {
    violations.push(`${path}: ontology distinct-filter requests must validate responses and support session-headed cancellation`)
  }

  if (
    path === 'domains/text2sql/api/client.ts'
    && !/directSql\([\s\S]{0,300}signal\?: AbortSignal[\s\S]{0,500}\bsignal\b/.test(source)
  ) {
    violations.push(`${path}: Direct SQL requests must support workflow-owned cancellation`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyNodeData.ts'
    && (
      !source.includes('requestVersion')
      || !source.includes('AbortController')
      || !source.includes('retryAttempt')
      || !source.includes('onScopeDispose(reset)')
      || !source.includes('buildOntologyNodeDataQuery')
      || !source.includes('buildText2SqlNodeDataRequest')
    )
  ) {
    violations.push(`${path}: node-data retrieval must own target snapshots, cancellation, stale-response rejection, and exact retry`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyNodeFilters.ts'
    && (
      !source.includes('projectOntologyFilters')
      || !source.includes('requestVersion')
      || !source.includes('AbortController')
      || !source.includes('retryAttempt')
      || !source.includes('onScopeDispose(reset)')
      || !source.includes('createOntologyFilterDraft')
      || !source.includes('commitOntologyFilterDraft')
    )
  ) {
    violations.push(`${path}: node filters must own draft commit/cancel, fresh cascade projection, cancellation, stale-response rejection, and exact retry`)
  }

  if (
    path === 'workflows/ontology/ui/AgentsMdEditor.vue'
    && (
      !source.includes('../composables/useAgentsMdEditor')
      || !source.includes('@/shared/components/ActionDialog.vue')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('useManagedTimeouts')
      || !source.includes('contextLoad.error')
      || !source.includes('processListError')
      || !source.includes('role="dialog"')
      || !source.includes('role="switch"')
      || !source.includes(':aria-checked="agentEnabled"')
      || !source.includes('contextGroupId')
      || !source.includes(':aria-expanded="group.expanded"')
      || !source.includes(':aria-expanded="processGptExpanded"')
      || !source.includes('aria-label="ProcessGPT 프로세스 메서드 추가"')
      || !source.includes('<Teleport to="body">')
      || !source.includes('changeAgentEnabled')
      || source.includes("toggleBuiltinGroup('_models')")
      || /<div class="subgroup-header" @click=/.test(source)
      || source.includes('@click.stop="openProcessSelector"')
      || /\b(?:agentsMdApi|behaviorApi|processGptApi)\b/.test(source)
      || /\b(?:alert|confirm|setTimeout|clearTimeout)\s*\(/.test(source)
      || /console\.(?:log|warn|error)/.test(source)
    )
  ) {
    violations.push(`${path}: Agents.md UI must preserve native context-group disclosures, explicit dialogs, partial errors, and managed lifetimes`)
  }

  if (
    path === 'workflows/ontology/application/datasourceConfirmation.ts'
    && (
      !source.includes('projectConfirmedDatasourceSchema')
      || !source.includes("columns.length > 0 ? { columns: [...new Set(columns)] } : {}")
    )
  ) {
    violations.push(`${path}: datasource confirmation must keep unknown columns distinct from a verified empty schema`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !/function restoreSelectedNode\(\) \{[\s\S]{0,160}if \(selectedNodeId\.value\) return/.test(source)
      || /const tempId = selectedNodeId\.value[\s\S]{0,180}selectedNodeId\.value = null/.test(source)
      || !source.includes("scheduleManagedTimeout('ontology-viewport-resize'")
      || !source.includes('cy.resize()')
      || !source.includes('cy.center(cy.nodes())')
    )
  ) {
    violations.push(`${path}: detail workflows and viewport resize must preserve active state and provide a usable responsive exit`)
  }

  if (
    path === 'workflows/ontology/composables/useAgentsMdEditor.ts'
    && (
      !source.includes('AbortController')
      || !source.includes('contentSequence')
      || !source.includes('contextSequence')
      || !source.includes('rewriteSequence')
      || !source.includes('lastSaveSnapshot')
      || !source.includes('lastDeleteTarget')
      || !source.includes('lastResetTarget')
      || !source.includes('lastRewriteSnapshot')
      || !source.includes('lastProcessSnapshot')
      || !source.includes('onScopeDispose(abortAll)')
      || !source.includes('isAgentsMdDirty')
      || !source.includes('rollbackEnabled')
    )
  ) {
    violations.push(`${path}: Agents.md workflow must own abortable reads, stale-response rejection, enabled rollback, and exact mutation retry`)
  }

  if (
    path === 'domains/ontology/api/agents.ts'
    && (
      !source.includes('parseAgentContextResponse')
      || !source.includes('parseAgentsMdResponse')
      || !source.includes('parseAgentsMdMutationResponse')
      || !source.includes('parseAgentsMdRewriteResponse')
      || !/getContext\([^)]*signal\?: AbortSignal/.test(source)
      || !/getContent\([^)]*signal\?: AbortSignal/.test(source)
      || !/async rewrite\([\s\S]{0,220}signal\?: AbortSignal/.test(source)
      || !/async save\([\s\S]{0,220}signal\?: AbortSignal/.test(source)
    )
  ) {
    violations.push(`${path}: Agents.md API responses must be runtime-validated and support workflow cancellation`)
  }

  if (
    path === 'domains/ontology/ui/extraction/whatif/StepModelManager.vue'
    && (
      !source.includes('../../../application/useWhatIfModelManager')
      || !source.includes('@/shared/components/ActionDialog.vue')
      || !source.includes('projectModelMetrics')
      || !source.includes(':aria-expanded=')
      || !source.includes(':aria-controls=')
      || /\bwhatifDomainApi\b/.test(source)
      || /\b(?:alert|confirm|JSON\.parse|onMounted)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: What-If model-manager UI must remain presentational, keyboard operable, and safe for malformed metrics`)
  }

  if (
    path === 'domains/ontology/ui/extraction/whatif/WhatIfPanel.vue'
    && (
      !source.includes('@media (max-width: 720px)')
      || !/\.step-nav\s*\{[\s\S]{0,220}overflow-x:\s*auto/.test(source)
      || !/\.step-btn\s*\{[\s\S]{0,180}white-space:\s*nowrap/.test(source)
      || !source.includes('new ResizeObserver(revealCurrentStep)')
      || !source.includes('watch(currentStep, revealCurrentStep)')
      || !source.includes('stepNavResizeObserver?.disconnect()')
    )
  ) {
    violations.push(`${path}: narrow What-If step navigation must preserve horizontal labels inside its own scroll strip`)
  }

  if (
    path === 'domains/ontology/application/useWhatIfModelManager.ts'
    && (
      !source.includes('AbortController')
      || !source.includes('loadSequence')
      || !source.includes('deleteSequence')
      || !source.includes('deleteSnapshot')
      || !source.includes('failedTargets')
      || !source.includes('projectModelDeleteResults')
      || !source.includes('onScopeDispose')
    )
  ) {
    violations.push(`${path}: What-If model lifecycle must own schema cancellation, stale rejection, frozen targets, and failed-only retry`)
  }

  if (
    path === 'domains/ontology/ui/extraction/whatif/StepSimulation.vue'
    && (
      !source.includes('../../../application/useWhatIfSimulation')
      || !source.includes('summary-table-scroll')
      || !source.includes('@media (max-width: 720px)')
      || !source.includes('snapshotCanRetry')
      || !source.includes('simulationCanRetry')
      || !source.includes('profileCanRetry')
      || /\bwhatifDomainApi\b/.test(source)
      || /\b(?:setTimeout|clearTimeout|alert|confirm|prompt|onMounted)\s*\(/.test(source)
      || /\b(?:animationStep|isAnimating|profileSaveMessage)\b/.test(source)
      || /\bRecord<string,\s*any>\b/.test(source)
      || /\$event\.target\s+as|JSON\.parse/.test(source)
    )
  ) {
    violations.push(`${path}: What-If simulation UI must remain presentational, operation-specific, managed, and narrow-screen contained`)
  }

  if (
    path === 'domains/ontology/application/useWhatIfSimulation.ts'
    && (
      !source.includes('AbortController')
      || !source.includes('snapshotSequence')
      || !source.includes('simulationSequence')
      || !source.includes('profileSequence')
      || !source.includes('failedSnapshotTarget')
      || !source.includes('failedSimulationTarget')
      || !source.includes('failedProfileTarget')
      || !source.includes('useManagedTimeouts')
      || !source.includes('onScopeDispose')
      || !source.includes('createSimulationRequestSnapshot')
      || !source.includes('createProfileSaveSnapshot')
    )
  ) {
    violations.push(`${path}: What-If simulation lifecycle must own context cancellation, stale rejection, last-valid state, and frozen exact retry`)
  }

  if (
    path === 'domains/ontology/api/whatIfModeling.ts'
    && (
      !source.includes('parseModelStatusResponse')
      || !source.includes('parseDeleteModelResponse')
      || !/getModelStatus\([\s\S]{0,120}signal\?: AbortSignal/.test(source)
      || !/listModels\([^)]*signal\?: AbortSignal/.test(source)
      || !/deleteModel\([\s\S]{0,120}signal\?: AbortSignal/.test(source)
      || !source.includes('response.schema_id !== schemaId')
      || !source.includes('response.model_id !== modelId')
    )
  ) {
    violations.push(`${path}: What-If model APIs must validate response identity and support lifecycle cancellation`)
  }

  if (
    path === 'domains/ontology/api/whatIfModeling.ts'
    && (
      !source.includes('parseSnapshotResponse')
      || !source.includes('parseSimulateResponse')
      || !source.includes('parseScenarioProfileResponse')
      || !/getSnapshot\([\s\S]{0,280}signal\?: AbortSignal/.test(source)
      || !/async simulate\([\s\S]{0,380}signal\?: AbortSignal/.test(source)
      || !/createScenarioProfile\([\s\S]{0,180}signal\?: AbortSignal/.test(source)
      || !source.includes('What-If simulation 응답의 schema_id가 요청과 일치하지 않습니다.')
      || !source.includes('What-If scenario profile 응답의 schemaId가 요청과 일치하지 않습니다.')
    )
  ) {
    violations.push(`${path}: What-If simulation APIs must runtime-validate snapshot, simulation, and profile responses with abortable identity checks`)
  }

  if (
    path === 'domains/ontology/ui/modeling/BehaviorDialog.vue'
    && (
      !source.includes('../../application/useBehaviorEditor')
      || !source.includes('@/shared/components/ActionDialog.vue')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('suspended: () => deleteDialogOpen.value')
      || !source.includes('role="dialog"')
      || !source.includes('aria-pressed')
      || !source.includes('@media (max-width: 640px)')
      || /\bbehaviorApi\b/.test(source)
      || /\bJSON\.parse\b/.test(source)
      || /\bJSON\.stringify\b/.test(source)
      || /\b(?:fetch|alert|confirm|setTimeout|clearTimeout)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: Behavior editor UI must remain presentational, keyboard-operable, action-dialog managed, and narrow-screen contained`)
  }

  if (
    path === 'domains/ontology/application/useBehaviorEditor.ts'
    && (
      !source.includes('AbortController')
      || !source.includes('failedGenerationTarget')
      || !source.includes('failedSaveTarget')
      || !source.includes('failedTestTarget')
      || !source.includes('failedDeleteTarget')
      || !source.includes('targetIsCurrent')
      || /\b(?:alert|confirm|setTimeout|clearTimeout)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: Behavior editor lifecycle must own cancellation, stale rejection, operation-specific state, and frozen exact retry`)
  }

  if (
    path === 'domains/ontology/api/agents.ts'
    && (
      !source.includes('parseBehaviorMutationResponse')
      || !source.includes('parseBehaviorCodeGenerationResponse')
      || !/testExternalEndpoint\([\s\S]{0,240}signal\?: AbortSignal/.test(source)
      || !/generateCode\([\s\S]{0,240}signal\?: AbortSignal/.test(source)
      || !source.includes('Never forward ROBO session')
    )
  ) {
    violations.push(`${path}: Behavior APIs must validate mutation/code responses, remain abortable, and isolate operator-supplied external URLs from ROBO headers`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useOntologyGraphHistory')
      || !source.includes('checkpoint: saveState')
      || !source.includes('clearGraphHistory()')
      || /\b(?:HistoryState|undoStack|redoStack|maxHistorySize)\b/.test(source)
      || /function\s+(?:saveState|undo|redo)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: local graph history must remain outside the giant viewer and clear on schema transitions`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useOntologyLocalGraphEditing')
      || !source.includes('useOntologyLocalGraphEditing')
      || /nodes\.value\.push\s*\(/.test(source)
      || /relationships\.value\.push\s*\(/.test(source)
      || /nodes\.value\s*\[[^\]]+\]\s*=/.test(source)
      || /relationships\.value\s*\[[^\]]+\]\s*=/.test(source)
    )
  ) {
    violations.push(`${path}: local graph creation and editing must use the immutable workflow mutation policy`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyLocalGraphEditing.ts'
    && (
      !source.includes('../model/localGraphMutation')
      || !source.includes('createLocalGraphNode')
      || !source.includes('renameLocalGraphNode')
      || !source.includes('changeLocalGraphNodeLayer')
      || !source.includes('createLocalGraphRelationshipDraft')
      || !source.includes('commitLocalGraphRelationship')
      || /options\.nodes\.value\.push\s*\(/.test(source)
      || /options\.relationships\.value\.push\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: local graph editing lifecycle must commit immutable model projections`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useOntologyRelationEditor')
      || /const\s+(?:showRelationEditor|editingRelation|editingRelationForm|sourceColumnState|targetColumnState)\s*=\s*(?:ref|shallowRef)\s*\(/.test(source)
      || /function\s+(?:openRelationEditor|retryRelationColumns|closeRelationEditor|saveRelationEditor)\s*\(/.test(source)
      || /(?:sourceNodeColumns|targetNodeColumns|sourceColumnStatus|targetColumnStatus|sourceColumnError|targetColumnError)\.value\s*=/.test(source)
      || /objectExplorerApi\.getNodeData\([^)]*limit=1/.test(source)
    )
  ) {
    violations.push(`${path}: relation-editor target, request, retry, validation, and commit state must remain in its workflow lifecycle`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyRelationEditor.ts'
    && (
      !source.includes('columnRequestSequence')
      || !source.includes('columnController?.abort()')
      || !source.includes('isCurrentColumnRequest')
      || !source.includes('onScopeDispose(closeRelationEditor)')
      || !source.includes("objectExplorerApi.getNodeData(nodeId, 'limit=1', signal)")
      || !source.includes('projectRelationEditorFormAfterColumnLoad')
      || !source.includes('updateLocalGraphRelationship')
      || !source.includes('validateRelationFieldMapping')
    )
  ) {
    violations.push(`${path}: relation-editor lifecycle must cancel and reject stale reads, preserve verified mappings, and commit immutable graph changes`)
  }

  if (
    path === 'workflows/ontology/application/relationEditorLifecycle.ts'
    && (
      /(?:from|import\s*\()\s*['"](?:vue|@\/domains\/ontology)/.test(source)
      || !source.includes('readInlineRelationColumns')
      || !source.includes('resolveRelationEditorRelationship')
      || !source.includes('projectRelationEditorFormAfterColumnLoad')
    )
  ) {
    violations.push(`${path}: relation-editor application projections must stay deterministic and framework-independent`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useNodeDatasourceDiscovery')
      || /\btext2sqlApi\b/.test(source)
      || /function\s+(?:searchNodeDataSource|confirmNodeDataSource|loadSampleData|probeRowCounts)\s*\(/.test(source)
      || /const\s+(?:nodeSearchResults|nodeSearchLoading|nodeSearchError|sampleDataLoading|sampleDataError|nodeDatasourceConfirmTarget)\s*=\s*(?:ref|shallowRef)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: node datasource search, probe, sample, and confirmation state must remain in its workflow lifecycle`)
  }

  if (
    path === 'workflows/ontology/composables/useNodeDatasourceDiscovery.ts'
    && (
      !source.includes('searchSequence')
      || !source.includes('sampleSequence')
      || !source.includes('searchController?.abort()')
      || !source.includes('sampleController?.abort()')
      || !source.includes('isCurrentSearch')
      || !source.includes('onScopeDispose')
      || !source.includes('projectNodeDatasourceCandidates')
      || !source.includes('projectNodeDatasourceProbeFailure')
      || !source.includes('createDatasourceConfirmationTarget')
      || !source.includes('useNodeDataSourceCatalog(input.catalogClient)')
    )
  ) {
    violations.push(`${path}: node datasource lifecycle must reject stale work, preserve partial failures and exact retry targets, and expose an injectable catalog boundary`)
  }

  if (
    path === 'workflows/ontology/application/nodeDatasourceDiscovery.ts'
    && (
      /(?:from|import\s*\()\s*['"]vue['"]/.test(source)
      || /\b(?:text2sqlApi|objectExplorerApi)\b/.test(source)
      || !source.includes('projectNodeDatasourceCandidates')
      || !source.includes('createNodeDatasourceProbeRequest')
      || !source.includes('projectNodeDatasourceProbe')
      || !source.includes('projectNodeDatasourceProbeFailure')
      || !source.includes('createManualNodeDatasourceCandidate')
      || !source.includes('createSelectedSearchCandidate')
    )
  ) {
    violations.push(`${path}: node datasource projections must stay deterministic, immutable, and free of framework or API calls`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useOntologyLibraryWorkspace')
      || /ontologyApi\.(?:listSchemas|updateSchemaName|deleteSchemaById|activateSchema|getSchemaById)\s*\(/.test(source)
      || /function\s+(?:startEditSchemaName|saveSchemaName|confirmDeleteSchema|loadOntologyList|loadSchema|retryLoadSchema|commitLoadedSchema)\s*\(/.test(source)
      || /const\s+(?:ontologyLibraryEntries|ontologyListLoading|ontologyListError|schemaToDelete|schemaApplicationError|editingSchemaId|editingSchemaName)\s*=\s*(?:ref|shallowRef)\s*\(/.test(source)
      || /ontologyLibraryEntries\.value[^;\n]*\.name\s*=/.test(source)
    )
  ) {
    violations.push(`${path}: ontology library list, rename, delete, load, application retry, and recent-history state must remain in its workflow lifecycle`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyLibraryWorkspace.ts'
    && (
      !source.includes('listSequence')
      || !source.includes('pendingSchemaApplicationRetry')
      || !source.includes('useOntologySchemaLifecycle')
      || !source.includes('projectOntologyLibrary')
      || !source.includes('projectRenamedOntologyLibraryEntries')
      || !source.includes('createOntologyLibraryApplicationRetry')
      || !source.includes('removeRecentSchemaId')
      || !source.includes('saveRecentSchemaId')
      || !source.includes('onScopeDispose')
    )
  ) {
    violations.push(`${path}: ontology library workspace must reject stale lists, preserve frozen mutation/application targets, and commit history only after success`)
  }

  if (
    path === 'workflows/ontology/application/ontologyLibraryWorkspace.ts'
    && (
      /(?:from|import\s*\()\s*['"]vue['"]/.test(source)
      || /\bontologyApi\b/.test(source)
      || !source.includes('createOntologyLibraryDeleteTarget')
      || !source.includes('projectRenamedOntologyLibraryEntries')
      || !source.includes('createOntologyLibraryApplicationRetry')
      || !source.includes('ontologyLibraryLoadFailureMessage')
    )
  ) {
    violations.push(`${path}: ontology library projections and retry snapshots must stay deterministic and free of framework or API calls`)
  }

  if (
    path === 'domains/text2sql/api/client.ts'
    && (
      !/async\s+getTableColumns\s*\([^)]*signal\?:\s*AbortSignal/s.test(source)
      || !/async\s+ask\s*\([^)]*signal\?:\s*AbortSignal/s.test(source)
      || !/getTableColumns[\s\S]*?headers:\s*sessionHeaders\(\)[\s\S]*?signal/.test(source)
      || !/async\s+ask[\s\S]*?sessionHeaders\(\),\s*signal/.test(source)
    )
  ) {
    violations.push(`${path}: node datasource metadata and ask reads must preserve session headers and accept cancellation signals`)
  }

  if (
    path === 'domains/ontology/api/objectExplorer.ts'
    && (
      !/async\s+getNodeSampleData\s*\([^)]*signal\?:\s*AbortSignal/s.test(source)
      || !/getNodeSampleData[\s\S]*?headers:\s*sessionHeaders\(\)[\s\S]*?signal/.test(source)
    )
  ) {
    violations.push(`${path}: ontology node sample reads must preserve session headers and accept cancellation signals`)
  }

  if (
    path === 'workflows/ontology/model/localGraphMutation.ts'
    && (
      /\bDate\.now\s*\(/.test(source)
      || /(?:from|import\s*\()\s*['"](?:vue|cytoscape)/.test(source)
    )
  ) {
    violations.push(`${path}: local graph mutation policy must stay deterministic and framework-independent`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useOntologyDocumentGeneration')
      || /\blet\s+abortController\b/.test(source)
      || /\bnew\s+FileReader\s*\(/.test(source)
      || /objectExplorerApi\.generateMultiLayer\s*\(/.test(source)
      || /glossaryApi\.getGlossaries\s*\(/.test(source)
      || /requestBody\.(?:pdfContent|pdfUrl|text)\s*=/.test(source)
    )
  ) {
    violations.push(`${path}: document generation draft, glossary read, PDF encoding, abort, and exact retry must remain in its workflow lifecycle`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyDocumentGeneration.ts'
    && (
      !source.includes('failedGenerationTarget')
      || !source.includes('glossarySequence')
      || !source.includes('generationSequence')
      || !source.includes('controller.signal.aborted')
      || !source.includes('onScopeDispose')
      || !source.includes('createOntologyDocumentGenerationTarget')
    )
  ) {
    violations.push(`${path}: document generation lifecycle must preserve frozen retry targets and reject stale glossary/stream work`)
  }

  if (
    path === 'domains/catalog/glossary/api.ts'
    && !/getGlossaries\(headers:\s*Headers,\s*signal\?:\s*AbortSignal\)/.test(source)
  ) {
    violations.push(`${path}: glossary reads used by document generation must remain abortable`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyGraphHistory.ts'
    && (
      !source.includes('appendBoundedHistory')
      || !source.includes('isGraphHistoryEditableTarget')
      || !source.includes('resolveGraphHistoryShortcut')
      || !source.includes('input.onRestore()')
      || !source.includes('redoStack.value = []')
    )
  ) {
    violations.push(`${path}: graph history lifecycle must own bounded branch-aware stacks, restore synchronization, and editable shortcut exclusion`)
  }

  if (
    path === 'domains/ontology/api/schema.ts'
    && (
      !source.includes('parseSaveOntologySchemaResponse(await response.json())')
      || !source.includes('value.success !== true')
      || !source.includes("useRuntimeStore().getHeaders()")
    )
  ) {
    violations.push(`${path}: ontology schema save must carry runtime context and validate explicit backend success before UI commit`)
  }

  if (
    path === 'domains/ontology/api/objectExplorer.ts'
    && (
      !source.includes('return parseDatasourceConfirmationResponse(')
      || !/async confirmDatasource\s*\([^)]*\)[\s\S]{0,500}parseDatasourceConfirmationResponse\(/.test(source)
      || !/autoLinkDatasourceStream\([\s\S]{0,260}signal\?: AbortSignal/.test(source)
      || !/autoLinkDatasourceStream\([\s\S]{0,600}\bsignal,\s*\n/.test(source)
    )
  ) {
    violations.push(`${path}: datasource confirmation must validate explicit backend success and auto-link streams must preserve abort ownership`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyDatasourceMapping.ts'
    && (
      !source.includes('createDatasourceMappingNodeSnapshots')
      || !source.includes('createDatasourceConfirmationTarget')
      || !source.includes('applicationRetryTargets')
      || !source.includes('activeConfirmations')
      || !source.includes('new AbortController()')
      || !source.includes('onScopeDispose')
      || !source.includes('projectBulkDatasourceConfirmation')
      || !source.includes('projectConfirmedDatasourceMapping')
      || /dataSourceMappings\.value\[[^\]]+\]\.(?:status|selected_candidate)\s*=/.test(source)
    )
  ) {
    violations.push(`${path}: datasource mapping workspace must own abortable stream, frozen exact confirmation, application-only retry, immutable mapping, and failed-only bulk lifecycle`)
  }

  if (
    path === 'workflows/ontology/application/ontologyCanvasSchema.ts'
    && (
      !source.includes('sanitizeOntologyCanvasRelationships')
      || !source.includes('projectOntologyCanvasSchema')
      || !source.includes('generateOntologyCanvasName')
      || !source.includes("source.kind === 'database'")
      || !source.includes("source.kind === 'library'")
      || !source.includes('schema.id?.trim() || null')
      || !source.includes('skippedRelationshipCount')
      || !source.includes('rekeyedRelationshipCount')
      || /\b(?:ref|reactive|computed|watch)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: canvas schema projection must remain source-aware, deterministic, immutable, identity-honest, and framework-free`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../model/ontologyCanvasStyles')
      || !source.includes('createOntologyCanvasStyles(isDarkMode.value)')
      || /function\s+getCytoscapeStyles/.test(source)
      || /selector:\s*['"](?:node|edge|\.eh-|\.filtered-)/.test(source)
    )
  ) {
    violations.push(`${path}: canvas presentation selectors and styles must belong to the pure ontology canvas style model`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      /@dblclick="openRelationEditor/.test(source)
    )
  ) {
    violations.push(`${path}: Ontology secondary actions must retain native menu, relation edit, and mapping disclosure ownership`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyGenerationDocumentForm.vue'
    && (
      !source.includes('id="ontology-generation-pdf-input"')
      || !source.includes('@click="openPdfFilePicker"')
      || !source.includes('@click.stop="removeSelectedPdfFile"')
      || !source.includes("fileInput.value.value = ''")
      || !source.includes("emit('update:selectedGlossaryIds'")
      || !source.includes("emit('retryGlossaries')")
      || /(?:ontologyApi|objectExplorerApi|glossaryApi|fetch\(|AbortController)/.test(source)
    )
  ) {
    violations.push(`${path}: generation document form must own controlled file/glossary presentation without data access`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyGenerationDialogShell.vue'
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('aria-modal="true"')
      || !source.includes("emit('update:mode'")
      || !source.includes("emit('cancelGeneration')")
      || /(?:ontologyApi|objectExplorerApi|glossaryApi|fetch\(|AbortController)/.test(source)
    )
  ) {
    violations.push(`${path}: generation dialog shell must own accessible controlled mode, close, start, and cancel presentation`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyGenerationOutcome.vue'
    && (
      !source.includes('role="alert"')
      || !source.includes("emit('retry')")
      || !source.includes("emit('edit')")
      || !source.includes("emit('reviewSynonyms')")
      || !source.includes("emit('finish')")
      || /(?:ontologyApi|objectExplorerApi|glossaryApi|fetch\(|AbortController)/.test(source)
    )
  ) {
    violations.push(`${path}: generation outcome must own pure retry/edit/save/synonym result presentation`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      /@dblclick=/.test(source)
      || !source.includes('class="search-row__primary"')
      || !source.includes('class="table-item__primary"')
      || !source.includes('function activateCatalogTable(')
      || !source.includes('function activateSemanticResult(')
      || !source.includes('테이블 캔버스에 추가`')
      || !source.includes('테이블 캔버스에서 제거`')
      || !source.includes('의미 검색 결과를 캔버스에 추가`')
    )
  ) {
    violations.push(`${path}: Schema modeling sources must preserve drag while native target-labelled siblings own select, add, and remove`)
  }

  if (
    path === 'workflows/ontology/ui/ObjectTypeModeler.vue'
    && (
      /@dblclick=/.test(source)
      || /opacity:\s*0;[\s\S]{0,160}\.ot-actions/.test(source)
      || !source.includes('ObjectType 캔버스에 추가`')
      || !source.includes('ObjectType Behavior 추가`')
      || !source.includes('ObjectType 편집`')
      || !source.includes('ObjectType 삭제`')
    )
  ) {
    violations.push(`${path}: ObjectType drag cards must expose always-discoverable native add, Behavior, edit, and delete siblings`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      source.includes('@dblclick.stop="startEditSchemaName')
      || !source.includes('<OntologyViewerHeader')
    )
  ) {
    violations.push(`${path}: saved-schema presentation must remain behind the named header boundary without redundant double-click ownership`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyViewerHeader.vue'
    && (
      !source.includes('온톨로지 이름 편집`')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('defineExpose({ focusRenameInput })')
      || !source.includes('aria-controls="ontology-library-menu"')
      || !source.includes("emit('retryList')")
      || !source.includes("emit('retryLoad')")
      || /(?:ontologyApi|objectExplorerApi|fetch\(|AbortController)/.test(source)
    )
  ) {
    violations.push(`${path}: ontology header must own accessible controlled library, rename, delete, layout, save, and What-if presentation`)
  }

  if (
    path === 'workflows/ontology/model/ontologyCanvasStyles.ts'
    && (
      !source.includes('RELATIONSHIP_STYLES')
      || !source.includes('createOntologyCanvasStyles')
      || !source.includes('edge[type="CAUSES"]')
      || !source.includes('node.agent-running')
      || !source.includes('.filtered-cascade')
      || /\b(?:ref|reactive|computed|watch)\s*\(/.test(source)
      || /\b(?:document|window)\./.test(source)
    )
  ) {
    violations.push(`${path}: canvas style projection must remain complete, theme-explicit, deterministic, and framework-free`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../model/ontologyGraphElements')
      || !source.includes('projectOntologyGraphElements(')
      || !source.includes('ONTOLOGY_CANVAS_LAYERS')
      || /const\s+layerHierarchy\s*:/.test(source)
      || /const\s+relationTypeInversion\s*:/.test(source)
      || /const\s+(?:upwardRelationTypes|horizontalRelationTypes)\s*=/.test(source)
      || /cytoscape\.ElementDefinition/.test(source)
    )
  ) {
    violations.push(`${path}: layer catalog and Cytoscape element projection must remain in the ontology graph model`)
  }

  if (
    path === 'workflows/ontology/model/ontologyGraphElements.ts'
    && (
      !source.includes('ONTOLOGY_CANVAS_LAYERS')
      || !source.includes('RELATION_TYPE_INVERSION')
      || !source.includes('projectOntologyGraphElements')
      || !source.includes('hasCompletePositions')
      || !source.includes('Number.isFinite')
      || !source.includes('REV_')
      || /\b(?:ref|reactive|computed|watch)\s*\(/.test(source)
      || /\b(?:document|window)\./.test(source)
    )
  ) {
    violations.push(`${path}: graph element projection must remain layer-canonical, direction-deterministic, finite-position-safe, and framework-free`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('../composables/useOntologyCanvasLayout')
      || !source.includes('useOntologyCanvasLayout')
      || /\b(?:LAYER_BASE_Y|LAYER_SPACING|DEPTH_SPACING|PROCESS_X_SPACING|driverTargetX|calculateDepth)\b/.test(source)
    )
  ) {
    violations.push(`${path}: hierarchical topology and position calculation must remain in the pure layout model`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyCanvasLayout.ts'
    && (
      !source.includes('../model/ontologyHierarchicalLayout')
      || !source.includes('projectOntologyHierarchicalLayout(')
      || !source.includes('../model/graphViewport')
      || !source.includes('limitOntologyAutoFitZoom')
      || !source.includes('isCurrentGeneration')
    )
  ) {
    violations.push(`${path}: canvas layout lifecycle must use pure topology, bounded zoom, and generation guards`)
  }

  if (
    path === 'workflows/ontology/model/ontologyHierarchicalLayout.ts'
    && (
      !source.includes('projectOntologyHierarchicalLayout')
      || !source.includes('calculateDepth')
      || !source.includes('DRIVER_PULL_ITERATIONS')
      || !source.includes('resolveLayoutLayer')
      || !source.includes('getOntologyCanvasLayerRank')
      || /\b(?:ref|reactive|computed|watch)\s*\(/.test(source)
      || /\b(?:document|window|cytoscape)\b/.test(source)
    )
  ) {
    violations.push(`${path}: hierarchical layout must remain deterministic, layer-canonical, finite, and renderer-independent`)
  }

  if (
    path === 'domains/ontology/ui/extraction/OntologyWizard.vue'
    && /startDataBinding|startMonitoring|\bconfirm\s*\(|class="wizard-step step-bind"/.test(source)
  ) {
    violations.push(`${path}: unreachable binding/monitoring placeholder UI must not return`)
  }

  if (
    path === 'domains/ontology/ui/extraction/InstancePanel.vue'
    && (
      /from\s+['"]@\/domains\/(?:ontology|text2sql|data-fabric)['"]/.test(source)
      || /EntityQueryPanel|Text2SqlTab|useReactStore|useDatasourcesStore/.test(source)
      || /typeof\s+table\s*===\s*['"]string['"]|console\.(?:log|error)|@(?:click|change)=['"]loadData['"]/.test(source)
    )
  ) {
    violations.push(`${path}: datasource binding must stay domain-local and delegate cross-domain SQL workflows`)
  }

  if (
    path === 'domains/ontology/state/extraction.ts'
    && (
      /from\s+['"]@\/domains\/ontology['"]/.test(source)
      || /async function (?:bindDataSource|unbindDataSource)\([^)]*\)[\s\S]{0,160}Promise<boolean>/.test(source)
    )
  ) {
    violations.push(`${path}: ontology state must not self-import its barrel or report binding failure as false success`)
  }

  if (
    path === 'workflows/ontology/ui/SchemaBasedGenerator.vue'
    && /console\.(?:log|error)|typeof\s+(?:ds|s)\s*===\s*['"]string['"]|tableCount|ds-type/.test(source)
  ) {
    violations.push(`${path}: schema generation must use typed Text2SQL metadata and visible workflow errors`)
  }

  if (
    path === 'workflows/ontology/ui/CreateObjectTypeDialog.vue'
    && (
      /console\.(?:log|error)|requestBody:\s*any/.test(source)
      || /catch\s*\(\s*relErr\s*\)[\s\S]{0,160}console/.test(source)
    )
  ) {
    violations.push(`${path}: ObjectType creation must expose typed primary and partial relationship failures`)
  }

  if (
    (
      path.startsWith('domains/data-fabric/')
      && /\bstore\s*\.\s*(?:error|loading|clearError)\b/.test(source)
    )
    || /\bdatasourcesStore\s*\.\s*(?:error|loading|clearError)\b/.test(source)
  ) {
    violations.push(`${path}: Data Fabric list, table, and mutation states must remain operation-specific`)
  }

  if (
    path === 'domains/data-fabric/ui/DataSourceManager.vue'
    && (
      /DataSourceTypeConfig|connectionName|selectedType|testConnectionWithParams/.test(source)
      || /\b(?:alert|confirm|setTimeout|clearTimeout)\s*\(/.test(source)
      || /CONNECTOR_PRESENTATIONS|datasourceConfig|categoryIcons/.test(source)
    )
  ) {
    violations.push(`${path}: management shell must not absorb connector catalog, connection form, native dialog, or raw timer responsibilities`)
  }

  if (
    path === 'domains/data-fabric/ui/AddDataSourceDialog.vue'
    && (
      /\b(?:alert|confirm|setTimeout|clearTimeout)\s*\(/.test(source)
      || !source.includes('../application/connectionDraft.ts')
      || !source.includes('useManagedTimeouts')
    )
  ) {
    violations.push(`${path}: connection dialog must use the tested draft policy and managed UI lifetime`)
  }

  if (
    path === 'domains/data-fabric/ui/DataSourceCard.vue'
    && !/class="source-select"/.test(source)
  ) {
    violations.push(`${path}: datasource selection must remain a native button boundary`)
  }

  if (
    path === 'domains/catalog/glossary/ui/TermBulkUploadModal.vue'
    && (
      /\bas any\b|as unknown|\b(?:alert|confirm|setTimeout|clearTimeout)\s*\(/.test(source)
      || /\$event\.target\s+as|JSON\.parse/.test(source)
      || !source.includes('../application/bulkUploadDraft.ts')
      || !source.includes('../application/useBulkUploadOperations')
      || !source.includes('useBulkUploadOperations')
      || !source.includes('GlossaryActionDialog')
    )
  ) {
    violations.push(`${path}: bulk upload workflow must use typed application policy, managed lifetime, and explicit confirmation UI`)
  }

  if (
    path === 'domains/catalog/glossary/application/useBulkUploadOperations.ts'
    && (
      !source.includes('useManagedTimeouts')
      || !source.includes('AbortController')
      || !source.includes('bulkExtractStream')
      || !source.includes('onScopeDispose')
    )
  ) {
    violations.push(`${path}: bulk upload operations must own cancellation, managed timers, streaming, and scope cleanup`)
  }

  if (
    path === 'domains/catalog/glossary/ui/GlossaryActionDialog.vue'
    && !/role="alertdialog"/.test(source)
  ) {
    violations.push(`${path}: glossary confirmation must remain an accessible alertdialog`)
  }

  if (
    path === 'domains/catalog/glossary/ui/GlossaryTab.vue'
    && (
      /\b(?:alert|confirm)\s*\(/.test(source)
      || !source.includes('GlossaryActionDialog')
      || !source.includes('retryLastOperation')
    )
  ) {
    violations.push(`${path}: glossary actions must keep accessible confirmation and operation-specific retry`)
  }

  if (
    path === 'domains/catalog/glossary/ui/BusinessDayCalendar.vue'
    && (
      /\b(?:setTimeout|clearTimeout|alert|confirm)\s*\(/.test(source)
      || !source.includes('../application/businessCalendarDraft.ts')
      || !source.includes('useManagedTimeouts')
      || !source.includes('useDialogFocusLifecycle')
      || !/role="dialog"/.test(source)
      || !source.includes('retryOperation')
    )
  ) {
    violations.push(`${path}: business calendar must use tested policy, managed lifetime, dialog, and exact retry`)
  }

  if (
    (
      path === 'domains/catalog/glossary/ui/GlossaryModal.vue'
      || path === 'domains/catalog/glossary/ui/TermModal.vue'
    )
    && (
      !/role="dialog"/.test(source)
      || !/aria-modal="true"/.test(source)
      || !source.includes('@keydown.esc')
    )
  ) {
    violations.push(`${path}: glossary editor modal must keep dialog, busy, focus, and Escape semantics`)
  }

  if (
    path === 'domains/catalog/glossary/ui/TermModal.vue'
    && (
      /console\.(?:error|warn|log)/.test(source)
      || !source.includes('Promise.allSettled')
      || !source.includes('metadataError')
    )
  ) {
    violations.push(`${path}: term metadata partial failures must remain visible and retryable`)
  }

  if (
    path === 'domains/catalog/glossary/api.ts'
    && (
      !source.includes('parseBulkUploadResponse(await postFormData<unknown>')
      || !source.includes('parseBulkExtractResponse(await postJson<unknown>')
      || !source.includes('parseBulkImportResponse(await postJson<unknown>')
      || !source.includes('parseBulkRollbackResponse(await response.json())')
      || !source.includes('parseGlossaryListResponse(await response.json())')
      || !source.includes('parseGlossaryResponse(await response.json())')
      || !source.includes('parseTermListResponse(await response.json())')
      || !source.includes('parseTermResponse(await response.json())')
      || !source.includes('parseBusinessDaysResponse(await response.json())')
      || !source.includes('parseBusinessCalendarMutationResponse(await response.json())')
      || !source.includes("parseGlossaryMetadataResponse(await response.json(), 'domains')")
      || !source.includes("parseGlossaryMetadataResponse(await response.json(), 'owners')")
      || !source.includes("parseGlossaryMetadataResponse(await response.json(), 'tags')")
    )
  ) {
    violations.push(`${path}: glossary responses must cross runtime parsers before reaching UI state`)
  }

  if (
    path === 'app/settings/SettingsModal.vue'
    && (
      /\b(?:alert|confirm)\s*\(/.test(source)
      || !source.includes('./application/settingsDraft')
      || !source.includes('SettingsActionDialog')
    )
  ) {
    violations.push(`${path}: settings draft and destructive actions must remain separated from native dialogs`)
  }

  if (
    path === 'app/settings/SettingsActionDialog.vue'
    && (
      !/role="alertdialog"/.test(source)
      || !source.includes('aria-busy')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('requestCancel')
    )
  ) {
    violations.push(`${path}: settings destructive actions must remain an accessible pending/error alertdialog`)
  }

  if (
    path === 'app/notifications/AlarmToast.vue'
    && (
      /\b(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/.test(source)
      || /console\.(?:log|warn|error)/.test(source)
      || !source.includes('useManagedTimeouts')
      || !source.includes('acknowledgingIds')
      || !source.includes('streamError')
      || !source.includes('aria-busy')
    )
  ) {
    violations.push(`${path}: app alarms must keep managed reconnect/dismiss lifetimes and per-alarm acknowledgement state`)
  }

  if (
    path === 'domains/text2sql/ui/HistoryPanel.vue'
    && (
      /\b(?:alert|confirm|setTimeout|clearTimeout)\s*\(/.test(source)
      || /console\.(?:error|warn|log)/.test(source)
      || !source.includes('HistoryActionDialog')
      || !source.includes('useManagedTimeouts')
      || !source.includes('aria-pressed')
    )
  ) {
    violations.push(`${path}: Text2SQL history must keep managed search, keyboard selection, and explicit delete state`)
  }

  if (
    (
      path === 'domains/security/ui/UserManagement.vue'
      || path === 'domains/security/ui/RoleManagement.vue'
      || path === 'domains/security/ui/AuditLogs.vue'
    )
    && /\b(?:alert|confirm|prompt)\s*\(|console\.(?:log|warn|error)/.test(source)
  ) {
    violations.push(`${path}: Security UI must expose load/editor/delete failures without native dialogs or console-only handling`)
  }

  if (
    (
      path === 'domains/security/ui/UserManagement.vue'
      || path === 'domains/security/ui/RoleManagement.vue'
    )
    && (
      !source.includes('ActionDialog')
      || !source.includes('role="dialog"')
      || !source.includes('editorPending')
      || !source.includes('deletePending')
    )
  ) {
    violations.push(`${path}: Security CRUD must keep editor and target-specific delete lifetimes explicit`)
  }

  if (
    path.startsWith('domains/olap/ui/')
    && (
      /\b(?:alert|confirm|prompt|setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/.test(source)
      || /console\.(?:log|warn|error)/.test(source)
      || /\bEventSource\b/.test(source)
    )
  ) {
    violations.push(`${path}: OLAP UI must use visible operation state, managed lifetimes, and abortable domain streams`)
  }

  if (
    path === 'domains/olap/ui/OlapTab.vue'
    && (
      !source.includes('executeCubeDeletion')
      || !source.includes('ActionDialog')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('suspended: () => deletionTarget.value !== null')
      || /listDWTables|normalizedName|fact_\$\{|dim_time|dim_site|dim_tag/.test(source)
    )
  ) {
    violations.push(`${path}: cube deletion must use the application policy without inferred single-cube DW ownership`)
  }

  if (
    path === 'domains/olap/ui/CubeDesigner.vue'
    && (
      !source.includes('executeCubeProvision')
      || !source.includes('CubeProvisionCheckpoint')
      || !source.includes('ActionDialog')
    )
  ) {
    violations.push(`${path}: cube provisioning must keep checkpointed steps and honest Airflow mutation results`)
  }

  if (
    path === 'domains/olap/application/provisionCube.ts'
    && (
      !source.includes('executeCubeProvision')
      || !source.includes('requireSuccessfulOperation')
      || !source.includes('CubeProvisionCheckpoint')
    )
  ) {
    violations.push(`${path}: cube provisioning policy must retain checkpoints and reject dishonest operation results`)
  }

  if (
    path === 'domains/olap/ui/PivotAnalysis.vue'
    && (
      !source.includes('useManagedTimeouts')
      || !source.includes('parsePivotDropPayload')
      || !source.includes('ActionDialog')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('suspended: () => pendingAction.value !== null')
      || !source.includes('../composables/useEtlScriptLifecycle.ts')
      || /\bolapApi\.(?:createAgentStream|generateETLScript|loadSavedScript|saveETLScript|executeScriptWithRetry)\b/.test(source)
      || /\b(?:activeAgentStream|executionCancelFn)\b/.test(source)
      || /const\s+(?:scriptCode|scriptFilename|scriptExecuting|scriptExecutionResult|agentReasoningLog|agentStatus|scriptSaved|scriptSavedAt|scriptSaving|savedScriptLoadError)\s*=\s*ref/.test(source)
    )
  ) {
    violations.push(`${path}: pivot editing must delegate ETL script request identity, state, and stream ownership to its domain lifecycle`)
  }

  if (
    path === 'domains/olap/composables/useEtlScriptLifecycle.ts'
    && (
      !source.includes('../application/etlScriptTargets')
      || !source.includes('onScopeDispose')
      || !source.includes('generationSequence')
      || !source.includes('savedLoadSequence')
      || !source.includes('saveSequence')
      || !source.includes('downloadSequence')
      || !source.includes('executionSequence')
      || !source.includes('failedSaveTarget')
      || !source.includes('completedExecutionSequence')
    )
  ) {
    violations.push(`${path}: ETL script lifecycle must keep operation-specific identity, frozen retry, and scope disposal explicit`)
  }

  if (
    path === 'domains/olap/api/client.ts'
    && (
      /\bnew\s+EventSource\b/.test(source)
      || !source.includes('streamSseFetch')
      || !source.includes('AbortController')
      || !source.includes('streamHeaders()')
      || !/generateETLScript[\s\S]{0,220}signal\?: AbortSignal/.test(source)
      || !/saveETLScript[\s\S]{0,260}signal\?: AbortSignal/.test(source)
      || !/loadSavedScript[\s\S]{0,220}signal\?: AbortSignal/.test(source)
    )
  ) {
    violations.push(`${path}: OLAP script reads, writes, generation, and streams must support abortable ownership with runtime headers`)
  }

  if (
    path === 'domains/olap/state/olap.ts'
    && (
      /const\s+(?:loading|error)\s*=\s*ref/.test(source)
      || !source.includes('cubeListSequence')
      || !source.includes('cubeSelectionSequence')
      || !source.includes('previewSequence')
      || !source.includes('commitCubeDeletion')
    )
  ) {
    violations.push(`${path}: OLAP list, selection, query, preview, sync, and deletion commits must remain operation-specific`)
  }

  if (
    path === 'domains/catalog/api/lineage.ts'
    && (
      !source.includes('parseCatalogLineageResponse')
      || !source.includes('return parseCatalogLineageResponse(await response.json())')
    )
  ) {
    violations.push(`${path}: Catalog lineage JSON must be runtime-validated at its domain API boundary`)
  }

  if (
    path === 'workflows/data-lineage/ui/LineageTab.vue'
    && (
      !source.includes('useLineageGraphQuery')
      || source.includes('olapLineageApi')
      || /interface\s+Lineage(?:Node|Edge|GraphData)/.test(source)
    )
  ) {
    violations.push(`${path}: Data Lineage UI must consume workflow-owned cross-domain projection and query state`)
  }

  if (
    path === 'workflows/data-lineage/ui/LineageDetailPanel.vue'
    && (
      /\b(?:alert|confirm|prompt|setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/.test(source)
      || !source.includes('ActionDialog')
      || !source.includes('useManagedTimeouts')
      || !source.includes('redeployTarget')
    )
  ) {
    violations.push(`${path}: lineage DAG redeploy must freeze its target and use explicit dialog/managed status state`)
  }

  if (
    path === 'workflows/data-lineage/ui/LineageGraph.vue'
    && (
      /\b(?:setTimeout|clearTimeout|setInterval|clearInterval)\s*\(/.test(source)
      || !source.includes('useManagedTimeouts')
    )
  ) {
    violations.push(`${path}: lineage viewport updates must be scoped to a managed component lifetime`)
  }

  if (
    path === 'workflows/data-lineage/application/useLineageGraphQuery.ts'
    && (
      !source.includes('Promise.allSettled')
      || !source.includes('currentSequence !== sequence')
      || !source.includes('mergeLineageGraphs')
    )
  ) {
    violations.push(`${path}: lineage query must preserve partial sources, merged projection, and stale-load rejection`)
  }

  if (
    (
      path === 'workflows/observability/ui/WatchAgent.vue'
      || path === 'workflows/observability/ui/EventDetection.vue'
    )
    && (
      /\b(?:alert|confirm|prompt)\s*\(/.test(source)
      || /role=["']button["']/.test(source)
      || !source.includes('ActionDialog')
      || !source.includes('commitMutationThenRefresh')
    )
  ) {
    violations.push(`${path}: Observability mutations require sibling native controls, exact dialog retry, and commit-before-refresh state`)
  }

  if (
    path === 'workflows/observability/application/commitMutationThenRefresh.ts'
    && (
      !source.includes('const result = await options.mutate()')
      || !source.includes('const committedItems = options.commit')
      || !source.includes('refreshError')
    )
  ) {
    violations.push(`${path}: Observability mutation must commit primary success before treating refresh as a separate warning`)
  }

  if (
    path === 'shared/components/ActionDialog.vue'
    && (
      !source.includes('role="alertdialog"')
      || !source.includes('aria-busy')
      || !source.includes('useDialogFocusLifecycle')
      || source.includes('document.addEventListener')
      || !source.includes('requestCancel')
      || /@\/(?:domains|workflows)\//.test(source)
    )
  ) {
    violations.push(`${path}: shared destructive dialog must remain domain-independent and own focus/pending/error accessibility`)
  }

  if (
    /(?:SecurityActionDialog|OlapActionDialog|ObservabilityActionDialog)/.test(source)
  ) {
    violations.push(`${path}: old domain-specific destructive dialog implementation must not remain`)
  }

  if (
    path === 'domains/text2sql/ui/HistoryActionDialog.vue'
    && (
      !/role="alertdialog"/.test(source)
      || !source.includes('aria-busy')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('requestCancel')
    )
  ) {
    violations.push(`${path}: Text2SQL history mutation must remain an accessible pending/error alertdialog`)
  }

  if (
    path === 'domains/text2sql/state/history.ts'
    && (
      /Promise<boolean>/.test(source)
      || /Promise<QueryHistoryItem\s*\|\s*null>/.test(source)
      || /console\.(?:log|warn|error)/.test(source)
      || !source.includes('fetchSequence')
      || !source.includes('activeSearch')
    )
  ) {
    violations.push(`${path}: Text2SQL history state must preserve filters, discard stale reads, and propagate mutation failure`)
  }

  if (
    path.startsWith('domains/text2sql/state/')
    && /console\.(?:log|warn|error)/.test(source)
  ) {
    violations.push(`${path}: Text2SQL state failures must reach explicit state or callers instead of console-only handling`)
  }

  if (
    path.startsWith('domains/text2sql/')
    && /from\s+['"]@\/domains\/ontology(?:\/|['"])/.test(source)
  ) {
    violations.push(`${path}: Text2SQL domain must export result intent instead of orchestrating Ontology`)
  }

  if (
    path === 'domains/text2sql/ui/Text2SqlTab.vue'
    && (
      /createInstancesFromSql|ontologyApi|objectExplorerApi|ontology-modal/.test(source)
      || !source.includes('request-instance-export')
      || /\b(?:alert|confirm|prompt|setTimeout|clearTimeout)\s*\(/.test(source)
      || /JSON\.parse|console\.(?:log|warn|error)/.test(source)
      || !source.includes('../application/recentQueries')
      || !source.includes('../application/messageWindow')
      || !source.includes('FeedbackDialog')
      || !source.includes('useManagedTimeouts')
      || !/<button[\s\S]{0,180}class="hidden-messages-indicator"/.test(source)
      || /<div[^>]*class="hidden-messages-indicator"/.test(source)
    )
  ) {
    violations.push(`${path}: Text2SQL result UI must keep typed exports, persistence, feedback, and timer lifetimes separated`)
  }

  if (
    path === 'domains/text2sql/ui/FeedbackDialog.vue'
    && (
      !source.includes('role="dialog"')
      || !source.includes('aria-busy')
      || !source.includes('useDialogFocusLifecycle')
      || source.includes('document.addEventListener')
      || !source.includes('requestClose')
    )
  ) {
    violations.push(`${path}: Text2SQL feedback must remain an accessible pending/error dialog`)
  }

  if (
    path === 'workflows/text2sql-ontology/ui/SqlResultInstanceDialog.vue'
    && (
      !source.includes('../application/instanceCreationGateway')
      || !source.includes('createOntologyInstancesFromSql')
      || !source.includes('role="dialog"')
      || !source.includes('useDialogFocusLifecycle')
      || source.includes('document.addEventListener')
      || !source.includes('schemaListError')
      || !source.includes('schemaDetailError')
      || !source.includes('createError')
      || /\b(?:alert|confirm|prompt)\s*\(/.test(source)
    )
  ) {
    violations.push(`${path}: Text2SQL-to-Ontology orchestration must keep explicit metadata, mutation, dialog, and retry state`)
  }

  if (
    path === 'workflows/code-analysis/ui/upload/UploadTab.vue'
    && (
      /class="tab-item"[\s\S]{0,200}@click="activateTab/.test(source)
      || !source.includes('role="tablist"')
      || !source.includes('role="tab"')
      || !source.includes(':aria-selected="activeTabId === tab.id"')
      || !source.includes(':aria-label="`${tab.fileName} 닫기`"')
    )
  ) {
    violations.push(`${path}: upload tabs require sibling native activation/close controls with selected ownership`)
  }

  if (
    path === 'workflows/code-analysis/ui/upload/ScopeBrowser.vue'
    && (
      !source.includes('@/shared/components/ActionDialog.vue')
      || !source.includes('role="menu"')
      || !source.includes('role="menuitem"')
      || !source.includes('@keydown.shift.f10.prevent')
      || !source.includes("toastTimers.cancel('scope-toast')")
      || !source.includes('aria-label="알림 닫기"')
      || /class="modal-(?:backdrop|box|msg|actions|btn)"/.test(source)
      || /<div[^>]*class="toast"[^>]*@click=/.test(source)
    )
  ) {
    violations.push(`${path}: scope transient actions require keyboard menu, shared confirmation, and timer-owned toast dismissal`)
  }

  if (
    [
      'domains/ontology/ui/extraction/OntologyCanvas.vue',
      'domains/ontology/ui/modeling/ObjectTypeEditDialog.vue',
      'domains/ontology/ui/modeling/BpmnViewer.vue',
      'shared/stores/runtime.ts',
    ].includes(path)
    && (
      /\b(?:setTimeout|clearTimeout)\s*\(/.test(source)
      || !source.includes('useManagedTimeouts')
    )
  ) {
    violations.push(`${path}: delayed UI work must use scope-owned latest-wins managed timeouts`)
  }

  if (
    path === 'domains/ontology/ui/modeling/BpmnViewer.vue'
    && (
      !source.includes('popupGeneration')
      || !source.includes('inlineGeneration')
      || !source.includes("timers.cancel('popup-open')")
      || !source.includes("timers.cancel('save-message')")
      || !source.includes('currentModeler !== modeler')
      || source.includes('keyboard: { bindTo:')
      || !source.includes('window.innerHeight * 0.75')
      || !source.includes('canvas.zoom(1.5)')
    )
  ) {
    violations.push(`${path}: BPMN delayed editor, viewport, and status work must reject stale modeler lifetimes`)
  }

  if (
    path === 'shared/stores/runtime.ts'
    && !source.includes("timers.schedule('theme-transition'")
  ) {
    violations.push(`${path}: rapid theme changes must replace the previous transition lifetime`)
  }

  if (
    path === 'domains/ontology/ui/modeling/ObjectTypeEditDialog.vue'
    && (
      !source.includes('role="dialog"')
      || !source.includes('role="tablist"')
      || !source.includes('role="tabpanel"')
      || !source.includes('useDialogFocusLifecycle')
      || !source.includes('mutationPending')
      || !source.includes('canClose: () => !mutationPending.value')
      || source.includes('document.addEventListener')
      || !source.includes('aria-label="ObjectType 편집 닫기"')
      || !/class="save-message"[\s\S]{0,500}<ChartConfigTab/.test(source)
      || !source.includes('@media (max-width: 720px)')
    )
  ) {
    violations.push(`${path}: ObjectType editor requires visible status, dialog focus ownership, and mobile geometry`)
  }

  if (
    path === 'domains/ontology/ui/modeling/ChartConfigTab.vue'
    && (
      !source.includes('@media (max-width: 720px)')
      || !source.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')
    )
  ) {
    violations.push(`${path}: chart configuration and preview must stack without mobile overflow`)
  }

  if (
    path === 'shared/composables/useDialogFocusLifecycle.ts'
    && (
      !source.includes("document.addEventListener('keydown', handleKeydown, true)")
      || !source.includes("document.removeEventListener('keydown', handleKeydown, true)")
      || !source.includes("event.key === 'Escape'")
      || !source.includes("event.key !== 'Tab'")
      || !source.includes('suspended')
      || !source.includes('getClientRects().length > 0')
      || !source.includes('restoreTriggerFocus')
      || !source.includes('onBeforeUnmount')
      || /(?:fetch|useRuntimeStore|domains\/|workflows\/)/.test(source)
    )
  ) {
    violations.push(`${path}: shared dialog focus lifecycle must own only keyboard listener, trap, and trigger restoration`)
  }

  if (
    path === 'shared/composables/useLatestTaskScope.ts'
    && (
      !source.includes('createLatestTaskScope')
      || !source.includes('expectedGeneration')
      || !source.includes('timers.clear()')
      || !source.includes('function guard(')
      || /(?:fetch|useRuntimeStore|domains\/|workflows\/)/.test(source)
    )
  ) {
    violations.push(`${path}: latest task scope must own only named task replacement and generation invalidation`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      source.includes('function scheduleTimeout(')
      || source.includes('nextTimeoutId')
      || !source.includes('useLatestTaskScope')
      || !source.includes("canvasTasks.schedule('canvas-init'")
      || !source.includes("canvasTasks.schedule('selection-restore'")
      || !source.includes("'canvas-viewport-sync'")
      || !source.includes("canvasTasks.schedule('schema-loading-settle'")
      || !source.includes('layout.one(\'layoutstop\', canvasTasks.guard(generation')
      || !source.includes('../composables/useOntologyCanvasLayout')
      || !/function commitOntologyCanvasProjection\([\s\S]{0,180}canvasTasks\.begin\(\)/.test(source)
      || !/function destroyCytoscapeCanvas\(invalidateTasks = true\)[\s\S]{0,120}canvasTasks\.clear\(\)/.test(source)
    )
  ) {
    violations.push(`${path}: canvas init, selection, viewport, zoom, and loading tasks must reject stale canvas generations`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyGraphContextMenu from './canvas/OntologyGraphContextMenu.vue'")
      || !source.includes('<OntologyGraphContextMenu')
      || source.includes('class="canvas-context-menu"')
      || source.includes('role="menuitem"')
    )
  ) {
    violations.push(`${path}: graph context menu presentation must remain in its named canvas UI boundary`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyGraphContextMenu.vue'
    && (
      !source.includes("mode: 'canvas' | 'node' | 'edge'")
      || !source.includes('role="menu"')
      || !source.includes('role="menuitem"')
      || !source.includes("emit('addNode', layer.id)")
      || !source.includes("emit('applyFilter')")
      || !source.includes("emit('editRelationship')")
      || !source.includes('function clampMenuPosition()')
      || !source.includes('menu?.offsetParent')
      || !source.includes('container.clientWidth - menu.offsetWidth')
      || !source.includes('container.clientHeight - menu.offsetHeight')
      || /(?:cytoscape|ontologyApi|whatifDomainApi|fetch\(|useOntology|nodes\.value|relationships\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: graph context menu must remain presentation-only and emit explicit native menu actions`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyGraphOverlay from './canvas/OntologyGraphOverlay.vue'")
      || !source.includes('<OntologyGraphOverlay')
      || !source.includes(':pending-relationship-source-name="pendingRelationSourceName"')
      || !source.includes('@cancel-pending-relationship="cancelPendingRelation"')
      || !source.includes('@toggle-relationship-mode="toggleRelationDrawMode"')
      || !source.includes('../composables/useOntologyLocalGraphEditing')
      || !source.includes('pendingRelationPreviousSelectionId')
      || source.includes('class="relation-pending-banner"')
      || source.includes('class="graph-floating-toolbar"')
      || source.includes('class="graph-legend"')
    )
  ) {
    violations.push(`${path}: graph pending, mode, and legend presentation must remain in the canvas overlay boundary`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyGraphOverlay.vue'
    && (
      !source.includes('pendingRelationshipSourceName: string | null')
      || !source.includes(':aria-pressed="relationshipModeActive"')
      || !source.includes('role="status"')
      || !source.includes('role="group"')
      || !source.includes("emit('cancelPendingRelationship')")
      || !source.includes("emit('toggleRelationshipMode')")
      || !/@media \(max-width: 720px\)[\s\S]*\.relation-pending-banner \{[\s\S]*left: 8px;[\s\S]*right: 8px;[\s\S]*white-space: normal;[\s\S]*z-index: 60;/.test(source)
      || /(?:cytoscape|edgehandles|ontologyApi|whatifDomainApi|fetch\(|useOntology|nodes\.value|relationships\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: graph overlay must remain presentation-only with explicit status, pressed state, and events`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyLayerPanel from './canvas/OntologyLayerPanel.vue'")
      || !source.includes('<OntologyLayerPanel')
      || !source.includes(':groups="layerPanelGroups"')
      || !source.includes('@activate-node="handleLayerNodeClick"')
      || !source.includes('@open-node-menu="openNodeContextMenu"')
      || !source.includes('nodes: getLayerNodes(layer.id).map(')
      || source.includes('class="layer-panel"')
      || source.includes('class="layer-header"')
      || source.includes('class="node-item"')
    )
  ) {
    violations.push(`${path}: layer header, disclosure, and node actions must remain in the named canvas panel boundary`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyLayerPanel.vue'
    && (
      !source.includes('interface LayerPanelGroup')
      || !source.includes(':aria-expanded="!collapsed"')
      || !source.includes(':aria-controls="layerNodesId(group.id)"')
      || !source.includes(':aria-pressed="selectedNodeId === node.id"')
      || !source.includes("emit('toggleLayer', group.id)")
      || !source.includes("emit('activateNode', node.id)")
      || !source.includes("emit('openNodeMenu', $event, node.id)")
      || !source.includes('encodeURIComponent(layerId)')
      || !/@media \(max-width: 720px\)[\s\S]*\.layer-panel \{[\s\S]*z-index: 30;[\s\S]*max-width: calc\(100% - 44px\)/.test(source)
      || /(?:cytoscape|ontologyApi|whatifDomainApi|fetch\(|useOntology|nodes\.value|relationships\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: layer panel must remain presentation-only with native disclosure, selection, context events, and mobile geometry`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyRelationDetail from './canvas/OntologyRelationDetail.vue'")
      || !source.includes('<OntologyRelationDetail')
      || !source.includes(':form="editingRelationForm"')
      || !source.includes('@update-field="updateRelationEditorField"')
      || !source.includes('@connect-datasource="openRelationEndpointDataSource"')
      || !source.includes('@save="saveRelationEditor"')
      || source.includes('class="relation-preview-panel"')
      || source.includes('class="field-mapping-section"')
      || source.includes('class="relation-column-retry"')
    )
  ) {
    violations.push(`${path}: relation detail form and column-state presentation must remain in its named canvas boundary`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyRelationDetail.vue'
    && (
      !source.includes("import RelationColumnField from './RelationColumnField.vue'")
      || !source.includes("emit('update-field', field, value)")
      || !source.includes("emit('save')")
      || !source.includes("emit('connect-datasource', 'source')")
      || !source.includes("emit('connect-datasource', 'target')")
      || !source.includes('aria-label="릴레이션 상세 닫기"')
      || !source.includes('role="alert"')
      || /(?:cytoscape|ontologyApi|objectExplorerApi|whatifDomainApi|fetch\(|useOntology|relationships\.value|saveState\()/.test(source)
    )
  ) {
    violations.push(`${path}: relation detail must remain controlled presentation with explicit intent events`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/RelationColumnField.vue'
    && (
      !source.includes("status === 'loading'")
      || !source.includes("status === 'no_datasource'")
      || !source.includes("status === 'error'")
      || !source.includes("emit('update'")
      || !source.includes("emit('connect-datasource')")
      || /(?:cytoscape|ontologyApi|objectExplorerApi|fetch\(|useOntology|relationships\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: relation column field must distinguish lifecycle states without owning data access`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyNodeDetailHeader")
      || !source.includes('<OntologyNodeDetailHeader')
      || !source.includes('@select-tab="selectNodeDetailTab"')
      || !source.includes("function selectNodeDetailTab(tab: OntologyNodeDetailTab)")
      || !source.includes("case 'data':")
      || !source.includes('openSelectedNodeDataTab()')
      || !source.includes("case 'behavior':")
      || !source.includes('openBehaviorTab(node.id)')
      || source.includes('class="detail-tabs"')
    )
  ) {
    violations.push(`${path}: node detail navigation must remain presentation-separated while orchestration stays in the parent`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeDetailHeader.vue'
    && (
      !source.includes('role="tablist"')
      || !source.includes('role="tab"')
      || !source.includes(':aria-selected="activeTab === tab.id"')
      || !source.includes(':aria-controls="`ontology-node-panel-${tab.id}`"')
      || !source.includes(':tabindex="activeTab === tab.id ? 0 : -1"')
      || !source.includes("['ArrowLeft', 'ArrowRight', 'Home', 'End']")
      || !source.includes('aria-label="노드 상세 닫기"')
      || !source.includes("emit('select-tab', tab.id)")
      || /(?:cytoscape|ontologyApi|objectExplorerApi|whatifDomainApi|fetch\(|useOntology|nodes\.value|relationships\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: node detail header must remain capability-driven tab presentation with explicit intents`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyNodeInfo")
      || !source.includes('<OntologyNodeInfo')
      || !source.includes(':filter-chips="selectedNodeInfoFilterChips"')
      || !source.includes(':relationships="selectedNodeInfoRelationships"')
      || !source.includes('@save-name="saveNodeName"')
      || !source.includes('@change-layer="changeNodeLayer"')
      || !source.includes('@edit-relation="openRelationEditor"')
      || source.includes('class="editable-name-container"')
      || source.includes('class="related-section"')
    )
  ) {
    violations.push(`${path}: node info projection and presentation must remain in its named canvas boundary`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeInfo.vue'
    && (
      !source.includes('id="ontology-node-panel-info"')
      || !source.includes('role="tabpanel"')
      || !source.includes('class="relation-edit-btn"')
      || !source.includes('관계 편집`')
      || !source.includes("emit('save-name')")
      || !source.includes("emit('cancel-name')")
      || !source.includes("emit('change-layer', layer.id)")
      || !source.includes('aria-controls="selected-node-layer-options"')
      || !source.includes(':aria-pressed="currentLayerId === layer.id"')
      || !source.includes('노드 이름 편집`')
      || source.includes('@dblclick="')
      || !source.includes('nameInput.value?.focus()')
      || !source.includes('nameInput.value?.select()')
      || /(?:cytoscape|ontologyApi|objectExplorerApi|whatifDomainApi|fetch\(|useOntology|nodes\.value|relationships\.value|saveState\()/.test(source)
    )
  ) {
    violations.push(`${path}: node info must remain controlled presentation with local input focus and explicit intents`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('<OntologyNodeBehaviorPanel')
      || !source.includes('@retry="retryNodeBehaviors"')
      || !source.includes('@refresh="loadNodeBehaviors(selectedNode.id)"')
      || !source.includes('<OntologyNodeBpmnPanel')
      || !source.includes('@saved="saveSelectedNodeBpmnXml"')
      || source.includes('<AgentsMdEditor')
      || source.includes('<BpmnViewer')
    )
  ) {
    violations.push(`${path}: Behavior and BPMN tab presentation must remain behind named child boundaries`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeBehaviorPanel.vue'
    && (
      !source.includes('role="tabpanel"')
      || !source.includes('role="status"')
      || !source.includes('role="alert"')
      || !source.includes("emit('retry')")
      || !source.includes("emit('refresh')")
      || /(?:whatifDomainApi|ontologyApi|fetch\(|AbortController|selectedNode|nodes\.value|cytoscape)/.test(source)
    )
  ) {
    violations.push(`${path}: Behavior panel must remain loading/error/editor presentation without read lifecycle ownership`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeBpmnPanel.vue'
    && (
      !source.includes('role="tabpanel"')
      || !source.includes("emit('saved', $event)")
      || !source.includes('v-if="bpmnXml"')
      || /(?:ontologyApi|fetch\(|selectedNode|nodes\.value|cytoscape)/.test(source)
    )
  ) {
    violations.push(`${path}: BPMN panel must remain controlled viewer/empty presentation with saved intent only`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('<OntologyNodeAnalysisPanel')
      || !source.includes('@update-metric="updateAnalysisMetric"')
      || !source.includes('<OntologyNodeDataState')
      || !source.includes('@fallback="fetchSelectedNodeDataViaText2Sql"')
      || !source.includes('<OntologyNodeDataSummary')
      || !source.includes('@toggle-business-day="updateBusinessDayFilter"')
      || source.includes('class="analysis-result-header"')
      || source.includes('class="no-data-actions"')
      || source.includes('class="business-day-filter-toggle"')
    )
  ) {
    violations.push(`${path}: Analysis and Data state presentation must remain behind named controlled boundaries`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeAnalysisPanel.vue'
    && (
      !source.includes('role="tabpanel"')
      || !source.includes("emit('update-metric'")
      || !source.includes("emit('reanalyze')")
      || !source.includes("emit('reconfigure')")
      || !source.includes("emit('cancel')")
      || /(?:objectExplorerApi|fetch\(|echarts|AbortController|selectedNode|nodes\.value|runCausalAnalysis)/.test(source)
    )
  ) {
    violations.push(`${path}: Analysis panel must remain controlled result/empty/Causal composition without lifecycle ownership`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeDataState.vue'
    && (
      !source.includes('role="status"')
      || !source.includes('role="alert"')
      || !source.includes("emit('retry')")
      || !source.includes("emit('fallback')")
      || !source.includes("emit('connect')")
      || !source.includes("emit('create-object-type')")
      || /(?:objectExplorerApi|fetch\(|echarts|selectedNode|nodes\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: Data state panel must distinguish loading/empty/error actions without data ownership`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeDataSummary.vue'
    && (
      !source.includes(':checked="businessDayFilterEnabled"')
      || !source.includes("emit('toggle-business-day'")
      || /(?:objectExplorerApi|fetch\(|echarts|selectedNode|nodes\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: Data summary must remain controlled source/filter presentation`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('<OntologyNodeDataChart')
      || !source.includes('@host-change="handleChartHostChange"')
      || !source.includes('<OntologyNodeDataTable')
      || !source.includes('useOntologyNodeDataChart({')
      || !source.includes('setHost: handleChartHostChange')
      || !source.includes('resize: resizeNodeDataChart')
      || source.includes('class="chart-container"')
      || source.includes('class="analysis-config-bar"')
      || source.includes('class="data-table"')
      || source.includes('function formatCellValue')
      || /(?:import .*echarts|chartInstance|function renderChart|function disposeNodeDataChart|NODE_DATA_CHART_RENDER_KEY)/.test(source)
    )
  ) {
    violations.push(`${path}: Data chart host/controls and raw table presentation must remain behind named boundaries`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeDataChart.vue'
    && (
      !source.includes("emit('host-change', chartHost.value)")
      || !source.includes("emit('host-change', null)")
      || !source.includes("emit('activate-brush')")
      || !source.includes("emit('update-metric'")
      || !source.includes("emit('set-analysis-type'")
      || !source.includes("emit('analyze')")
      || !source.includes("scrollIntoView({ behavior: 'smooth', block: 'nearest' })")
      || /(?:import .*echarts|objectExplorerApi|fetch\(|chartInstance|selectedNode|nodes\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: Data chart must expose host and controlled intents without owning ECharts or data lifecycle`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeDataTable.vue'
    && (
      !source.includes('rows.slice(0, 50)')
      || !source.includes('rows.length > 50')
      || !source.includes("toLocaleString('ko-KR'")
      || !source.includes("if (value === null || value === undefined) return '-'")
      || /(?:objectExplorerApi|fetch\(|echarts|selectedNode|nodes\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: Data table must preserve pure formatting and first-50 presentation only`)
  }

  if (
    path === 'workflows/ontology/composables/useOntologyNodeDataChart.ts'
    && (
      !source.includes("import * as echarts from 'echarts'")
      || !source.includes('buildOntologyChartModel')
      || !source.includes('extractBrushXAxisRange')
      || !source.includes('resolveBrushRowRange')
      || !source.includes('useManagedTimeouts')
      || !source.includes('watch(')
      || !source.includes('[result, host, dark]')
      || !source.includes('onScopeDispose(dispose)')
      || !source.includes('chart?.dispose()')
      || !source.includes("activeChart.on('brushSelected'")
      || /(?:ontologyApi|objectExplorerApi|text2sqlApi|fetch\(|cytoscape|runCausalAnalysis)/.test(source)
    )
  ) {
    violations.push(`${path}: node-data chart runtime must own managed ECharts/brush lifecycle without API, graph, or analysis requests`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes('<OntologyNodeFilterDialog')
      || !source.includes('@update-field="updateFilterDraftField"')
      || !source.includes('<OntologyNewRelationDialog')
      || !source.includes('@update:relation-type="updateNewRelationType"')
      || source.includes('class="filter-dialog"')
      || source.includes('class="new-relation-dialog"')
    )
  ) {
    violations.push(`${path}: filter and local relationship draft presentation must remain behind named controlled boundaries`)
  }

  if (
    [
      'workflows/ontology/ui/canvas/OntologyNodeFilterDialog.vue',
      'workflows/ontology/ui/canvas/OntologyNewRelationDialog.vue',
    ].includes(path)
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('aria-modal="true"')
      || !source.includes('aria-labelledby=')
      || !source.includes('tabindex="-1"')
      || /(?:ontologyApi|objectExplorerApi|fetch\(|cytoscape|nodes\.value|relationships\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: ontology draft dialog must own accessible controlled presentation without API or graph mutation`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeFilterDialog.vue'
    && (
      !source.includes("emit('update-field'")
      || !source.includes("emit('retry')")
      || !source.includes("emit('clear')")
      || !source.includes('백엔드 날짜 범위 계약이 확인되지 않아')
      || !source.includes('백엔드 숫자 범위 계약이 확인되지 않아')
    )
  ) {
    violations.push(`${path}: node filter dialog must preserve controlled draft, retry/clear, and unsupported-contract disclosure`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyDatasourceMappingDialog from './canvas/OntologyDatasourceMappingDialog.vue'")
      || !source.includes('<OntologyDatasourceMappingDialog')
      || !source.includes('@toggle-candidate="toggleCandidateExpanded"')
      || !source.includes('@confirm-candidate="confirmMappingCandidate"')
      || !source.includes('@confirm-bulk="openBulkDatasourceConfirmation"')
      || source.includes('class="datasource-dialog"')
      || source.includes('function candidateDetailsId')
      || source.includes('function mappingDetailsId')
    )
  ) {
    violations.push(`${path}: datasource auto-link presentation must remain behind its named controlled dialog boundary`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyDatasourceMappingDialog.vue'
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('getDatasourceMappingStats')
      || !source.includes('datasourceMappingStatusIcon')
      || !source.includes('formatDatasourceSampleValue')
      || !source.includes("emit('toggle-mapping'")
      || !source.includes("emit('toggle-candidate'")
      || !source.includes("emit('confirm-candidate'")
      || !source.includes("emit('confirm-bulk')")
      || !source.includes('class="candidate-toggle-hitbox"')
      || !source.includes(':aria-controls="candidateDetailsId(nodeId, index)"')
      || !source.includes(':aria-controls="mappingDetailsId(nodeId)"')
      || !source.includes(':aria-expanded="selectedNodeId === nodeId"')
      || /class="mapping-item"[\s\S]{0,160}@click=/.test(source)
      || !source.includes('suspended: () => props.nestedDialogOpen')
      || /(?:ontologyApi|objectExplorerApi|text2sqlApi|fetch\(|AbortController|dataSourceMappings\.value|mappingConfirmPendingIds\.value)/.test(source)
    )
  ) {
    violations.push(`${path}: datasource mapping dialog must own pure accessible presentation without SSE or confirmation mutation`)
  }

  if (
    path === 'workflows/ontology/ui/MultiLayerOntologyViewer.vue'
    && (
      !source.includes("import OntologyNodeDatasourceDialog from './canvas/OntologyNodeDatasourceDialog.vue'")
      || !source.includes("import OntologyDatasourceSampleDialog from './canvas/OntologyDatasourceSampleDialog.vue'")
      || !source.includes('<OntologyNodeDatasourceDialog')
      || !source.includes('<OntologyDatasourceSampleDialog')
      || !source.includes('@update:manual-source="updateNodeManualSource"')
      || !source.includes('@load-object-types="loadObjectTypes"')
      || source.includes('class="node-datasource-dialog"')
      || source.includes('class="sample-data-dialog"')
    )
  ) {
    violations.push(`${path}: single-node datasource and sample presentation must remain behind named controlled boundaries`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyNodeDatasourceDialog.vue'
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('suspended: () => props.nestedDialogOpen')
      || !source.includes('aria-modal="true"')
      || !source.includes('OBJECT_TYPE_SOURCE')
      || !source.includes('실행 데이터 소스:')
      || !source.includes("emit('loadObjectTypes'")
      || !source.includes(':aria-pressed="selectedSearchResult === index"')
      || !source.includes(':aria-label="`${result.table_name} 미리보기`"')
      || !source.includes(':aria-label="`${result.table_name} 선택`"')
      || /class="result-item"[\s\S]{0,180}@click=/.test(source)
      || /(?:ontologyApi|objectExplorerApi|text2sqlApi|fetch\(|AbortController)/.test(source)
    )
  ) {
    violations.push(`${path}: single-node datasource dialog must own pure accessible controlled presentation and explicit ObjectType execution-source intent`)
  }

  if (
    path === 'workflows/ontology/ui/canvas/OntologyDatasourceSampleDialog.vue'
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('aria-modal="true"')
      || !source.includes('role="status"')
      || !source.includes('role="alert"')
      || /(?:ontologyApi|objectExplorerApi|text2sqlApi|fetch\(|AbortController)/.test(source)
    )
  ) {
    violations.push(`${path}: datasource sample dialog must own pure accessible loading, failure, table, and empty presentation`)
  }

  if (
    [
      'app/settings/SettingsActionDialog.vue',
      'domains/text2sql/ui/HistoryActionDialog.vue',
      'workflows/ontology/ui/AgentsMdEditor.vue',
      'domains/olap/ui/OlapTab.vue',
      'domains/olap/ui/PivotAnalysis.vue',
    ].includes(path)
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('aria-modal="true"')
      || !source.includes('aria-labelledby=')
      || !source.includes('tabindex="-1"')
      || source.includes("document.addEventListener('keydown'")
      || source.includes("document.removeEventListener('keydown'")
    )
  ) {
    violations.push(`${path}: remaining action/editor dialog must use shared focus ownership without local document key listeners`)
  }

  if (
    [
      'domains/whatif/ui/CausalExplainabilityModal.vue',
      'workflows/ontology/ui/SqlInstanceExplorerModal.vue',
      'domains/security/ui/AuditLogs.vue',
      'domains/ontology/ui/explorer/ChildSelectDialog.vue',
      'domains/catalog/glossary/ui/BusinessDayCalendar.vue',
    ].includes(path)
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('role="dialog"')
      || !source.includes('aria-modal="true"')
      || !source.includes('aria-labelledby=')
      || !source.includes('tabindex="-1"')
      || source.includes("window.addEventListener('keydown'")
      || source.includes('@keydown.esc')
      || source.includes('@keydown="handleDetailKeydown"')
    )
  ) {
    violations.push(`${path}: visualization/detail/form modal requires shared focus ownership and viewport-safe dialog semantics`)
  }

  if (
    path === 'domains/whatif/ui/CausalExplainabilityModal.vue'
    && (
      !source.includes('disposeVisuals')
      || !source.includes('animationGeneration += 1')
      || !source.includes('cy?.destroy()')
      || !source.includes('destroyChart()')
      || source.includes('modal-backdrop')
    )
  ) {
    violations.push(`${path}: causal modal must keep visual disposal while the actual panel owns modal focus semantics`)
  }

  if (
    path === 'workflows/ontology/ui/SqlInstanceExplorerModal.vue'
    && (
      !source.includes("timers.cancel('close-sql-instance-explorer')")
      || !source.includes("timers.schedule('close-sql-instance-explorer', close, 1500)")
      || !source.includes('canClose: () => !isCreatingInstances.value')
      || !source.includes(':aria-busy="isCreatingInstances"')
    )
  ) {
    violations.push(`${path}: SQL instance modal must cancel delayed close, reset each open, and block close during creation`)
  }

  if (
    [
      'domains/text2sql/ui/FeedbackDialog.vue',
      'workflows/text2sql-ontology/ui/SqlResultInstanceDialog.vue',
      'domains/ontology/ui/modeling/BehaviorDialog.vue',
      'domains/ontology/ui/modeling/ObjectTypeEditDialog.vue',
    ].includes(path)
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('role="dialog"')
      || !source.includes('aria-modal="true"')
      || !source.includes('aria-labelledby=')
      || !source.includes('tabindex="-1"')
      || source.includes('document.addEventListener')
    )
  ) {
    violations.push(`${path}: cross-domain form dialog requires one shared keyboard/focus lifecycle without local document listeners`)
  }

  if (
    [
      'shared/components/DataConfirmModal.vue',
      'domains/security/ui/TablePermissions.vue',
      'domains/ontology/ui/extraction/FeedbackModal.vue',
      'domains/ontology/ui/modeling/SynonymSuggestionModal.vue',
    ].includes(path)
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('role="dialog"')
      || !source.includes('aria-modal="true"')
      || !source.includes('aria-labelledby=')
      || !source.includes('tabindex="-1"')
      || !source.includes(':focus-visible')
      || !source.includes('100dvh')
    )
  ) {
    violations.push(`${path}: form dialog requires shared focus ownership, an accessible name, and viewport-safe geometry`)
  }

  if (
    [
      'workflows/schema-modeling/ui/CardinalityModal.vue',
      'workflows/schema-modeling/ui/EditRelationshipDialog.vue',
      'workflows/schema-modeling/ui/CatalogRelationshipDialog.vue',
      'workflows/ontology/ui/ObjectTypeModeler.vue',
    ].includes(path)
    && (
      !source.includes('useDialogFocusLifecycle')
      || !source.includes('aria-modal="true"')
      || !source.includes('aria-labelledby=')
      || !source.includes('tabindex="-1"')
      || !source.includes('100dvh')
    )
  ) {
    violations.push(`${path}: modeling dialog requires shared focus ownership, an accessible name, and viewport-safe geometry`)
  }

  if (
    path === 'workflows/schema-modeling/ui/CardinalityModal.vue'
    && (
      !source.includes('pending?: boolean')
      || !source.includes('error?: string | null')
      || !source.includes('role="alert"')
      || !source.includes("error ? '같은 설정 다시 시도'")
    )
  ) {
    violations.push(`${path}: cardinality mutation failure must remain visible and retryable with the frozen dialog draft`)
  }

  if (
    path === 'workflows/ontology/ui/ObjectTypeModeler.vue'
    && (
      /(?:showRenameDialog|renameTarget|renameNewName|confirmRename|rename-dialog|renameObjectType)/.test(source)
      || !source.includes('role="alertdialog"')
      || !source.includes('deleteConfirmInputRef')
      || !source.includes('canClose: () => !isDeleting.value')
    )
  ) {
    violations.push(`${path}: dead rename flow must stay removed and ObjectType delete must preserve target/error while pending`)
  }

  if (
    path === 'workflows/schema-modeling/ui/CloseButton.vue'
    && (
      !source.includes(':aria-label="title"')
      || !source.includes(':disabled="disabled"')
    )
  ) {
    violations.push(`${path}: shared close control must expose its visible title as a native accessible name and disabled state`)
  }

  if (
    path === 'domains/security/ui/TablePermissions.vue'
    && (
      !source.includes('class="dialog-error" role="alert"')
      || !source.includes('@click="openAddDialog"')
      || !source.includes('@click="closeAddDialog"')
    )
  ) {
    violations.push(`${path}: permission save failure must remain visible inside the retryable dialog`)
  }

  if (
    path === 'workflows/schema-modeling/ui/TableDetailPanel.vue'
    && (
      /class="behavior-item"\s+@click=/.test(source)
      || !source.includes('class="behavior-item__edit-hitbox"')
      || !source.includes(':aria-label="`${behavior.name} Behavior 편집`"')
    )
  ) {
    violations.push(`${path}: schema detail Behavior cards require a labelled native edit hitbox`)
  }

  if (
    path === 'workflows/schema-modeling/ui/nodes/TableNode.vue'
    && (
      /class="table-node__column-name"\s+role="button"/.test(source)
      || /class="table-node__toggle"[\s\S]{0,120}@click="toggleExpand"/.test(source)
      || source.includes('@dblclick.stop="handleBehaviorDoubleClick')
      || source.includes('v-if="hoveredBehavior === behavior.name"')
      || !source.includes('class="table-node__column-name nodrag"')
      || !source.includes('class="table-node__toggle nodrag"')
      || !source.includes(':aria-expanded="isExpanded"')
      || !source.includes('class="table-node__behavior-edit-btn nodrag"')
      || !source.includes('class="table-node__behavior-run-btn nodrag"')
      || /class="references-popup__item"\s+role="button"/.test(source)
      || (source.match(/<button[\s\S]{0,180}class="references-popup__item"/g)?.length ?? 0) !== 2
    )
  ) {
    violations.push(`${path}: schema table-node column, reference, and Behavior actions require discoverable native controls`)
  }

  if (
    path === 'workflows/schema-modeling/ui/SchemaCanvas.vue'
    && (
      /<div[\s\S]{0,180}class="timeline-step"/.test(source)
      || !/<button[\s\S]{0,180}class="timeline-step"/.test(source)
      || !source.includes(':aria-pressed="selectedAttemptIndex === idx"')
    )
  ) {
    violations.push(`${path}: Behavior attempts require native buttons with explicit selected ownership`)
  }

  if (
    path === 'domains/ontology/ui/explorer/ChildSelectDialog.vue'
    && (
      /<tr[\s\S]{0,180}@click="toggleItem\(child\)"/.test(source)
      || !source.includes('aria-label="검색 결과 전체 선택"')
      || !source.includes(':aria-label="`${child.name} 선택`"')
      || !source.includes('role="dialog"')
      || !source.includes('aria-labelledby="child-select-dialog-title"')
    )
  ) {
    violations.push(`${path}: child selection must belong to labelled native checkboxes inside a named dialog`)
  }

  if (
    path === 'workflows/schema-modeling/composables/useTableReferences.ts'
    && (
      !source.includes('clampReferencePopupX')
      || !source.includes('referencePopupAnchor')
      || !source.includes('event.detail === 0')
      || !source.includes('targetRect.left + targetRect.width / 2')
      || !source.includes('targetRect?.bottom')
    )
  ) {
    violations.push(`${path}: reference popups must anchor keyboard activation to the control and clamp both axes`)
  }

  if (
    path === 'app/config/features.ts'
    && (
      source.includes("import('@/domains/text2sql')")
      || !source.includes("import('@/workflows/text2sql-ontology')")
    )
  ) {
    violations.push(`${path}: Text2SQL app entries must load the cross-domain workflow boundary`)
  }

  if (
    source.includes('@/features/datasources') ||
    source.includes('@/features/domain') ||
    source.includes('@/features/ontology') ||
    source.includes('@/features/object-explorer') ||
    source.includes('@/features/observability') ||
    source.includes('@/features/langchain') ||
    source.includes('@/features/object-explorer/api') ||
    source.includes('@/features/olap') ||
    source.includes('@/features/glossary') ||
    source.includes('@/features/security') ||
    source.includes('@/features/text2sql') ||
    source.includes('@/features/whatif') ||
    source.includes('@/features/ontology/api') ||
    source.includes('@/features/code-analysis/analyzer') ||
    source.includes('@/features/code-analysis/upload') ||
    source.includes('@/features/code-analysis/components/upload') ||
    source.includes('@/shared/stores/navigator') ||
    source.includes('@/shared/stores/session') ||
    source.includes('@/shared/components/FloatingProgressPanel') ||
    source.includes('@/shared/components/SettingsModal') ||
    source.includes('@/features/code-analysis/stores/semanticSearch') ||
    source.includes('@/features/domain/api') ||
    source.includes('@/shared/utils/upload')
  ) {
    violations.push(`${path}: obsolete import path remains`)
  }
}

assert.equal(
  files.some((file) => relative(sourceRoot, file).replaceAll('\\', '/').startsWith('features/datasources/')),
  false,
  'obsolete features/datasources source remains',
)
for (const obsoleteDirectory of [
  'features/datasources/',
  'features/domain/',
  'features/ontology/',
  'features/object-explorer/',
  'features/observability/',
  'features/langchain/',
  'features/code-analysis/components/upload/',
]) {
  assert.equal(
    files.some((file) => relative(sourceRoot, file).replaceAll('\\', '/').startsWith(obsoleteDirectory)),
    false,
    `obsolete ${obsoleteDirectory} source remains`,
  )
}
assert.equal(
  files.some(file =>
    relative(sourceRoot, file).replaceAll('\\', '/') === 'features/code-analysis/upload.ts'),
  false,
  'obsolete code-analysis upload entry remains',
)
assert.equal(
  files.some(file =>
    relative(sourceRoot, file).replaceAll('\\', '/')
      === 'domains/ontology/ui/extraction/EntityQueryPanel.vue'),
  false,
  'cross-domain EntityQueryPanel remains in the Ontology domain',
)
assert.equal(
  files.some(file =>
    relative(sourceRoot, file).replaceAll('\\', '/')
      === 'domains/ontology/ui/extraction/SchemaBasedGenerator.vue'),
  false,
  'cross-domain SchemaBasedGenerator remains in the Ontology domain',
)
assert.equal(
  files.some(file =>
    relative(sourceRoot, file).replaceAll('\\', '/')
      === 'domains/ontology/ui/modeling/CreateObjectTypeDialog.vue'),
  false,
  'cross-domain CreateObjectTypeDialog remains in the Ontology domain',
)
assert.equal(
  files.some(file =>
    relative(sourceRoot, file).replaceAll('\\', '/')
      === 'domains/ontology/ui/modeling/AgentsMdEditor.vue'),
  false,
  'cross-domain AgentsMdEditor remains in the Ontology domain',
)
const multiLayerStyle = await readFile(
  resolve(sourceRoot, 'workflows/ontology/ui/MultiLayerOntologyViewer.scss'),
  'utf8',
)
const ontologyHeaderStyle = await readFile(
  resolve(sourceRoot, 'workflows/ontology/ui/canvas/OntologyViewerHeader.scss'),
  'utf8',
)
const ontologyGenerationStyle = await readFile(
  resolve(sourceRoot, 'workflows/ontology/ui/canvas/OntologyGenerationDialog.scss'),
  'utf8',
)
assert.match(multiLayerStyle, /@media \(max-width: 720px\)/)
assert.match(ontologyHeaderStyle, /\.header-actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
assert.match(ontologyGenerationStyle, /\.generate-dialog/)
assert.match(multiLayerStyle, /\.detail-panel \{[\s\S]*width: 100% !important/)
assert.doesNotMatch(
  multiLayerStyle,
  /\.(?:filter-dialog|filter-field-row|new-relation-dialog|relation-preview|node-preview)(?:[\s.:,{]|$)/,
  'extracted filter/relation dialog styles must remain owned by their components',
)
assert.doesNotMatch(
  multiLayerStyle,
  /\.(?:datasource-dialog|linking-status|node-progress-item|mapping-item|candidate-item)(?:[\s.:,{]|$)/,
  'extracted datasource auto-link styles must remain owned by its component',
)
assert.doesNotMatch(
  multiLayerStyle,
  /\.(?:node-datasource-dialog|sample-data-dialog|node-info-section|datasource-tabs|search-results|result-item|table-list-container)(?:[\s.:,{]|$)/,
  'extracted single-node datasource/sample styles must remain owned by their components',
)
assert.doesNotMatch(
  multiLayerStyle,
  /\.(?:viewer-header|header-actions|ontology-list-dropdown|generate-dialog|generation-mode-tabs|progress-viewer|generation-logs|ontology-operation-status)(?:[\s.:,{]|$)/,
  'extracted header/generation/operation styles must remain owned by their components',
)
assert.match(multiLayerStyle, /\.detail-panel \.resize-handle \{[\s\S]*display: none/)
const schemaCanvasStyle = await readFile(
  resolve(sourceRoot, 'workflows/schema-modeling/ui/SchemaCanvas.scss'),
  'utf8',
)
assert.match(schemaCanvasStyle, /@media \(max-width: 720px\)/)
assert.match(schemaCanvasStyle, /\.left-panel--mobile-open/)
assert.match(schemaCanvasStyle, /\.mobile-table-panel-backdrop/)
assert.match(schemaCanvasStyle, /max-width: calc\(100% - 16px\)/)
const schemaCanvasGlobalStyle = await readFile(
  resolve(sourceRoot, 'workflows/schema-modeling/ui/SchemaCanvas.global.css'),
  'utf8',
)
assert.match(
  schemaCanvasGlobalStyle,
  /@media \(max-width: 720px\) \{[\s\S]*\.schema-canvas \.vue-flow__minimap \{[\s\S]*display: none !important/,
)
assert.deepEqual(violations, [])
console.log(`Architecture contract passed across ${files.length} TypeScript/Vue source files`)
