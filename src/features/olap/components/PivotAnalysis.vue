<script setup lang="ts">
/**
 * PivotAnalysis.vue
 * 피벗 테이블 분석 - 드래그앤드롭으로 차원/측정값 구성 및 쿼리 실행
 */
import { ref, watch, nextTick } from 'vue'
import { useOlapStore } from '@/stores/olap'
import * as olapApi from '@/features/olap/olap-api'
import FieldList from './FieldList.vue'

const store = useOlapStore()
const showSQL = ref(false)
const etlLoading = ref(false)
const etlResult = ref<any>(null)
const showETLResult = ref(false)
const airflowUrl = ref<string | null>(null)

// Visual Modeler Modal
const showCubeEditor = ref(false)
const cubeEditLoading = ref(false)
const cubeEditError = ref<string | null>(null)
const cubeEditSuccess = ref<string | null>(null)
const dagRedeployLoading = ref(false)
const editorTab = ref<'cube' | 'etl' | 'script'>('cube')

// ETL Editor State
const etlConfig = ref<any>(null)
const directETLLoading = ref(false)
const scriptLoading = ref(false)
const directETLResult = ref<any>(null)

// Script Tab State
const scriptCode = ref<string>('')
const scriptFilename = ref<string>('')
const scriptExecuting = ref(false)
const scriptExecutionResult = ref<any>(null)
const agentReasoningLog = ref<any[]>([])
const agentStatus = ref<string>('')
const scriptSaved = ref(false)
const scriptSavedAt = ref<string | null>(null)
const scriptSaving = ref(false)
const useAgentGeneration = ref(true)  // Use intelligent agent by default
const syncMode = ref<'full' | 'incremental'>('full')  // ETL sync mode
const showSyncModeConfirm = ref(false)  // Show confirmation dialog for full reload

// Visual Modeler State (for current cube)
const editCubeName = ref('')
const editFactTable = ref('')
const editDimensions = ref<any[]>([])
const editMeasures = ref<any[]>([])

// Load current cube for editing
async function openCubeEditor() {
  if (!store.currentCube) return
  
  cubeEditLoading.value = true
  cubeEditError.value = null
  editorTab.value = 'cube'  // Reset to cube tab
  
  try {
    // Load cube metadata
    const metadata = store.cubeMetadata
    if (metadata) {
      editCubeName.value = store.currentCube
      editFactTable.value = metadata.fact_table || ''
      editDimensions.value = (metadata.dimensions || []).map((d: any, i: number) => ({
        id: Date.now() + i,
        name: d.name || '',
        table: d.table || '',
        foreignKey: d.foreign_key || '',
        levels: (d.levels || []).map((l: any, j: number) => ({
          id: Date.now() + i * 100 + j,
          name: l.name || '',
          column: l.column || ''
        }))
      }))
      editMeasures.value = (metadata.measures || []).map((m: any, i: number) => ({
        id: Date.now() + i,
        name: m.name || '',
        column: m.column || '',
        aggregator: m.aggregator || 'sum'
      }))
    } else {
      // Empty template if no metadata
      editCubeName.value = store.currentCube
      editFactTable.value = ''
      editDimensions.value = []
      editMeasures.value = []
    }
    
    // Load ETL config and saved script
    await loadETLConfig()
    await loadSavedScript()
    
    showCubeEditor.value = true
  } catch (e: any) {
    cubeEditError.value = e.message
  } finally {
    cubeEditLoading.value = false
  }
}

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
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Schema name="${editCubeName.value}Schema">\n`
  xml += `  <Cube name="${editCubeName.value}">\n`
  xml += `    <Table name="${editFactTable.value.split('.').pop()}" schema="dw"/>\n`
  
  editDimensions.value.forEach(dim => {
    if (dim.name && dim.table) {
      xml += `    <Dimension name="${dim.name}" foreignKey="${dim.foreignKey || dim.name.toLowerCase() + '_id'}">\n`
      xml += `      <Hierarchy hasAll="true" primaryKey="id">\n`
      xml += `        <Table name="${dim.table.split('.').pop()}" schema="dw"/>\n`
      dim.levels?.forEach((level: any) => {
        if (level.name && level.column) {
          xml += `        <Level name="${level.name}" column="${level.column}"/>\n`
        }
      })
      xml += `      </Hierarchy>\n`
      xml += `    </Dimension>\n`
    }
  })
  
  editMeasures.value.forEach(m => {
    if (m.name && m.column) {
      xml += `    <Measure name="${m.name}" column="${m.column}" aggregator="${m.aggregator}"/>\n`
    }
  })
  
  xml += `  </Cube>\n</Schema>`
  return xml
}

// Save cube changes
async function saveCubeChanges() {
  cubeEditLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null
  
  try {
    const xml = generateEditXML()
    await olapApi.uploadSchemaText(xml)
    cubeEditSuccess.value = '큐브가 업데이트되었습니다!'
    
    // Reload cubes and metadata
    await store.loadCubes()
    if (store.currentCube) {
      await store.selectCube(store.currentCube)
    }
    
    setTimeout(() => {
      showCubeEditor.value = false
      cubeEditSuccess.value = null
    }, 1500)
  } catch (e: any) {
    cubeEditError.value = e.message
  } finally {
    cubeEditLoading.value = false
  }
}

// Load ETL config for editing
async function loadETLConfig() {
  if (!store.currentCube) return
  
  etlLoading.value = true
  try {
    const config = await olapApi.getETLConfig(store.currentCube)
    etlConfig.value = config
  } catch (e: any) {
    console.warn('ETL config not found:', e.message)
    // Create empty config template
    etlConfig.value = {
      cube_name: store.currentCube,
      fact_table: editFactTable.value,
      dimension_tables: editDimensions.value.map((d: any) => d.table).filter(Boolean),
      source_tables: [],
      mappings: [],
      dw_schema: 'dw',
      sync_mode: 'full',
      incremental_column: null
    }
  } finally {
    etlLoading.value = false
  }
}

// Save ETL config
async function saveETLConfig() {
  if (!etlConfig.value) return
  
  cubeEditLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null
  
  try {
    await olapApi.createETLConfig(etlConfig.value)
    cubeEditSuccess.value = 'ETL 설정이 저장되었습니다!'
    
    setTimeout(() => {
      cubeEditSuccess.value = null
    }, 3000)
  } catch (e: any) {
    cubeEditError.value = `ETL 저장 실패: ${e.message}`
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

// Execute ETL directly (without Airflow)
async function executeDirectETL() {
  if (!store.currentCube) return
  
  directETLLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null
  directETLResult.value = null
  
  try {
    const result = await olapApi.executeDirectETLByCube(store.currentCube)
    directETLResult.value = result
    
    if (result.success) {
      cubeEditSuccess.value = `✅ ETL 완료! ${result.total_rows_processed} 행 처리됨`
    } else {
      cubeEditError.value = `ETL 실패: ${result.error}`
    }
    
    setTimeout(() => {
      cubeEditSuccess.value = null
    }, 5000)
  } catch (e: any) {
    cubeEditError.value = `직접 ETL 실행 실패: ${e.message}`
  } finally {
    directETLLoading.value = false
  }
}

// Active EventSource for streaming
let activeEventSource: EventSource | null = null

// Load Python ETL script for preview (with streaming support)
async function loadETLScript() {
  if (!store.currentCube) return
  
  // Close any existing EventSource
  if (activeEventSource) {
    activeEventSource.close()
    activeEventSource = null
  }
  
  scriptLoading.value = true
  scriptCode.value = ''
  scriptFilename.value = `etl_${store.currentCube}.py`
  agentReasoningLog.value = []
  agentStatus.value = 'analyzing'
  cubeEditError.value = null
  
  try {
    if (useAgentGeneration.value) {
      // Use streaming API for real-time updates
      agentReasoningLog.value.push({
        timestamp: new Date().toISOString(),
        type: 'start',
        message: '🚀 AI 에이전트 기반 ETL 생성 시작...'
      })
      
      activeEventSource = olapApi.createAgentEventSource(store.currentCube, {
        onStart: (data) => {
          agentStatus.value = data.status || 'analyzing'
          agentReasoningLog.value.push({
            timestamp: new Date().toISOString(),
            type: 'start',
            message: data.message || '에이전트 시작'
          })
        },
        onLog: (data) => {
          agentReasoningLog.value.push({
            timestamp: data.timestamp || new Date().toISOString(),
            type: 'log',
            node: data.node,
            message: data.message
          })
        },
        onCode: (data) => {
          scriptCode.value = data.code || ''
          if (data.complete) {
            agentReasoningLog.value.push({
              timestamp: new Date().toISOString(),
              type: 'code',
              message: '✅ 코드 생성 완료'
            })
          }
        },
        onSql: (data) => {
          agentReasoningLog.value.push({
            timestamp: new Date().toISOString(),
            type: 'sql',
            message: `📝 SQL 생성: ${data.name}`
          })
        },
        onStatus: (data) => {
          agentStatus.value = data.status
          agentReasoningLog.value.push({
            timestamp: new Date().toISOString(),
            type: 'status',
            node: data.node,
            message: `상태: ${data.status}`
          })
        },
        onDimensions: (data) => {
          agentReasoningLog.value.push({
            timestamp: new Date().toISOString(),
            type: 'dimensions',
            message: `📐 ${data.strategies?.length || 0}개 디멘전 전략 생성됨`
          })
        },
        onTest: (data) => {
          const icon = data.success ? '✅' : '❌'
          agentReasoningLog.value.push({
            timestamp: new Date().toISOString(),
            type: 'test',
            message: `${icon} 테스트: ${data.name || 'unknown'}`
          })
        },
        onComplete: (data) => {
          agentStatus.value = 'completed'
          scriptLoading.value = false
          agentReasoningLog.value.push({
            timestamp: new Date().toISOString(),
            type: 'complete',
            message: data.message || '✅ ETL 생성 완료!'
          })
        },
        onError: (error) => {
          agentStatus.value = 'error'
          scriptLoading.value = false
          const errMsg = error?.message || '알 수 없는 오류'
          cubeEditError.value = `스크립트 생성 실패: ${errMsg}`
          agentReasoningLog.value.push({
            timestamp: new Date().toISOString(),
            type: 'error',
            message: `❌ 오류: ${errMsg}`
          })
        }
      })
    } else {
      // Fall back to template-based generation (non-streaming)
      const result = await olapApi.generateETLScript(store.currentCube)
      scriptCode.value = result.code
      scriptFilename.value = result.filename || `etl_${store.currentCube}.py`
      agentReasoningLog.value = [{
        timestamp: new Date().toISOString(),
        type: 'complete',
        message: '📝 템플릿 기반 스크립트 생성 완료'
      }]
      agentStatus.value = 'completed'
      scriptLoading.value = false
    }
  } catch (e: any) {
    cubeEditError.value = `스크립트 생성 실패: ${e.message}`
    agentStatus.value = 'error'
    agentReasoningLog.value.push({
      timestamp: new Date().toISOString(),
      type: 'error',
      message: `❌ 오류: ${e.message}`
    })
    scriptLoading.value = false
  }
}

// Load saved script from server
async function loadSavedScript() {
  if (!store.currentCube) return
  
  try {
    const result = await olapApi.loadSavedScript(store.currentCube)
    
    if (result.exists) {
      scriptCode.value = result.code
      scriptFilename.value = result.filename
      scriptSaved.value = true
      scriptSavedAt.value = result.saved_at
      agentReasoningLog.value = [{
        timestamp: result.saved_at,
        type: 'complete',
        message: `💾 저장된 스크립트 로드됨 (${result.saved_at})`
      }]
      agentStatus.value = 'completed'
    } else {
      // No saved script, reset state
      scriptCode.value = ''
      scriptFilename.value = ''
      scriptSaved.value = false
      scriptSavedAt.value = null
      agentReasoningLog.value = []
      agentStatus.value = ''
    }
  } catch (e: any) {
    console.error('Failed to load saved script:', e)
    // Don't show error to user, just reset state
    scriptSaved.value = false
  }
}

// Save the current script
async function saveScript() {
  if (!store.currentCube || !scriptCode.value) return
  
  scriptSaving.value = true
  cubeEditError.value = null
  
  try {
    const result = await olapApi.saveETLScript(
      store.currentCube, 
      scriptCode.value, 
      scriptFilename.value
    )
    
    if (result.success) {
      scriptSaved.value = true
      scriptSavedAt.value = result.metadata?.saved_at
      cubeEditSuccess.value = '💾 스크립트가 저장되었습니다'
      
      agentReasoningLog.value.push({
        timestamp: new Date().toISOString(),
        type: 'complete',
        message: '💾 스크립트 저장 완료'
      })
      
      setTimeout(() => {
        cubeEditSuccess.value = null
      }, 3000)
    }
  } catch (e: any) {
    cubeEditError.value = `스크립트 저장 실패: ${e.message}`
  } finally {
    scriptSaving.value = false
  }
}

// Execution progress state
const executionProgress = ref({
  attempt: 0,
  maxRetries: 3,
  phase: '' as 'executing' | 'regenerating' | 'completed' | '',
  message: ''
})
let executionCancelFn: (() => void) | null = null

// Execute menu and live logs
const showExecuteMenu = ref(false)
const executionLogs = ref<Array<{ timestamp: string; type: string; message: string }>>([])
const executionLogContainer = ref<HTMLElement | null>(null)

// Format log timestamp
function formatLogTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

// Execute with specific mode (called from dropdown menu)
function executeWithMode(mode: 'full' | 'incremental') {
  showExecuteMenu.value = false
  syncMode.value = mode
  
  if (mode === 'full') {
    // Simple browser confirm for full reload
    const confirmed = window.confirm('⚠️ 전체 재적재를 실행합니다.\n\n기존 DW 테이블과 데이터가 모두 삭제됩니다.\n계속하시겠습니까?')
    if (!confirmed) return
  }
  
  executeScript()
}

// Add log entry and scroll to bottom
function addExecutionLog(type: string, message: string) {
  executionLogs.value.push({
    timestamp: new Date().toISOString(),
    type,
    message
  })
  // Auto scroll to bottom
  nextTick(() => {
    if (executionLogContainer.value) {
      executionLogContainer.value.scrollTop = executionLogContainer.value.scrollHeight
    }
  })
}

// Execute saved Python ETL script with auto-retry feedback loop
async function executeScript() {
  if (!store.currentCube) return
  
  // Check if script is saved
  if (!scriptSaved.value) {
    cubeEditError.value = '스크립트를 먼저 저장해주세요'
    return
  }
  
  scriptExecuting.value = true
  scriptExecutionResult.value = null
  cubeEditError.value = null
  cubeEditSuccess.value = null
  executionProgress.value = { attempt: 0, maxRetries: 3, phase: 'executing', message: '' }
  executionLogs.value = [] // Clear previous logs
  
  // Add initial log entry
  addExecutionLog('start', syncMode.value === 'full' 
    ? '🔄 전체 재적재 모드로 ETL 실행 시작...'
    : '📈 증분 적재 모드로 ETL 실행 시작...')
  
  try {
    // Use streaming API with auto-retry
    const { cancel } = olapApi.executeScriptWithRetry(
      store.currentCube,
      syncMode.value as 'full' | 'incremental',
      3, // maxRetries
      (event) => {
        // Update progress
        if (event.attempt) {
          executionProgress.value.attempt = event.attempt
        }
        if (event.maxRetries) {
          executionProgress.value.maxRetries = event.maxRetries
        }
        executionProgress.value.message = event.message
        
        // Handle different event types and add to execution logs
        switch (event.type) {
          case 'progress':
            executionProgress.value.phase = 'executing'
            addExecutionLog('info', event.message)
            break
            
          case 'log':
            addExecutionLog('info', event.message)
            break
            
          case 'error':
            addExecutionLog('error', event.message)
            break
            
          case 'regenerating':
            executionProgress.value.phase = 'regenerating'
            addExecutionLog('warning', `🔄 ${event.message}`)
            break
            
          case 'agent_reasoning':
            addExecutionLog('reasoning', `🤖 ${event.message}`)
            break
            
          case 'script_updated':
            addExecutionLog('success', `✏️ ${event.message}`)
            loadSavedScriptFromServer()
            break
            
          case 'success':
            cubeEditSuccess.value = event.message
            addExecutionLog('success', event.message)
            break
            
          case 'warning':
            addExecutionLog('warning', `⚠️ ${event.message}`)
            break
            
          case 'complete':
            executionProgress.value.phase = 'completed'
            scriptExecuting.value = false
            
            if (event.success) {
              cubeEditSuccess.value = event.message || 'ETL 실행 완료!'
              scriptExecutionResult.value = { success: true }
              addExecutionLog('success', `✅ ${event.message || 'ETL 실행 완료!'}`)
            } else {
              cubeEditError.value = event.message || 'ETL 실행 실패'
              scriptExecutionResult.value = { success: false, error: event.message }
              addExecutionLog('error', `❌ ${event.message || 'ETL 실행 실패'}`)
            }
            break
        }
      }
    )
    
    executionCancelFn = cancel
    
  } catch (e: any) {
    cubeEditError.value = `스크립트 실행 실패: ${e.message}`
    addExecutionLog('error', `❌ 스크립트 실행 실패: ${e.message}`)
    scriptExecuting.value = false
  }
}

// Cancel ongoing execution
function cancelScriptExecution() {
  if (executionCancelFn) {
    executionCancelFn()
    executionCancelFn = null
  }
  scriptExecuting.value = false
  executionProgress.value.phase = ''
  addExecutionLog('info', '⏹️ 실행이 취소되었습니다.')
}

// Load saved script from server (for reload after agent update)
async function loadSavedScriptFromServer() {
  if (!store.currentCube) return
  try {
    const result = await olapApi.loadSavedScript(store.currentCube)
    if (result.exists && result.code) {
      scriptCode.value = result.code
      scriptSaved.value = true
    }
  } catch (e) {
    console.error('Failed to reload script:', e)
  }
}

// Scroll log container to bottom
function scrollLogToBottom() {
  nextTick(() => {
    const logContainer = document.querySelector('.agent-log-scroll')
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight
    }
  })
}

// Cancel execution confirmation
function cancelExecution() {
  showSyncModeConfirm.value = false
}

// Confirm and execute with full reload
function confirmAndExecute() {
  showSyncModeConfirm.value = false
  executeScript()
}

// Download Python ETL script
async function downloadETLScript() {
  if (!store.currentCube) return
  
  scriptLoading.value = true
  cubeEditError.value = null
  
  try {
    const result = await olapApi.generateETLScript(store.currentCube)
    
    // Create blob and download
    const blob = new Blob([result.code], { type: 'text/x-python' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename || `etl_${store.currentCube}.py`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    cubeEditSuccess.value = `📥 스크립트 다운로드: ${result.filename}`
    
    setTimeout(() => {
      cubeEditSuccess.value = null
    }, 3000)
  } catch (e: any) {
    cubeEditError.value = `스크립트 생성 실패: ${e.message}`
  } finally {
    scriptLoading.value = false
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
async function redeployDAG() {
  if (!store.currentCube) {
    cubeEditError.value = '큐브를 선택해주세요'
    return
  }
  
  if (!confirm('DAG를 재생성하시겠습니까?\n기존 DAG가 덮어씌워집니다.')) {
    return
  }
  
  dagRedeployLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null
  
  try {
    // Force redeploy to Airflow
    const result = await olapApi.deployETLPipeline(store.currentCube, true)
    cubeEditSuccess.value = `DAG가 성공적으로 재생성되었습니다! (DAG ID: ${result.dag_id || store.currentCube})`
    
    console.log('DAG redeployment result:', result)
    
    setTimeout(() => {
      cubeEditSuccess.value = null
    }, 3000)
  } catch (e: any) {
    console.error('DAG redeployment failed:', e)
    cubeEditError.value = `DAG 재생성 실패: ${e.message}`
  } finally {
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
    const data = JSON.parse(event.dataTransfer.getData('application/json'))
    
    if (data.type === 'dimension') {
      if (target === 'rows') {
        store.addToRows({ dimension: data.dimension, level: data.level })
      } else if (target === 'cols') {
        store.addToColumns({ dimension: data.dimension, level: data.level })
      }
    } else if (data.type === 'measure' && target === 'measures') {
      store.addMeasure({ name: data.name })
    }
  } catch (e) {
    console.error('Drop error:', e)
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

// Deploy and run ETL via Airflow
const executeETL = async () => {
  if (!store.currentCube) return
  
  etlLoading.value = true
  etlResult.value = null
  showETLResult.value = true
  airflowUrl.value = null
  
  try {
    // Use Airflow to run ETL pipeline
    const result = await olapApi.runETLPipeline(store.currentCube)
    etlResult.value = result
    
    if (result.airflow_url) {
      airflowUrl.value = result.airflow_url
    }
  } catch (e: any) {
    // Fallback: Try direct sync if Airflow is not available
    console.warn('Airflow not available, trying direct sync:', e.message)
    try {
      const result = await store.executeETLSync(store.currentCube)
      etlResult.value = result
    } catch (syncError: any) {
      etlResult.value = { 
        status: 'failed', 
        error: `Airflow: ${e.message} | Direct: ${syncError.message}` 
      }
    }
  } finally {
    etlLoading.value = false
  }
}

// Open Airflow UI
const openAirflow = () => {
  if (airflowUrl.value) {
    window.open(airflowUrl.value, '_blank')
  }
}

function copySQL() {
  navigator.clipboard.writeText(store.generatedSQL)
}
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
              <span class="remove" @click="store.removeFromRows(index)">×</span>
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
              <span class="remove" @click="store.removeFromColumns(index)">×</span>
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
              <span class="remove" @click="store.removeMeasure(index)">×</span>
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
              <tr v-for="(row, i) in store.queryResult.data?.slice(0, 50)" :key="i">
                <td v-for="col in store.queryResult.columns" :key="col">{{ row[col] }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="store.queryResult.data?.length > 50" class="more-rows">
            ... 외 {{ store.queryResult.data.length - 50 }}개 행
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
      </div>
      
      <!-- Error -->
      <div v-if="store.error" class="error-message">
        {{ store.error }}
      </div>
    </main>
    
    <!-- Cube Editor Modal (Visual Modeler) -->
    <div v-if="showCubeEditor" class="modal-overlay" @click.self="showCubeEditor = false">
      <div class="cube-editor-modal">
        <header class="modal-header">
          <div class="header-left">
            <h2>✏️ {{ editCubeName }}</h2>
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
          
          <button class="btn-close" @click="showCubeEditor = false">×</button>
        </header>
        
        <div class="modal-body">
          <!-- Messages -->
          <div v-if="cubeEditError" class="message error">{{ cubeEditError }}</div>
          <div v-if="cubeEditSuccess" class="message success">{{ cubeEditSuccess }}</div>
          
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
                      <div v-for="(table, idx) in etlConfig.source_tables" :key="idx" class="source-table-item">
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
                      :disabled="!scriptCode"
                    >
                      📥
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
                  <span v-else class="log-status completed">완료</span>
                  <button v-if="!scriptExecuting && executionLogs.length > 0" class="btn-clear-log" @click="executionLogs = []">지우기</button>
                </div>
                <div class="log-content" ref="executionLogContainer">
                  <div v-for="(log, idx) in executionLogs" :key="idx" class="log-entry" :class="log.type">
                    <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                </div>
              </div>
              
              <div v-if="scriptExecutionResult" class="execution-result" :class="{ success: scriptExecutionResult.success, error: !scriptExecutionResult.success }">
                <div class="result-header">
                  <span class="result-icon">{{ scriptExecutionResult.success ? '✅' : '❌' }}</span>
                  <span class="result-title">{{ scriptExecutionResult.success ? '실행 성공' : '실행 실패' }}</span>
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
            <button class="btn btn-dag-redeploy" @click="redeployDAG" :disabled="dagRedeployLoading" title="Airflow로 DAG 배포">
              <span v-if="dagRedeployLoading" class="spinner-sm"></span>
              <span v-else>🚀 DAG 배포</span>
            </button>
          </div>
          <div class="footer-right">
            <button class="btn btn-secondary" @click="showCubeEditor = false">닫기</button>
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
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.pivot-analysis {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  height: 100%;
  width: 100%;
  padding: 16px;
  overflow: hidden;
}

.fields-panel {
  max-height: 100%;
  overflow-y: auto;
}

.config-panel {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  
  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
}

.config-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &.btn-primary {
    background: var(--color-accent);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--color-accent-hover);
    }
  }
  
  &.btn-secondary {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    
    &:hover {
      background: var(--color-bg);
    }
  }
  
  &.btn-ghost {
    background: transparent;
    color: var(--color-text-light);
    
    &:hover {
      background: var(--color-bg-tertiary);
    }
  }
  
  &.btn-etl {
    background: linear-gradient(135deg, #228be6, #7c3aed);
    color: white;
    
    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(34, 139, 230, 0.4);
    }
  }
  
  &.btn-sm {
    padding: 4px 8px;
    font-size: 0.75rem;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.drop-zones {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.zone-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zone-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  font-weight: 500;
}

.drop-zone {
  min-height: 100px;
  background: var(--color-bg-tertiary);
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
  transition: all 0.2s ease;
  
  &.drag-over {
    border-color: var(--color-accent);
    background: rgba(34, 139, 230, 0.1);
    box-shadow: inset 0 0 0 2px rgba(34, 139, 230, 0.2);
  }
  
  .placeholder {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    width: 100%;
    text-align: center;
    padding: 24px;
    pointer-events: none;
  }
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  
  &.dimension {
    background: rgba(174, 62, 201, 0.15);
    color: #ae3ec9;
  }
  
  &.measure {
    background: rgba(55, 178, 77, 0.15);
    color: #37b24d;
  }
  
  .remove {
    cursor: pointer;
    opacity: 0.6;
    
    &:hover {
      opacity: 1;
    }
  }
}

.results-section {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
  
  h4 {
    margin: 0 0 12px 0;
    font-size: 0.875rem;
  }
}

.results-table-wrapper {
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
  
  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  
  th {
    background: var(--color-bg-tertiary);
    font-weight: 600;
    position: sticky;
    top: 0;
  }
  
  tr:hover td {
    background: var(--color-bg-tertiary);
  }
}

.more-rows {
  text-align: center;
  padding: 8px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  margin: 0;
}

.sql-preview {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.sql-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.code-block {
  background: var(--color-bg);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  font-family: monospace;
  font-size: 0.8125rem;
  max-height: 200px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
}

.error-message {
  padding: 12px;
  background: rgba(250, 82, 82, 0.1);
  border: 1px solid rgba(250, 82, 82, 0.3);
  border-radius: 8px;
  color: #fa5252;
  font-size: 0.875rem;
}

/* ETL Popup */
.etl-result-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  z-index: 100;
}

.etl-result-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  min-width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  position: relative;
  
  .close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    
    &:hover {
      color: var(--color-text);
    }
  }
}

.etl-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
}

.etl-success, .etl-error {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  
  .icon {
    font-size: 1.5rem;
  }
  
  strong {
    display: block;
    margin-bottom: 4px;
  }
  
  p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
  
  .duration {
    font-size: 0.75rem;
  }
  
  .dag-info {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 6px;
    border-radius: 4px;
  }
  
  .message {
    margin-top: 8px !important;
  }
}

.btn-airflow {
  margin-top: 12px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #00d4aa 0%, #00a896 100%);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: linear-gradient(135deg, #00a896 0%, #008b7a 100%);
    transform: translateY(-1px);
  }
}

.spinner, .spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-sm {
  width: 14px;
  height: 14px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Cube Editor Button */
.btn-cube-edit {
  background: linear-gradient(135deg, #20c997, #12b886);
  color: white;
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(32, 201, 151, 0.4);
  }
}

/* Cube Editor Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.cube-editor-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  width: 90vw;
  max-width: 1200px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  gap: 16px;
  
  .header-left {
    h2 {
      margin: 0;
      font-size: 1.25rem;
    }
  }
  
  .btn-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 4px 8px;
    
    &:hover {
      color: var(--color-text);
    }
  }
}

.editor-tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  justify-content: center;
  
  .editor-tab {
    padding: 8px 20px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--color-text-muted);
    transition: all 0.2s;
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text);
    }
    
    &.active {
      background: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
    }
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  
  .message {
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 16px;
    
    &.error {
      background: rgba(250, 82, 82, 0.1);
      border: 1px solid rgba(250, 82, 82, 0.3);
      color: #fa5252;
    }
    
    &.success {
      background: rgba(64, 192, 87, 0.1);
      border: 1px solid rgba(64, 192, 87, 0.3);
      color: #40c057;
    }
  }
}

.editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

/* ETL Editor Styles */
.etl-editor {
  height: 100%;
  
  .etl-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: var(--color-text-muted);
    
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
  }
  
  .etl-empty {
    text-align: center;
    padding: 40px;
    color: var(--color-text-muted);
  }
}

.etl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  height: 100%;
}

.etl-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  max-height: 60vh;
  
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
}

.source-tables-list, .dim-tables-list, .mappings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-table-item {
  display: flex;
  gap: 8px;
  align-items: center;
  
  .form-input {
    flex: 1;
  }
}

.dim-tables-list {
  flex-direction: row;
  flex-wrap: wrap;
}

.dim-table-chip {
  background: var(--color-primary-alpha);
  color: var(--color-primary);
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 0.85rem;
}

.mapping-item {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  
  .mapping-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    
    .form-input {
      width: 120px;
      flex-shrink: 0;
    }
    
    .mapping-dot {
      color: var(--color-text-muted);
    }
    
    .mapping-arrow {
      color: var(--color-primary);
      font-weight: bold;
      padding: 0 4px;
    }
  }
  
  .mapping-transform {
    margin-top: 8px;
    
    .form-input {
      width: 100%;
    }
  }
}

.etl-preview {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  
  h4 {
    margin: 0 0 12px 0;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }
  
  .json-preview {
    flex: 1;
    background: var(--color-bg-code);
    padding: 12px;
    border-radius: 8px;
    overflow: auto;
    font-size: 0.75rem;
    font-family: 'Fira Code', 'Monaco', monospace;
    color: var(--color-text);
    white-space: pre-wrap;
    max-height: 60vh;
  }
}

/* Script Editor Tab Styles */
.script-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;  // Critical for flex children to enable scrolling
  overflow: hidden;
  
  .agent-toggle {
    padding: 12px 16px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    .toggle-label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      
      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--color-primary);
      }
      
      .toggle-text {
        font-size: 0.9rem;
        color: var(--color-text);
      }
    }
    
    .btn-generate {
      padding: 8px 20px;
      font-size: 0.9rem;
    }
  }
  
  // Split View Layout - Fixed height to keep execution section visible
  .script-split-view {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    min-height: 200px;
    max-height: calc(100vh - 400px);  // Limit height to ensure execution section is visible
    overflow: hidden;
  }
  
  .reasoning-panel, .code-panel {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
    min-height: 0;  // Important for flex children to enable scrolling
    max-height: 100%;  // Take full height of parent
    
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--color-bg-tertiary);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;  // Prevent header from shrinking
      
      h4 {
        margin: 0;
        font-size: 0.95rem;
        color: var(--color-text);
      }
    }
  }
  
  .reasoning-panel {
    .log-entries {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;  // Critical for scrolling to work
      max-height: calc(100vh - 500px);  // Fixed max height for internal scrolling
      scroll-behavior: smooth;
      
      .log-empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--color-text-muted);
        font-size: 0.9rem;
      }
      
      .log-entry {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 12px;
        font-size: 0.8rem;
        font-family: 'Fira Code', 'Monaco', monospace;
        background: var(--color-bg-tertiary);
        border-radius: 6px;
        color: var(--color-text-muted);
        
        &.start, &.complete {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.15) 100%);
          color: #10b981;
        }
        
        &.log {
          background: var(--color-bg-tertiary);
        }
        
        &.error {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }
        
        &.sql, &.code {
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
        }
        
        &.test {
          background: rgba(139, 92, 246, 0.15);
          color: #8b5cf6;
        }
        
        &.loading {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
        }
        
        .log-time {
          flex-shrink: 0;
          font-size: 0.7rem;
          opacity: 0.6;
          min-width: 60px;
        }
        
        .log-node {
          flex-shrink: 0;
          font-weight: 600;
          color: var(--color-primary);
        }
        
        .log-message {
          flex: 1;
          word-break: break-word;
        }
        
        .spinner-sm {
          width: 14px;
          height: 14px;
          border-width: 2px;
        }
      }
    }
    
    .status-badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      
      &.analyzing {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
      }
      
      &.generating {
        background: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
      }
      
      &.testing {
        background: rgba(139, 92, 246, 0.2);
        color: #8b5cf6;
      }
      
      &.completed {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
      }
      
      &.error {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
      }
    }
  }
  
  .code-panel {
    .script-info {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .script-icon {
        font-size: 1.1rem;
      }
      
      .script-filename {
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;
        color: var(--color-text);
      }
    }
    
    .script-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .saved-badge {
        font-size: 0.75rem;
        color: #10b981;
        padding: 4px 8px;
        background: rgba(16, 185, 129, 0.15);
        border-radius: 4px;
      }
      
      .btn-sm {
        padding: 4px 10px;
        font-size: 0.8rem;
      }
      
      .btn-save {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        border: none;
        color: white;
        
        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
        }
        
        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
    
    .code-content {
      flex: 1;
      overflow: auto;
      min-height: 0;  // Critical for scrolling to work
      max-height: calc(100vh - 500px);  // Fixed max height for internal scrolling
      
      .code-empty {
        text-align: center;
        padding: 60px 20px;
        color: var(--color-text-muted);
        
        .empty-icon {
          font-size: 36px;
          margin-bottom: 12px;
        }
        
        p {
          margin: 0 0 6px 0;
          font-size: 0.9rem;
        }
        
        .hint {
          font-size: 0.8rem;
          opacity: 0.7;
        }
      }
      
      .script-code {
        margin: 0;
        padding: 16px;
        font-family: 'Fira Code', 'Monaco', monospace;
        font-size: 0.8rem;
        line-height: 1.6;
        background: var(--color-bg-code);
        color: var(--color-text);
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
  }
  
  .reasoning-log {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 12px;
    padding: 16px;
    max-height: 200px;
    overflow-y: auto;
    
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      
      h4 {
        margin: 0;
        font-size: 0.95rem;
        color: var(--color-text);
      }
      
      .status-badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        
        &.analyzing {
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
        }
        
        &.generating {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }
        
        &.testing {
          background: rgba(139, 92, 246, 0.2);
          color: #8b5cf6;
        }
        
        &.completed {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
        }
        
        &.error {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
      }
    }
    
    .log-entries {
      display: flex;
      flex-direction: column;
      gap: 6px;
      
      .log-entry {
        font-size: 0.8rem;
        font-family: 'Fira Code', monospace;
        color: var(--color-text-muted);
        padding: 4px 8px;
        background: var(--color-bg-secondary);
        border-radius: 4px;
        
        &:last-child {
          color: var(--color-text);
          font-weight: 500;
        }
      }
    }
  }
  
  .script-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: var(--color-text-muted);
    
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
  }
  
  .script-empty {
    text-align: center;
    padding: 60px 40px;
    color: var(--color-text-muted);
    
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    
    h4 {
      color: var(--color-text-primary);
      margin-bottom: 12px;
      font-size: 18px;
    }
    
    p {
      margin-bottom: 8px;
    }
    
    .hint {
      font-size: 13px;
      color: var(--color-text-tertiary);
      margin-bottom: 20px;
    }
    
    .btn-lg {
      margin-top: 16px;
      padding: 12px 24px;
      font-size: 15px;
    }
  }
}

.script-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.script-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  
  .script-info {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .script-icon {
      font-size: 1.25rem;
    }
    
    .script-filename {
      font-family: 'Fira Code', 'Monaco', monospace;
      font-weight: 600;
      color: var(--color-primary);
    }
  }
  
  .script-actions {
    display: flex;
    gap: 8px;
    
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.8rem;
    }
    
    .btn-refresh {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      
      &:hover {
        background: var(--color-bg-tertiary);
      }
    }
    
    .btn-download {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      border: none;
      color: white;
      
      &:hover {
        background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      }
    }
  }
}

.script-code-container {
  flex: 1;
  background: #1e1e2e;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: auto;
  max-height: 40vh;
  
  .script-code {
    margin: 0;
    padding: 16px;
    font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
    font-size: 0.8rem;
    line-height: 1.5;
    color: #cdd6f4;
    white-space: pre;
    tab-size: 4;
    
    code {
      display: block;
    }
  }
}

.script-execution {
  flex-shrink: 0;  // Prevent shrinking - always visible at bottom
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  margin-top: auto;  // Push to bottom if space available
  
  .execution-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    
    h4 {
      margin: 0;
      font-size: 1rem;
    }
    
    .execution-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      
      .unsaved-warning {
        font-size: 0.8rem;
        color: #f59e0b;
        padding: 4px 10px;
        background: rgba(245, 158, 11, 0.15);
        border-radius: 4px;
      }
    }
    
    .btn-execute {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        transform: translateY(-1px);
      }
      
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }
  
  .execution-controls {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  
  .sync-mode-selector {
    display: flex;
    gap: 12px;
    
    .sync-mode-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--color-bg-tertiary);
      border: 2px solid var(--color-border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      
      input[type="radio"] {
        display: none;
      }
      
      .mode-icon {
        font-size: 1.1rem;
      }
      
      .mode-label {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text);
      }
      
      .mode-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        display: none;
      }
      
      &.active {
        border-color: var(--color-primary);
        background: rgba(59, 130, 246, 0.1);
        
        .mode-label {
          color: var(--color-primary);
        }
      }
      
      &:hover:not(.active) {
        border-color: var(--color-text-muted);
        background: var(--color-bg-secondary);
      }
    }
    
    @media (min-width: 900px) {
      .sync-mode-option {
        flex-direction: column;
        align-items: flex-start;
        padding: 10px 16px;
        
        .mode-desc {
          display: block;
        }
      }
    }
  }
}

.sync-confirm-dialog {
  margin-top: 16px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%);
  border: 2px solid rgba(239, 68, 68, 0.4);
  border-radius: 12px;
  
  .confirm-content {
    text-align: center;
    
    .confirm-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }
    
    h4 {
      margin: 0 0 12px 0;
      color: #ef4444;
      font-size: 1.1rem;
    }
    
    p {
      margin: 0 0 16px 0;
      color: var(--color-text);
      font-size: 0.9rem;
      line-height: 1.5;
      
      .text-danger {
        color: #ef4444;
      }
    }
    
    .confirm-tables {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-bottom: 20px;
      
      .table-label {
        font-size: 0.8rem;
        color: var(--color-text-muted);
        width: 100%;
        margin-bottom: 4px;
      }
      
      .table-name {
        font-size: 0.75rem;
        padding: 4px 8px;
        background: rgba(239, 68, 68, 0.2);
        border-radius: 4px;
        color: #ef4444;
        font-family: 'Fira Code', monospace;
      }
    }
    
    .confirm-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      
      .btn-secondary {
        padding: 10px 20px;
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        color: var(--color-text);
        cursor: pointer;
        
        &:hover {
          background: var(--color-bg-secondary);
        }
      }
      
      .btn-danger {
        padding: 10px 20px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        border: none;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        
        &:hover {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        }
      }
    }
  }
}

.execution-result {
  border-radius: 8px;
  padding: 16px;
  
  &.success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  
  &.error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  
  .result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    
    .result-icon {
      font-size: 1.25rem;
    }
    
    .result-title {
      font-weight: 600;
      font-size: 1rem;
    }
  }
  
  .result-stats {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    
    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
      
      .stat-label {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      
      .stat-value {
        font-weight: 600;
        font-family: 'Fira Code', monospace;
      }
    }
  }
  
  .result-error {
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 6px;
    color: #ef4444;
    font-family: monospace;
    font-size: 0.85rem;
  }
  
  .result-steps {
    margin-top: 12px;
    
    h5 {
      margin: 0 0 8px 0;
      font-size: 0.9rem;
      color: var(--color-text-muted);
    }
    
    .step-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 0.85rem;
      border-bottom: 1px solid var(--color-border);
      
      &:last-child {
        border-bottom: none;
      }
      
      .step-icon {
        width: 20px;
        text-align: center;
      }
      
      &.success .step-icon {
        color: #10b981;
      }
      
      &.error .step-icon {
        color: #ef4444;
      }
      
      &.skipped .step-icon {
        color: var(--color-text-muted);
      }
      
      .step-name {
        font-weight: 500;
        min-width: 180px;
      }
      
      .step-message {
        color: var(--color-text-muted);
        flex: 1;
      }
    }
  }
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-section {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  
  h4 {
    margin: 0 0 12px;
    font-size: 0.875rem;
    color: var(--color-text);
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  
  h4 {
    margin: 0;
  }
}

.form-group {
  margin-bottom: 12px;
  
  label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
}

.form-select {
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.btn-add {
  background: var(--color-accent);
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  
  &:hover {
    opacity: 0.9;
  }
}

.dimension-item, .measure-item {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.dim-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  
  .form-input {
    flex: 1;
  }
}

.dim-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.levels-section {
  padding-top: 8px;
  border-top: 1px dashed var(--color-border);
  
  .levels-label {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
}

.level-item {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 6px 0;
  
  .level-input {
    width: 120px;
    padding: 4px 8px;
    font-size: 0.75rem;
  }
}

.btn-add-level {
  background: transparent;
  color: var(--color-accent);
  border: 1px dashed var(--color-accent);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.7rem;
  
  &:hover {
    background: rgba(34, 139, 230, 0.1);
  }
}

.btn-remove {
  background: transparent;
  border: none;
  color: #fa5252;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  
  &:hover {
    background: rgba(250, 82, 82, 0.1);
    border-radius: 4px;
  }
}

.btn-remove-level {
  background: transparent;
  border: none;
  color: #fa5252;
  font-size: 1rem;
  cursor: pointer;
  padding: 0 4px;
  
  &:hover {
    background: rgba(250, 82, 82, 0.1);
    border-radius: 4px;
  }
}

.measure-item {
  display: flex;
  gap: 8px;
  align-items: center;
  
  .form-input {
    flex: 1;
  }
  
  .form-select {
    width: 100px;
  }
}

.empty-hint {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-align: center;
  padding: 16px;
  font-style: italic;
}

.editor-preview {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  
  h4 {
    margin: 0 0 12px;
    font-size: 0.875rem;
  }
  
  .xml-preview {
    flex: 1;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    overflow: auto;
    white-space: pre-wrap;
    color: var(--color-text-light);
    max-height: 400px;
  }
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  
  .footer-left {
    display: flex;
    gap: 10px;
  }
  
  .footer-right {
    display: flex;
    gap: 10px;
  }
}

.btn-dag-redeploy {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

.btn-direct-etl {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

.btn-script {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

// ============== Execute Dropdown & Live Log Styles ==============

.execute-dropdown {
  position: relative;
  display: inline-block;
}

.btn-execute-main {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.execute-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  z-index: 100;
  min-width: 180px;
  overflow: hidden;
  
  .menu-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--color-text);
    transition: background 0.15s;
    
    &:hover {
      background: var(--color-bg-tertiary);
    }
    
    &:first-child {
      border-bottom: 1px solid var(--color-border);
    }
    
    .menu-desc {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }
  }
}

.execution-live-log {
  margin-top: 12px;
  background: #0d1117;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  
  .log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid var(--color-border);
  }
  
  .log-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    font-weight: 500;
    
    &.running {
      color: #3b82f6;
    }
    
    &.completed {
      color: #10b981;
    }
  }
  
  .pulse-dot {
    width: 8px;
    height: 8px;
    background: #3b82f6;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  .retry-badge {
    background: #f59e0b;
    color: #000;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }
  
  .btn-clear-log {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    
    &:hover {
      color: var(--color-text);
    }
  }
  
  .log-content {
    max-height: 200px;
    overflow-y: auto;
    padding: 8px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.75rem;
    line-height: 1.5;
  }
  
  .log-entry {
    display: flex;
    gap: 8px;
    padding: 2px 4px;
    border-radius: 3px;
    
    &.error {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    
    &.warning {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
    }
    
    &.success {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
    }
    
    &.info, &.start {
      color: #94a3b8;
    }
    
    &.reasoning {
      color: #a78bfa;
      font-style: italic;
    }
  }
  
  .log-time {
    color: #64748b;
    flex-shrink: 0;
  }
  
  .log-message {
    word-break: break-word;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
}

.btn-cancel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }
}

.execution-progress {
  margin-top: 16px;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  
  .progress-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  
  .progress-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .progress-title {
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
  }
  
  .progress-attempt {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    padding: 4px 8px;
    background: var(--color-bg-secondary);
    border-radius: 12px;
  }
  
  .progress-bar-container {
    margin-bottom: 10px;
  }
  
  .progress-bar {
    height: 6px;
    background: var(--color-bg-secondary);
    border-radius: 3px;
    overflow: hidden;
    
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6);
      background-size: 200% 100%;
      animation: progressSlide 1.5s linear infinite;
    }
    
    &.regenerating .progress-bar-fill {
      background: linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b);
      background-size: 200% 100%;
    }
  }
  
  .progress-message {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    line-height: 1.4;
    max-height: 60px;
    overflow-y: auto;
  }
}

@keyframes progressSlide {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>

