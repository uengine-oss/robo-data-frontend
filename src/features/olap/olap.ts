/**
 * OLAP Cube Store
 * 큐브 상태 관리 및 피벗 쿼리 실행
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as olapApi from '@/features/olap/olap-api'

interface PivotField {
  dimension: string
  level: string
}

interface MeasureField {
  name: string
}

interface FilterField {
  dimension: string
  level: string
  operator: string
  values: string[]
}

interface PivotConfig {
  rows: PivotField[]
  columns: PivotField[]
  measures: MeasureField[]
  filters: FilterField[]
}

interface DimensionLevel {
  name: string
  column: string
}

interface Dimension {
  name: string
  type: string
  levels: DimensionLevel[]
}

interface Measure {
  name: string
  column: string
  aggregator: string
  type: string
}

interface CubeMetadata {
  name: string
  fact_table: string
  dimensions: Dimension[]
  measures: Measure[]
}

export const useOlapStore = defineStore('olap', () => {
  // State
  const cubes = ref<string[]>([])
  const currentCube = ref<string | null>(null)
  const cubeMetadata = ref<CubeMetadata | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Pivot configuration
  const pivotConfig = ref<PivotConfig>({
    rows: [],
    columns: [],
    measures: [],
    filters: []
  })
  
  // Drill-down state
  const expandedItems = ref<Record<string, boolean>>({})
  
  // Query results
  const queryResult = ref<any>(null)
  const generatedSQL = ref('')
  
  // ETL State
  const etlConfig = ref<any>(null)
  const etlSyncResult = ref<any>(null)
  
  // Computed
  const hasCubes = computed(() => cubes.value.length > 0)
  
  const dimensions = computed(() => {
    if (!cubeMetadata.value) return []
    return cubeMetadata.value.dimensions.map(dim => ({
      ...dim,
      type: 'dimension'
    }))
  })
  
  const measures = computed(() => {
    if (!cubeMetadata.value) return []
    return cubeMetadata.value.measures.map(m => ({
      ...m,
      type: 'measure'
    }))
  })
  
  // Get the next level in a dimension hierarchy
  function getNextLevel(dimensionName: string, currentLevel: string) {
    const dim = cubeMetadata.value?.dimensions.find(d => d.name === dimensionName)
    if (!dim || !dim.levels) return null
    
    const currentIndex = dim.levels.findIndex(l => l.name === currentLevel)
    if (currentIndex === -1 || currentIndex >= dim.levels.length - 1) {
      return null
    }
    
    return dim.levels[currentIndex + 1]
  }
  
  function hasNextLevel(dimensionName: string, currentLevel: string) {
    return getNextLevel(dimensionName, currentLevel) !== null
  }
  
  function getDimensionHierarchy(dimensionName: string) {
    const dim = cubeMetadata.value?.dimensions.find(d => d.name === dimensionName)
    return dim?.levels || []
  }
  
  // Actions
  async function uploadSchema(file: File) {
    loading.value = true
    error.value = null
    try {
      const metadata = await olapApi.uploadSchema(file)
      await loadCubes()
      return metadata
    } catch (e: any) {
      error.value = e.response?.data?.detail || e.message
      throw e
    } finally {
      loading.value = false
    }
  }
  
  async function uploadSchemaText(xmlContent: string) {
    loading.value = true
    error.value = null
    try {
      const metadata = await olapApi.uploadSchemaText(xmlContent)
      await loadCubes()
      return metadata
    } catch (e: any) {
      error.value = e.response?.data?.detail || e.message
      throw e
    } finally {
      loading.value = false
    }
  }
  
  async function loadCubes() {
    loading.value = true
    error.value = null
    try {
      const response = await olapApi.getCubes()
      cubes.value = response.cubes
      
      if (cubes.value.length > 0 && !currentCube.value) {
        await selectCube(cubes.value[0])
      }
    } catch (e: any) {
      error.value = e.response?.data?.detail || e.message
    } finally {
      loading.value = false
    }
  }
  
  async function selectCube(cubeName: string) {
    loading.value = true
    error.value = null
    try {
      const metadata = await olapApi.getCubeMetadata(cubeName)
      currentCube.value = cubeName
      cubeMetadata.value = metadata
      
      resetPivotConfig()
    } catch (e: any) {
      error.value = e.response?.data?.detail || e.message
    } finally {
      loading.value = false
    }
  }
  
  function resetPivotConfig() {
    pivotConfig.value = {
      rows: [],
      columns: [],
      measures: [],
      filters: []
    }
    expandedItems.value = {}
    queryResult.value = null
    generatedSQL.value = ''
  }
  
  function addToRows(field: PivotField) {
    if (!pivotConfig.value.rows.find(f => f.dimension === field.dimension && f.level === field.level)) {
      pivotConfig.value.rows.push({ ...field })
    }
  }
  
  function addToColumns(field: PivotField) {
    if (!pivotConfig.value.columns.find(f => f.dimension === field.dimension && f.level === field.level)) {
      pivotConfig.value.columns.push({ ...field })
    }
  }
  
  function addMeasure(measure: MeasureField) {
    if (!pivotConfig.value.measures.find(m => m.name === measure.name)) {
      pivotConfig.value.measures.push({ name: measure.name })
    }
  }
  
  function removeFromRows(index: number) {
    pivotConfig.value.rows.splice(index, 1)
  }
  
  function removeFromColumns(index: number) {
    pivotConfig.value.columns.splice(index, 1)
  }
  
  function removeMeasure(index: number) {
    pivotConfig.value.measures.splice(index, 1)
  }
  
  function addFilter(filter: FilterField) {
    pivotConfig.value.filters.push(filter)
  }
  
  function removeFilter(index: number) {
    pivotConfig.value.filters.splice(index, 1)
  }
  
  function buildDrillDownConfig() {
    const config = {
      rows: [...pivotConfig.value.rows],
      columns: [...pivotConfig.value.columns],
      measures: [...pivotConfig.value.measures],
      filters: [...pivotConfig.value.filters]
    }
    
    for (const key of Object.keys(expandedItems.value)) {
      const [type, dimName, level, value] = key.split(':')
      const nextLevel = getNextLevel(dimName, level)
      
      if (nextLevel) {
        if (type === 'col') {
          const exists = config.columns.find(
            c => c.dimension === dimName && c.level === nextLevel.name
          )
          if (!exists) {
            const currentIdx = config.columns.findIndex(
              c => c.dimension === dimName && c.level === level
            )
            if (currentIdx !== -1) {
              config.columns.splice(currentIdx + 1, 0, {
                dimension: dimName,
                level: nextLevel.name
              })
            }
          }
        } else if (type === 'row') {
          const exists = config.rows.find(
            r => r.dimension === dimName && r.level === nextLevel.name
          )
          if (!exists) {
            const currentIdx = config.rows.findIndex(
              r => r.dimension === dimName && r.level === level
            )
            if (currentIdx !== -1) {
              config.rows.splice(currentIdx + 1, 0, {
                dimension: dimName,
                level: nextLevel.name
              })
            }
          }
        }
        
        config.filters.push({
          dimension: dimName,
          level: level,
          operator: '=',
          values: [value]
        })
      }
    }
    
    return config
  }
  
  async function executePivotQuery() {
    expandedItems.value = {}
    await executePivotQueryWithDrillDown()
  }
  
  async function executePivotQueryWithDrillDown() {
    if (!currentCube.value) {
      error.value = 'No cube selected'
      return
    }
    
    loading.value = true
    error.value = null
    
    try {
      const config = buildDrillDownConfig()
      const query = {
        cube_name: currentCube.value,
        ...config
      }
      
      const result = await olapApi.executePivotQuery(query)
      queryResult.value = result
      generatedSQL.value = result.sql
      
      if (result.error) {
        error.value = result.error
      }
    } catch (e: any) {
      error.value = e.response?.data?.detail || e.message
    } finally {
      loading.value = false
    }
  }
  
  async function previewSQL() {
    if (!currentCube.value) return ''
    
    try {
      const config = buildDrillDownConfig()
      const query = {
        cube_name: currentCube.value,
        ...config
      }
      
      const result = await olapApi.previewPivotSQL(query)
      generatedSQL.value = result.sql
      return result.sql
    } catch (e: any) {
      error.value = e.response?.data?.detail || e.message
      return ''
    }
  }
  
  async function executeNaturalQuery(question: string) {
    if (!currentCube.value) {
      error.value = 'No cube selected'
      return
    }
    
    loading.value = true
    error.value = null
    
    try {
      const result = await olapApi.executeNL2SQL(question, currentCube.value)
      queryResult.value = result
      generatedSQL.value = result.sql
      
      if (result.error) {
        error.value = result.error
      }
      
      return result
    } catch (e: any) {
      error.value = e.response?.data?.detail || e.message
      throw e
    } finally {
      loading.value = false
    }
  }
  
  // ETL Actions
  async function executeETLSync(cubeName: string, forceFull: boolean = false) {
    loading.value = true
    etlSyncResult.value = null
    
    try {
      const result = await olapApi.executeETLSync(cubeName, forceFull)
      etlSyncResult.value = result
      return result
    } catch (e: any) {
      etlSyncResult.value = { status: 'failed', error: e.message }
      throw e
    } finally {
      loading.value = false
    }
  }
  
  return {
    // State
    cubes,
    currentCube,
    cubeMetadata,
    loading,
    error,
    pivotConfig,
    expandedItems,
    queryResult,
    generatedSQL,
    etlConfig,
    etlSyncResult,
    
    // Computed
    hasCubes,
    dimensions,
    measures,
    
    // Actions
    uploadSchema,
    uploadSchemaText,
    loadCubes,
    selectCube,
    resetPivotConfig,
    addToRows,
    addToColumns,
    addMeasure,
    removeFromRows,
    removeFromColumns,
    removeMeasure,
    addFilter,
    removeFilter,
    executePivotQuery,
    previewSQL,
    executeNaturalQuery,
    executeETLSync,
    
    // Drill-down
    hasNextLevel,
    getNextLevel,
    getDimensionHierarchy,
    buildDrillDownConfig
  }
})

