<script setup lang="ts">
/**
 * CubeDesigner.vue
 * OLAP 큐브 설계 - AI 기반 스타 스키마 생성 및 ETL 전략
 */
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { useOlapStore } from '../state/olap.ts'
import { useFeatureNavigation } from '@/shared/navigation/featureNavigation'
import { openExternalHttpUrl, resolveExternalHttpUrl } from '@/shared/browser/externalHttpUrl'
import {
  deployCubeDesign,
  loadCubeDesignCatalog,
  requestCubeDesignSuggestion,
} from '../application/cubeDesignOperations.ts'
import { generateMondrianSchemaXml } from '../application/cubeEditorModel.ts'
import { buildEtlConfig } from '../application/etlConfigBuilder.ts'
import {
  CubeProvisionError,
  executeCubeProvision,
  type CubeProvisionCheckpoint,
  type ProvisionStep,
  type ProvisionStepStatus,
} from '../application/provisionCube.ts'
import {
  describeOlapError,
  type AirflowRunResult,
  type OlapAiSuggestion,
  type OlapCatalogResponse,
  type OlapDesignerDimension,
  type OlapDesignerLevel,
  type OlapDesignerMeasure
} from '../model/contracts.ts'
import mermaid from 'mermaid'

const store = useOlapStore()
const featureNavigation = useFeatureNavigation()

// State
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)
const catalog = ref<OlapCatalogResponse>({ tables: [], schemas: [], relationships: [] })
const catalogLoading = ref(false)
const catalogError = ref<string | null>(null)
const etlDescription = ref('')
const aiSuggestion = ref<OlapAiSuggestion | null>(null)
const dwSchema = ref('dw')

// Tab State
const activeTab = ref<'ai' | 'visual'>('ai')

// Visual Modeler State
const cubeName = ref('')
const factTable = ref('')
const dimensions = ref<OlapDesignerDimension[]>([])
const measures = ref<OlapDesignerMeasure[]>([])
const previewMode = ref<'diagram' | 'xml'>('diagram')

// =====================================================================
// Visual Modeler Functions
// =====================================================================

// Add new dimension
function addDimension() {
  dimensions.value.push({
    id: Date.now(),
    name: '',
    table: '',
    foreignKey: '',
    levels: [{ id: Date.now(), name: '', column: '' }]
  })
}

// Remove dimension
function removeDimension(index: number) {
  dimensions.value.splice(index, 1)
}

// Add level to dimension
function addLevel(dimIndex: number) {
  dimensions.value[dimIndex].levels.push({
    id: Date.now(),
    name: '',
    column: ''
  })
}

// Remove level from dimension
function removeLevel(dimIndex: number, levelIndex: number) {
  dimensions.value[dimIndex].levels.splice(levelIndex, 1)
}

// Add new measure
function addMeasure() {
  measures.value.push({
    id: Date.now(),
    name: '',
    column: '',
    aggregator: 'sum'
  })
}

// Remove measure
function removeMeasure(index: number) {
  measures.value.splice(index, 1)
}

// Load sample template
function loadSampleTemplate() {
  cubeName.value = 'SalesCube'
  factTable.value = 'dw.fact_sales'
  dimensions.value = [
    {
      id: 1,
      name: 'Time',
      table: 'dw.dim_time',
      foreignKey: 'time_id',
      levels: [
        { id: 1, name: 'Year', column: 'year' },
        { id: 2, name: 'Quarter', column: 'quarter' },
        { id: 3, name: 'Month', column: 'month' }
      ]
    },
    {
      id: 2,
      name: 'Product',
      table: 'dw.dim_product',
      foreignKey: 'product_id',
      levels: [
        { id: 1, name: 'Category', column: 'category' },
        { id: 2, name: 'ProductName', column: 'product_name' }
      ]
    }
  ]
  measures.value = [
    { id: 1, name: 'SalesAmount', column: 'sales_amount', aggregator: 'sum' },
    { id: 2, name: 'Quantity', column: 'quantity', aggregator: 'sum' }
  ]
}

// Clear form
function clearForm() {
  cubeName.value = ''
  factTable.value = ''
  dimensions.value = []
  measures.value = []
  aiSuggestion.value = null
  provisionCheckpoint.value = null
  resetProvisionProgress()
}

function resetProvisionProgress() {
  for (const step of Object.keys(provisionSteps.value) as ProvisionStep[]) {
    provisionSteps.value[step] = { status: 'pending', message: null }
  }
}

// Diagram refs
const starSchemaDiagram = ref<HTMLDivElement | null>(null)
const lineageDiagram = ref<HTMLDivElement | null>(null)

// Airflow State
const airflowDag = ref<AirflowRunResult | null>(null)
const airflowLoading = ref(false)
const airflowError = ref<string | null>(null)
const diagramError = ref<string | null>(null)
const redeployDialogOpen = ref(false)
const redeployError = ref<string | null>(null)
const provisionCheckpoint = ref<CubeProvisionCheckpoint | null>(null)
const provisionSteps = ref<Record<ProvisionStep, {
  status: ProvisionStepStatus | 'pending'
  message: string | null
}>>({
  'dw-schema': { status: 'pending', message: null },
  'dw-tables': { status: 'pending', message: null },
  'cube-schema': { status: 'pending', message: null },
  'etl-config': { status: 'pending', message: null },
  'airflow-deploy': { status: 'pending', message: null },
  'initial-run': { status: 'pending', message: null },
})
const provisionStepLabels: Record<ProvisionStep, string> = {
  'dw-schema': 'DW schema',
  'dw-tables': 'DW 테이블',
  'cube-schema': '큐브 schema',
  'etl-config': 'ETL 설정',
  'airflow-deploy': 'Airflow DAG',
  'initial-run': '최초 ETL',
}
const provisionStepOrder: ProvisionStep[] = [
  'dw-schema',
  'dw-tables',
  'cube-schema',
  'etl-config',
  'airflow-deploy',
  'initial-run',
]
const hasProvisionProgress = computed(() =>
  provisionStepOrder.some(step => provisionSteps.value[step].status !== 'pending'),
)

// Text2SQL에서 전달받은 SQL 정보
const transferredFromText2Sql = ref(false)
const transferredSQL = ref('')

// Initialize Mermaid
onMounted(async () => {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#0d1929',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#228be6',
      lineColor: '#228be6',
      secondaryColor: '#1a2744',
      tertiaryColor: '#0f1d32'
    }
  })
  
  await fetchCatalog()
  
  // Text2SQL에서 전달받은 데이터 확인
  const transferData = featureNavigation.consume<{
    question: string
    sql: string
    fromHistory?: boolean
  }>('olap')
  if (transferData && transferData.fromHistory) {
    transferredFromText2Sql.value = true
    transferredSQL.value = transferData.sql || ''
    
    // SQL이 있는 경우와 없는 경우 분기
    if (transferData.sql && transferData.sql.trim()) {
      // ETL 설명에 질문과 SQL 정보 자동 입력
      etlDescription.value = `다음 SQL 쿼리를 분석하여 DW 스타 스키마를 설계해주세요:

질문: ${transferData.question}

SQL:
${transferData.sql}

위 쿼리에서 팩트 테이블과 디멘션 테이블을 추출하고, 적절한 측정값(Measures)과 디멘션 계층(Hierarchies)을 구성해주세요.`
      
      success.value = 'Text2SQL 히스토리에서 쿼리를 불러왔습니다. "AI 스타 스키마 생성"을 클릭하세요.'
    } else {
      // SQL이 없는 경우
      etlDescription.value = `질문: ${transferData.question}

(SQL 쿼리가 전달되지 않았습니다. 위 질문을 바탕으로 DW 스타 스키마를 설계해주세요.)`
      
      error.value = 'SQL 쿼리가 전달되지 않았습니다. 히스토리에서 SQL이 있는 항목을 선택해주세요.'
    }
  }
})

// Watch for Visual Modeler changes to re-render diagram
watch(
  [cubeName, factTable, dimensions, measures, activeTab, previewMode],
  async () => {
    if (activeTab.value === 'visual' && previewMode.value === 'diagram') {
      await nextTick()
      await renderVisualModelerDiagram()
    }
  },
  { deep: true }
)

// Render Visual Modeler diagram
async function renderVisualModelerDiagram() {
  if (!starSchemaDiagram.value) return
  if (!cubeName.value && dimensions.value.length === 0) return
  
  try {
    diagramError.value = null
    const diagram = generateVisualModelerMermaid()
    if (!diagram) return
    
    starSchemaDiagram.value.innerHTML = ''
    const { svg } = await mermaid.render(`vm-diagram-${Date.now()}`, diagram)
    starSchemaDiagram.value.innerHTML = svg
  } catch (cause: unknown) {
    diagramError.value = `다이어그램을 그리지 못했습니다. ${describeOlapError(cause)}`
  }
}

// Generate Mermaid diagram for Visual Modeler
function generateVisualModelerMermaid(): string {
  if (!cubeName.value || !factTable.value) return ''
  
  const sanitize = (name: string) => (name || 'unknown').replace(/[^a-zA-Z0-9_]/g, '_')
  const safeFact = sanitize(factTable.value)
  
  let diagram = `erDiagram\n`
  
  // Fact table
  diagram += `    ${safeFact} {\n`
  diagram += `        int id PK\n`
  dimensions.value.forEach(dim => {
    if (dim.foreignKey) {
      diagram += `        int ${sanitize(dim.foreignKey)} FK\n`
    }
  })
  measures.value.forEach(m => {
    if (m.column) {
      diagram += `        decimal ${sanitize(m.column)}\n`
    }
  })
  diagram += `    }\n\n`
  
  // Dimension tables
  dimensions.value.forEach(dim => {
    if (!dim.name) return
    const safeDim = sanitize(dim.table || dim.name)
    diagram += `    ${safeDim} {\n`
    diagram += `        int id PK\n`
    dim.levels.forEach(level => {
      if (level.column) {
        diagram += `        varchar ${sanitize(level.column)}\n`
      }
    })
    diagram += `    }\n`
    diagram += `    ${safeDim} ||--o{ ${safeFact} : has\n`
  })
  
  return diagram
}

// Fetch catalog from Neo4j
async function fetchCatalog() {
  catalogLoading.value = true
  catalogError.value = null
  try {
    const data = await loadCubeDesignCatalog()
    catalog.value = data
  } catch (cause: unknown) {
    const message = describeOlapError(cause)
    catalogError.value = `OLAP 원본 카탈로그를 불러오지 못했습니다. ${message}`
  } finally {
    catalogLoading.value = false
  }
}

// Get AI suggestion
async function getAISuggestion() {
  if (!etlDescription.value.trim()) {
    error.value = '큐브 설명을 입력해주세요'
    return
  }
  
  loading.value = true
  error.value = null
  aiSuggestion.value = null
  
  try {
    aiSuggestion.value = await requestCubeDesignSuggestion(etlDescription.value)
    const data = { suggestion: aiSuggestion.value }
    if (!data.suggestion) throw new Error('OLAP 서비스가 추천 결과를 반환하지 않았습니다.')
    await populateFromAISuggestion(aiSuggestion.value)
    success.value = 'AI 추천이 완료되었습니다.'
    
    await nextTick()
    await renderDiagrams()
  } catch (cause: unknown) {
    error.value = describeOlapError(cause)
  } finally {
    loading.value = false
  }
}

// Populate from AI suggestion
async function populateFromAISuggestion(suggestion: OlapAiSuggestion) {
  // Use suggested cube name - LLM now returns English names
  if (suggestion.cube_name) {
    // cube_name should already be in English from LLM
    cubeName.value = suggestion.cube_name.replace(/[^a-zA-Z0-9_]/g, '')
  } else if (!cubeName.value) {
    cubeName.value = 'analytics_cube'
  }
  
  // Use fact_table_name from LLM if provided, otherwise generate from cube name
  if (suggestion.fact_table_name) {
    factTable.value = `${dwSchema.value}.${suggestion.fact_table_name}`
  } else {
    const sanitizedCubeName = cubeName.value.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    factTable.value = `${dwSchema.value}.fact_${sanitizedCubeName || 'data'}`
  }
  
  dimensions.value = []
  
  // New format: dimensions array with detailed ETL strategy
  if (suggestion.dimensions && Array.isArray(suggestion.dimensions)) {
    for (const dim of suggestion.dimensions) {
      const tableInfo = dim.source_table ? 
        catalog.value.tables.find(t => t.name === dim.source_table) : null
      
      // Build levels from columns or column_mappings
      let levels: OlapDesignerLevel[] = []
      if (dim.columns && Array.isArray(dim.columns)) {
        levels = dim.columns.filter(col => col.name !== 'id').map((col, index) => ({
          id: Date.now() + index,
          name: col.name,
          column: col.name
        }))
      } else if (dim.target_columns && Array.isArray(dim.target_columns)) {
        levels = dim.target_columns.filter(col => col !== 'id').map((col, index) => ({
          id: Date.now() + index,
          name: col,
          column: col
        }))
      } else if (tableInfo?.columns) {
        levels = tableInfo.columns.slice(0, 3).map((col, index) => ({
          id: Date.now() + index,
          name: col.name,
          column: col.name
        }))
      }
      
      if (levels.length === 0) {
        levels = [{ id: Date.now(), name: 'name', column: 'name' }]
      }
      
      // Dimension name should already be English from LLM (e.g., dim_site, dim_time)
      const dimName = dim.name.replace(/[^a-zA-Z0-9_]/g, '') || 'dim_unknown'
      dimensions.value.push({
        id: Date.now() + Math.random(),
        name: dimName,
        nameKorean: dim.name_korean || dim.description_korean || '',
        table: `${dwSchema.value}.${dimName}`,
        foreignKey: `${dimName.toLowerCase()}_id`,
        levels: levels,
        // Store ETL strategy info for later use
        etlStrategy: dim.generation_strategy || 'etl',
        sourceTable: dim.source_table || null
      })
    }
  } 
  // Legacy format: dimension_sources object
  else {
    const dimSources = suggestion.dimension_sources || {}
    
    for (const [dimName, sources] of Object.entries(dimSources)) {
      if (Array.isArray(sources) && sources.length > 0) {
        const sourceTable = sources[0] as string
        const tableInfo = catalog.value.tables.find(t => t.name === sourceTable)
        
        // Ensure dimension name is in English
        const cleanDimName = dimName.replace(/[^a-zA-Z0-9_]/g, '') || 'dim_unknown'
        dimensions.value.push({
          id: Date.now() + Math.random(),
          name: cleanDimName,
          table: `${dwSchema.value}.${cleanDimName}`,
          foreignKey: `${cleanDimName.toLowerCase()}_id`,
          levels: tableInfo?.columns.slice(0, 2).map((col, index) => ({
            id: Date.now() + index,
            name: col.name,
            column: col.name
          })) || [{ id: Date.now(), name: 'id', column: 'id' }],
          etlStrategy: 'etl',
          sourceTable: sourceTable
        })
      }
    }
  }
  
  // Extract measures - prefer new format with measures array from LLM
  measures.value = []
  
  if (suggestion.measures && Array.isArray(suggestion.measures)) {
    // New format: LLM provides measures array with English names
    suggestion.measures.forEach((m, i) => {
      measures.value.push({
        id: Date.now() + i,
        name: m.name || `measure_${i}`,
        nameKorean: m.name_korean || m.description || '',
        column: m.column || m.name || `measure_${i}`,
        aggregator: (m.aggregator || 'sum').toLowerCase()
      })
    })
  } else {
    // Fallback: Extract from fact_mappings or suggested_mappings
    const mappings = suggestion.fact_mappings || suggestion.suggested_mappings || []
    const measureMappings = mappings.filter(m =>
      m.transformation && (m.transformation.includes('SUM') || m.transformation.includes('AVG') || 
       m.transformation.includes('COUNT') || m.transformation.includes('MAX') || m.transformation.includes('MIN'))
    )
    
    if (measureMappings.length > 0) {
      measureMappings.forEach((m, i) => {
        const colName = m.target?.split('.')?.pop() || m.source?.split('.')?.pop() || `measure_${i}`
        // Convert to English column name
        const cleanColName = colName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_')
        const transformation = m.transformation ?? ''
        let aggregator = 'sum'
        if (transformation.includes('AVG')) aggregator = 'avg'
        else if (transformation.includes('COUNT')) aggregator = 'count'
        else if (transformation.includes('MAX')) aggregator = 'max'
        else if (transformation.includes('MIN')) aggregator = 'min'
        
        measures.value.push({
          id: Date.now() + i,
          name: cleanColName,
          nameKorean: m.description || '',
          column: cleanColName,
          aggregator: aggregator
        })
      })
    } else {
      // Default measures
      measures.value = [
        { id: Date.now(), name: 'record_count', nameKorean: '레코드 수', column: 'id', aggregator: 'count' },
        { id: Date.now() + 1, name: 'total_amount', nameKorean: '총 금액', column: 'amount', aggregator: 'sum' }
      ]
    }
  }
}

// Sanitize name for Mermaid
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '').replace(/_+$/, '') || 'entity'
}

// Generate star schema diagram
const starSchemaMermaid = computed(() => {
  if (!cubeName.value || !factTable.value) return ''
  
  const safeFact = sanitizeName(factTable.value)
  let diagram = `erDiagram\n`
  
  // Fact table
  diagram += `    ${safeFact} {\n`
  diagram += `        int id PK\n`
  dimensions.value.forEach(dim => {
    diagram += `        int ${sanitizeName(dim.foreignKey)} FK\n`
  })
  measures.value.forEach(m => {
    diagram += `        decimal ${sanitizeName(m.column)}\n`
  })
  diagram += `    }\n\n`
  
  // Dimension tables
  dimensions.value.forEach(dim => {
    const safeDim = sanitizeName(dim.table)
    diagram += `    ${safeDim} {\n`
    diagram += `        int id PK\n`
    dim.levels.forEach(level => {
      diagram += `        varchar ${sanitizeName(level.column)}\n`
    })
    diagram += `    }\n`
    diagram += `    ${safeDim} ||--o{ ${safeFact} : has\n`
  })
  
  return diagram
})

// Generate lineage diagram
const lineageMermaid = computed(() => {
  if (!aiSuggestion.value) return ''
  
  const sources = aiSuggestion.value.fact_sources || []
  let diagram = `flowchart LR\n`
  
  diagram += `    subgraph OLTP["🗄️ OLTP"]\n`
  sources.forEach((s: string) => {
    diagram += `        ${sanitizeName(s)}["📊 ${s}"]\n`
  })
  diagram += `    end\n\n`
  
  diagram += `    ETL{{"⚙️ ETL"}}\n\n`
  
  diagram += `    subgraph OLAP["⭐ OLAP"]\n`
  diagram += `        ${sanitizeName(factTable.value)}[["🎯 ${factTable.value}"]]\n`
  dimensions.value.forEach(dim => {
    diagram += `        ${sanitizeName(dim.table)}["📐 ${dim.name}"]\n`
  })
  diagram += `    end\n\n`
  
  sources.forEach((s: string) => {
    diagram += `    ${sanitizeName(s)} --> ETL\n`
  })
  diagram += `    ETL --> ${sanitizeName(factTable.value)}\n`
  dimensions.value.forEach(dim => {
    diagram += `    ETL --> ${sanitizeName(dim.table)}\n`
  })
  
  return diagram
})

// Render diagrams
async function renderDiagrams() {
  diagramError.value = null
  if (starSchemaDiagram.value && starSchemaMermaid.value) {
    try {
      const { svg } = await mermaid.render(`star_${Date.now()}`, starSchemaMermaid.value)
      starSchemaDiagram.value.innerHTML = svg
    } catch (cause: unknown) {
      diagramError.value = `스타 스키마 다이어그램을 그리지 못했습니다. ${describeOlapError(cause)}`
    }
  }
  
  if (lineageDiagram.value && lineageMermaid.value) {
    try {
      const { svg } = await mermaid.render(`lineage_${Date.now()}`, lineageMermaid.value)
      lineageDiagram.value.innerHTML = svg
    } catch (cause: unknown) {
      diagramError.value = `리니지 다이어그램을 그리지 못했습니다. ${describeOlapError(cause)}`
    }
  }
}

// Build ETL config from current state
function buildETLConfig() {
  return buildEtlConfig({
    cubeName: cubeName.value,
    factTable: factTable.value,
    dwSchema: dwSchema.value,
    dimensions: dimensions.value,
    suggestion: aiSuggestion.value,
  })
}

// Deploy to Airflow
async function deployToAirflow() {
  if (!cubeName.value) {
    airflowError.value = '큐브 이름이 없습니다'
    return
  }
  
  airflowLoading.value = true
  airflowError.value = null
  
  try {
    const etlConfig = buildETLConfig()
    airflowDag.value = await deployCubeDesign(cubeName.value, etlConfig)
  } catch (cause: unknown) {
    airflowError.value = describeOlapError(cause)
  } finally {
    airflowLoading.value = false
  }
}

function requestRedeployToAirflow() {
  if (!cubeName.value) {
    airflowError.value = '큐브 이름이 없습니다'
    return
  }
  redeployError.value = null
  redeployDialogOpen.value = true
}

function cancelRedeploy() {
  if (airflowLoading.value) return
  redeployDialogOpen.value = false
  redeployError.value = null
}

async function confirmRedeployToAirflow() {
  if (!cubeName.value || airflowLoading.value) return
  airflowLoading.value = true
  redeployError.value = null
  
  try {
    const etlConfig = buildETLConfig()
    airflowDag.value = await deployCubeDesign(cubeName.value, etlConfig, true)
    success.value = 'DAG가 성공적으로 재생성되었습니다.'
    redeployDialogOpen.value = false
  } catch (cause: unknown) {
    redeployError.value = `DAG 재생성 실패: ${describeOlapError(cause)}`
  } finally {
    airflowLoading.value = false
  }
}

// Open Airflow UI
const airflowUiUrl = computed(() =>
  resolveExternalHttpUrl(airflowDag.value?.airflow_url, window.location.href)
)

function openAirflowUI() {
  if (!openExternalHttpUrl(airflowUiUrl.value)) {
    airflowError.value = '백엔드가 유효한 Airflow UI 주소를 제공하지 않았습니다.'
  }
}

// Upload cube and deploy to Airflow with full provisioning
async function uploadCubeAndDeploy() {
  if (!cubeName.value || !factTable.value) {
    error.value = '큐브 이름과 팩트 테이블을 설정해주세요'
    return
  }
  
  loading.value = true
  error.value = null
  airflowError.value = null
  success.value = null
  
  try {
    const xml = generateMondrianXML()
    const etlConfig = buildETLConfig()
    const identity = JSON.stringify({
      cubeName: cubeName.value,
      factTable: factTable.value,
      dimensions: dimensions.value,
      measures: measures.value,
      dwSchema: dwSchema.value,
      xml,
      etlConfig,
    })
    if (provisionCheckpoint.value?.identity !== identity) resetProvisionProgress()

    const result = await executeCubeProvision({
      identity,
      cubeName: cubeName.value,
      aiSuggestion: aiSuggestion.value,
      dimensions: dimensions.value,
      measures: measures.value,
      factTable: factTable.value,
      dwSchema: dwSchema.value,
      schemaXml: xml,
      etlConfig,
    }, provisionCheckpoint.value, undefined, (step, status, message) => {
      provisionSteps.value[step] = { status, message: message ?? null }
    })
    provisionCheckpoint.value = result.checkpoint
    airflowDag.value = result.airflowResult

    const warnings: string[] = []
    if (result.warning) warnings.push(result.warning)
    try {
      await store.loadCubes()
    } catch (cause: unknown) {
      warnings.push(`큐브 목록 새로고침에 실패했습니다. ${describeOlapError(cause)}`)
    }

    airflowError.value = warnings.length ? warnings.join(' ') : null
    success.value = `✅ 큐브 "${cubeName.value}" ${result.warning ? '배포 완료' : '프로비저닝 완료'}!\n` +
      `• DW 테이블 생성됨\n` +
      `• ETL 파이프라인 배포됨\n` +
      `• Airflow DAG: ${result.airflowResult.dag_id || 'N/A'}`
  } catch (cause: unknown) {
    if (cause instanceof CubeProvisionError) {
      provisionCheckpoint.value = cause.checkpoint
    }
    error.value = `프로비저닝 실패: ${describeOlapError(cause)}`
  } finally {
    loading.value = false
  }
}

// Generate Mondrian XML
function generateMondrianXML(): string {
  return generateMondrianSchemaXml({
    cubeName: cubeName.value,
    factTable: factTable.value,
    schema: dwSchema.value,
    includeIncompleteEntries: true,
    dimensions: dimensions.value,
    measures: measures.value,
  })
}
</script>

<template>
  <div class="cube-designer">
    <!-- Left Panel: Catalog -->
    <aside class="catalog-panel">
      <h3>📚 데이터 카탈로그</h3>
      <div class="catalog-list">
        <div v-if="catalogLoading" class="catalog-status" role="status">
          카탈로그를 불러오는 중...
        </div>
        <div v-else-if="catalogError" class="catalog-status error" role="alert">
          <span>{{ catalogError }}</span>
          <button type="button" class="btn btn-sm" @click="fetchCatalog">다시 시도</button>
        </div>
        <div 
          v-else
          v-for="table in catalog.tables" 
          :key="table.name" 
          class="catalog-item"
        >
          <span class="table-icon">📊</span>
          <div class="table-info">
            <span class="table-name">{{ table.name }}</span>
            <span class="table-desc" v-if="table.description" :title="table.description">
              {{ table.description }}
            </span>
          </div>
        </div>
        <div v-if="!catalogLoading && !catalogError && !catalog.tables.length" class="empty-catalog">
          카탈로그가 비어있습니다
        </div>
      </div>
    </aside>
    
    <!-- Main Content -->
    <main class="design-content">
      <!-- Tab Navigation -->
      <div class="modeler-tabs">
        <button 
          :class="['tab-btn', { active: activeTab === 'ai' }]"
          @click="activeTab = 'ai'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            <circle cx="7.5" cy="14.5" r="1.5"/>
            <circle cx="16.5" cy="14.5" r="1.5"/>
          </svg>
          AI 설계
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'visual' }]"
          @click="activeTab = 'visual'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
          Visual Modeler
        </button>
      </div>

      <div class="designer-messages" aria-live="polite">
        <div v-if="error" class="message error" role="alert">{{ error }}</div>
        <div v-if="success" class="message success" role="status">{{ success }}</div>
        <div v-if="airflowError" class="message warning" role="alert">{{ airflowError }}</div>
        <div v-if="diagramError" class="message error" role="alert">{{ diagramError }}</div>
      </div>

      <ol v-if="hasProvisionProgress" class="provision-progress" aria-label="큐브 프로비저닝 진행 상태">
        <li
          v-for="step in provisionStepOrder"
          :key="step"
          :class="provisionSteps[step].status"
        >
          <span class="step-state" aria-hidden="true">
            {{ provisionSteps[step].status === 'completed'
              ? '✓'
              : provisionSteps[step].status === 'failed'
                ? '!'
                : provisionSteps[step].status === 'running'
                  ? '…'
                  : '○' }}
          </span>
          <span>{{ provisionStepLabels[step] }}</span>
          <span v-if="provisionSteps[step].message" class="step-message">
            {{ provisionSteps[step].message }}
          </span>
        </li>
      </ol>

      <!-- Text2SQL Transfer Banner -->
      <div v-if="transferredFromText2Sql && activeTab === 'ai'" class="transfer-banner">
        <div class="banner-icon">📊</div>
        <div class="banner-content">
          <strong>Text2SQL 히스토리에서 가져온 쿼리</strong>
          <p>복잡한 쿼리를 분석하여 DW 스타 스키마로 변환합니다.</p>
        </div>
        <button class="banner-close" @click="transferredFromText2Sql = false">×</button>
      </div>

      <!-- =====================================================================
           AI Designer Tab
           ===================================================================== -->
      <template v-if="activeTab === 'ai'">
      <!-- AI Input -->
      <section class="ai-section">
        <h3>🤖 AI 큐브 설계</h3>
        <div class="ai-input-row">
          <textarea 
            v-model="etlDescription"
            placeholder="분석하고 싶은 내용을 자연어로 설명하세요. 예: 주문 관련 매출 분석 큐브를 만들어주세요."
            rows="3"
          ></textarea>
          <button 
            class="btn btn-primary" 
            @click="getAISuggestion"
            :disabled="loading || !etlDescription.trim()"
          >
            <span v-if="loading" class="spinner"></span>
            <span v-else>⚡ AI 스타 스키마 생성</span>
          </button>
        </div>
        
      </section>
      
      <!-- Results -->
      <section v-if="aiSuggestion" class="results-section">
        <!-- Query Generalization Section -->
        <div v-if="aiSuggestion.generalization" class="generalization-section">
          <h4>🔍 쿼리 일반화 분석</h4>
          <div class="generalization-content">
            <div class="gen-row">
              <div class="gen-item">
                <span class="gen-label">원본 쿼리</span>
                <span class="gen-value original">{{ aiSuggestion.generalization.original_query }}</span>
              </div>
              <div class="gen-arrow">→</div>
              <div class="gen-item">
                <span class="gen-label">일반화된 분석</span>
                <span class="gen-value generalized">{{ aiSuggestion.generalization.generalized_query_korean || aiSuggestion.generalization.generalized_query }}</span>
              </div>
            </div>
            
            <!-- Pivot Capabilities -->
            <div v-if="aiSuggestion.generalization.pivot_capabilities || aiSuggestion.generalization.pivot_examples" class="pivot-capabilities">
              <span class="gen-label">📊 이 큐브로 가능한 분석:</span>
              <div class="pivot-chips">
                <span v-for="(cap, i) in (aiSuggestion.generalization.pivot_capabilities || aiSuggestion.generalization.pivot_examples)" :key="i" class="pivot-chip">
                  {{ cap }}
                </span>
              </div>
            </div>
            
            <!-- Identified Dimensions -->
            <div v-if="aiSuggestion.generalization.identified_dimensions" class="identified-dims">
              <span class="gen-label">📐 식별된 피벗 차원:</span>
              <div class="dim-chips">
                <div v-for="dim in aiSuggestion.generalization.identified_dimensions" :key="dim.name" class="dim-chip">
                  <strong>{{ dim.name }}</strong>
                  <span class="dim-hint">{{ dim.source_hint || dim.description }}</span>
                </div>
              </div>
            </div>
            
            <!-- Reasoning -->
            <div v-if="aiSuggestion.generalization.reasoning" class="gen-reasoning">
              <span class="gen-label">💡 일반화 근거:</span>
              <p>{{ aiSuggestion.generalization.reasoning }}</p>
            </div>
          </div>
        </div>

        <div class="diagrams-grid">
          <!-- Star Schema -->
          <div class="diagram-card">
            <h4>⭐ 스타 스키마</h4>
            <div ref="starSchemaDiagram" class="diagram-container"></div>
          </div>
          
          <!-- Airflow DAG -->
          <div class="diagram-card airflow-card">
            <h4>
              <span class="airflow-mark" aria-hidden="true">AF</span>
              Airflow ETL Pipeline
            </h4>
            
            <div class="airflow-content">
              <!-- Not Deployed Yet -->
              <div v-if="!airflowDag && !airflowLoading" class="airflow-empty">
                <div ref="lineageDiagram" class="diagram-container mini"></div>
                <button class="btn btn-airflow" @click="deployToAirflow" :disabled="!cubeName">
                  🚀 Airflow에 배포
                </button>
                <p class="hint">ETL 파이프라인을 Apache Airflow에 배포합니다</p>
              </div>
              
              <!-- Loading -->
              <div v-else-if="airflowLoading" class="airflow-loading">
                <div class="spinner"></div>
                <span>Airflow에 배포 중...</span>
              </div>
              
              <!-- Deployed -->
              <div v-else-if="airflowDag" class="airflow-deployed">
                <div class="dag-info">
                  <div class="dag-status success">
                    <span class="status-icon">✅</span>
                    <span>DAG 배포됨</span>
                  </div>
                  <div class="dag-details">
                    <div class="detail-row">
                      <span class="label">DAG ID:</span>
                      <code>{{ airflowDag.dag_id }}</code>
                    </div>
                    <div class="detail-row">
                      <span class="label">큐브:</span>
                      <span>{{ airflowDag.cube_name }}</span>
                    </div>
                  </div>
                </div>
                
                <div class="dag-actions">
                  <button
                    class="btn btn-airflow-open"
                    :disabled="!airflowUiUrl"
                    :title="airflowUiUrl ? 'Airflow UI를 새 창에서 엽니다' : '백엔드가 Airflow UI 주소를 제공하지 않았습니다'"
                    @click="openAirflowUI"
                  >
                    🔗 Airflow UI에서 보기
                  </button>
                  <button class="btn btn-dag-redeploy" @click="requestRedeployToAirflow" :disabled="airflowLoading">
                    🔄 DAG 재생성
                  </button>
                </div>
                
                <p class="airflow-hint">
                  Airflow에서 DAG를 트리거하고 실행 상태를 모니터링할 수 있습니다
                </p>
              </div>
              
              <!-- Error -->
              <div v-if="airflowError" class="airflow-error">
                <span>❌ {{ airflowError }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- ETL Strategy -->
        <div class="etl-strategy">
          <h4>📋 ETL 전략</h4>
          
          <!-- Basic Strategy Info -->
          <div class="strategy-grid">
            <div class="strategy-item">
              <span class="label">동기화 방식</span>
              <span class="value badge">{{ aiSuggestion.sync_strategy === 'incremental' ? '🔄 증분' : '🔃 전체' }}</span>
            </div>
            <div class="strategy-item" v-if="aiSuggestion.incremental_column">
              <span class="label">증분 기준</span>
              <span class="value mono">{{ aiSuggestion.incremental_column }}</span>
            </div>
            <div class="strategy-item">
              <span class="label">팩트 원본 테이블</span>
              <span class="value">{{ aiSuggestion.fact_sources?.join(', ') }}</span>
            </div>
          </div>
          
          <!-- Dimension ETL Strategies -->
          <div class="dimension-strategies" v-if="aiSuggestion.dimensions?.length">
            <h5>📐 디멘전 테이블 ETL 전략</h5>
            <div class="dimension-cards">
              <div v-for="dim in aiSuggestion.dimensions" :key="dim.name" class="dimension-card">
                <div class="dim-header">
                  <span class="dim-name">{{ dim.name }}</span>
                  <span :class="['dim-strategy-badge', dim.generation_strategy]">
                    {{ dim.generation_strategy === 'etl' ? '📥 ETL 추출' : 
                       dim.generation_strategy === 'generate' ? '🔧 자동 생성' : '✍️ 수동 관리' }}
                  </span>
                </div>
                <p class="dim-description" v-if="dim.description">{{ dim.description }}</p>
                
                <!-- ETL Type: Source table specified -->
                <div v-if="dim.generation_strategy === 'etl' && dim.source_table" class="dim-source">
                  <div class="source-header">
                    <span class="source-label">소스 테이블:</span>
                    <code class="source-table">{{ dim.source_table }}</code>
                  </div>
                  <div v-if="dim.column_mappings?.length" class="dim-mappings">
                    <table class="mini-table">
                      <thead>
                        <tr>
                          <th>원본 컬럼</th>
                          <th></th>
                          <th>대상 컬럼</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(cm, ci) in dim.column_mappings" :key="ci">
                          <td class="source">{{ cm.source }}</td>
                          <td class="arrow">→</td>
                          <td class="target">{{ cm.target }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <!-- Generate Type: Show columns to be generated -->
                <div v-else-if="dim.generation_strategy === 'generate'" class="dim-generate">
                  <span class="generate-label">생성될 컬럼:</span>
                  <div class="generated-columns">
                    <span v-for="col in dim.columns" :key="col.name" class="column-chip">
                      {{ col.name }} <span class="col-type">({{ col.type }})</span>
                    </span>
                  </div>
                  <code v-if="dim.generate_sql" class="generate-sql">{{ dim.generate_sql }}</code>
                </div>
                
                <!-- Manual Type: Show required columns -->
                <div v-else-if="dim.generation_strategy === 'manual'" class="dim-manual">
                  <span class="manual-label">⚠️ 수동으로 데이터를 입력해야 합니다</span>
                  <div v-if="dim.columns?.length" class="required-columns">
                    <span v-for="col in dim.columns" :key="col.name" class="column-chip">
                      {{ col.name }} <span class="col-type">({{ col.type }})</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Legacy dimension_sources display (fallback) -->
          <div class="dimension-sources" v-else-if="aiSuggestion.dimension_sources && Object.keys(aiSuggestion.dimension_sources).length">
            <h5>📐 디멘전 소스</h5>
            <div class="dim-source-list">
              <div v-for="(sources, dimName) in aiSuggestion.dimension_sources" :key="dimName" class="dim-source-item">
                <span class="dim-name">{{ dimName }}</span>
                <span class="arrow">←</span>
                <span class="sources">{{ Array.isArray(sources) ? sources.join(', ') : sources }}</span>
              </div>
            </div>
          </div>
          
          <!-- Fact Table Mappings -->
          <div class="mappings-table" v-if="aiSuggestion.suggested_mappings?.length || aiSuggestion.fact_mappings?.length">
            <h5>📊 팩트 테이블 컬럼 매핑 ({{ (aiSuggestion.suggested_mappings || aiSuggestion.fact_mappings)?.length }}개)</h5>
            <table>
              <thead>
                <tr>
                  <th>원본 (OLTP)</th>
                  <th></th>
                  <th>대상 (OLAP)</th>
                  <th>변환</th>
                  <th>설명</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in (aiSuggestion.suggested_mappings || aiSuggestion.fact_mappings)" :key="i">
                  <td class="source">{{ m.source }}</td>
                  <td class="arrow">→</td>
                  <td class="target">{{ m.target }}</td>
                  <td class="transform">{{ m.transformation || '-' }}</td>
                  <td class="description">{{ m.description || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Reasoning -->
          <div class="strategy-reasoning" v-if="aiSuggestion.reasoning">
            <h5>💡 AI 설명</h5>
            <p>{{ aiSuggestion.reasoning }}</p>
          </div>
        </div>
        
        <!-- Actions -->
        <div class="actions-bar">
          <button class="btn btn-success" @click="uploadCubeAndDeploy" :disabled="loading">
            📤 큐브 업로드 & Airflow 배포
          </button>
          <p class="hint">큐브와 ETL 파이프라인을 저장하고 Airflow에 배포합니다.</p>
        </div>
      </section>
      </template>
      
      <!-- =====================================================================
           Visual Modeler Tab
           ===================================================================== -->
      <template v-else-if="activeTab === 'visual'">
        <div class="visual-modeler">
          <!-- Toolbar -->
          <div class="vm-toolbar">
            <button class="btn btn-sm" @click="loadSampleTemplate">
              📋 샘플 템플릿
            </button>
            <button class="btn btn-sm" @click="clearForm">
              🗑️ 초기화
            </button>
            <div class="toolbar-spacer"></div>
            <div class="preview-toggle">
              <button 
                :class="['toggle-btn', { active: previewMode === 'diagram' }]"
                @click="previewMode = 'diagram'"
              >다이어그램</button>
              <button 
                :class="['toggle-btn', { active: previewMode === 'xml' }]"
                @click="previewMode = 'xml'"
              >XML</button>
            </div>
          </div>
          
          <div class="vm-content">
            <!-- Left: Form -->
            <div class="vm-form">
              <!-- Basic Info -->
              <div class="form-section">
                <h4>📦 기본 정보</h4>
                <div class="form-group">
                  <label>큐브 이름</label>
                  <input 
                    type="text" 
                    v-model="cubeName" 
                    placeholder="예: SalesCube"
                    class="form-input"
                  />
                </div>
                <div class="form-group">
                  <label>팩트 테이블</label>
                  <input 
                    type="text" 
                    v-model="factTable" 
                    placeholder="예: dw.fact_sales"
                    class="form-input"
                  />
                </div>
              </div>
              
              <!-- Dimensions -->
              <div class="form-section">
                <div class="section-header">
                  <h4>📐 디멘전</h4>
                  <button class="btn btn-sm btn-add" @click="addDimension">
                    + 추가
                  </button>
                </div>
                
                <div 
                  v-for="(dim, dimIndex) in dimensions" 
                  :key="dim.id" 
                  class="dimension-item"
                >
                  <div class="dim-header-row">
                    <input 
                      v-model="dim.name" 
                      placeholder="디멘전 이름" 
                      class="form-input dim-name"
                    />
                    <button class="btn-remove" @click="removeDimension(dimIndex)">×</button>
                  </div>
                  
                  <div class="dim-details">
                    <div class="form-row">
                      <input 
                        v-model="dim.table" 
                        placeholder="테이블 (예: dw.dim_time)" 
                        class="form-input"
                      />
                      <input 
                        v-model="dim.foreignKey" 
                        placeholder="FK (예: time_id)" 
                        class="form-input"
                      />
                    </div>
                    
                    <!-- Levels -->
                    <div class="levels-section">
                      <span class="levels-label">레벨:</span>
                      <div 
                        v-for="(level, levelIndex) in dim.levels" 
                        :key="level.id" 
                        class="level-item"
                      >
                        <input 
                          v-model="level.name" 
                          placeholder="이름" 
                          class="form-input level-input"
                        />
                        <input 
                          v-model="level.column" 
                          placeholder="컬럼" 
                          class="form-input level-input"
                        />
                        <button 
                          class="btn-remove-level" 
                          @click="removeLevel(dimIndex, levelIndex)"
                        >×</button>
                      </div>
                      <button class="btn-add-level" @click="addLevel(dimIndex)">
                        + 레벨 추가
                      </button>
                    </div>
                  </div>
                </div>
                
                <div v-if="dimensions.length === 0" class="empty-section">
                  디멘전이 없습니다. "추가" 버튼을 클릭하세요.
                </div>
              </div>
              
              <!-- Measures -->
              <div class="form-section">
                <div class="section-header">
                  <h4>📊 측정값</h4>
                  <button class="btn btn-sm btn-add" @click="addMeasure">
                    + 추가
                  </button>
                </div>
                
                <div 
                  v-for="(measure, measureIndex) in measures" 
                  :key="measure.id" 
                  class="measure-item"
                >
                  <input 
                    v-model="measure.name" 
                    placeholder="이름" 
                    class="form-input"
                  />
                  <input 
                    v-model="measure.column" 
                    placeholder="컬럼" 
                    class="form-input"
                  />
                  <select v-model="measure.aggregator" class="form-select">
                    <option value="sum">SUM</option>
                    <option value="count">COUNT</option>
                    <option value="avg">AVG</option>
                    <option value="min">MIN</option>
                    <option value="max">MAX</option>
                  </select>
                  <button class="btn-remove" @click="removeMeasure(measureIndex)">×</button>
                </div>
                
                <div v-if="measures.length === 0" class="empty-section">
                  측정값이 없습니다. "추가" 버튼을 클릭하세요.
                </div>
              </div>
              
              <!-- Upload Button -->
              <div class="vm-actions">
                <button 
                  class="btn btn-success btn-upload" 
                  @click="uploadCubeAndDeploy" 
                  :disabled="loading || !cubeName || !factTable"
                >
                  <span v-if="loading" class="spinner"></span>
                  <span v-else>📤 큐브 업로드 & 배포</span>
                </button>
              </div>
            </div>
            
            <!-- Right: Preview -->
            <div class="vm-preview">
              <template v-if="previewMode === 'diagram'">
                <div ref="starSchemaDiagram" class="preview-diagram"></div>
              </template>
              <template v-else>
                <pre class="preview-xml">{{ generateMondrianXML() }}</pre>
              </template>
            </div>
          </div>
        </div>
      </template>
    </main>

    <ActionDialog
      :open="redeployDialogOpen"
      dialog-id="olap-designer-redeploy"
      title="Airflow DAG 재배포"
      :message="`기존 DAG를 덮어쓰고 '${cubeName}' 큐브의 ETL 설정과 DAG를 다시 배포합니다.`"
      confirm-label="DAG 재배포"
      pending-label="재배포 중…"
      :pending="airflowLoading"
      :error="redeployError"
      @cancel="cancelRedeploy"
      @confirm="confirmRedeployToAirflow"
    />
  </div>
</template>

<style lang="scss" scoped src="./CubeDesigner.scss"></style>
