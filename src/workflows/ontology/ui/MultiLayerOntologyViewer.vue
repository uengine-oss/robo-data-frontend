<template>
  <div class="multi-layer-ontology-viewer" :class="{ 'light-mode': !isDarkMode }">
    <OntologyViewerHeader
      ref="viewerHeaderRef"
      :agent-monitor-error="agentMonitorError"
      :visual-effects-error="visualEffectsError"
      :agent-count="agentStates.size"
      :layout="currentLayout"
      :loading="loading"
      :schema-lifecycle-busy="schemaLifecycleBusy"
      :dropdown-open="showOntologyListDropdown"
      :entries="ontologyLibraryEntries"
      :list-loading="ontologyListLoading"
      :list-error="ontologyListError"
      :list-notice="ontologyListNotice"
      :load-error-message="ontologyLoadErrorMessage"
      :operation-notice="ontologyOperationNotice"
      :load-pending-id="loadPendingId"
      :current-schema-id="currentSchemaId"
      :editing-schema-id="editingSchemaId"
      :editing-schema-name="editingSchemaName"
      :rename-pending-id="renamePendingId"
      :rename-error="renameError"
      :delete-target="schemaToDelete"
      :delete-pending-id="deletePendingId"
      :delete-error="deleteError"
      :save-pending="ontologySavePending"
      :save-error="ontologySaveError"
      :what-if-open="isWhatIfPanelOpen"
      :node-count="nodes.length"
      @apply-layout="updateOntologyLayout"
      @open-generate="openGenerateDialog"
      @toggle-dropdown="toggleOntologyListDropdown"
      @retry-list="loadOntologyList({ autoLoadRecent: false })"
      @retry-load="retryLoadSchema"
      @load-schema="loadSchema"
      @save-schema-name="saveSchemaName"
      @cancel-edit-schema-name="cancelEditSchemaName"
      @clear-rename-error="clearSchemaRenameError"
      @start-edit-schema-name="startEditSchemaName"
      @request-delete-schema="requestDeleteSchema"
      @close-delete-dialog="closeDeleteSchemaDialog"
      @confirm-delete-schema="confirmDeleteSchema"
      @save="saveToNeo4j"
      @toggle-what-if="toggleWhatIfPanel"
      @update:editing-schema-name="editingSchemaName = $event; clearSchemaRenameError()"
    />

    <OntologyOperationNotices
      :save-error="ontologySaveError"
      :save-notice="ontologySaveNotice"
      :save-pending="ontologySavePending"
      :object-type-notice="measureObjectTypeNotice"
      :object-type-refresh-warning="measureObjectTypeRefreshWarning"
      :datasource-notice="dataSourceMappingNotice"
      :datasource-warning="dataSourceMappingWarning"
      @retry-save="saveToNeo4j"
      @dismiss="dismissOntologyOperationNotice"
    />

    <OntologyNodeFilterDialog
      :open="showFilterDialog"
      :target-name="filterTargetNode?.name || ''"
      :fields="filterTargetNode?.filterFields || []"
      :draft="filterDraft"
      :distinct-values="filterDistinctValues"
      :distinct-loading="filterDistinctLoading"
      :distinct-error="filterDistinctError"
      :cascading-filters="filterDialogCascadingRows"
      :conflict-count="currentFilterConflictCount"
      :has-active-filters="hasActiveFilters"
      @update-field="updateFilterDraftField"
      @retry="retryFilterDistinctValues"
      @clear="clearAllFilters"
      @close="closeFilterDialog"
      @confirm="applyAndCloseFilterDialog"
    />

    <!-- 로딩 오버레이 (v-show로 컨텐츠 DOM을 유지하면서 표시) -->
    <div v-show="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>{{ loadingMessage }}</p>
    </div>

    <!-- 메인 컨텐츠 (v-show로 전환하여 저장 시 Cytoscape DOM이 파괴되지 않도록 함) -->
    <div v-show="!loading" class="viewer-content">
      <OntologyLayerPanel
        :collapsed="isLayerPanelCollapsed"
        :groups="layerPanelGroups"
        :selected-node-id="selectedNodeId"
        @toggle-panel="toggleLayerPanel"
        @toggle-layer="toggleLayer"
        @activate-node="handleLayerNodeClick"
        @open-node-menu="openNodeContextMenu"
      />

      <!-- 중앙: Cytoscape 그래프 -->
      <div class="graph-panel">
        <div
          ref="cytoscapeContainer"
          class="cytoscape-container"
          tabindex="-1"
          @contextmenu.prevent="onCanvasContextMenu"
        ></div>

        <OntologyGraphOverlay
          :pending-relationship-source-name="pendingRelationSourceName"
          :relationship-mode-active="isRelationDrawModeEnabled"
          :relationship-mode-disabled="loading || nodes.length < 2"
          :layers="layers"
          @cancel-pending-relationship="cancelPendingRelation"
          @toggle-relationship-mode="toggleRelationDrawMode"
        />

        <OntologyGraphContextMenu
          :visible="showContextMenu"
          :mode="contextMenuMode"
          :position="contextMenuPos"
          :layers="layers"
          :node-name="contextMenuNodeName"
          :relationship-label="contextMenuEdgeLabel"
          @add-node="addNodeFromContextMenu"
          @start-relationship="startRelationFromContextMenu"
          @apply-filter="openFilterFromContextMenu"
          @open-what-if="openWhatIfFromContextMenu"
          @rename-node="openNodeRenameFromContextMenu"
          @delete-node="deleteNodeFromContextMenu"
          @edit-relationship="openEdgePropertiesFromContextMenu"
          @delete-relationship="deleteEdgeFromContextMenu"
        />
      </div>

      <!-- 오른쪽: 상세 패널 (노드 선택 또는 릴레이션 편집) -->
      <div class="detail-panel" v-if="selectedNode || (showRelationEditor && editingRelation)" :style="{ width: detailPanelWidth + 'px' }">
        <!-- 리사이즈 핸들 -->
        <div
          class="resize-handle"
          role="separator"
          aria-label="상세 패널 너비 조절"
          aria-orientation="vertical"
          :aria-valuemin="280"
          :aria-valuemax="800"
          :aria-valuenow="Math.round(detailPanelWidth)"
          tabindex="0"
          @pointerdown="startResize"
          @keydown="handleDetailPanelResizeKeydown"
          @dblclick="resetPanelWidth"
          title="드래그 또는 방향키로 폭 조절 (Home/더블클릭: 기본값)"
        ></div>

        <!-- ===== 릴레이션 속성 편집 패널 ===== -->
        <template v-if="showRelationEditor && editingRelation && !selectedNode">
          <OntologyRelationDetail
            :source-name="getNodeName(editingRelation.source)"
            :target-name="getNodeName(editingRelation.target)"
            :source-color="getLayerColor(getNodeLayer(editingRelation.source))"
            :target-color="getLayerColor(getNodeLayer(editingRelation.target))"
            :form="editingRelationForm"
            :relation-type-options="relationTypeOptions"
            :source-node-columns="sourceNodeColumns"
            :target-node-columns="targetNodeColumns"
            :source-column-status="sourceColumnStatus"
            :target-column-status="targetColumnStatus"
            :source-column-error="sourceColumnError"
            :target-column-error="targetColumnError"
            :can-retry-relation-columns="canRetryRelationColumns"
            :relation-editor-error="relationEditorError"
            @update-field="updateRelationEditorField"
            @save="saveRelationEditor"
            @connect-datasource="openRelationEndpointDataSource"
            @retry-columns="retryRelationColumns"
            @delete="deleteRelationFromEditor"
            @close="closeRelationEditor"
          />
        </template>

        <!-- ===== 노드 상세 패널 ===== -->
        <template v-else-if="selectedNode">
        <OntologyNodeDetailHeader
          :active-tab="detailPanelTab"
          :has-data-source="Boolean(selectedNode.dataSource)"
          :is-measure="isMeasureNode(selectedNode)"
          :is-kpi-or-measure="isKPIOrMeasure(selectedNode)"
          :behavior-loading="behaviorLoading"
          :behavior-count="nodeBehaviors.length"
          :is-process="isProcessNode(selectedNode)"
          :has-bpmn="Boolean(selectedNode.bpmnXml)"
          @delete="confirmDeleteNode"
          @close="deselectNode"
          @select-tab="selectNodeDetailTab"
        />

        <!-- 정보 탭 -->
        <OntologyNodeInfo
          v-if="detailPanelTab === 'info'"
          :node="selectedNode"
          :layers="layers"
          :is-editing-name="isEditingNodeName"
          :editing-name-value="editingNodeNameValue"
          :layer-selector-open="isLayerSelectorOpen"
          :data-source-column-count="getDataSourceSchemaColumnCount(selectedNode)"
          :filter-chips="selectedNodeInfoFilterChips"
          :relationships="selectedNodeInfoRelationships"
          @update-name="editingNodeNameValue = $event"
          @start-name="startEditNodeName"
          @save-name="saveNodeName"
          @cancel-name="cancelEditNodeName"
          @toggle-layer-selector="toggleLayerSelector"
          @change-layer="changeNodeLayer"
          @open-datasource="openNodeDataSourceDialog(selectedNode.id)"
          @edit-relation="openRelationEditor"
        />

        <OntologyNodeAnalysisPanel
          v-if="detailPanelTab === 'analysis'"
          :node="selectedNode"
          :schema-id="currentSchemaId"
          :node-data-result="nodeDataResult"
          :analysis-result="analysisResult"
          :analysis-loading="analysisLoading"
          :analysis-error="analysisError"
          :analysis-notice="analysisNotice"
          :analysis-warning="analysisWarning"
          :analysis-progress="analysisProgress"
          :streaming-report="displayedStreamingReport || null"
          :has-analysis-state="hasAnalysisState"
          :brush-selection="causalBrushSelection"
          :metric-options="analysisMetricOptions"
          :metric-color="getMetricOptionColor"
          @update-metric="updateAnalysisMetric"
          @reanalyze="startAnalysisFromConfig"
          @reconfigure="goBackToDataTab"
          @cancel="cancelCausalAnalysis"
        />

        <OntologyNodeBehaviorPanel
          v-if="detailPanelTab === 'behavior'"
          :node-name="selectedNode.name"
          :loading="behaviorLoading"
          :error="behaviorLoadError"
          :models="nodeBehaviors"
          @retry="retryNodeBehaviors"
          @refresh="loadNodeBehaviors(selectedNode.id)"
        />

        <OntologyNodeBpmnPanel
          v-if="detailPanelTab === 'bpmn' && isProcessNode(selectedNode)"
          :node-id="selectedNode.id"
          :node-name="selectedNode.name"
          :bpmn-xml="selectedNode.bpmnXml"
          @saved="saveSelectedNodeBpmnXml"
        />

        <!-- 데이터 탭 -->
        <div
          v-if="detailPanelTab === 'data'"
          id="ontology-node-panel-data"
          class="detail-content data-tab"
          role="tabpanel"
          aria-labelledby="ontology-node-tab-data"
        >
          <OntologyNodeDataState
            v-if="nodeDataLoading || !selectedNode.dataSource || !nodeDataResult?.hasDataSource"
            :loading="nodeDataLoading"
            :has-data-source="Boolean(selectedNode.dataSource)"
            :message="nodeDataResult?.message"
            :error="lastDataError || undefined"
            :fallback-available="text2SqlFallbackAvailable"
            :is-measure="isMeasureNode(selectedNode)"
            @retry="retrySelectedNodeData"
            @fallback="fetchSelectedNodeDataViaText2Sql"
            @connect="openDataSourceMappingDialog(selectedNode.id)"
            @create-object-type="createMeasureObjectType"
          />

          <!-- 데이터 있음 -->
          <div v-else-if="nodeDataResult" class="data-view">
            <OntologyNodeDataSummary
              :is-object-type="Boolean(nodeDataResult.isObjectType)"
              :data-source="nodeDataResult.dataSource"
              :row-count="nodeDataResult.rowCount"
              :business-day-filtered="Boolean(nodeDataResult.businessDayFiltered)"
              :business-day-filter-enabled="businessDayFilterEnabled"
              @toggle-business-day="updateBusinessDayFilter"
            />

            <OntologyNodeDataChart
              v-if="nodeDataResult.chartRecommendation?.type !== 'table'"
              :chart-type="nodeDataResult.chartRecommendation?.type"
              :chart-ready="isChartReady"
              :brush-mode-active="isCausalBrushModeActive"
              :analysis-loading="analysisLoading"
              :brush-selection="causalBrushSelection"
              :is-kpi-or-measure="isKPIOrMeasure(selectedNode)"
              :metric-options="analysisMetricOptions"
              :metric-color="getMetricOptionColor"
              @host-change="handleChartHostChange"
              @activate-brush="activateCausalBrushMode"
              @update-metric="updateAnalysisMetric"
              @set-analysis-type="setCausalAnalysisType"
              @analyze="startAnalysisFromConfig"
            />

            <OntologyNodeDataTable
              :columns="nodeDataResult.columns"
              :time-columns="nodeDataResult.timeColumns"
              :numeric-columns="nodeDataResult.numericColumns"
              :rows="nodeDataResult.rows"
              :row-count="nodeDataResult.rowCount"
            />
          </div>
        </div>
        </template>
      </div>
    </div>

    <div v-if="showSynonymSuggestionToast" class="synonym-toast-banner">
      <span class="toast-message">
        동의어 {{ synonymSuggestions.length }}건이 발견되었습니다. 수락하면 용어집에 자동 추가됩니다.
      </span>
      <button
        type="button"
        class="toast-action"
        @click="showSynonymSuggestionModal = true; showSynonymSuggestionToast = false"
      >
        리뷰하기
      </button>
      <button type="button" class="toast-dismiss" @click="dismissSynonymSuggestions">
        닫기
      </button>
    </div>

    <div v-if="showSynonymAppliedToast" class="synonym-applied-banner">
      <span class="toast-message">
        {{ synonymAppliedCount }}개의 동의어가 용어집에 추가되었습니다.
      </span>
      <button type="button" class="toast-dismiss" @click="showSynonymAppliedToast = false">
        닫기
      </button>
    </div>

    <OntologyGenerationDialogShell
      :open="showGenerateDialog"
      :mode="generationMode"
      :generating="generating"
      :has-error="Boolean(generateError)"
      :completed="generationCompleted"
      :can-generate="canGenerate"
      @close="onCloseGenerateDialog"
      @generate="generateOntology()"
      @cancel-generation="cancelGeneration"
      @update:mode="generationMode = $event"
    >
        <div v-if="generationMode === 'schema' && !generating && !generateError && !generationCompleted" class="schema-generation-content">
          <SchemaBasedGenerator
            @generated="handleSchemaBasedGenerated"
            @cancel="onCloseGenerateDialog"
          />
        </div>

        <OntologyGenerationOutcome
          v-else-if="generateError && !generating"
          :error="generateError"
          :can-retry="Boolean(failedGenerationTarget)"
          :completed="false"
          :result="generationResult"
          :save-status="generationSaveStatus"
          :save-error="generationSaveError"
          @retry="retryGeneration"
          @edit="editGenerationInput"
          @close="onCloseGenerateDialog"
          @review-synonyms="reviewGeneratedSynonyms"
          @finish="finishViewingGeneratedOntology"
        />

        <OntologyGenerationDocumentForm
          v-else-if="generationMode === 'document' && !generating && !generationCompleted"
          :form="generateForm"
          :uploaded-file="uploadedFile"
          :dragging-file="isDraggingFile"
          :file-upload-error="fileUploadError"
          :use-all-glossaries="useAllGlossaries"
          :all-glossaries-label="allGlossariesLabel"
          :glossaries="glossariesForSelect"
          :glossary-loading="glossaryLoading"
          :glossary-error="glossaryError"
          @accept-file="acceptPdfFile"
          @remove-file="removePdfFile"
          @retry-glossaries="loadGlossariesForGeneration"
          @toggle-all-glossaries="updateUseAllGlossaries"
          @update:input-type="updateGenerationInputType"
          @update:text="updateGenerationText"
          @update:pdf-url="updateGenerationPdfUrl"
          @update:selected-glossary-ids="updateGenerationGlossaryIds"
          @update:dragging-file="isDraggingFile = $event"
        />

        <OntologyGenerationOutcome
          v-else-if="generationCompleted"
          error=""
          :can-retry="false"
          :completed="true"
          :result="generationResult"
          :save-status="generationSaveStatus"
          :save-error="generationSaveError"
          @retry="retryGeneration"
          @edit="editGenerationInput"
          @close="onCloseGenerateDialog"
          @review-synonyms="reviewGeneratedSynonyms"
          @finish="finishViewingGeneratedOntology"
        />

        <OntologyGenerationProgress
          v-else-if="generating"
          :current-step="currentStep"
          :stages="activePipelineStages"
          :progress="pipelineProgress"
          :chunk-progress="chunkProgress"
          :sanitize-chunk-progress="sanitizeChunkProgress"
          :layer-results="layerResults"
          :total-stage-count="totalStageCount"
          :completed-stage-count="completedStageCount"
          :total-extracted-nodes="totalExtractedNodes"
          :overall-progress-percent="overallProgressPercent"
          :logs="generationLogs"
          :logs-expanded="logsExpanded"
          :stage-message="getStageDisplayMessage"
          @update:logs-expanded="logsExpanded = $event"
        />
    </OntologyGenerationDialogShell>

    <SynonymSuggestionModal
      v-if="showSynonymSuggestionModal"
      :suggestions="synonymSuggestions"
      @close="dismissSynonymSuggestions"
      @applied="handleSynonymSuggestionsApplied"
    />

    <OntologyDatasourceMappingDialog
      :open="showDataSourceDialog"
      :nodes="nodes"
      :linking="linkingDataSources"
      :error="autoLinkError"
      :progress="linkingProgress"
      :mappings="dataSourceMappings"
      :selected-node-id="selectedMappingNodeId"
      :expanded-candidates="expandedCandidates"
      :confirm-pending-ids="mappingConfirmPendingIds"
      :confirm-errors="mappingConfirmErrors"
      :busy="dataSourceDialogBusy"
      :close-blocked="dataSourceDialogCloseBlocked"
      :nested-dialog-open="bulkConfirmTargets.length > 0"
      @close="closeDataSourceMappingDialog"
      @retry="autoLinkDataSources"
      @toggle-mapping="toggleMappingDetails"
      @toggle-candidate="toggleCandidateExpanded"
      @preview="loadSampleData"
      @confirm-candidate="confirmMappingCandidate"
      @confirm-bulk="openBulkDatasourceConfirmation"
    />

    <OntologyNodeDatasourceDialog
      :open="showNodeDataSourceDialog"
      :pending="nodeDatasourceConfirmPending"
      :confirm-error="nodeDatasourceConfirmError"
      :current-node="currentNodeForDataSource"
      :tab="nodeDataSourceTab"
      :catalog-error="dataSourceCatalogError"
      :available-datasources="availableDatasources"
      :available-schemas="availableSchemas"
      :search-datasource="searchDatasource"
      :search-query="nodeSearchQuery"
      :search-loading="nodeSearchLoading"
      :search-status="nodeSearchStatus"
      :search-error="nodeSearchError"
      :search-results="nodeSearchResults"
      :selected-search-result="selectedSearchResult"
      :manual-source="manualSource"
      :selected-schema="selectedSchema"
      :object-type-datasource="objectTypeDatasource"
      :table-search-query="tableSearchQuery"
      :loading-tables="loadingTables"
      :tables="filteredTables"
      :selected-manual-table="selectedManualTable"
      :nested-dialog-open="showSampleDataDialog"
      @close="closeNodeDataSourceDialog"
      @retry-catalog="retryDataSourceCatalog"
      @search="searchNodeDataSource"
      @preview="previewSearchResult"
      @select-result="selectSearchResult"
      @confirm="confirmNodeDataSource"
      @load-object-types="loadObjectTypes"
      @update:tab="updateNodeDataSourceTab"
      @update:search-datasource="updateNodeSearchDatasource"
      @update:search-query="updateNodeSearchQuery"
      @update:manual-source="updateNodeManualSource"
      @update:selected-schema="updateNodeSelectedSchema"
      @update:table-search-query="updateNodeTableSearchQuery"
      @update:selected-manual-table="updateNodeSelectedManualTable"
    />

    <OntologyDatasourceSampleDialog
      :open="showSampleDataDialog"
      :loading="sampleDataLoading"
      :error="sampleDataError"
      :rows="sampleData"
      @close="closeSampleDataDialog"
    />

    <OntologyNewRelationDialog
      :open="showNewRelationDialog"
      :source-name="getNodeName(newRelation.sourceId)"
      :target-name="getNodeName(newRelation.targetId)"
      :relation-type="newRelation.type"
      :description="newRelation.description"
      :relation-type-options="relationTypeOptions"
      @update:relation-type="updateNewRelationType"
      @update:description="updateNewRelationDescription"
      @close="cancelRelation"
      @confirm="createRelation"
    />


    <!-- 릴레이션 속성 편집 다이얼로그는 우측 패널로 이동 (아래 detail-panel 참조) -->

    <ActionDialog
      :open="Boolean(localGraphDeleteTarget)"
      dialog-id="ontology-local-graph-delete"
      :title="localGraphDeleteDialogTitle"
      :message="localGraphDeleteDialogMessage"
      confirm-label="삭제"
      :pending="false"
      :error="null"
      @cancel="localGraphDeleteTarget = null"
      @confirm="confirmLocalGraphDelete"
    />

    <ActionDialog
      :open="Boolean(measureObjectTypeTarget)"
      dialog-id="ontology-measure-object-type"
      title="ObjectType 생성"
      :message="measureObjectTypeTarget
        ? `'${measureObjectTypeTarget.nodeName}'에 대한 ObjectType을 생성하시겠습니까?\n\n도메인 레이어에 새 ObjectType이 생성됩니다.`
        : ''"
      confirm-label="ObjectType 생성"
      pending-label="생성 중…"
      :pending="measureObjectTypePending"
      :error="measureObjectTypeError"
      @cancel="closeMeasureObjectTypeDialog"
      @confirm="confirmCreateMeasureObjectType"
    />

    <ActionDialog
      :open="bulkConfirmTargets.length > 0"
      dialog-id="ontology-bulk-datasource-confirm"
      title="데이터 소스 일괄 확정"
      :message="bulkConfirmDialogMessage"
      confirm-label="모두 확정"
      pending-label="확정 중…"
      :pending="bulkConfirmPending"
      :error="bulkConfirmError"
      @cancel="closeBulkDatasourceConfirmation"
      @confirm="confirmBulkDatasourceMappings"
    />

    <!-- What-if 분석 하단 패널 (드래그 가능한 세퍼레이터 포함) -->
    <template v-if="isWhatIfPanelOpen && currentSchemaId">
      <!-- 드래그 세퍼레이터 -->
      <div
        class="whatif-separator"
        role="separator"
        aria-label="What-if 패널 높이 조절"
        aria-orientation="horizontal"
        :aria-valuemin="150"
        :aria-valuemax="Math.round(getWhatIfPanelMaxHeight())"
        :aria-valuenow="Math.round(whatifPanelHeight)"
        tabindex="0"
        @pointerdown="startResizeWhatIf"
        @keydown="handleWhatIfPanelResizeKeydown"
        @dblclick="resetWhatIfPanelHeight"
        title="드래그 또는 방향키로 높이 조절 (Home/더블클릭: 기본값)"
      >
        <div class="separator-handle"></div>
      </div>
      <!-- 패널 -->
      <div
        class="whatif-panel-container"
        :style="{ height: whatifPanelHeight + 'px' }"
      >
        <WhatIfPanel
          :schema-id="currentSchemaId"
          :filters="whatifFilters"
          @close="isWhatIfPanelOpen = false"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed, onUnmounted } from 'vue'
import cytoscape from 'cytoscape'
import {
  SynonymSuggestionModal,
} from '@/domains/ontology/ui/modeling'
import {
  WhatIfPanel,
} from '@/domains/ontology/ui/extraction'
import SchemaBasedGenerator from './SchemaBasedGenerator.vue'
import OntologyGraphContextMenu from './canvas/OntologyGraphContextMenu.vue'
import OntologyGraphOverlay from './canvas/OntologyGraphOverlay.vue'
import OntologyLayerPanel from './canvas/OntologyLayerPanel.vue'
import OntologyRelationDetail from './canvas/OntologyRelationDetail.vue'
import OntologyNodeDetailHeader, {
  type OntologyNodeDetailTab,
} from './canvas/OntologyNodeDetailHeader.vue'
import OntologyNodeInfo, {
  type OntologyNodeInfoFilterChip,
  type OntologyNodeInfoRelationship,
} from './canvas/OntologyNodeInfo.vue'
import OntologyNodeBehaviorPanel from './canvas/OntologyNodeBehaviorPanel.vue'
import OntologyNodeBpmnPanel from './canvas/OntologyNodeBpmnPanel.vue'
import OntologyNodeAnalysisPanel from './canvas/OntologyNodeAnalysisPanel.vue'
import OntologyNodeDataState from './canvas/OntologyNodeDataState.vue'
import OntologyNodeDataSummary from './canvas/OntologyNodeDataSummary.vue'
import OntologyNodeDataChart from './canvas/OntologyNodeDataChart.vue'
import OntologyNodeDataTable from './canvas/OntologyNodeDataTable.vue'
import OntologyNodeFilterDialog from './canvas/OntologyNodeFilterDialog.vue'
import OntologyNewRelationDialog from './canvas/OntologyNewRelationDialog.vue'
import OntologyDatasourceMappingDialog from './canvas/OntologyDatasourceMappingDialog.vue'
import OntologyNodeDatasourceDialog from './canvas/OntologyNodeDatasourceDialog.vue'
import OntologyDatasourceSampleDialog from './canvas/OntologyDatasourceSampleDialog.vue'
import OntologyGenerationProgress from './canvas/OntologyGenerationProgress.vue'
import OntologyGenerationDocumentForm from './canvas/OntologyGenerationDocumentForm.vue'
import OntologyGenerationOutcome from './canvas/OntologyGenerationOutcome.vue'
import OntologyGenerationDialogShell from './canvas/OntologyGenerationDialogShell.vue'
import OntologyOperationNotices from './canvas/OntologyOperationNotices.vue'
import OntologyViewerHeader from './canvas/OntologyViewerHeader.vue'
import {
  type MultiLayerGenerationEvent,
  type OntologyDataSourceSchema,
  type OntologySchema as PersistedOntologySchema,
} from '@/domains/ontology'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { useLatestTaskScope } from '@/shared/composables/useLatestTaskScope'
import { useResizablePanel } from '@/shared/composables/useResizablePanel'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import {
  getSelectedNodeIdForSchema,
  removeSelectedNode,
  removeSelectedNodesForSchema,
  saveSelectedNode,
} from '../model/ontologyHistory'
import { createOntologyCanvasStyles } from '../model/ontologyCanvasStyles'
import {
  ONTOLOGY_CANVAS_LAYERS,
  getOntologyCanvasLayerColor as getLayerColor,
  projectOntologyGraphElements,
} from '../model/ontologyGraphElements'
import {
  localGraphDeleteMessage,
  localGraphDeleteTitle,
  moveLocalGraphNode,
  type LocalGraphDeleteTarget,
} from '../model/localGraphMutation'
import {
  reconcileRelationFieldMappings,
} from '../model/relationFieldMapping'
import {
  normalizeRelationColumnNames as normalizeColumnNames,
  type OntologyRelationEditorForm,
} from '../application/relationEditorLifecycle'
import {
  projectConfirmedDatasourceSchema,
  type DatasourceConfirmationTarget,
} from '../application/datasourceConfirmation'
import type { OntologyDocumentInputType } from '../application/documentGeneration'
import {
  projectOntologyCanvasSchema,
  type OntologyCanvasNode as OntologyNode,
  type OntologyCanvasRelationship as OntologyRelationship,
  type OntologyCanvasSchemaProjection,
} from '../application/ontologyCanvasSchema'
import { useNodeAgentMonitoring } from '../composables/useNodeAgentMonitoring'
import { useOntologyGenerationProgress } from '../composables/useOntologyGenerationProgress'
import { useNodeDatasourceDiscovery } from '../composables/useNodeDatasourceDiscovery'
import { useCausalAnalysis } from '../composables/useCausalAnalysis'
import { useOntologyNodeDataChart } from '../composables/useOntologyNodeDataChart'
import { useOntologyNodeData } from '../composables/useOntologyNodeData'
import { useOntologyNodeFilters } from '../composables/useOntologyNodeFilters'
import { useOntologyGraphHistory } from '../composables/useOntologyGraphHistory'
import { useOntologyDocumentGeneration } from '../composables/useOntologyDocumentGeneration'
import { useOntologyDatasourceMapping } from '../composables/useOntologyDatasourceMapping'
import { useOntologyLibraryWorkspace } from '../composables/useOntologyLibraryWorkspace'
import { useOntologyRelationEditor } from '../composables/useOntologyRelationEditor'
import { useOntologyNodeBehaviors } from '../composables/useOntologyNodeBehaviors'
import { useOntologyPersistence } from '../composables/useOntologyPersistence'
import { useMeasureObjectTypeCreation } from '../composables/useMeasureObjectTypeCreation'
import { useOntologyEdgehandles } from '../composables/useOntologyEdgehandles'
import { useOntologyCanvasLayout } from '../composables/useOntologyCanvasLayout'
import { useOntologyCanvasHighlights } from '../composables/useOntologyCanvasHighlights'
import {
  bindOntologyCanvasEvents,
  type OntologyCanvasContextMenuRequest,
} from '../composables/bindOntologyCanvasEvents'
import { useOntologyLocalGraphEditing } from '../composables/useOntologyLocalGraphEditing'
import { logger } from '@/shared/utils/logger'

const {
  schedule: scheduleManagedTimeout,
  clear: clearPendingTimeouts,
} = useManagedTimeouts()
const canvasTasks = useLatestTaskScope()

function getErrorMessage(error: unknown, fallback = '알 수 없는 오류'): string {
  return error instanceof Error && error.message ? error.message : fallback
}

// Layer 정의 (KPI가 맨 위, 위에서 아래로 계층 순서)
const layers = ONTOLOGY_CANVAS_LAYERS

// State
const cytoscapeContainer = ref<HTMLElement | null>(null)
let cy: cytoscape.Core | null = null
let themeObserver: MutationObserver | null = null
const {
  agentStates,
  agentMonitorError,
  visualEffectsError,
  startMonitoring: startNodeAgentMonitoring,
  stopMonitoring: stopNodeAgentMonitoring,
} = useNodeAgentMonitoring(() => cy)
const pendingRelationSourceId = ref<string | null>(null)
const pendingRelationPreviousSelectionId = ref<string | null>(null)
const pendingRelationSourceName = computed(() => (
  pendingRelationSourceId.value ? getNodeName(pendingRelationSourceId.value) : null
))
const showNewRelationDialog = ref(false)
const newRelation = ref({
  relationId: '',
  sourceId: '',
  targetId: '',
  type: 'CAUSES',
  description: ''
})

const loading = ref(false)
const isDarkMode = ref(document.documentElement.getAttribute('data-theme') !== 'light')
const loadingMessage = ref('')
const nodes = ref<OntologyNode[]>([])
const relationships = ref<OntologyRelationship[]>([])
const {
  checkpoint: saveState,
  clear: clearGraphHistory,
  handleShortcut: handleGraphHistoryShortcut,
} = useOntologyGraphHistory({
  nodes,
  relationships,
  onRestore: () => renderGraph(),
})
const {
  showRelationEditor,
  editingRelation,
  editingRelationForm,
  sourceNodeColumns,
  targetNodeColumns,
  sourceColumnStatus,
  targetColumnStatus,
  sourceColumnError,
  targetColumnError,
  relationEditorError,
  canRetryRelationColumns,
  openRelationEditor,
  retryRelationColumns,
  applyRelationNodeColumns,
  closeRelationEditor,
  saveRelationEditor,
} = useOntologyRelationEditor({
  nodes,
  relationships,
  beforeOpen: () => deselectNode(),
  beforeCommit: () => saveState(),
  afterCommit: relationship => {
    const edge = cy?.getElementById(relationship.id)
    if (edge && edge.length > 0) {
      edge.data('type', relationship.type)
      edge.data('label', relationship.type)
    }
    applyCausalHighlight()
  },
})
const {
  directFilters,
  filterTarget: filterTargetNode,
  filterDraft,
  filterProjection,
  nodeFilters,
  cascadingFilters,
  filterConflicts,
  hasActiveFilters,
  filterDistinctValues,
  filterDistinctLoading,
  filterDistinctError,
  open: openNodeFilterDialog,
  close: discardNodeFilterDraft,
  confirm: commitNodeFilterDraft,
  clearAll: clearAllNodeFilters,
  removeNode: removeNodeFilters,
  retryDistinctValues: retryFilterDistinctValues,
  reset: resetNodeFilters,
  getNodeFilterChips: projectNodeFilterChips,
} = useOntologyNodeFilters({ relationships })
const showFilterDialog = computed(() => filterTargetNode.value !== null)
const currentFilterConflictCount = computed(() => {
  const targetId = filterTargetNode.value?.id
  return targetId
    ? filterConflicts.value.filter(conflict => conflict.nodeId === targetId).length
    : 0
})
const filterDialogCascadingRows = computed(() => {
  const targetId = filterTargetNode.value?.id
  if (!targetId) return []
  return getCascadingFiltersForNode(targetId).map(filter => ({
    field: filter.field,
    value: filter.value,
    fromNodeName: getNodeName(filter.fromNode),
    fromField: filter.fromField,
  }))
})
const currentSchemaId = ref<string | null>(null)
const schemaName = ref('')
const collapsedLayers = ref(new Set<string>())
const isLayerPanelCollapsed = ref(false)
const selectedNodeId = ref<string | null>(null)

const { persist: persistOntologyCanvas } = useOntologyPersistence({
  nodes,
  relationships,
  schemaId: currentSchemaId,
  schemaName,
  nodePosition: nodeId => {
    const canvasNode = cy?.getElementById(nodeId)
    if (!canvasNode || canvasNode.length === 0) return null
    const position = canvasNode.position()
    return { x: position.x, y: position.y }
  },
})
const layerPanelGroups = computed(() => layers.map(layer => ({
  id: layer.id,
  name: layer.name,
  icon: layer.icon,
  color: layer.color,
  collapsed: collapsedLayers.value.has(layer.id),
  nodes: getLayerNodes(layer.id).map(node => ({ id: node.id, name: node.name })),
})))
const {
  currentLayout,
  applyLayout,
  fit: fitGraphToViewport,
  syncAfterPanelChange: syncCanvasViewportAfterPanelChange,
  updateLayout: updateOntologyLayout,
} = useOntologyCanvasLayout({
  getCanvas: () => cy,
  nodeCount: () => nodes.value.length,
  selectedNodeId,
  currentGeneration: () => canvasTasks.current(),
  isCurrentGeneration: generation => canvasTasks.isCurrent(generation),
})

async function clearAllFilters() {
  clearAllNodeFilters()
  updateFilteredNodeVisuals()
  if (selectedNodeId.value) {
    await fetchNodeData(selectedNodeId.value)
  }
}

// 스키마 로드 중 플래그 (watch가 initCytoscape를 덮어쓰지 않도록)
const isLoadingSchema = ref(false)

// 노드 추가 드롭다운
const showAddNodeDropdown = ref(false)

// 노드 이름 편집
const isEditingNodeName = ref(false)
const editingNodeNameValue = ref('')

// 레이어(스테레오타입) 변경
const isLayerSelectorOpen = ref(false)

// 캔버스 우클릭 컨텍스트 메뉴
const showContextMenu = ref(false)
const contextMenuMode = ref<'canvas' | 'node' | 'edge'>('canvas')
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuGraphPos = ref({ x: 0, y: 0 })
const contextMenuNodeId = ref<string | null>(null)
const contextMenuNodeName = ref('')
const contextMenuEdgeId = ref<string | null>(null)
const contextMenuEdgeLabel = ref('')

function openCanvasContextMenu(request: OntologyCanvasContextMenuRequest): void {
  contextMenuMode.value = request.mode
  contextMenuPos.value = request.position
  if (request.mode === 'node') {
    contextMenuNodeId.value = request.nodeId
    contextMenuNodeName.value = request.nodeName
  } else if (request.mode === 'edge') {
    contextMenuEdgeId.value = request.edgeId
    contextMenuEdgeLabel.value = request.edgeLabel
  } else {
    contextMenuGraphPos.value = request.graphPosition
  }
  showContextMenu.value = true
}

const {
  isRelationDrawModeEnabled,
  initialize: initEdgehandles,
  destroy: destroyEdgehandles,
  reset: resetEdgehandlesInteractionState,
  suspendHover: suspendEdgehandlesHover,
  setDrawMode: setRelationDrawMode,
  upsertRelationship: upsertRelationEdgeInCy,
  removeRelationship: removeRelationEdgeFromCy,
} = useOntologyEdgehandles({
  getCanvas: () => cy,
  relationships,
  showRelationDialog: showNewRelationDialog,
  loading,
  loadingSchema: isLoadingSchema,
  closeContextMenu: () => {
    showContextMenu.value = false
  },
  openRelationDraft: (sourceId, targetId) => openNewRelationDraft(sourceId, targetId),
  schedule: (key, callback, delay) => {
    const generation = canvasTasks.current()
    canvasTasks.schedule(key, callback, delay, generation)
  },
})

function toggleRelationDrawMode() {
  if (loading.value || nodes.value.length < 2) return
  setRelationDrawMode(!isRelationDrawModeEnabled.value)
}

watch(() => nodes.value.length, (count) => {
  if (count < 2 && isRelationDrawModeEnabled.value) {
    setRelationDrawMode(false)
  }
})

// 로컬 graph 삭제와 원격 mutation은 서로 다른 수명주기를 가진다.
const localGraphDeleteTarget = ref<LocalGraphDeleteTarget | null>(null)
const localGraphDeleteDialogTitle = computed(() => localGraphDeleteTitle(localGraphDeleteTarget.value))
const localGraphDeleteDialogMessage = computed(() => localGraphDeleteMessage(localGraphDeleteTarget.value))

const ontologySavePending = ref(false)
const ontologySaveError = ref<string | null>(null)
const ontologySaveNotice = ref<string | null>(null)

function dismissOntologyOperationNotice(
  target:
    | 'saveNotice'
    | 'objectTypeNotice'
    | 'objectTypeRefreshWarning'
    | 'datasourceNotice'
    | 'datasourceWarning',
): void {
  const notices = {
    saveNotice: ontologySaveNotice,
    objectTypeNotice: measureObjectTypeNotice,
    objectTypeRefreshWarning: measureObjectTypeRefreshWarning,
    datasourceNotice: dataSourceMappingNotice,
    datasourceWarning: dataSourceMappingWarning,
  }
  notices[target].value = null
}

const generationLogs = ref<{ time: string; message: string; type?: string }[]>([])
interface SynonymSuggestion {
  termId: string
  termName: string
  glossaryId: string
  glossaryName: string
  suggestedSynonym: string
  similarity: number
  sourceNodeName: string
  sourceLayer: string
  accepted: boolean
}
const synonymSuggestions = ref<SynonymSuggestion[]>([])
const showSynonymSuggestionModal = ref(false)
const showSynonymSuggestionToast = ref(false)
const showSynonymAppliedToast = ref(false)
const synonymAppliedCount = ref(0)

// 생성 완료 결과 화면 상태
const generationCompleted = ref(false)
const generationSaveStatus = ref<'saving' | 'saved' | 'failed'>('saving')
const generationSaveError = ref('')
interface GenerationResultSummary {
  nodeCount: number
  relationshipCount: number
  layerBreakdown: Record<string, number>
  synonymSuggestionCount: number
}
const generationResult = ref<GenerationResultSummary>({
  nodeCount: 0,
  relationshipCount: 0,
  layerBreakdown: {},
  synonymSuggestionCount: 0,
})

function dismissSynonymSuggestions() {
  showSynonymSuggestionToast.value = false
  showSynonymSuggestionModal.value = false
  synonymSuggestions.value = []
}

function handleSynonymSuggestionsApplied(count: number) {
  showSynonymSuggestionModal.value = false
  showSynonymSuggestionToast.value = false
  synonymSuggestions.value = []
  synonymAppliedCount.value = count
  showSynonymAppliedToast.value = count > 0
}

const logsExpanded = ref(false)
const {
  currentStep,
  activePipelineStages,
  pipelineProgress,
  chunkProgress,
  sanitizeChunkProgress,
  layerResults,
  totalStageCount,
  completedStageCount,
  totalExtractedNodes,
  overallProgressPercent,
  getStageDisplayMessage,
  reset: resetGenerationProgress,
  applyLayerProgress,
  recordLayerComplete,
  markComplete: markGenerationProgressComplete,
  markFailed: markGenerationProgressFailed,
} = useOntologyGenerationProgress()

const {
  showGenerateDialog,
  generationMode,
  generating,
  generateError,
  failedGenerationTarget,
  generateForm,
  useAllGlossaries,
  glossariesForSelect,
  glossaryLoading,
  glossaryError,
  uploadedFile,
  isDraggingFile,
  fileUploadError,
  canGenerate,
  openGenerateDialog,
  closeGenerateDialog,
  loadGlossariesForGeneration,
  onToggleAllGlossaries,
  acceptPdfFile,
  removePdfFile,
  runGeneration: generateOntology,
  retryGeneration,
  editGenerationInput,
  cancelGeneration,
} = useOntologyDocumentGeneration({
  onStart: inputType => {
    resetProgress(inputType)
    addLog('온톨로지 생성 시작...', 'info')
    currentStep.value = '문서 준비 중'
  },
  onEvent: handleStreamEvent,
  onCancel: () => {
    currentStep.value = '생성 취소됨'
    addLog('사용자에 의해 취소됨', 'warning')
  },
  onFailure: message => {
    logger.error('온톨로지 생성 오류:', message)
    addLog(`오류: ${message}`, 'error')
  },
})

function updateGenerationInputType(value: OntologyDocumentInputType): void {
  generateForm.value.inputType = value
}

function updateGenerationText(value: string): void {
  generateForm.value.text = value
}

function updateGenerationPdfUrl(value: string): void {
  generateForm.value.pdfUrl = value
}

function updateGenerationGlossaryIds(value: string[]): void {
  generateForm.value.selectedGlossaryIds = value
}

function updateUseAllGlossaries(value: boolean): void {
  useAllGlossaries.value = value
  onToggleAllGlossaries()
}

const allGlossariesLabel = computed(() => (
  glossaryLoading.value
    ? '전체 용어집 사용 (확인 중...)'
    : `전체 용어집 사용 (${glossariesForSelect.value.length}개)`
))

// Data source linking
const {
  showDataSourceDialog,
  linkingDataSources,
  autoLinkError,
  dataSourceMappingNotice,
  dataSourceMappingWarning,
  dataSourceMappings,
  linkingProgress,
  selectedMappingNodeId,
  expandedCandidates,
  mappingConfirmPendingIds,
  mappingConfirmErrors,
  bulkConfirmTargets,
  bulkConfirmPending,
  bulkConfirmError,
  bulkConfirmDialogMessage,
  dataSourceDialogBusy,
  dataSourceDialogCloseBlocked,
  openDataSourceMappingDialog,
  closeDataSourceMappingDialog,
  autoLinkDataSources,
  toggleCandidateExpanded,
  confirmMappingTarget,
  confirmMappingCandidate,
  openBulkDatasourceConfirmation,
  closeBulkDatasourceConfirmation,
  confirmBulkDatasourceMappings,
} = useOntologyDatasourceMapping({
  nodes,
  getNodeName,
  applyConfirmedMapping: applyConfirmedDatasourceMapping,
})

function toggleMappingDetails(nodeId: string) {
  selectedMappingNodeId.value = selectedMappingNodeId.value === nodeId ? null : nodeId
}

const {
  availableDatasources,
  availableSchemas,
  searchDatasource,
  manualSource,
  objectTypeDatasource,
  selectedSchema,
  tableSearchQuery,
  loading: loadingTables,
  loadError: dataSourceCatalogError,
  filteredTables,
  loadObjectTypes,
  retry: retryDataSourceCatalog,
  showNodeDataSourceDialog,
  nodeDatasourceConfirmPending,
  nodeDatasourceConfirmError,
  currentNodeForDataSource,
  nodeDataSourceTab,
  nodeSearchQuery,
  nodeSearchLoading,
  nodeSearchStatus,
  nodeSearchError,
  nodeSearchResults,
  selectedSearchResult,
  selectedManualTable,
  showSampleDataDialog,
  sampleDataLoading,
  sampleData,
  sampleDataError,
  openNodeDataSourceDialog,
  closeNodeDataSourceDialog,
  searchNodeDataSource,
  handleManualSourceChange,
  handleSchemaChange,
  previewSearchResult,
  selectSearchResult,
  loadSampleData,
  closeSampleDataDialog,
  confirmNodeDataSource,
} = useNodeDatasourceDiscovery({
  nodes,
  selectedMappingNodeId,
  commitMapping: confirmMappingTarget,
  onConfirmed: () => undefined,
})

function updateNodeDataSourceTab(value: 'search' | 'manual'): void {
  nodeDataSourceTab.value = value
}

function updateNodeSearchDatasource(value: string): void {
  searchDatasource.value = value
}

function updateNodeSearchQuery(value: string): void {
  nodeSearchQuery.value = value
}

async function updateNodeManualSource(value: string): Promise<void> {
  manualSource.value = value
  await handleManualSourceChange()
}

async function updateNodeSelectedSchema(value: string): Promise<void> {
  selectedSchema.value = value
  await handleSchemaChange()
}

function updateNodeTableSearchQuery(value: string): void {
  tableSearchQuery.value = value
}

function updateNodeSelectedManualTable(value: string): void {
  selectedManualTable.value = value
}

// 노드 데이터 소스 뷰어 상태
const detailPanelTab = ref<'info' | 'data' | 'analysis' | 'behavior' | 'bpmn'>('info')
const businessDayFilterEnabled = ref(false)  // 영업일 캘린더 필터 적용 여부
const {
  nodeDataLoading,
  nodeDataResult,
  lastDataError,
  text2SqlFallbackAvailable,
  load: loadNodeData,
  loadViaText2Sql: loadNodeDataViaText2Sql,
  retry: retryNodeData,
  reset: resetNodeData,
} = useOntologyNodeData({
  resolveTarget: (nodeId) => {
    const node = nodes.value.find(candidate => candidate.id === nodeId)
    if (!node) return null
    return {
      ...node,
      dataSourceSchema: getDataSourceSchemaMetadata(node) ?? undefined,
    }
  },
  getEffectiveFilters,
  businessDayFilterEnabled,
})
const {
  target: measureObjectTypeTarget,
  pending: measureObjectTypePending,
  error: measureObjectTypeError,
  notice: measureObjectTypeNotice,
  refreshWarning: measureObjectTypeRefreshWarning,
  open: openMeasureObjectTypeDialog,
  close: closeMeasureObjectTypeDialog,
  confirm: confirmCreateMeasureObjectType,
} = useMeasureObjectTypeCreation({
  nodes,
  refreshNodeData: fetchNodeData,
  lastDataError,
})
const {
  analysisLoading,
  analysisResult,
  analysisError,
  analysisNotice,
  analysisWarning,
  analysisProgress,
  hasAnalysisState,
  displayedStreamingReport,
  analysisMetricOptions,
  causalBrushSelection,
  causalHighlight,
  getMetricOptionColor,
  selectBrushRange: selectCausalBrushRange,
  recalculateAnalysisType: recalcAnalysisType,
  setAnalysisType: setCausalAnalysisType,
  run: runCausalAnalysis,
  cancel: cancelCausalAnalysis,
  reset: resetCausalAnalysis,
  clearResultForReconfiguration: clearCausalAnalysisResult,
} = useCausalAnalysis({
  selectedNodeId,
  schemaId: currentSchemaId,
  nodeDataResult,
})
const {
  applyCausalHighlight,
  applyFilterHighlights: updateFilteredNodeVisuals,
  clearCausalHighlight: clearRenderedCausalHighlight,
} = useOntologyCanvasHighlights({
  getCanvas: () => cy,
  causalHighlight,
  getNodes: () => nodes.value,
  getRelationships: () => relationships.value,
  getDirectFilters: () => directFilters.value,
  getNodeFilters: () => nodeFilters.value,
})

const {
  isReady: isChartReady,
  isBrushModeActive: isCausalBrushModeActive,
  setHost: handleChartHostChange,
  markPending: markNodeDataChartPending,
  activateBrushMode: activateCausalBrushMode,
  resize: resizeNodeDataChart,
} = useOntologyNodeDataChart({
  result: nodeDataResult,
  dark: isDarkMode,
  selectedNodeId,
  schemaId: currentSchemaId,
  analysisLoading,
  brushSelection: causalBrushSelection,
  selectBrushRange: selectCausalBrushRange,
})

function getDataSourceSchemaMetadata(node: OntologyNode): OntologyDataSourceSchema | null {
  return node.dataSourceSchema && typeof node.dataSourceSchema === 'object'
    ? node.dataSourceSchema
    : null
}

function getDataSourceSchemaColumnCount(node: OntologyNode): number {
  return getDataSourceSchemaMetadata(node)?.columns?.length ?? 0
}

function startAnalysisFromConfig() {
  if (analysisLoading.value || !causalBrushSelection.value) return

  detailPanelTab.value = 'analysis'
  nextTick(() => {
    void runCausalAnalysis()
  })
}

function goBackToDataTab() {
  clearCausalAnalysisResult()
  detailPanelTab.value = 'data'
  if (selectedNode.value?.id && !nodeDataResult.value) {
    fetchNodeData(selectedNode.value.id)
  }
}

function updateAnalysisMetric(metric: string): void {
  if (!causalBrushSelection.value) return
  causalBrushSelection.value.targetMetric = metric
  recalcAnalysisType()
}

function updateBusinessDayFilter(enabled: boolean): void {
  businessDayFilterEnabled.value = enabled
  if (selectedNode.value) void fetchNodeData(selectedNode.value.id)
}

// 분석 탭 클릭 핸들러
function handleAnalysisTabClick() {
  detailPanelTab.value = 'analysis'
}

// 상세 패널 리사이즈
const {
  value: detailPanelWidth,
  startResize,
  handleResizeKeydown: handleDetailPanelResizeKeydown,
  reset: resetPanelWidth,
} = useResizablePanel({
  initialValue: 440,
  minValue: 280,
  maxValue: 800,
  axis: 'x',
  direction: 'negative',
  cursor: 'ew-resize',
})

// Computed
const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return nodes.value.find(n => n.id === selectedNodeId.value) || null
})
const {
  addNode: addLocalGraphNode,
  startPendingRelation,
  cancelPendingRelation,
  completePendingRelation,
  selectOrCompleteRelation: handleLayerNodeClick,
  startNameEditing: startEditNodeName,
  saveName: saveNodeName,
  cancelNameEditing: cancelEditNodeName,
  changeLayer: changeNodeLayer,
  requestNodeDelete: confirmDeleteNode,
  requestRelationshipDelete,
  confirmDelete: confirmLocalGraphDelete,
  openRelationDraft: openNewRelationDraft,
  discardRelationDraft: discardNewRelationDraft,
  commitRelationDraft: commitNewRelationDraft,
  requestEditingRelationshipDelete: deleteRelationFromEditor,
} = useOntologyLocalGraphEditing({
  nodes,
  relationships,
  selectedNodeId,
  pendingRelationSourceId,
  pendingRelationPreviousSelectionId,
  showRelationDialog: showNewRelationDialog,
  relationDraft: newRelation,
  editingName: isEditingNodeName,
  editingNameValue: editingNodeNameValue,
  layerSelectorOpen: isLayerSelectorOpen,
  deleteTarget: localGraphDeleteTarget,
  getCanvas: () => cy,
  getSelectedNode: () => selectedNode.value,
  getEditingRelationship: () => editingRelation.value,
  resolveLayer: layerId => {
    const layer = layers.find(candidate => candidate.id === layerId)
    return {
      name: layer?.name ?? layerId,
      color: getLayerColor(layerId),
    }
  },
  checkpoint: saveState,
  selectNode,
  deselectNode,
  removeNodeFilters,
  closeRelationEditor,
  initializeEdgehandles: initEdgehandles,
  upsertRelationship: upsertRelationEdgeInCy,
  removeRelationship: removeRelationEdgeFromCy,
})
const selectedNodeInfoFilterChips = computed<OntologyNodeInfoFilterChip[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  return projectNodeFilterChips(node.id).map(chip => ({
    label: chip.label,
    value: chip.value,
    type: chip.type,
    ...(chip.fromNode ? { fromNodeName: getNodeName(chip.fromNode) } : {}),
  }))
})
const selectedNodeInfoRelationships = computed<OntologyNodeInfoRelationship[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  return getNodeRelations(node.id).map(relationship => ({
    id: relationship.id,
    type: relationship.type,
    sourceName: getNodeName(relationship.source),
    targetName: getNodeName(relationship.target),
    ...(relationship.fromField ? { fromField: relationship.fromField } : {}),
    ...(relationship.toField ? { toField: relationship.toField } : {}),
  }))
})
const isDetailPanelVisible = computed(
  () => Boolean(selectedNode.value || (showRelationEditor.value && editingRelation.value)),
)

watch(
  [isDetailPanelVisible, detailPanelWidth],
  () => {
    const generation = canvasTasks.current()
    void nextTick(() => {
      if (!canvasTasks.isCurrent(generation)) return
      canvasTasks.schedule(
        'canvas-viewport-sync',
        () => syncCanvasViewportAfterPanelChange(generation),
        80,
        generation,
      )
    })
  },
)

// Methods
function getLayerNodes(layerId: string): OntologyNode[] {
  return nodes.value.filter(n => (n.layer || n.label) === layerId)
}

function toggleLayer(layerId: string) {
  if (collapsedLayers.value.has(layerId)) {
    collapsedLayers.value.delete(layerId)
  } else {
    collapsedLayers.value.add(layerId)
  }
}

function toggleLayerPanel() {
  isLayerPanelCollapsed.value = !isLayerPanelCollapsed.value
}

function selectNode(nodeId: string) {
  if (showRelationEditor.value || editingRelation.value) {
    closeRelationEditor()
  }

  selectedNodeId.value = nodeId
  detailPanelTab.value = 'info'  // 탭 초기화
  resetNodeBehaviorLoad()
  resetNodeData()
  isEditingNodeName.value = false  // 이름 편집 초기화
  isLayerSelectorOpen.value = false  // 레이어 셀렉터 초기화

  resetCausalAnalysis()

  if (cy) {
    cy.nodes().removeClass('selected')
    cy.$(`#${nodeId}`).addClass('selected')
  }

  // 선택된 노드를 로컬스토리지에 저장
  if (currentSchemaId.value) {
    saveSelectedNode(currentSchemaId.value, nodeId)
  }

  // 선택된 노드에 데이터 소스가 있으면 자동으로 데이터 탭 표시 가능
  const node = nodes.value.find(n => n.id === nodeId)
  if (node?.dataSource) {
    // 데이터가 있으면 자동으로 데이터 로드 (선택 사항)
    // fetchNodeData(nodeId)
  }
}

// 노드 선택 해제
function deselectNode() {
  // 선택 해제 시 로컬스토리지에서 제거
  if (currentSchemaId.value && selectedNodeId.value) {
    removeSelectedNode(currentSchemaId.value, selectedNodeId.value)
  }
  selectedNodeId.value = null
  detailPanelTab.value = 'info'
  resetNodeBehaviorLoad()
  resetNodeData()
  resetCausalAnalysis()

  if (cy) {
    cy.nodes().removeClass('selected')
  }
}

// 노드 데이터 조회
async function fetchNodeData(nodeId: string) {
  markNodeDataChartPending()
  resetCausalAnalysis()
  await loadNodeData(nodeId)
}

async function retrySelectedNodeData() {
  markNodeDataChartPending()
  resetCausalAnalysis()
  await retryNodeData()
}

async function fetchSelectedNodeDataViaText2Sql() {
  markNodeDataChartPending()
  resetCausalAnalysis()
  await loadNodeDataViaText2Sql()
}

// 그래프 다시 렌더링 (initCytoscape 래퍼)
function renderGraph() {
  requestCanvasInit()
}

// ========== 노드 추가 기능 ==========

// 캔버스 우클릭 핸들러 (브라우저 기본 메뉴 차단용 - 실제 로직은 Cytoscape cxttap에서 처리)
function onCanvasContextMenu(event: MouseEvent) {
  // 브라우저 기본 컨텍스트 메뉴만 차단 (Cytoscape cxttap 이벤트가 처리)
  event.preventDefault()
}

function openNodeContextMenu(event: MouseEvent, nodeId: string) {
  const node = nodes.value.find(candidate => candidate.id === nodeId)
  if (!node) return
  const graphPanel = cytoscapeContainer.value?.parentElement
  if (!graphPanel) return
  const graphRect = graphPanel.getBoundingClientRect()
  contextMenuPos.value = {
    x: Math.min(
      Math.max(8, event.clientX - graphRect.left),
      Math.max(8, graphRect.width - 220),
    ),
    y: Math.min(
      Math.max(8, event.clientY - graphRect.top),
      Math.max(8, graphRect.height - 220),
    ),
  }
  contextMenuMode.value = 'node'
  contextMenuNodeId.value = node.id
  contextMenuNodeName.value = node.name
  showContextMenu.value = true
}

// 컨텍스트 메뉴 닫기
function closeContextMenu() {
  showContextMenu.value = false
}

// 새 노드 추가 (우클릭) - 지정된 위치에 배치
function addNewNodeAtPosition(layerId: string, position: { x: number; y: number }) {
  showContextMenu.value = false
  showAddNodeDropdown.value = false
  addLocalGraphNode(layerId, position)
}

function addNodeFromContextMenu(layerId: string) {
  addNewNodeAtPosition(layerId, contextMenuGraphPos.value)
}

// ========== 우클릭 → 관계 생성 (2클릭 방식) ==========

function startRelationFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return
  startPendingRelation(contextMenuNodeId.value)
}

// ========== 노드 컨텍스트 메뉴 액션 ==========

function openFilterFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return

  const node = nodes.value.find(n => n.id === contextMenuNodeId.value)
  if (!node) return

  // 노드를 선택 상태로
  selectNode(node.id)

  void openNodeFilterDialog(node)
}

function closeFilterDialog() {
  discardNodeFilterDraft()
  void nextTick(() => cytoscapeContainer.value?.focus())
}

function updateFilterDraftField(field: string, value: unknown): void {
  filterDraft.value = {
    ...filterDraft.value,
    [field]: value,
  }
}

async function applyAndCloseFilterDialog() {
  const targetNodeId = commitNodeFilterDraft()
  if (!targetNodeId) return
  updateFilteredNodeVisuals()
  await nextTick()
  cytoscapeContainer.value?.focus()
  await fetchNodeData(targetNodeId)
}

function openNodeRenameFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return

  // 노드 선택
  selectNode(contextMenuNodeId.value)

  // 이름 편집 모드 진입
  nextTick(() => startEditNodeName())
}

function deleteNodeFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuNodeId.value) return

  // 노드 선택
  selectNode(contextMenuNodeId.value)

  // 삭제 확인
  nextTick(() => confirmDeleteNode())
}

// ========== 엣지 컨텍스트 메뉴 액션 ==========

function openEdgePropertiesFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuEdgeId.value) return

  // 노드 선택 해제 (릴레이션 패널 표시를 위해)
  deselectNode()

  // 릴레이션 편집기 열기
  openRelationEditor(contextMenuEdgeId.value)
}

function deleteEdgeFromContextMenu() {
  showContextMenu.value = false
  if (!contextMenuEdgeId.value) return

  const edgeId = contextMenuEdgeId.value

  // 관계 정보 찾기
  const rel = relationships.value.find(r => r.id === edgeId)
  if (!rel) return

  requestRelationshipDelete(rel)
}

// ========== 레이어(스테레오타입) 변경 ==========

function toggleLayerSelector() {
  isLayerSelectorOpen.value = !isLayerSelectorOpen.value
}

// 다른 곳 클릭 시 레이어 셀렉터 닫기
function closeLayerSelectorOnOutsideClick(e: MouseEvent) {
  if (isLayerSelectorOpen.value) {
    const wrapper = (e.target as HTMLElement).closest('.layer-selector-wrapper')
    if (!wrapper) {
      isLayerSelectorOpen.value = false
    }
  }
}

// 문서 클릭 시 드롭다운/컨텍스트 메뉴 닫기
function onDocumentClick(event: MouseEvent) {
  // 드롭다운 외부 클릭 시 닫기
  const target = event.target as HTMLElement
  if (!target.closest('.add-node-dropdown')) {
    showAddNodeDropdown.value = false
  }
  // 컨텍스트 메뉴 외부 클릭 시 닫기
  if (!target.closest('.canvas-context-menu')) {
    showContextMenu.value = false
  }
}

// ========== 릴레이션 속성 편집 기능 ==========

function getNodeLayer(nodeId: string): string {
  const node = nodes.value.find(n => n.id === nodeId)
  return node?.layer || node?.label || 'Resource'
}

function getEffectiveFilters(nodeId: string): Record<string, unknown> {
  return { ...(filterProjection.value.effective[nodeId] ?? {}) }
}

function getCascadingFiltersForNode(nodeId: string): Array<{ field: string; value: unknown; fromNode: string; fromField: string }> {
  return (cascadingFilters.value[nodeId] ?? []).map(item => ({ ...item }))
}

// ========== 필터 시각화 (Cytoscape 그래프에 하이라이팅) ==========

// 키보드 단축키 (Ctrl+Z, Ctrl+Y)
function handleKeyDown(event: KeyboardEvent) {
  handleGraphHistoryShortcut(event)
}

function handleWindowBlur() {
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
}

function isKPIOrMeasure(node: { layer?: string; label?: string } | null): boolean {
  if (!node) return false
  const layer = node.layer || node.label || ''
  return layer === 'KPI' || layer === 'Measure'
}

function isMeasureNode(node: { layer?: string; label?: string } | null): boolean {
  if (!node) return false
  return (node.layer || node.label || '') === 'Measure'
}

function selectNodeDetailTab(tab: OntologyNodeDetailTab): void {
  const node = selectedNode.value
  if (!node) return

  switch (tab) {
    case 'info':
      detailPanelTab.value = 'info'
      return
    case 'data':
      openSelectedNodeDataTab()
      return
    case 'analysis':
      if (!node.dataSource || !isKPIOrMeasure(node)) return
      handleAnalysisTabClick()
      return
    case 'behavior':
      openBehaviorTab(node.id)
      return
    case 'bpmn':
      if (!isProcessNode(node) || !node.bpmnXml) return
      detailPanelTab.value = 'bpmn'
  }
}

function saveSelectedNodeBpmnXml(xml: string): void {
  if (selectedNode.value) selectedNode.value.bpmnXml = xml
}

function openSelectedNodeDataTab() {
  const node = selectedNode.value
  if (!node || (!node.dataSource && !isMeasureNode(node))) return

  detailPanelTab.value = 'data'
  if (node.dataSource) {
    void fetchNodeData(node.id)
  }
}

function isProcessNode(node: { layer?: string; label?: string } | null): boolean {
  if (!node) return false
  const layer = node.layer || node.label || ''
  return layer === 'Process'
}

function getNodeName(nodeId: string): string {
  const node = nodes.value.find(n => n.id === nodeId)
  return node?.name || nodeId
}

function getNodeRelations(nodeId: string): OntologyRelationship[] {
  return relationships.value.filter(r => r.source === nodeId || r.target === nodeId)
}

// Measure용 ObjectType 생성
function createMeasureObjectType() {
  if (!selectedNode.value) return
  openMeasureObjectTypeDialog(selectedNode.value)
}

// Progress helpers
function addLog(message: string, type: string = 'info') {
  const time = new Date().toLocaleTimeString()
  generationLogs.value.push({ time, message, type })
  if (type === 'error' || type === 'warning') {
    logsExpanded.value = true
  }
}



function resetProgress(inputType = generateForm.value.inputType) {
  resetGenerationProgress(inputType)
  generationLogs.value = []
  logsExpanded.value = false
  showSynonymSuggestionModal.value = false
  showSynonymSuggestionToast.value = false
  showSynonymAppliedToast.value = false
  synonymAppliedCount.value = 0
  synonymSuggestions.value = []
  generationCompleted.value = false
  generationSaveStatus.value = 'saving'
  generationSaveError.value = ''
  generationResult.value = { nodeCount: 0, relationshipCount: 0, layerBreakdown: {}, synonymSuggestionCount: 0 }
}

function onCloseGenerateDialog() {
  if (!generating.value) {
    generationCompleted.value = false
    closeGenerateDialog()
  }
}

function reviewGeneratedSynonyms() {
  showSynonymSuggestionModal.value = true
  generationCompleted.value = false
  closeGenerateDialog()
}

function finishViewingGeneratedOntology() {
  generationCompleted.value = false
  closeGenerateDialog()
}

function commitOntologyCanvasProjection(
  projection: OntologyCanvasSchemaProjection,
): void {
  canvasTasks.begin()
  resetNodeFilters()
  resetNodeData()
  resetCausalAnalysis()
  closeRelationEditor()
  closeContextMenu()
  selectedNodeId.value = null
  detailPanelTab.value = 'info'
  isWhatIfPanelOpen.value = false
  clearGraphHistory()
  currentSchemaId.value = projection.schemaId
  schemaName.value = projection.schemaName
  nodes.value = projection.nodes
  relationships.value = projection.relationships

  if (
    projection.skippedRelationshipCount > 0
    || projection.rekeyedRelationshipCount > 0
  ) {
    addLog(
      `관계 정제 적용: 잘못된 관계 ${projection.skippedRelationshipCount}개 제외, 중복 ID ${projection.rekeyedRelationshipCount}개 보정`,
      'warning',
    )
  }
}

// 스키마 기반 온톨로지 생성 완료 핸들러
function handleSchemaBasedGenerated(generatedSchema: PersistedOntologySchema) {
  logger.debug('📊 스키마 기반 온톨로지 생성 완료:', generatedSchema)
  const projection = projectOntologyCanvasSchema(
    generatedSchema,
    { kind: 'database' },
  )
  commitOntologyCanvasProjection(projection)

  nextTick(() => {
    if (cy) renderGraph()
  })
  addLog(
    `✅ 스키마 기반 온톨로지 생성 완료: ${projection.summary.nodeCount}개 노드, ${projection.summary.relationshipCount}개 관계`,
    'success',
  )

  closeGenerateDialog()
}

function destroyCytoscapeCanvas(invalidateTasks = true) {
  if (invalidateTasks) canvasTasks.clear()
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
  destroyEdgehandles()
  if (!cy) return
  cy.destroy()
  cy = null
}

// Cytoscape
function requestCanvasInit(shouldRestoreSelection = false): void {
  const generation = canvasTasks.current()
  void nextTick(() => {
    canvasTasks.schedule(
      'canvas-init',
      () => initCytoscape(shouldRestoreSelection, generation),
      0,
      generation,
    )
  })
}

function initCytoscape(
  shouldRestoreSelection: boolean = false,
  generation: number = canvasTasks.current(),
) {
  if (!canvasTasks.isCurrent(generation)) return
  if (!cytoscapeContainer.value) {
    logger.warn('Cytoscape container not found')
    return
  }

  // 컨테이너 크기 확인
  const rect = cytoscapeContainer.value.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    logger.warn('Cytoscape container has no dimensions, retrying...')
    canvasTasks.schedule(
      'canvas-init',
      () => initCytoscape(shouldRestoreSelection, generation),
      100,
      generation,
    )
    return
  }

  logger.debug('Initializing Cytoscape with', nodes.value.length, 'nodes and', relationships.value.length, 'relationships')

  destroyCytoscapeCanvas(false)

  // 스키마를 새로 로드한 직후에는 마우스 위치가 우연히 노드 테두리 위에 있어도
  // 연결 모드로 즉시 진입하지 않도록 잠시 보호 시간을 둔다.
  suspendEdgehandlesHover(shouldRestoreSelection ? 1200 : 250)

  const { elements, hasCompletePositions } = projectOntologyGraphElements(
    nodes.value,
    relationships.value,
  )
  cy = cytoscape({
    container: cytoscapeContainer.value,
    elements,
    style: createOntologyCanvasStyles(isDarkMode.value),
    layout: { name: 'preset' }
  })

  bindOntologyCanvasEvents({
    canvas: cy,
    container: cytoscapeContainer.value,
    getNodeName,
    hasNode: nodeId => nodes.value.some(node => node.id === nodeId),
    hasPendingRelation: () => pendingRelationSourceId.value !== null,
    hasOpenRelationEditor: () => showRelationEditor.value || editingRelation.value !== null,
    resetEdgehandles: resetEdgehandlesInteractionState,
    suspendEdgehandlesHover,
    selectNode,
    deselectNode,
    completePendingRelation,
    cancelPendingRelation,
    closeRelationEditor,
    moveNode: (nodeId, position) => {
      const result = moveLocalGraphNode(nodes.value, nodeId, position)
      if (result.changed) nodes.value = result.nodes
    },
    openRelationEditor,
    openContextMenu: openCanvasContextMenu,
  })

  // Edgehandles 초기화 - 관계 생성 모드에서 노드 테두리 드래그로 관계 생성
  initEdgehandles()

    // 저장된 위치가 있으면 레이아웃 적용하지 않음, 없으면 계층형 레이아웃 적용
  if (hasCompletePositions) {
    // 저장된 위치 사용 - fit만 수행
    fitGraphToViewport()
    logger.debug('Using saved node positions')

    // 저장된 노드 자동 선택: 그래프 그려진 뒤 오버레이(선택) 적용 (애니메이션 여유 후)
    if (shouldRestoreSelection && currentSchemaId.value) {
      canvasTasks.schedule('selection-restore', restoreSelectedNode, 600, generation)
    }
  } else {
    // 위치가 없으면 레이아웃 적용
    const layout = applyLayout()
    logger.debug('Applying layout')

    // 레이아웃 완료 후 저장된 노드 자동 선택 (애니메이션 끝난 뒤 오버레이 적용)
    if (shouldRestoreSelection && currentSchemaId.value) {
      if (layout) {
        // 레이아웃 객체가 있으면 (cose, circle, grid) layoutstop = 애니메이션 종료 후
        layout.one('layoutstop', canvasTasks.guard(generation, () => {
          canvasTasks.schedule('selection-restore', restoreSelectedNode, 100, generation)
        }))
      } else {
        // 계층형 레이아웃은 동기 실행 → 그래프 그려진 뒤 여유 시간 두고 선택
        canvasTasks.schedule('selection-restore', restoreSelectedNode, 600, generation)
      }
    }
  }
}

// 저장된 노드 복원
function restoreSelectedNode() {
  if (!currentSchemaId.value) return
  if (selectedNodeId.value) return

  const savedNodeId = getSelectedNodeIdForSchema(currentSchemaId.value)
  logger.debug('🔍 저장된 노드 확인:', { savedNodeId, currentSchemaId: currentSchemaId.value, nodesCount: nodes.value.length })

  if (savedNodeId && nodes.value.some(n => n.id === savedNodeId)) {
    // 저장된 노드가 현재 스키마에 존재하면 자동 선택
    logger.debug(`📌 저장된 노드 자동 선택: ${savedNodeId}`)
    selectNode(savedNodeId)
  } else {
    logger.debug('❌ 저장된 노드를 찾을 수 없음:', { savedNodeId, availableNodes: nodes.value.map(n => n.id).slice(0, 5) })
  }
}

async function applyConfirmedDatasourceMapping(
  target: DatasourceConfirmationTarget,
): Promise<string | null> {
  const { nodeId, candidate } = target

      // 노드 업데이트 (반응성을 위해 새 객체로 교체)
      const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
      if (nodeIndex !== -1) {
        const updatedNode = {
          ...nodes.value[nodeIndex],
          dataSource: candidate.table_name,
          dataSourceSchema: projectConfirmedDatasourceSchema(candidate),
        }
        // Vue 반응성을 위해 배열 교체
        nodes.value = [
          ...nodes.value.slice(0, nodeIndex),
          updatedNode,
          ...nodes.value.slice(nodeIndex + 1)
        ]
      }

      const candidateColumns = normalizeColumnNames(candidate.columns)
      if (showRelationEditor.value && editingRelation.value) {
        applyRelationNodeColumns(
          nodeId,
          candidateColumns,
          `데이터 소스 '${candidate.table_name}'의 컬럼 정보를 조회하지 못했습니다.`,
        )
      }

      const mappingReconciliation = reconcileRelationFieldMappings(
        relationships.value,
        nodeId,
        candidateColumns.length > 0 ? candidateColumns : null,
      )
      relationships.value = mappingReconciliation.relationships
      const clearedMappings = mappingReconciliation.cleared.map(cleared => {
        const sideLabel = cleared.side === 'from' ? 'From' : 'To'
        const reasonLabel = cleared.reason === 'unpaired' ? '짝이 없는 ' : ''
        return `${getNodeName(cleared.source)} → ${getNodeName(cleared.target)}: ${reasonLabel}${sideLabel} 필드 '${cleared.field}' 삭제`
      })

      // Cytoscape 노드 스타일 업데이트
      if (cy) {
        cy.$(`#${nodeId}`).addClass('has-datasource')
      }

      // 노드 배열은 reactive이므로 보조 메타데이터 갱신을 위해 상세 패널을
      // 재마운트할 필요가 없다. 데이터 탭의 조회만 현재 선택에 맞춰 갱신한다.
      if (selectedNodeId.value === nodeId && detailPanelTab.value === 'data') {
        await fetchNodeData(nodeId)
      }

  return clearedMappings.length > 0
    ? `데이터 소스 재설정으로 기존 필드 매핑 일부가 자동 삭제되었습니다. ${clearedMappings.join(' / ')}`
    : null
}

// 관계 타입 옵션
const relationTypeOptions = [
  { value: 'CAUSES', label: '원인 (CAUSES)' },
  { value: 'EFFECTS', label: '영향 (EFFECTS)' },
  { value: 'MEASURED_AS', label: '측정됨 (MEASURED_AS)' },
  { value: 'PRODUCES', label: '생산 (PRODUCES)' },
  { value: 'INFLUENCES', label: '영향 (INFLUENCES)' },
  { value: 'EXECUTES', label: '실행 (EXECUTES)' },
  { value: 'USED_WHEN', label: '사용됨 (USED_WHEN)' },
  { value: 'USES', label: '사용 (USES)' },
  { value: 'NEXT', label: '다음 (NEXT)' },
  { value: 'TRIGGERS', label: '트리거 (TRIGGERS)' }
]

function updateNewRelationType(value: string): void {
  newRelation.value.type = value
}

function updateNewRelationDescription(value: string): void {
  newRelation.value.description = value
}

function updateRelationEditorField(
  field: keyof OntologyRelationEditorForm,
  value: string,
): void {
  editingRelationForm.value[field] = value
}

function openRelationEndpointDataSource(endpoint: 'source' | 'target'): void {
  const relation = editingRelation.value
  if (!relation) return
  openNodeDataSourceDialog(relation[endpoint])
}

async function createRelation() {
  if (!newRelation.value.sourceId || !newRelation.value.targetId || !newRelation.value.relationId) return

  const relationship = commitNewRelationDraft()
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
  if (relationship) applyCausalHighlight()
}

function cancelRelation() {
  discardNewRelationDraft()
  resetEdgehandlesInteractionState({ removeTransientEdges: true })
}

function handleStreamEvent(event: MultiLayerGenerationEvent) {
  switch (event.event) {
    case 'start':
      addLog('Multi-Layer 스키마 생성 시작', 'info')
      currentStep.value = '파이프라인 시작'
      break

    case 'layer_progress':
      {
      const progress = applyLayerProgress(event)
      addLog(
        `[${progress.phaseName}] ${event.message}`,
        progress.status === 'completed' ? 'success' : 'info'
      )
      }
      break

    case 'layer_complete':
      {
      recordLayerComplete(event)
      addLog(`[${event.layer}] ${event.nodeCount}개 노드 추출 완료`, 'success')
      }
      break

    case 'complete':
      markGenerationProgressComplete()
      if (event.data?.success && event.data?.schema) {
        const synonymCount =
          event.data.synonymSuggestions?.length ?? 0
        const projection = projectOntologyCanvasSchema(
          event.data.schema,
          { kind: 'document' },
          { synonymSuggestionCount: synonymCount },
        )
        if (projection.autoNamed) {
          addLog('온톨로지 이름 자동 생성 중...', 'info')
        }
        commitOntologyCanvasProjection(projection)
        if (projection.autoNamed) {
          addLog(`이름 생성 완료: ${projection.schemaName}`, 'success')
        }

        if (synonymCount > 0) {
          synonymSuggestions.value = event.data.synonymSuggestions.map(suggestion => ({
            ...suggestion,
            accepted: true
          }))
          addLog(`동의어 제안 ${synonymSuggestions.value.length}건을 수집했습니다.`, 'info')
        } else {
          synonymSuggestions.value = []
        }

        addLog(
          `온톨로지 생성 완료 - 총 ${projection.summary.nodeCount}개 노드`,
          'success',
        )
        generationResult.value = projection.summary

        generationSaveStatus.value = 'saving'
        generationSaveError.value = ''
        generationCompleted.value = true

        addLog('Neo4j에 저장 중...', 'info')
        saveToNeo4jSilent().then(() => {
          generationSaveStatus.value = 'saved'
          addLog('Neo4j에 저장 완료', 'success')
        }).catch(err => {
          generationSaveStatus.value = 'failed'
          generationSaveError.value = err.message || '저장 실패'
          addLog(`저장 실패: ${err.message}`, 'error')
        })

        requestCanvasInit()
      } else {
        const errMsg = event.data?.error || '알 수 없는 오류'
        addLog(`생성 실패: ${errMsg}`, 'error')
      }
      break

    case 'error':
      markGenerationProgressFailed(event.message)
      addLog(`오류: ${event.message}`, 'error')
      break
  }
}

const viewerHeaderRef = ref<InstanceType<typeof OntologyViewerHeader> | null>(null)
const {
  showOntologyListDropdown,
  ontologyLibraryEntries,
  ontologyListLoading,
  ontologyListError,
  ontologyListNotice,
  schemaToDelete,
  ontologyOperationNotice,
  editingSchemaId,
  editingSchemaName,
  renamePendingId,
  renameError,
  deletePendingId,
  deleteError,
  loadPendingId,
  schemaLifecycleBusy,
  ontologyLoadErrorMessage,
  startEditSchemaName,
  saveSchemaName,
  clearSchemaRenameError,
  cancelEditSchemaName,
  toggleOntologyListDropdown,
  requestDeleteSchema,
  closeDeleteSchemaDialog,
  confirmDeleteSchema,
  loadOntologyList,
  loadSchema,
  retryLoadSchema,
} = useOntologyLibraryWorkspace<PersistedOntologySchema>({
  currentSchemaId,
  currentSchemaName: schemaName,
  applySchema: applyLoadedSchemaToViewer,
  clearDeletedSchema: clearDeletedSchemaFromViewer,
  setLoadingState: (pending, message) => {
    loading.value = pending
    if (message) loadingMessage.value = message
  },
  focusRenameInput: () => {
    void viewerHeaderRef.value?.focusRenameInput()
  },
})

function clearDeletedSchemaFromViewer(schemaId: string) {
  currentSchemaId.value = null
  schemaName.value = ''
  nodes.value = []
  relationships.value = []
  selectedNodeId.value = null
  resetNodeFilters()
  resetNodeData()
  detailPanelTab.value = 'info'
  isWhatIfPanelOpen.value = false
  resetCausalAnalysis()
  closeRelationEditor()
  closeContextMenu()
  destroyCytoscapeCanvas()
  removeSelectedNodesForSchema(schemaId)
}

async function applyLoadedSchemaToViewer(
  schemaId: string,
  schema: PersistedOntologySchema,
) {
  const projection = projectOntologyCanvasSchema(
    schema,
    { kind: 'library', schemaId },
  )
  isLoadingSchema.value = true
  commitOntologyCanvasProjection(projection)
  if (
    projection.skippedRelationshipCount > 0
    || projection.rekeyedRelationshipCount > 0
  ) {
    logger.warn('스키마 관계 정제 적용:', {
      schemaId,
      skipped: projection.skippedRelationshipCount,
      rekeyed: projection.rekeyedRelationshipCount,
    })
  }

  logger.debug(
    `스키마 로드 완료: ${schema.name} (${nodes.value.length}개 노드, ${relationships.value.length}개 관계)`,
  )
  loading.value = false

  if (nodes.value.length > 0) {
    await nextTick()
    const generation = canvasTasks.current()
    canvasTasks.schedule('canvas-init', () => {
      initCytoscape(true, generation)
      canvasTasks.schedule('schema-loading-settle', () => {
        isLoadingSchema.value = false
      }, 800, generation)
    }, 150, generation)
  } else {
    isLoadingSchema.value = false
    logger.warn('스키마에 노드가 없습니다.')
  }
}

async function saveToNeo4jSilent(): Promise<void> {
  await persistOntologyCanvas()
}

async function saveToNeo4j() {
  ontologySaveError.value = null
  ontologySaveNotice.value = null

  if (nodes.value.length === 0) {
    ontologySaveError.value = '저장할 온톨로지가 없습니다.'
    return
  }

  if (showNewRelationDialog.value) {
    ontologySaveError.value = '열려 있는 관계 생성 다이얼로그를 먼저 완료하거나 취소해주세요.'
    return
  }

  resetEdgehandlesInteractionState({ removeTransientEdges: true })

  loading.value = true
  ontologySavePending.value = true
  loadingMessage.value = 'Neo4j에 온톨로지 저장 중...'

  try {
    await saveToNeo4jSilent()
    ontologySaveNotice.value = '온톨로지가 Neo4j에 저장되었습니다.'
  } catch (error: unknown) {
    logger.error('Neo4j 저장 오류:', error)
    ontologySaveError.value = getErrorMessage(error, '온톨로지 저장에 실패했습니다.')
  } finally {
    ontologySavePending.value = false
    loading.value = false
  }
}

// What-if 분석 패널 상태
const isWhatIfPanelOpen = ref(false)

// What-if에 전달할 필터 (nodeFilters 스냅샷)
const whatifFilters = ref<Record<string, Record<string, unknown>>>({})

function toggleWhatIfPanel(): void {
  whatifFilters.value = JSON.parse(JSON.stringify(nodeFilters.value || {}))
  isWhatIfPanelOpen.value = !isWhatIfPanelOpen.value
}

function openWhatIfFromContextMenu() {
  showContextMenu.value = false
  whatifFilters.value = JSON.parse(JSON.stringify(nodeFilters.value || {}))
  isWhatIfPanelOpen.value = true
}

const {
  loading: behaviorLoading,
  loadError: behaviorLoadError,
  behaviors: nodeBehaviors,
  load: loadNodeBehaviors,
  retry: retryNodeBehaviors,
  reset: resetNodeBehaviorLoad,
} = useOntologyNodeBehaviors(currentSchemaId, selectedNodeId)

function openBehaviorTab(nodeId: string) {
  detailPanelTab.value = 'behavior'
  void loadNodeBehaviors(nodeId)
}

function getWhatIfPanelMaxHeight(): number {
  return typeof window === 'undefined'
    ? 810
    : Math.max(150, window.innerHeight * 0.75)
}

const {
  value: whatifPanelHeight,
  startResize: startResizeWhatIf,
  handleResizeKeydown: handleWhatIfPanelResizeKeydown,
  reset: resetWhatIfPanelHeight,
} = useResizablePanel({
  initialValue: 350,
  minValue: 150,
  maxValue: getWhatIfPanelMaxHeight,
  axis: 'y',
  direction: 'negative',
  cursor: 'row-resize',
})

// 테마 변경 감지 및 Cytoscape 스타일 업데이트
function updateCytoscapeTheme() {
  isDarkMode.value = document.documentElement.getAttribute('data-theme') !== 'light'
  if (cy) {
    cy.style(createOntologyCanvasStyles(isDarkMode.value))
  }
}

function closeOntologyListOnOutsideClick(event: MouseEvent): void {
  const target = event.target
  const element = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null
  if (
    showOntologyListDropdown.value &&
    !element?.closest('.ontology-list-dropdown')
  ) {
    showOntologyListDropdown.value = false
  }
}

function resizeVisualizations(): void {
  resizeNodeDataChart()
  scheduleManagedTimeout('ontology-viewport-resize', () => {
    if (!cy) return
    const zoom = cy.zoom()
    cy.resize()
    cy.center(cy.nodes())
    cy.zoom(zoom)
  }, 120)
}

// Lifecycle
onMounted(async () => {
  // 키보드 단축키 등록 (Ctrl+Z, Ctrl+Y)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('resize', resizeVisualizations)

  // 테마 변경 감지
  themeObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'data-theme') {
        updateCytoscapeTheme()
      }
    })
  })
  themeObserver.observe(document.documentElement, { attributes: true })

  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener('click', closeOntologyListOnOutsideClick)

  // 노드 추가 드롭다운 및 컨텍스트 메뉴 외부 클릭 시 닫기
  document.addEventListener('click', onDocumentClick)

  // 레이어 셀렉터 외부 클릭 시 닫기
  document.addEventListener('click', closeLayerSelectorOnOutsideClick)

  // 온톨로지 목록 로드 및 최근 온톨로지 자동 열기
  await loadOntologyList()

  if (nodes.value.length > 0) {
    requestCanvasInit()
  }

  // Start agent activity + visual effects polling (every 10s / 5s)
  startNodeAgentMonitoring()
})

onUnmounted(() => {
  // 키보드 단축키 해제
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('blur', handleWindowBlur)
  window.removeEventListener('resize', resizeVisualizations)

  // 클릭 이벤트 해제
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('click', closeOntologyListOnOutsideClick)
  document.removeEventListener('click', closeLayerSelectorOnOutsideClick)
  canvasTasks.clear()
  clearPendingTimeouts()

  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  if (cy) {
    destroyEdgehandles()
    cy.destroy()
    cy = null
  }
  stopNodeAgentMonitoring()
})

watch([nodes, relationships], () => {
  // 스키마 로드 중에는 loadSchema에서 initCytoscape(true)를 호출하므로 여기서 덮어쓰지 않음
  if (isLoadingSchema.value) return
  if (nodes.value.length === 0) {
    closeContextMenu()
    closeRelationEditor()
    resetCausalAnalysis()
    clearRenderedCausalHighlight()
    destroyCytoscapeCanvas()
    return
  }
  requestCanvasInit()
})

</script>

<style scoped src="./MultiLayerOntologyViewer.scss"></style>
