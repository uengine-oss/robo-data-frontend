<script setup lang="ts">
/**
 * PivotAnalysis.vue
 * 피벗 테이블 분석 - 드래그앤드롭으로 차원/측정값 구성 및 쿼리 실행
 */
import { computed, nextTick, ref, watch } from 'vue'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import { useOlapStore } from '../state/olap.ts'
import {
  createCubeEditorDraft,
  generateMondrianSchemaXml,
} from '../application/cubeEditorModel.ts'
import {
  loadCubeEtlConfig,
  redeployCubeDag,
  saveCubeEtlConfig,
  saveCubeSchema,
} from '../application/cubeEditorOperations.ts'
import { parsePivotDropPayload } from '../application/pivotDrop.ts'
import { useEtlScriptLifecycle } from '../composables/useEtlScriptLifecycle.ts'
import { usePivotEtlExecution } from '../composables/usePivotEtlExecution.ts'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import {
  describeOlapError,
  type EtlConfig,
  type OlapDesignerDimension,
  type OlapDesignerMeasure
} from '../model/contracts.ts'
import FieldList from './FieldList.vue'

const store = useOlapStore()
const timeouts = useManagedTimeouts()
const dropError = ref<string | null>(null)
const copyStatus = ref<{ tone: 'success' | 'error'; message: string } | null>(null)
const showSQL = ref(false)
const {
  loading: etlLoading,
  result: etlResult,
  resultVisible: showETLResult,
  airflowUrl,
  directSyncAvailable,
  executeAirflow: executeETL,
  executeDirect: executeDirectSync,
  openAirflow,
} = usePivotEtlExecution({
  getCubeName: () => store.currentCube,
  executeDirectSync: cubeName => store.executeETLSync(cubeName),
})

// Visual Modeler Modal
const showCubeEditor = ref(false)
const cubeEditorDialog = ref<HTMLElement | null>(null)
const cubeEditorCloseButton = ref<HTMLButtonElement | null>(null)
const cubeEditLoading = ref(false)
const cubeEditError = ref<string | null>(null)
const cubeEditSuccess = ref<string | null>(null)
const dagRedeployLoading = ref(false)
const editorTab = ref<'cube' | 'etl' | 'script'>('cube')

// ETL Editor State
const etlConfig = ref<EtlConfig | null>(null)
const etlConfigLoadError = ref<string | null>(null)

// Script Tab State
const useAgentGeneration = ref(true)  // Use intelligent agent by default
const syncMode = ref<'full' | 'incremental'>('full')  // ETL sync mode
const {
  scriptCode,
  scriptFilename,
  scriptSaved,
  scriptSavedAt,
  generationPending: scriptLoading,
  generationError,
  generationStatus: agentStatus,
  generationLogs: agentReasoningLog,
  failedGenerationTarget,
  savedLoadPending,
  savedLoadError: savedScriptLoadError,
  savePending: scriptSaving,
  saveError,
  saveNotice,
  failedSaveTarget,
  downloadPending,
  downloadError,
  executionPending: scriptExecuting,
  executionError,
  executionNotice,
  executionResult: scriptExecutionResult,
  executionProgress,
  executionLogs,
  generate: generateEtlScript,
  retryGeneration,
  cancelGeneration: cancelAgentGeneration,
  loadSaved: loadSavedScript,
  retrySavedLoad,
  saveCurrent: saveScript,
  retrySave,
  createDownload,
  execute: executeEtlScript,
  cancelExecution: cancelScriptExecution,
  clearExecutionLogs,
  resetForCubeChange: resetScriptLifecycleForCubeChange,
} = useEtlScriptLifecycle({
  getCubeName: () => store.currentCube,
})
const scriptOperationError = computed(() =>
  generationError.value
  ?? saveError.value
  ?? downloadError.value
  ?? executionError.value,
)
const scriptOperationNotice = computed(() =>
  saveNotice.value
  ?? executionNotice.value,
)
const editorError = computed(() => cubeEditError.value ?? scriptOperationError.value)
const editorNotice = computed(() => cubeEditSuccess.value ?? scriptOperationNotice.value)
const pendingAction = ref<'full-reload' | 'redeploy-dag' | null>(null)
const actionPending = ref(false)
const actionError = ref<string | null>(null)
const actionTitle = computed(() => pendingAction.value === 'full-reload'
  ? 'ETL 전체 재적재'
  : 'Airflow DAG 재배포')
const actionMessage = computed(() => pendingAction.value === 'full-reload'
  ? '기존 DW 테이블과 데이터를 삭제하고 전체 ETL을 다시 실행합니다. 계속하시겠습니까?'
  : `기존 DAG를 덮어쓰고 '${store.currentCube ?? ''}' 큐브의 DAG를 다시 배포합니다.`)
const editorBusy = computed(() =>
  cubeEditLoading.value
  || scriptSaving.value
  || savedLoadPending.value
  || downloadPending.value
  || dagRedeployLoading.value,
)

// Visual Modeler State (for current cube)
const editCubeName = ref('')
const editFactTable = ref('')
const editDimensions = ref<OlapDesignerDimension[]>([])
const editMeasures = ref<OlapDesignerMeasure[]>([])

// Load current cube for editing
async function openCubeEditor() {
  if (!store.currentCube) return

  cubeEditLoading.value = true
  cubeEditError.value = null
  editorTab.value = 'cube'  // Reset to cube tab

  try {
    // Load cube metadata
    const draft = createCubeEditorDraft(store.currentCube, store.cubeMetadata)
    editCubeName.value = draft.cubeName
    editFactTable.value = draft.factTable
    editDimensions.value = draft.dimensions
    editMeasures.value = draft.measures

    await Promise.all([loadETLConfig(), loadSavedScript()])

    showCubeEditor.value = true
  } catch (cause: unknown) {
    cubeEditError.value = describeOlapError(cause)
  } finally {
    cubeEditLoading.value = false
  }
}

function closeCubeEditor() {
  if (editorBusy.value || pendingAction.value) return
  resetScriptLifecycleForCubeChange()
  showCubeEditor.value = false
}

useDialogFocusLifecycle({
  active: () => showCubeEditor.value,
  dialog: cubeEditorDialog,
  requestClose: closeCubeEditor,
  initialFocus: () => cubeEditorCloseButton.value,
  canClose: () => !editorBusy.value && pendingAction.value === null,
  suspended: () => pendingAction.value !== null,
})

// Visual Modeler Functions
function addEditDimension() {
  editDimensions.value.push({
    id: Date.now(),
    name: '',
    table: '',
    foreignKey: '',
    levels: [{ id: Date.now(), name: '', column: '' }]
  })
}

function removeEditDimension(index: number) {
  editDimensions.value.splice(index, 1)
}

function addEditLevel(dimIndex: number) {
  editDimensions.value[dimIndex].levels.push({
    id: Date.now(),
    name: '',
    column: ''
  })
}

function removeEditLevel(dimIndex: number, levelIndex: number) {
  editDimensions.value[dimIndex].levels.splice(levelIndex, 1)
}

function addEditMeasure() {
  editMeasures.value.push({
    id: Date.now(),
    name: '',
    column: '',
    aggregator: 'sum'
  })
}

function removeEditMeasure(index: number) {
  editMeasures.value.splice(index, 1)
}

// Generate Mondrian XML
function generateEditXML(): string {
  return generateMondrianSchemaXml({
    cubeName: editCubeName.value,
    factTable: editFactTable.value,
    dimensions: editDimensions.value,
    measures: editMeasures.value,
  })
}

// Save cube changes
async function saveCubeChanges() {
  cubeEditLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null

  try {
    const xml = generateEditXML()
    await saveCubeSchema(xml)
    cubeEditSuccess.value = '큐브가 업데이트되었습니다!'

    // Reload cubes and metadata
    await store.loadCubes()
    if (store.currentCube) {
      await store.selectCube(store.currentCube)
    }

    timeouts.schedule('cube-editor-close', () => {
      closeCubeEditor()
      cubeEditSuccess.value = null
    }, 1500)
  } catch (cause: unknown) {
    cubeEditError.value = describeOlapError(cause)
  } finally {
    cubeEditLoading.value = false
  }
}

// Load ETL config for editing
async function loadETLConfig() {
  if (!store.currentCube) return

  etlLoading.value = true
  etlConfigLoadError.value = null
  try {
    const config = await loadCubeEtlConfig(store.currentCube)
    etlConfig.value = config
  } catch (cause: unknown) {
    etlConfigLoadError.value = `ETL 설정을 불러오지 못했습니다. ${describeOlapError(cause)}`
  } finally {
    etlLoading.value = false
  }
}

function createNewETLConfigDraft() {
  if (!store.currentCube) return
  etlConfig.value = {
    cube_name: store.currentCube,
    fact_table: editFactTable.value,
    dimension_tables: editDimensions.value.map(d => d.table).filter(Boolean),
    source_tables: [],
    mappings: [],
    dw_schema: 'dw',
    sync_mode: 'full',
    incremental_column: null,
  }
  etlConfigLoadError.value = null
}

// Save ETL config
async function saveETLConfig() {
  if (!etlConfig.value) return

  cubeEditLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null

  try {
    await saveCubeEtlConfig(etlConfig.value)
    cubeEditSuccess.value = 'ETL 설정이 저장되었습니다!'

    timeouts.schedule('etl-config-success', () => {
      cubeEditSuccess.value = null
    }, 3000)
  } catch (cause: unknown) {
    cubeEditError.value = `ETL 저장 실패: ${describeOlapError(cause)}`
  } finally {
    cubeEditLoading.value = false
  }
}

// Add ETL mapping
function addETLMapping() {
  if (!etlConfig.value) return
  if (!etlConfig.value.mappings) etlConfig.value.mappings = []

  etlConfig.value.mappings.push({
    source_table: '',
    source_column: '',
    target_table: '',
    target_column: '',
    transformation: ''
  })
}

// Remove ETL mapping
function removeETLMapping(index: number) {
  if (!etlConfig.value?.mappings) return
  etlConfig.value.mappings.splice(index, 1)
}

// Add source table
function addSourceTable() {
  if (!etlConfig.value) return
  if (!etlConfig.value.source_tables) etlConfig.value.source_tables = []
  etlConfig.value.source_tables.push('')
}

// Remove source table
function removeSourceTable(index: number) {
  if (!etlConfig.value?.source_tables) return
  etlConfig.value.source_tables.splice(index, 1)
}

// Script lifecycle UI projection
const showExecuteMenu = ref(false)
const executionLogContainer = ref<HTMLElement | null>(null)

function formatLogTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ''
  }
}

async function loadETLScript() {
  cubeEditError.value = null
  await generateEtlScript(useAgentGeneration.value)
}

function executeWithMode(mode: 'full' | 'incremental') {
  showExecuteMenu.value = false
  if (mode === 'full') {
    pendingAction.value = 'full-reload'
    actionError.value = null
    return
  }
  syncMode.value = mode
  executeScript()
}

function executeScript() {
  cubeEditError.value = null
  cubeEditSuccess.value = null
  executeEtlScript(syncMode.value)
}

async function downloadETLScript() {
  cubeEditError.value = null
  const result = await createDownload()
  if (!result) return

  const blob = new Blob([result.code], { type: 'text/x-python' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = result.filename || 'etl_script.py'
    document.body.appendChild(anchor)
    anchor.click()
    cubeEditSuccess.value = `📥 스크립트 다운로드: ${anchor.download}`
    timeouts.schedule('script-download-success', () => {
      cubeEditSuccess.value = null
    }, 3000)
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}

// Ref for auto-scrolling log entries
const logEntriesRef = ref<HTMLElement | null>(null)

// Watch for log updates to auto-scroll
watch(agentReasoningLog, () => {
  nextTick(() => {
    if (logEntriesRef.value) {
      logEntriesRef.value.scrollTop = logEntriesRef.value.scrollHeight
    }
  })
}, { deep: true })

// Redeploy DAG to Airflow
function requestRedeployDAG() {
  if (!store.currentCube) {
    cubeEditError.value = '큐브를 선택해주세요'
    return
  }
  pendingAction.value = 'redeploy-dag'
  actionError.value = null
}

function cancelPendingAction() {
  if (actionPending.value) return
  pendingAction.value = null
  actionError.value = null
}

async function confirmPendingAction() {
  const action = pendingAction.value
  if (!action || actionPending.value) return
  if (action === 'full-reload') {
    pendingAction.value = null
    syncMode.value = 'full'
    await executeScript()
    return
  }

  if (!store.currentCube) {
    actionError.value = '큐브를 선택해주세요.'
    return
  }
  actionPending.value = true
  dagRedeployLoading.value = true
  actionError.value = null
  cubeEditSuccess.value = null

  try {
    const result = await redeployCubeDag(store.currentCube)
    cubeEditSuccess.value = `DAG가 성공적으로 재생성되었습니다! (DAG ID: ${result.dag_id || store.currentCube})`
    pendingAction.value = null
    timeouts.schedule('dag-redeploy-success', () => {
      cubeEditSuccess.value = null
    }, 3000)
  } catch (cause: unknown) {
    actionError.value = `DAG 재생성 실패: ${describeOlapError(cause)}`
  } finally {
    actionPending.value = false
    dagRedeployLoading.value = false
  }
}

// Drop zone drag states
const rowsOver = ref(false)
const colsOver = ref(false)
const measuresOver = ref(false)

// Drop handlers
function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onDropRows(event: DragEvent) {
  event.preventDefault()
  rowsOver.value = false
  handleDrop(event, 'rows')
}

function onDropCols(event: DragEvent) {
  event.preventDefault()
  colsOver.value = false
  handleDrop(event, 'cols')
}

function onDropMeasures(event: DragEvent) {
  event.preventDefault()
  measuresOver.value = false
  handleDrop(event, 'measures')
}

function handleDrop(event: DragEvent, target: 'rows' | 'cols' | 'measures') {
  if (!event.dataTransfer) return

  try {
    const data = parsePivotDropPayload(event.dataTransfer.getData('application/json'))
    dropError.value = null

    if (data.type === 'dimension') {
      if (target === 'rows') {
        store.addToRows({ dimension: data.dimension, level: data.level })
      } else if (target === 'cols') {
        store.addToColumns({ dimension: data.dimension, level: data.level })
      }
    } else if (data.type === 'measure' && target === 'measures') {
      store.addMeasure({ name: data.name })
    }
  } catch (cause: unknown) {
    dropError.value = describeOlapError(cause)
  }
}

// Auto-preview SQL when config changes
watch(
  () => store.pivotConfig,
  async () => {
    if (store.pivotConfig.rows.length || store.pivotConfig.columns.length || store.pivotConfig.measures.length) {
      await store.previewSQL()
    }
  },
  { deep: true }
)

const executeQuery = async () => {
  await store.executePivotQuery()
}

async function copySQL() {
  try {
    await navigator.clipboard.writeText(store.generatedSQL)
    copyStatus.value = { tone: 'success', message: 'SQL을 클립보드에 복사했습니다.' }
  } catch (cause: unknown) {
    copyStatus.value = {
      tone: 'error',
      message: `SQL을 복사하지 못했습니다. ${describeOlapError(cause)}`,
    }
  }
  timeouts.schedule('copy-status', () => {
    copyStatus.value = null
  }, 3000)
}

watch(() => store.currentCube, (cubeName, previousCubeName) => {
  if (cubeName === previousCubeName) return
  resetScriptLifecycleForCubeChange()
})

</script>

<template>
  <div class="pivot-analysis">
    <!-- Field List Sidebar -->
    <aside class="fields-panel">
      <FieldList />
    </aside>

    <!-- Pivot Configuration -->
    <main class="config-panel">
      <div class="config-header">
        <h3>피벗 설정</h3>
        <div class="config-actions">
          <button
            class="btn btn-cube-edit"
            @click="openCubeEditor"
            :disabled="!store.currentCube"
            title="큐브 구조 편집"
          >
            ✏️ 큐브 편집
          </button>
          <button
            class="btn btn-etl"
            @click="executeETL"
            :disabled="etlLoading || !store.currentCube"
            title="OLTP → OLAP 데이터 동기화"
          >
            <span v-if="etlLoading" class="spinner-sm"></span>
            <span v-else>🔄</span>
            {{ etlLoading ? 'ETL 중...' : 'ETL 동기화' }}
          </button>
          <button class="btn btn-ghost" @click="showSQL = !showSQL">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            SQL 보기
          </button>
          <button class="btn btn-secondary" @click="store.resetPivotConfig">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            초기화
          </button>
          <button
            class="btn btn-primary"
            @click="executeQuery"
            :disabled="!store.pivotConfig.measures.length"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            실행
          </button>
        </div>

        <!-- ETL Result Popup -->
        <div v-if="showETLResult" class="etl-result-popup">
          <div class="etl-result-content" :class="etlResult?.status || (etlResult?.success ? 'success' : 'failed')">
            <button class="close-btn" @click="showETLResult = false">×</button>
            <div v-if="etlLoading" class="etl-loading">
              <div class="spinner"></div>
              <span>ETL 파이프라인 배포 중...</span>
            </div>
            <div v-else-if="etlResult">
              <!-- Airflow Pipeline Deployed -->
              <div v-if="etlResult.success && etlResult.dag_id" class="etl-success">
                <span class="icon">🚀</span>
                <div>
                  <strong>ETL 파이프라인 배포됨!</strong>
                  <p class="dag-info">DAG: {{ etlResult.dag_id }}</p>
                  <p v-if="etlResult.state">상태: {{ etlResult.state }}</p>
                  <p class="message">{{ etlResult.message }}</p>
                  <button v-if="airflowUrl" class="btn-airflow" @click="openAirflow">
                    🔗 Airflow에서 모니터링
                  </button>
                </div>
              </div>
              <!-- Direct Sync Completed -->
              <div v-else-if="etlResult.status === 'completed'" class="etl-success">
                <span class="icon">✅</span>
                <div>
                  <strong>ETL 동기화 완료!</strong>
                  <p>{{ etlResult.rows_inserted || 0 }}행 삽입, {{ etlResult.rows_updated || 0 }}행 업데이트</p>
                  <p class="duration">소요 시간: {{ etlResult.duration_ms }}ms</p>
                </div>
              </div>
              <!-- Failed -->
              <div v-else class="etl-error">
                <span class="icon">❌</span>
                <div>
                  <strong>ETL 실패</strong>
                  <p>{{ etlResult.error || etlResult.message }}</p>
                  <button v-if="directSyncAvailable" class="btn-airflow" @click="executeDirectSync">
                    직접 동기화 실행
                  </button>
                  <button v-if="airflowUrl" class="btn-airflow" @click="openAirflow">
                    🔗 Airflow에서 확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Drop Zones -->
      <div class="drop-zones">
        <!-- Rows -->
        <div class="zone-container">
          <label class="zone-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            행
          </label>
          <div
            class="drop-zone"
            :class="{ 'drag-over': rowsOver }"
            @dragover="onDragOver"
            @dragenter="rowsOver = true"
            @dragleave="rowsOver = false"
            @drop="onDropRows"
          >
            <div
              v-for="(field, index) in store.pivotConfig.rows"
              :key="`row-${index}`"
              class="tag dimension"
            >
              {{ field.dimension }} › {{ field.level }}
              <button
                type="button"
                class="remove"
                :aria-label="`${field.dimension} ${field.level} 행 제거`"
                @click="store.removeFromRows(index)"
              >×</button>
            </div>
            <span v-if="!store.pivotConfig.rows.length" class="placeholder">
              차원을 여기에 드롭하세요
            </span>
          </div>
        </div>

        <!-- Columns -->
        <div class="zone-container">
          <label class="zone-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="3" x2="12" y2="21"/>
              <line x1="6" y1="3" x2="6" y2="21"/>
              <line x1="18" y1="3" x2="18" y2="21"/>
            </svg>
            열
          </label>
          <div
            class="drop-zone"
            :class="{ 'drag-over': colsOver }"
            @dragover="onDragOver"
            @dragenter="colsOver = true"
            @dragleave="colsOver = false"
            @drop="onDropCols"
          >
            <div
              v-for="(field, index) in store.pivotConfig.columns"
              :key="`col-${index}`"
              class="tag dimension"
            >
              {{ field.dimension }} › {{ field.level }}
              <button
                type="button"
                class="remove"
                :aria-label="`${field.dimension} ${field.level} 열 제거`"
                @click="store.removeFromColumns(index)"
              >×</button>
            </div>
            <span v-if="!store.pivotConfig.columns.length" class="placeholder">
              차원을 여기에 드롭하세요
            </span>
          </div>
        </div>

        <!-- Measures -->
        <div class="zone-container">
          <label class="zone-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="20" x2="12" y2="10"/>
              <line x1="18" y1="20" x2="18" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="16"/>
            </svg>
            측정값
          </label>
          <div
            class="drop-zone"
            :class="{ 'drag-over': measuresOver }"
            @dragover="onDragOver"
            @dragenter="measuresOver = true"
            @dragleave="measuresOver = false"
            @drop="onDropMeasures"
          >
            <div
              v-for="(measure, index) in store.pivotConfig.measures"
              :key="`measure-${index}`"
              class="tag measure"
            >
              {{ measure.name }}
              <button
                type="button"
                class="remove"
                :aria-label="`${measure.name} 측정값 제거`"
                @click="store.removeMeasure(index)"
              >×</button>
            </div>
            <span v-if="!store.pivotConfig.measures.length" class="placeholder">
              측정값을 여기에 드롭하세요
            </span>
          </div>
        </div>
      </div>

      <!-- Query Results -->
      <div v-if="store.queryResult" class="results-section">
        <h4>결과</h4>
        <div class="results-table-wrapper">
          <table class="results-table">
            <thead>
              <tr>
                <th v-for="col in store.queryResult.columns" :key="col">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in store.queryResult.rows.slice(0, 50)" :key="i">
                <td v-for="col in store.queryResult.columns" :key="col">{{ row[col] }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="store.queryResult.rows.length > 50" class="more-rows">
            ... 외 {{ store.queryResult.rows.length - 50 }}개 행
          </p>
        </div>
      </div>

      <!-- SQL Preview -->
      <div v-if="showSQL && store.generatedSQL" class="sql-preview">
        <div class="sql-header">
          <span>생성된 SQL</span>
          <button class="btn btn-ghost btn-sm" @click="copySQL">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            복사
          </button>
        </div>
        <pre class="code-block">{{ store.generatedSQL }}</pre>
        <div
          v-if="copyStatus"
          class="copy-status"
          :class="copyStatus.tone"
          :role="copyStatus.tone === 'error' ? 'alert' : 'status'"
        >
          {{ copyStatus.message }}
        </div>
      </div>

      <!-- Error -->
      <div v-if="store.queryError || store.previewError || dropError" class="error-message" role="alert">
        {{ store.queryError || store.previewError || dropError }}
      </div>
    </main>

    <!-- Cube Editor Modal (Visual Modeler) -->
    <div v-if="showCubeEditor" class="modal-overlay" @click.self="closeCubeEditor">
      <section
        ref="cubeEditorDialog"
        class="cube-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="olap-cube-editor-title"
        :aria-busy="editorBusy"
        tabindex="-1"
      >
        <header class="modal-header">
          <div class="header-left">
            <h2 id="olap-cube-editor-title">✏️ {{ editCubeName }}</h2>
          </div>

          <!-- Tabs -->
          <nav class="editor-tabs">
            <button
              class="editor-tab"
              :class="{ active: editorTab === 'cube' }"
              @click="editorTab = 'cube'"
            >
              📦 큐브 스키마
            </button>
            <button
              class="editor-tab"
              :class="{ active: editorTab === 'etl' }"
              @click="editorTab = 'etl'"
            >
              🔄 ETL 설정
            </button>
            <button
              class="editor-tab"
              :class="{ active: editorTab === 'script' }"
              @click="editorTab = 'script'"
            >
              📜 ETL 스크립트
            </button>
          </nav>

          <button
            ref="cubeEditorCloseButton"
            type="button"
            class="btn-close"
            aria-label="큐브 편집기 닫기"
            :disabled="editorBusy"
            @click="closeCubeEditor"
          >
            ×
          </button>
        </header>

        <div class="modal-body">
          <!-- Messages -->
          <div v-if="editorError" class="message error" role="alert">
            <span>{{ editorError }}</span>
            <button
              v-if="failedGenerationTarget"
              type="button"
              class="btn btn-secondary"
              :disabled="scriptLoading"
              @click="retryGeneration"
            >
              같은 생성 다시 시도
            </button>
            <button
              v-else-if="failedSaveTarget"
              type="button"
              class="btn btn-secondary"
              :disabled="scriptSaving"
              @click="retrySave"
            >
              같은 저장 다시 시도
            </button>
          </div>
          <div v-if="editorNotice" class="message success" role="status">{{ editorNotice }}</div>

          <!-- CUBE TAB -->
          <div v-if="editorTab === 'cube'" class="editor-grid">
            <!-- Left: Form -->
            <div class="editor-form">
              <!-- Basic Info -->
              <div class="form-section">
                <h4>📦 기본 정보</h4>
                <div class="form-group">
                  <label>큐브 이름</label>
                  <input type="text" v-model="editCubeName" class="form-input" disabled />
                </div>
                <div class="form-group">
                  <label>팩트 테이블</label>
                  <input type="text" v-model="editFactTable" placeholder="dw.fact_xxx" class="form-input" />
                </div>
              </div>

              <!-- Dimensions -->
              <div class="form-section">
                <div class="section-header">
                  <h4>📐 디멘전</h4>
                  <button class="btn btn-sm btn-add" @click="addEditDimension">+ 추가</button>
                </div>

                <div v-for="(dim, dimIndex) in editDimensions" :key="dim.id" class="dimension-item">
                  <div class="dim-row">
                    <input v-model="dim.name" placeholder="디멘전 이름" class="form-input" />
                    <button class="btn-remove" @click="removeEditDimension(dimIndex)">×</button>
                  </div>
                  <div class="dim-details">
                    <input v-model="dim.table" placeholder="테이블 (dw.dim_xxx)" class="form-input" />
                    <input v-model="dim.foreignKey" placeholder="FK (xxx_id)" class="form-input" />
                  </div>
                  <div class="levels-section">
                    <span class="levels-label">레벨:</span>
                    <div v-for="(level, levelIndex) in dim.levels" :key="level.id" class="level-item">
                      <input v-model="level.name" placeholder="레벨명" class="form-input level-input" />
                      <input v-model="level.column" placeholder="컬럼" class="form-input level-input" />
                      <button class="btn-remove-level" @click="removeEditLevel(dimIndex, levelIndex)">×</button>
                    </div>
                    <button class="btn-add-level" @click="addEditLevel(dimIndex)">+ 레벨</button>
                  </div>
                </div>

                <div v-if="editDimensions.length === 0" class="empty-hint">
                  디멘전이 없습니다
                </div>
              </div>

              <!-- Measures -->
              <div class="form-section">
                <div class="section-header">
                  <h4>📊 측정값</h4>
                  <button class="btn btn-sm btn-add" @click="addEditMeasure">+ 추가</button>
                </div>

                <div v-for="(measure, measureIndex) in editMeasures" :key="measure.id" class="measure-item">
                  <input v-model="measure.name" placeholder="이름" class="form-input" />
                  <input v-model="measure.column" placeholder="컬럼" class="form-input" />
                  <select v-model="measure.aggregator" class="form-select">
                    <option value="sum">SUM</option>
                    <option value="count">COUNT</option>
                    <option value="avg">AVG</option>
                    <option value="min">MIN</option>
                    <option value="max">MAX</option>
                  </select>
                  <button class="btn-remove" @click="removeEditMeasure(measureIndex)">×</button>
                </div>

                <div v-if="editMeasures.length === 0" class="empty-hint">
                  측정값이 없습니다
                </div>
              </div>
            </div>

            <!-- Right: XML Preview -->
            <div class="editor-preview">
              <h4>XML 미리보기</h4>
              <pre class="xml-preview">{{ generateEditXML() }}</pre>
            </div>
          </div>

          <!-- ETL TAB -->
          <div v-else-if="editorTab === 'etl'" class="etl-editor">
            <div v-if="etlLoading" class="etl-loading">
              <div class="spinner"></div>
              <span>ETL 설정 로드 중...</span>
            </div>

            <div v-else-if="etlConfigLoadError" class="etl-load-error" role="alert">
              <p>{{ etlConfigLoadError }}</p>
              <div class="load-error-actions">
                <button type="button" class="btn btn-secondary" @click="loadETLConfig">다시 시도</button>
                <button type="button" class="btn btn-primary" @click="createNewETLConfigDraft">
                  새 ETL 설정 작성
                </button>
              </div>
            </div>

            <div v-else-if="etlConfig" class="etl-content">
              <div class="etl-grid">
                <!-- Left: ETL Config Form -->
                <div class="etl-form">
                  <!-- Basic ETL Info -->
                  <div class="form-section">
                    <h4>⚙️ 기본 설정</h4>
                    <div class="form-row">
                      <div class="form-group">
                        <label>팩트 테이블</label>
                        <input type="text" v-model="etlConfig.fact_table" class="form-input" placeholder="dw.fact_xxx" />
                      </div>
                      <div class="form-group">
                        <label>DW 스키마</label>
                        <input type="text" v-model="etlConfig.dw_schema" class="form-input" placeholder="dw" />
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group">
                        <label>동기화 모드</label>
                        <select v-model="etlConfig.sync_mode" class="form-select">
                          <option value="full">전체 (Full)</option>
                          <option value="incremental">증분 (Incremental)</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label>증분 컬럼</label>
                        <input type="text" v-model="etlConfig.incremental_column" class="form-input" placeholder="updated_at" :disabled="etlConfig.sync_mode !== 'incremental'" />
                      </div>
                    </div>
                  </div>

                  <!-- Source Tables -->
                  <div class="form-section">
                    <div class="section-header">
                      <h4>📥 소스 테이블</h4>
                      <button class="btn btn-sm btn-add" @click="addSourceTable">+ 추가</button>
                    </div>
                    <div class="source-tables-list">
                      <div v-for="(_, idx) in etlConfig.source_tables" :key="idx" class="source-table-item">
                        <input v-model="etlConfig.source_tables[idx]" class="form-input" placeholder="RWIS.TABLE_NAME" />
                        <button class="btn-remove" @click="removeSourceTable(idx)">×</button>
                      </div>
                      <div v-if="!etlConfig.source_tables?.length" class="empty-hint">소스 테이블이 없습니다</div>
                    </div>
                  </div>

                  <!-- Dimension Tables -->
                  <div class="form-section">
                    <h4>📐 디멘전 테이블</h4>
                    <div class="dim-tables-list">
                      <div v-for="(table, idx) in etlConfig.dimension_tables" :key="idx" class="dim-table-chip">
                        {{ table }}
                      </div>
                      <div v-if="!etlConfig.dimension_tables?.length" class="empty-hint">디멘전 테이블이 없습니다 (큐브 탭에서 추가)</div>
                    </div>
                  </div>

                  <!-- Column Mappings -->
                  <div class="form-section">
                    <div class="section-header">
                      <h4>🔀 컬럼 매핑</h4>
                      <button class="btn btn-sm btn-add" @click="addETLMapping">+ 추가</button>
                    </div>
                    <div class="mappings-list">
                      <div v-for="(mapping, idx) in etlConfig.mappings" :key="idx" class="mapping-item">
                        <div class="mapping-row">
                          <input v-model="mapping.source_table" class="form-input" placeholder="소스 테이블" />
                          <span class="mapping-dot">.</span>
                          <input v-model="mapping.source_column" class="form-input" placeholder="소스 컬럼" />
                          <span class="mapping-arrow">→</span>
                          <input v-model="mapping.target_table" class="form-input" placeholder="타겟 테이블" />
                          <span class="mapping-dot">.</span>
                          <input v-model="mapping.target_column" class="form-input" placeholder="타겟 컬럼" />
                          <button class="btn-remove" @click="removeETLMapping(idx)">×</button>
                        </div>
                        <div class="mapping-transform">
                          <input v-model="mapping.transformation" class="form-input" placeholder="변환식 (예: AVG(...), SUM(...))" />
                        </div>
                      </div>
                      <div v-if="!etlConfig.mappings?.length" class="empty-hint">컬럼 매핑이 없습니다</div>
                    </div>
                  </div>
                </div>

                <!-- Right: JSON Preview -->
                <div class="etl-preview">
                  <h4>ETL 설정 (JSON)</h4>
                  <pre class="json-preview">{{ JSON.stringify(etlConfig, null, 2) }}</pre>
                </div>
              </div>
            </div>

            <div v-else class="etl-empty">
              <p>ETL 설정을 로드할 수 없습니다.</p>
            </div>
          </div>

          <!-- SCRIPT TAB - Split View -->
          <div v-else-if="editorTab === 'script'" class="script-editor">
            <div v-if="savedScriptLoadError" class="script-load-error" role="alert">
              <span>{{ savedScriptLoadError }}</span>
              <button type="button" class="btn btn-secondary" @click="retrySavedLoad">다시 시도</button>
            </div>

            <!-- Agent Toggle -->
            <div class="agent-toggle">
              <label class="toggle-label">
                <input type="checkbox" v-model="useAgentGeneration" />
                <span class="toggle-text">🤖 AI 에이전트 사용 (LangGraph 기반 지능형 ETL 생성)</span>
              </label>
              <button
                class="btn btn-primary btn-generate"
                @click="loadETLScript"
                :disabled="scriptLoading"
              >
                <span v-if="scriptLoading" class="spinner-sm"></span>
                <span v-else>{{ useAgentGeneration ? '🤖 ETL 스크립트 생성' : '⚡ 스크립트 생성' }}</span>
              </button>
              <button
                v-if="scriptLoading"
                type="button"
                class="btn btn-cancel"
                @click="cancelAgentGeneration()"
              >
                생성 취소
              </button>
            </div>

            <!-- Split View: Left = Reasoning, Right = Code -->
            <div class="script-split-view">
              <!-- Left Panel: Agent Reasoning Log -->
              <div class="reasoning-panel">
                <div class="panel-header">
                  <h4>🧠 에이전트 추론 과정</h4>
                  <span class="status-badge" :class="agentStatus">{{ agentStatus.toUpperCase() }}</span>
                </div>
                <div class="log-entries" ref="logEntriesRef">
                  <div v-if="agentReasoningLog.length === 0" class="log-empty">
                    <p>에이전트 버튼을 클릭하면 추론 과정이 여기에 실시간으로 표시됩니다.</p>
                  </div>
                  <div
                    v-for="(log, idx) in agentReasoningLog"
                    :key="idx"
                    class="log-entry"
                    :class="[log.type, { 'error': log.type === 'error' }]"
                  >
                    <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
                    <span v-if="log.node" class="log-node">[{{ log.node }}]</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                  <div v-if="scriptLoading" class="log-entry loading">
                    <span class="spinner-sm"></span>
                    <span class="log-message">처리 중...</span>
                  </div>
                </div>
              </div>

              <!-- Right Panel: Generated Code -->
              <div class="code-panel">
                <div class="panel-header">
                  <div class="script-info">
                    <span class="script-icon">📜</span>
                    <span class="script-filename">{{ scriptFilename || 'ETL 스크립트' }}</span>
                  </div>
                  <div class="script-actions">
                    <span v-if="scriptSaved" class="saved-badge" :title="'저장됨: ' + scriptSavedAt">
                      💾 저장됨
                    </span>
                    <button
                      class="btn btn-sm btn-save"
                      @click="saveScript"
                      title="스크립트 저장"
                      :disabled="!scriptCode || scriptSaving"
                    >
                      <span v-if="scriptSaving" class="spinner-sm"></span>
                      <span v-else>💾 저장</span>
                    </button>
                    <button
                      class="btn btn-sm btn-refresh"
                      @click="loadETLScript"
                      title="스크립트 재생성"
                      :disabled="scriptLoading"
                    >
                      🔄
                    </button>
                    <button
                      class="btn btn-sm btn-download"
                      @click="downloadETLScript"
                      title="파일 다운로드"
                      :disabled="!scriptCode || downloadPending"
                    >
                      {{ downloadPending ? '⏳' : '📥' }}
                    </button>
                  </div>
                </div>
                <div class="code-content">
                  <div v-if="!scriptCode && !scriptLoading" class="code-empty">
                    <div class="empty-icon">📝</div>
                    <p>생성된 코드가 여기에 표시됩니다.</p>
                    <p class="hint">"ETL 스크립트 생성" 버튼을 클릭하세요.</p>
                  </div>
                  <pre v-else class="script-code"><code>{{ scriptCode }}</code></pre>
                </div>
              </div>
            </div>

            <!-- Execution Section -->
            <div class="script-execution">
              <div class="execution-header">
                <h4>⚡ 스크립트 실행</h4>
                <div class="execution-controls">
                  <span v-if="!scriptSaved && scriptCode" class="unsaved-warning">
                    ⚠️ 저장되지 않음
                  </span>

                  <!-- Dropdown Execute Button -->
                  <div class="execute-dropdown" v-if="!scriptExecuting">
                    <button
                      class="btn btn-execute-main"
                      @click="showExecuteMenu = !showExecuteMenu"
                      :disabled="!scriptSaved"
                      :title="!scriptSaved ? '스크립트를 먼저 저장해주세요' : 'ETL 실행'"
                    >
                      ▶️ 실행 ▾
                    </button>
                    <div v-if="showExecuteMenu" class="execute-menu">
                      <button class="menu-item" @click="executeWithMode('full')">
                        🔄 전체 재적재
                        <span class="menu-desc">기존 삭제 후 새로 생성</span>
                      </button>
                      <button class="menu-item" @click="executeWithMode('incremental')">
                        📈 증분 적재
                        <span class="menu-desc">새 데이터만 추가</span>
                      </button>
                    </div>
                  </div>

                  <!-- Cancel button during execution -->
                  <button
                    v-if="scriptExecuting"
                    class="btn btn-cancel"
                    @click="cancelScriptExecution"
                    title="실행 취소"
                  >
                    ⏹️ 취소
                  </button>
                </div>
              </div>

              <!-- Execution Progress with Live Log -->
              <div v-if="scriptExecuting || executionLogs.length > 0" class="execution-live-log">
                <div class="log-header">
                  <span v-if="scriptExecuting" class="log-status running">
                    <span class="pulse-dot"></span>
                    {{ executionProgress.phase === 'regenerating' ? '에이전트 수정 중...' : 'ETL 실행 중...' }}
                    <span v-if="executionProgress.attempt > 1" class="retry-badge">재시도 {{ executionProgress.attempt }}/{{ executionProgress.maxRetries }}</span>
                  </span>
                  <span
                    v-else
                    class="log-status"
                    :class="scriptExecutionResult?.cancelled
                      ? 'cancelled'
                      : scriptExecutionResult?.success === false
                        ? 'failed'
                        : 'completed'"
                  >
                    {{ scriptExecutionResult?.cancelled
                      ? '취소됨'
                      : scriptExecutionResult?.success === false
                        ? '실패'
                        : '완료' }}
                  </span>
                  <button v-if="!scriptExecuting && executionLogs.length > 0" class="btn-clear-log" @click="clearExecutionLogs">지우기</button>
                </div>
                <div class="log-content" ref="executionLogContainer">
                  <div v-for="(log, idx) in executionLogs" :key="idx" class="log-entry" :class="log.type">
                    <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                </div>
              </div>

              <div
                v-if="scriptExecutionResult"
                class="execution-result"
                :class="{
                  success: scriptExecutionResult.success,
                  error: !scriptExecutionResult.success && !scriptExecutionResult.cancelled,
                  cancelled: scriptExecutionResult.cancelled,
                }"
              >
                <div class="result-header">
                  <span class="result-icon">
                    {{ scriptExecutionResult.success ? '✅' : scriptExecutionResult.cancelled ? '⏹️' : '❌' }}
                  </span>
                  <span class="result-title">
                    {{ scriptExecutionResult.success
                      ? '실행 성공'
                      : scriptExecutionResult.cancelled
                        ? '실행 취소'
                        : '실행 실패' }}
                  </span>
                </div>

                <div v-if="scriptExecutionResult.success" class="result-stats">
                  <div class="stat">
                    <span class="stat-label">처리된 행</span>
                    <span class="stat-value">{{ scriptExecutionResult.total_rows_processed }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">시작</span>
                    <span class="stat-value">{{ scriptExecutionResult.started_at }}</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">완료</span>
                    <span class="stat-value">{{ scriptExecutionResult.completed_at }}</span>
                  </div>
                </div>

                <div v-if="scriptExecutionResult.error" class="result-error">
                  {{ scriptExecutionResult.error }}
                </div>

                <div v-if="scriptExecutionResult.steps?.length" class="result-steps">
                  <h5>실행 단계:</h5>
                  <div v-for="(step, idx) in scriptExecutionResult.steps" :key="idx" class="step-item" :class="step.status">
                    <span class="step-icon">{{ step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : '○' }}</span>
                    <span class="step-name">{{ step.step }}</span>
                    <span class="step-message">{{ step.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <div class="footer-left">
            <!-- Airflow DAG button -->
            <button class="btn btn-dag-redeploy" @click="requestRedeployDAG" :disabled="dagRedeployLoading" title="Airflow로 DAG 배포">
              <span v-if="dagRedeployLoading" class="spinner-sm"></span>
              <span v-else>🚀 DAG 배포</span>
            </button>
          </div>
          <div class="footer-right">
            <button class="btn btn-secondary" :disabled="editorBusy" @click="closeCubeEditor">닫기</button>
            <button v-if="editorTab === 'cube'" class="btn btn-primary" @click="saveCubeChanges" :disabled="cubeEditLoading">
              <span v-if="cubeEditLoading" class="spinner-sm"></span>
              <span v-else>💾 큐브 저장</span>
            </button>
            <button v-else-if="editorTab === 'etl'" class="btn btn-primary" @click="saveETLConfig" :disabled="cubeEditLoading">
              <span v-if="cubeEditLoading" class="spinner-sm"></span>
              <span v-else>💾 ETL 저장</span>
            </button>
          </div>
        </footer>
      </section>
    </div>

    <ActionDialog
      :open="pendingAction !== null"
      dialog-id="olap-pivot-action"
      :title="actionTitle"
      :message="actionMessage"
      :confirm-label="pendingAction === 'full-reload' ? '전체 재적재' : 'DAG 재배포'"
      :pending-label="pendingAction === 'full-reload' ? '실행 준비 중…' : '재배포 중…'"
      :pending="actionPending"
      :error="actionError"
      @cancel="cancelPendingAction"
      @confirm="confirmPendingAction"
    />
  </div>
</template>

<style lang="scss" scoped src="./PivotAnalysis.scss"></style>
