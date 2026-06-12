<script setup lang="ts">
/**
 * CubeDesigner.vue
 * OLAP 큐브 설계 - AI 기반 스타 스키마 생성 및 ETL 전략
 */
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useOlapStore } from '@/stores/olap'
import { useSessionStore } from '@/stores/session'
import * as olapApi from '@/features/olap/olap-api'
import mermaid from 'mermaid'

const store = useOlapStore()
const sessionStore = useSessionStore()

// State
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)
const catalog = ref<any>({ tables: [], schemas: [], relationships: [] })
const etlDescription = ref('')
const aiSuggestion = ref<any>(null)
const dwSchema = ref('dw')

// Tab State
const activeTab = ref<'ai' | 'visual'>('ai')

// Visual Modeler State
const cubeName = ref('')
const factTable = ref('')
const dimensions = ref<any[]>([])
const measures = ref<any[]>([])
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
}

// Diagram refs
const starSchemaDiagram = ref<HTMLDivElement | null>(null)
const lineageDiagram = ref<HTMLDivElement | null>(null)

// Airflow State
const airflowDag = ref<any>(null)
const airflowLoading = ref(false)
const airflowError = ref<string | null>(null)

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
  const transferData = sessionStore.consumeOlapTransferData()
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
    const diagram = generateVisualModelerMermaid()
    if (!diagram) return
    
    starSchemaDiagram.value.innerHTML = ''
    const { svg } = await mermaid.render(`vm-diagram-${Date.now()}`, diagram)
    starSchemaDiagram.value.innerHTML = svg
  } catch (e) {
    console.error('Mermaid render error:', e)
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
    dim.levels?.forEach((level: any) => {
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
  try {
    const data = await olapApi.getETLCatalog()
    catalog.value = data
  } catch (e) {
    console.error('Failed to fetch catalog:', e)
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
    const data = await olapApi.suggestETLStrategy(etlDescription.value)
    aiSuggestion.value = data.suggestion
    
    if (aiSuggestion.value && !aiSuggestion.value.error) {
      await populateFromAISuggestion(aiSuggestion.value)
      success.value = 'AI 추천이 완료되었습니다.'
      
      await nextTick()
      await renderDiagrams()
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Populate from AI suggestion
async function populateFromAISuggestion(suggestion: any) {
  // Use suggested cube name - LLM now returns English names
  if (suggestion.cube_name) {
    // cube_name should already be in English from LLM
    cubeName.value = suggestion.cube_name.replace(/[^a-zA-Z0-9_]/g, '')
  } else if (!cubeName.value) {
    cubeName.value = 'analytics_cube'
  }
  
  const factSources = suggestion.fact_sources || []
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
        catalog.value.tables.find((t: any) => t.name === dim.source_table) : null
      
      // Build levels from columns or column_mappings
      let levels = []
      if (dim.columns && Array.isArray(dim.columns)) {
        levels = dim.columns.filter((col: any) => col.name !== 'id').map((col: any) => ({
          name: col.name,
          column: col.name
        }))
      } else if (dim.target_columns && Array.isArray(dim.target_columns)) {
        levels = dim.target_columns.filter((col: string) => col !== 'id').map((col: string) => ({
          name: col,
          column: col
        }))
      } else if (tableInfo?.columns) {
        levels = tableInfo.columns.slice(0, 3).map((col: any) => ({
          name: col.name,
          column: col.name
        }))
      }
      
      if (levels.length === 0) {
        levels = [{ name: 'name', column: 'name' }]
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
        const tableInfo = catalog.value.tables.find((t: any) => t.name === sourceTable)
        
        // Ensure dimension name is in English
        const cleanDimName = dimName.replace(/[^a-zA-Z0-9_]/g, '') || 'dim_unknown'
        dimensions.value.push({
          id: Date.now() + Math.random(),
          name: cleanDimName,
          table: `${dwSchema.value}.${cleanDimName}`,
          foreignKey: `${cleanDimName.toLowerCase()}_id`,
          levels: tableInfo?.columns?.slice(0, 2).map((col: any) => ({
            name: col.name,
            column: col.name
          })) || [{ name: 'id', column: 'id' }],
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
    suggestion.measures.forEach((m: any, i: number) => {
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
    const measureMappings = mappings.filter((m: any) => 
      m.transformation && (m.transformation.includes('SUM') || m.transformation.includes('AVG') || 
       m.transformation.includes('COUNT') || m.transformation.includes('MAX') || m.transformation.includes('MIN'))
    )
    
    if (measureMappings.length > 0) {
      measureMappings.forEach((m: any, i: number) => {
        const colName = m.target?.split('.')?.pop() || m.source?.split('.')?.pop() || `measure_${i}`
        // Convert to English column name
        const cleanColName = colName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_')
        let aggregator = 'sum'
        if (m.transformation.includes('AVG')) aggregator = 'avg'
        else if (m.transformation.includes('COUNT')) aggregator = 'count'
        else if (m.transformation.includes('MAX')) aggregator = 'max'
        else if (m.transformation.includes('MIN')) aggregator = 'min'
        
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
    dim.levels?.forEach((level: any) => {
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
  if (starSchemaDiagram.value && starSchemaMermaid.value) {
    try {
      const { svg } = await mermaid.render(`star_${Date.now()}`, starSchemaMermaid.value)
      starSchemaDiagram.value.innerHTML = svg
    } catch (e) {
      console.error('Star schema diagram error:', e)
    }
  }
  
  if (lineageDiagram.value && lineageMermaid.value) {
    try {
      const { svg } = await mermaid.render(`lineage_${Date.now()}`, lineageMermaid.value)
      lineageDiagram.value.innerHTML = svg
    } catch (e) {
      console.error('Lineage diagram error:', e)
    }
  }
}

// Generate and upload cube schema + ETL config
async function uploadCube() {
  if (!cubeName.value || !factTable.value) {
    error.value = '큐브 이름과 팩트 테이블을 설정해주세요'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    // 1. Generate and upload Mondrian XML
    const xml = generateMondrianXML()
    console.log('Uploading cube schema...')
    await store.uploadSchemaText(xml)
    console.log('Cube schema uploaded successfully')
    
    // 2. Create ETL configuration (always attempt)
    const etlConfig = buildETLConfig()
    console.log('Creating ETL config:', etlConfig)
    
    if (etlConfig.mappings.length > 0 || etlConfig.source_tables.length > 0) {
      try {
        await olapApi.createETLConfig(etlConfig)
        console.log('ETL config created successfully')
        success.value = '큐브와 ETL 설정이 성공적으로 저장되었습니다!'
      } catch (etlError: any) {
        console.error('ETL config creation failed:', etlError)
        success.value = `큐브는 저장되었으나 ETL 설정 생성 실패: ${etlError.message}`
      }
    } else {
      console.warn('No mappings or source tables - skipping ETL config')
      success.value = '큐브가 저장되었습니다. (ETL 설정: 매핑 정보 없음)'
    }
  } catch (e: any) {
    console.error('Upload failed:', e)
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Build ETL config from current state
function buildETLConfig() {
  const suggestion = aiSuggestion.value || {}
  
  // Get source tables from suggestion or dimensions
  const factSources = suggestion.fact_sources || []
  const dimSources = suggestion.dimension_sources || {}
  const allSourceTables = new Set<string>(factSources)
  
  // Add from dimension sources
  Object.values(dimSources).forEach((sources: any) => {
    if (Array.isArray(sources)) {
      sources.forEach(s => {
        const cleaned = s.replace(/^\./, '')
        if (cleaned) allSourceTables.add(cleaned)
      })
    }
  })
  
  // Also add source tables from dimensions if not from AI
  dimensions.value.forEach(dim => {
    if (dim.sourceTable) {
      const cleaned = dim.sourceTable.replace(/^\./, '')
      if (cleaned) allSourceTables.add(cleaned)
    }
  })
  
  // Get dimension table names (use 'table' or 'tableName' property)
  const dimensionTableNames = dimensions.value.map(d => d.table || d.tableName).filter(Boolean)
  
  // Build mappings from AI suggestion (fact table mappings)
  const mappings: any[] = []
  const suggestedMappings = suggestion.suggested_mappings || suggestion.fact_mappings || []
  
  suggestedMappings.forEach((m: any) => {
    // Parse source (handle formats like ".table.column" or "table.column")
    const sourceParts = (m.source || '').replace(/^\./, '').split('.')
    const sourceTable = sourceParts.length >= 2 ? sourceParts[0] : ''
    const sourceCol = sourceParts.length >= 2 ? sourceParts.slice(1).join('.') : sourceParts[0] || ''
    
    // Parse target (handle formats like "fact_table.column" or "dim_table.column")
    const targetParts = (m.target || '').replace(/^\./, '').split('.')
    const targetTable = targetParts.length >= 2 ? targetParts[0] : ''
    const targetCol = targetParts.length >= 2 ? targetParts.slice(1).join('.') : targetParts[0] || ''
    
    // Only add if we have valid source and target
    if (sourceTable && sourceCol && targetTable && targetCol) {
      mappings.push({
        source_table: sourceTable,
        source_column: sourceCol,
        target_table: targetTable,
        target_column: targetCol,
        transformation: m.transformation || ''
      })
    }
  })
  
  // Add dimension mappings from AI suggestion (for dimension ETL)
  const aiDimensions = suggestion.dimensions || []
  aiDimensions.forEach((dim: any) => {
    const dimName = (dim.name || '').replace(/[^a-zA-Z0-9_]/g, '') || 'dim_unknown'
    const sourceTable = dim.source_table || ''
    const columnMappings = dim.column_mappings || []
    
    // If has column mappings, use them
    if (columnMappings.length > 0) {
      columnMappings.forEach((cm: any) => {
        const srcParts = (cm.source || '').split('.')
        const tgtParts = (cm.target || '').split('.')
        mappings.push({
          source_table: srcParts[0] || sourceTable,
          source_column: srcParts.slice(1).join('.') || srcParts[0] || '',
          target_table: tgtParts[0] || dimName,
          target_column: tgtParts.slice(1).join('.') || tgtParts[0] || '',
          transformation: cm.transformation || ''
        })
      })
    } 
    // Otherwise create basic mapping from source_columns to target_columns
    else if (dim.source_columns && dim.target_columns) {
      const srcCols = dim.source_columns || []
      const tgtCols = dim.target_columns || []
      srcCols.forEach((srcCol: string, idx: number) => {
        const tgtCol = tgtCols[idx] || srcCol
        if (srcCol && tgtCol) {
          mappings.push({
            source_table: sourceTable,
            source_column: srcCol,
            target_table: dimName,
            target_column: tgtCol,
            transformation: ''
          })
        }
      })
    }
  })
  
  // If no mappings from AI, create basic mappings from dimensions
  if (mappings.length === 0 && dimensions.value.length > 0) {
    dimensions.value.forEach(dim => {
      if (dim.sourceTable && dim.foreignKey) {
        // Get just the table name without schema prefix
        const tableName = (dim.table || dim.tableName || '').split('.').pop() || dim.name
        mappings.push({
          source_table: dim.sourceTable.replace(/^\./, ''),
          source_column: dim.foreignKey,
          target_table: tableName,
          target_column: dim.foreignKey,
          transformation: ''
        })
      }
    })
  }
  
  return {
    cube_name: cubeName.value,
    fact_table: factTable.value,
    dimension_tables: dimensionTableNames,
    source_tables: Array.from(allSourceTables),
    mappings: mappings,
    dw_schema: dwSchema.value,
    sync_mode: suggestion.sync_strategy || 'full',
    incremental_column: suggestion.incremental_column || null
  }
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
    // First ensure ETL config exists
    const etlConfig = buildETLConfig()
    await olapApi.createETLConfig(etlConfig)
    
    // Deploy to Airflow
    const result = await olapApi.deployETLPipeline(cubeName.value)
    airflowDag.value = result
    
    console.log('Airflow deployment result:', result)
  } catch (e: any) {
    console.error('Airflow deployment failed:', e)
    airflowError.value = e.message
  } finally {
    airflowLoading.value = false
  }
}

async function redeployToAirflow() {
  if (!cubeName.value) {
    airflowError.value = '큐브 이름이 없습니다'
    return
  }
  
  if (!confirm('DAG를 재생성하시겠습니까?\n기존 DAG가 덮어씌워집니다.')) {
    return
  }
  
  airflowLoading.value = true
  airflowError.value = null
  
  try {
    // Rebuild ETL config from current cube settings
    const etlConfig = buildETLConfig()
    await olapApi.createETLConfig(etlConfig)
    
    // Force redeploy to Airflow
    const result = await olapApi.deployETLPipeline(cubeName.value, true) // force=true
    airflowDag.value = result
    
    console.log('Airflow redeployment result:', result)
    alert('DAG가 성공적으로 재생성되었습니다!')
  } catch (e: any) {
    console.error('Airflow redeployment failed:', e)
    airflowError.value = e.message
  } finally {
    airflowLoading.value = false
  }
}

// Open Airflow UI
function openAirflowUI() {
  if (airflowDag.value?.airflow_url) {
    window.open(airflowDag.value.airflow_url, '_blank')
  } else {
    window.open('http://localhost:8080', '_blank')
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
    console.log('=== Starting full cube provisioning ===')
    
    // 1. Create DW schema and tables
    console.log('Step 1: Creating DW schema...')
    await olapApi.createDWSchema()
    
    // 2. Generate and execute DDL for dimension and fact tables
    console.log('Step 2: Provisioning tables...')
    const provisionResult = await olapApi.provisionCube(
      cubeName.value,
      aiSuggestion.value,
      dimensions.value,
      measures.value,
      factTable.value
    )
    console.log('Tables provisioned:', provisionResult)
    
    // 3. Upload cube schema (Mondrian XML)
    console.log('Step 3: Uploading cube schema...')
    const xml = generateMondrianXML()
    await store.uploadSchemaText(xml)
    
    // 4. Create ETL config
    console.log('Step 4: Creating ETL config...')
    const etlConfig = buildETLConfig()
    await olapApi.createETLConfig(etlConfig)
    
    // 5. Deploy to Airflow
    console.log('Step 5: Deploying to Airflow...')
    const result = await olapApi.deployETLPipeline(cubeName.value)
    airflowDag.value = result
    
    // 6. Trigger initial ETL run (optional - run Airflow DAG)
    console.log('Step 6: Triggering initial ETL...')
    try {
      await olapApi.runETLPipeline(cubeName.value)
      console.log('Initial ETL triggered via Airflow')
    } catch (airflowErr: any) {
      console.warn('Airflow ETL trigger failed, data may need manual sync:', airflowErr.message)
    }
    
    success.value = `✅ 큐브 "${cubeName.value}" 프로비저닝 완료!\n` +
      `• DW 테이블 생성됨\n` +
      `• ETL 파이프라인 배포됨\n` +
      `• Airflow DAG: ${result.dag_id || 'N/A'}`
    
    console.log('=== Cube provisioning complete ===')
  } catch (e: any) {
    console.error('Provisioning failed:', e)
    error.value = `프로비저닝 실패: ${e.message}`
  } finally {
    loading.value = false
  }
}

// Generate Mondrian XML
function generateMondrianXML(): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Schema name="${cubeName.value}Schema">\n`
  xml += `  <Cube name="${cubeName.value}">\n`
  xml += `    <Table name="${factTable.value.split('.').pop()}" schema="${dwSchema.value}"/>\n`
  
  dimensions.value.forEach(dim => {
    xml += `    <Dimension name="${dim.name}" foreignKey="${dim.foreignKey}">\n`
    xml += `      <Hierarchy hasAll="true" primaryKey="id">\n`
    xml += `        <Table name="${dim.table.split('.').pop()}" schema="${dwSchema.value}"/>\n`
    dim.levels?.forEach((level: any) => {
      xml += `        <Level name="${level.name}" column="${level.column}"/>\n`
    })
    xml += `      </Hierarchy>\n`
    xml += `    </Dimension>\n`
  })
  
  measures.value.forEach(m => {
    xml += `    <Measure name="${m.name}" column="${m.column}" aggregator="${m.aggregator}"/>\n`
  })
  
  xml += `  </Cube>\n</Schema>`
  return xml
}
</script>

<template>
  <div class="cube-designer">
    <!-- Left Panel: Catalog -->
    <aside class="catalog-panel">
      <h3>📚 데이터 카탈로그</h3>
      <div class="catalog-list">
        <div 
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
        <div v-if="!catalog.tables?.length" class="empty-catalog">
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
        
        <!-- Messages -->
        <div v-if="error" class="message error">{{ error }}</div>
        <div v-if="success" class="message success">{{ success }}</div>
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
              <img src="https://airflow.apache.org/images/feature-image.png" alt="Airflow" class="airflow-logo" />
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
                  <button class="btn btn-airflow-open" @click="openAirflowUI">
                    🔗 Airflow UI에서 보기
                  </button>
                  <button class="btn btn-dag-redeploy" @click="redeployToAirflow" :disabled="airflowLoading">
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
  </div>
</template>

<style lang="scss" scoped>
// Modeler Tabs
.modeler-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  margin-bottom: 16px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  
  svg {
    opacity: 0.7;
  }
  
  &:hover {
    background: var(--color-bg-secondary);
    color: var(--color-text);
  }
  
  &.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
    
    svg {
      opacity: 1;
    }
  }
}

// Visual Modeler
.visual-modeler {
  display: flex;
  flex-direction: column;
  height: calc(100% - 80px);
}

.vm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 16px;
  
  .toolbar-spacer {
    flex: 1;
  }
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.8125rem;
}

.preview-toggle {
  display: flex;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  overflow: hidden;
  
  .toggle-btn {
    padding: 6px 14px;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    
    &.active {
      background: var(--color-accent);
      color: white;
    }
  }
}

.vm-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.vm-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 8px;
}

.form-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 16px;
  
  h4 {
    margin: 0 0 12px 0;
    font-size: 0.9375rem;
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

.btn-add {
  background: rgba(34, 139, 230, 0.15);
  border-color: var(--color-accent);
  color: var(--color-accent);
  
  &:hover {
    background: rgba(34, 139, 230, 0.25);
  }
}

.form-group {
  margin-bottom: 12px;
  
  label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  &::placeholder {
    color: var(--color-text-muted);
  }
}

.form-select {
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
  min-width: 100px;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.dimension-item {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.dim-header-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  
  .dim-name {
    flex: 1;
    font-weight: 500;
  }
}

.btn-remove {
  width: 28px;
  height: 28px;
  padding: 0;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ef4444;
  font-size: 1rem;
  cursor: pointer;
  
  &:hover {
    background: rgba(239, 68, 68, 0.25);
  }
}

.dim-details {
  padding-left: 4px;
}

.levels-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
  
  .levels-label {
    display: block;
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
}

.level-item {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  
  .level-input {
    flex: 1;
    padding: 6px 10px;
    font-size: 0.8125rem;
  }
}

.btn-remove-level {
  width: 24px;
  height: 24px;
  padding: 0;
  background: rgba(239, 68, 68, 0.1);
  border: none;
  border-radius: 4px;
  color: #ef4444;
  font-size: 0.875rem;
  cursor: pointer;
  
  &:hover {
    background: rgba(239, 68, 68, 0.2);
  }
}

.btn-add-level {
  padding: 4px 10px;
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  
  &:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}

.measure-item {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.empty-section {
  padding: 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
}

.vm-actions {
  padding: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  text-align: center;
  
  .btn-upload {
    width: 100%;
    padding: 14px 20px;
    font-size: 1rem;
  }
}

.vm-preview {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-diagram {
  flex: 1;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  
  :deep(svg) {
    max-width: 100%;
    height: auto;
  }
}

.preview-xml {
  flex: 1;
  margin: 0;
  padding: 16px;
  background: var(--color-bg-tertiary);
  color: #82c91e;
  font-family: 'Fira Code', 'Monaco', monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
}

// Transfer Banner from Text2SQL
.transfer-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.12) 0%, rgba(124, 58, 237, 0.12) 100%);
  border: 1px solid rgba(34, 139, 230, 0.3);
  border-radius: 12px;
  animation: slideIn 0.3s ease-out;
  
  .banner-icon {
    font-size: 28px;
  }
  
  .banner-content {
    flex: 1;
    
    strong {
      display: block;
      color: #38bdf8;
      font-size: 14px;
      margin-bottom: 4px;
    }
    
    p {
      margin: 0;
      font-size: 12px;
      color: var(--color-text-secondary);
    }
  }
  
  .banner-close {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s;
    
    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text);
    }
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.cube-designer {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.catalog-panel {
  width: 280px;
  flex-shrink: 0;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  
  h3 {
    padding: 16px;
    margin: 0;
    font-size: 0.9375rem;
    border-bottom: 1px solid var(--color-border);
  }
}

.catalog-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.catalog-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  .table-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }
  
  .table-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  
  .table-name {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }
  
  .table-desc {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.empty-catalog {
  padding: 24px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.design-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ai-section {
  h3 {
    margin: 0 0 16px 0;
    font-size: 1rem;
  }
}

.ai-input-row {
  display: flex;
  gap: 12px;
  
  textarea {
    flex: 1;
    padding: 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 0.875rem;
    resize: none;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
  
  .btn {
    white-space: nowrap;
    align-self: flex-end;
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  
  &.btn-primary {
    background: linear-gradient(135deg, var(--color-accent) 0%, #1c7ed6 100%);
    color: white;
    
    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(34, 139, 230, 0.4);
    }
  }
  
  &.btn-success {
    background: linear-gradient(135deg, #37b24d 0%, #2f9e44 100%);
    color: white;
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.message {
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 12px;
  font-size: 0.875rem;
  
  &.error {
    background: rgba(250, 82, 82, 0.1);
    border: 1px solid rgba(250, 82, 82, 0.3);
    color: #fa5252;
  }
  
  &.success {
    background: rgba(55, 178, 77, 0.1);
    border: 1px solid rgba(55, 178, 77, 0.3);
    color: #37b24d;
  }
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

// Query Generalization Section
.generalization-section {
  background: linear-gradient(135deg, rgba(130, 201, 30, 0.08) 0%, rgba(34, 139, 230, 0.08) 100%);
  border: 1px solid rgba(130, 201, 30, 0.3);
  border-radius: 12px;
  padding: 16px;
  
  h4 {
    margin: 0 0 12px 0;
    font-size: 0.9375rem;
    color: #82c91e;
  }
}

.generalization-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gen-row {
  display: flex;
  align-items: stretch;
  gap: 16px;
  
  .gen-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
    border-radius: 10px;
    
    &:first-child {
      /* 원본 쿼리 - 회색 계열 */
      background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
      border: 1px solid #cbd5e1;
    }
    
    &:last-child {
      /* 일반화된 분석 - 청록색 계열 */
      background: linear-gradient(135deg, #ccfbf1 0%, #cffafe 100%);
      border: 2px solid #14b8a6;
    }
  }
  
  .gen-arrow {
    font-size: 1.75rem;
    color: #0d9488;
    flex-shrink: 0;
    align-self: center;
    font-weight: bold;
  }
}

.gen-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  
  .gen-item:first-child & {
    color: #64748b;
  }
  
  .gen-item:last-child & {
    color: #0d9488;
  }
}

.gen-value {
  font-size: 0.9375rem;
  line-height: 1.5;
  
  &.original {
    color: #475569;
    font-style: italic;
  }
  
  &.generalized {
    color: #0f766e;
    font-weight: 700;
    font-size: 1rem;
  }
}

.pivot-capabilities {
  padding: 14px 16px;
  background: linear-gradient(135deg, #ecfccb 0%, #d9f99d 100%);
  border: 1px solid #84cc16;
  border-radius: 10px;
  
  .gen-label {
    color: #4d7c0f !important;
  }
}

.pivot-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.pivot-chip {
  padding: 8px 14px;
  background: linear-gradient(135deg, #bbf7d0 0%, #a7f3d0 100%);
  border: 1px solid #22c55e;
  border-radius: 20px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #166534;
  transition: all 0.2s ease;
  cursor: default;
  
  &:hover {
    background: linear-gradient(135deg, #86efac 0%, #6ee7b7 100%);
    border-color: #16a34a;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
  }
}

.identified-dims {
  padding: 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.dim-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.dim-chip {
  padding: 8px 12px;
  background: rgba(174, 62, 201, 0.15);
  border: 1px solid rgba(174, 62, 201, 0.3);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  
  strong {
    font-size: 0.8125rem;
    color: #ae3ec9;
  }
  
  .dim-hint {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
  }
}

.gen-reasoning {
  padding: 12px;
  background: rgba(250, 176, 5, 0.1);
  border: 1px solid rgba(250, 176, 5, 0.2);
  border-radius: 8px;
  
  p {
    margin: 8px 0 0 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
  }
}

.diagrams-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.diagram-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  
  h4 {
    padding: 12px 16px;
    margin: 0;
    font-size: 0.875rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-tertiary);
  }
}

.diagram-container {
  min-height: 250px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  
  :deep(svg) {
    max-width: 100%;
    height: auto;
  }
}

.etl-strategy {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  
  h4 {
    margin: 0 0 16px 0;
    font-size: 0.9375rem;
  }
  
  h5 {
    margin: 16px 0 8px 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
}

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.strategy-item {
  background: var(--color-bg-tertiary);
  padding: 12px;
  border-radius: 8px;
  
  .label {
    display: block;
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  
  .value {
    font-size: 0.875rem;
    color: var(--color-text);
    
    &.badge {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(34, 139, 230, 0.2);
      border-radius: 4px;
      color: var(--color-accent);
    }
    
    &.mono {
      font-family: monospace;
    }
  }
}

.mappings-table {
  margin-top: 16px;
  
  table {
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
      color: var(--color-text-muted);
      font-size: 0.6875rem;
      text-transform: uppercase;
    }
    
    .source {
      font-family: monospace;
      color: var(--color-accent);
    }
    
    .arrow {
      text-align: center;
      color: #37b24d;
    }
    
    .target {
      font-family: monospace;
      color: #ae3ec9;
    }
    
    .transform {
      font-family: monospace;
      color: var(--color-text-muted);
      font-size: 0.75rem;
    }
    
    .description {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      max-width: 200px;
    }
  }
}

// Dimension Strategy Styles
.dimension-strategies {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  
  h5 {
    margin: 0 0 12px 0;
  }
}

.dimension-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.dimension-card {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  
  .dim-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    
    .dim-name {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--color-text);
    }
    
    .dim-strategy-badge {
      font-size: 0.6875rem;
      padding: 3px 8px;
      border-radius: 12px;
      
      &.etl {
        background: rgba(34, 139, 230, 0.2);
        color: #228be6;
      }
      
      &.generate {
        background: rgba(130, 201, 30, 0.2);
        color: #82c91e;
      }
      
      &.manual {
        background: rgba(250, 176, 5, 0.2);
        color: #fab005;
      }
    }
  }
  
  .dim-description {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0 0 10px 0;
    line-height: 1.4;
  }
  
  .dim-source {
    .source-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      
      .source-label {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
      }
      
      .source-table {
        background: rgba(34, 139, 230, 0.1);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        color: var(--color-accent);
      }
    }
  }
  
  .dim-mappings {
    .mini-table {
      width: 100%;
      font-size: 0.6875rem;
      border-collapse: collapse;
      
      th, td {
        padding: 4px 6px;
        border-bottom: 1px solid rgba(var(--color-border-rgb), 0.5);
      }
      
      th {
        background: rgba(0, 0, 0, 0.2);
        font-weight: 500;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      
      .source {
        font-family: monospace;
        color: var(--color-accent);
      }
      
      .arrow {
        text-align: center;
        color: #37b24d;
      }
      
      .target {
        font-family: monospace;
        color: #ae3ec9;
      }
    }
  }
  
  .dim-generate, .dim-manual {
    .generate-label, .manual-label {
      display: block;
      font-size: 0.6875rem;
      color: var(--color-text-muted);
      margin-bottom: 6px;
    }
    
    .generated-columns, .required-columns {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    
    .column-chip {
      background: rgba(130, 201, 30, 0.15);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.6875rem;
      color: #82c91e;
      
      .col-type {
        color: var(--color-text-muted);
        font-size: 0.625rem;
      }
    }
    
    .generate-sql {
      display: block;
      background: rgba(0, 0, 0, 0.3);
      padding: 8px;
      border-radius: 6px;
      font-size: 0.6875rem;
      color: var(--color-text-muted);
      overflow-x: auto;
      white-space: nowrap;
    }
  }
  
  .dim-manual {
    .manual-label {
      color: #fab005;
    }
    
    .column-chip {
      background: rgba(250, 176, 5, 0.15);
      color: #fab005;
    }
  }
}

// Legacy dimension sources fallback
.dimension-sources {
  margin-top: 16px;
  padding: 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  
  .dim-source-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .dim-source-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    
    .dim-name {
      font-weight: 500;
      color: #ae3ec9;
    }
    
    .arrow {
      color: #37b24d;
    }
    
    .sources {
      font-family: monospace;
      color: var(--color-accent);
    }
  }
}

// Strategy reasoning
.strategy-reasoning {
  margin-top: 16px;
  padding: 12px;
  background: rgba(34, 139, 230, 0.05);
  border: 1px solid rgba(34, 139, 230, 0.2);
  border-radius: 8px;
  
  h5 {
    margin: 0 0 8px 0;
  }
  
  p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
  }
}

.actions-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  
  .hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
  }
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// Airflow Card Styles
.airflow-card {
  h4 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .airflow-logo {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
}

.airflow-content {
  padding: 16px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.airflow-empty {
  text-align: center;
  
  .diagram-container.mini {
    min-height: 120px;
    max-height: 150px;
    margin-bottom: 16px;
    
    :deep(svg) {
      max-height: 120px;
    }
  }
  
  .hint {
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
}

.airflow-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
  
  .spinner {
    width: 32px;
    height: 32px;
    border-width: 3px;
    border-color: rgba(0, 212, 170, 0.3);
    border-top-color: #00d4aa;
  }
}

.airflow-deployed {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dag-info {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  padding: 16px;
}

.dag-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  
  &.success {
    color: #37b24d;
  }
  
  .status-icon {
    font-size: 1.25rem;
  }
}

.dag-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  
  .label {
    color: var(--color-text-muted);
    min-width: 60px;
  }
  
  code {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 8px;
    border-radius: 4px;
    color: #00d4aa;
  }
}

.btn-airflow {
  padding: 10px 20px;
  background: linear-gradient(135deg, #00d4aa 0%, #00a896 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #00a896 0%, #008b7a 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 212, 170, 0.3);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.dag-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-airflow-open {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #017cee 0%, #0056b3 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: linear-gradient(135deg, #0056b3 0%, #003d80 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(1, 124, 238, 0.3);
  }
}

.btn-dag-redeploy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
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
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.airflow-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.airflow-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 12px;
  color: #ef4444;
  font-size: 0.875rem;
}
</style>

