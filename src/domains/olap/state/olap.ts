import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as olapApi from '../api/client.ts'
import {
  describeOlapError,
  type EtlConfig,
  type EtlSyncResult,
  type OlapCubeMetadata,
  type OlapNaturalQueryResult,
  type OlapQueryResult,
  type PivotField,
  type PivotFilter,
  type PivotMeasure,
} from '../model/contracts.ts'

interface PivotConfig {
  rows: PivotField[]
  columns: PivotField[]
  measures: PivotMeasure[]
  filters: PivotFilter[]
}

export const useOlapStore = defineStore('olap', () => {
  const cubes = ref<string[]>([])
  const currentCube = ref<string | null>(null)
  const cubeMetadata = ref<OlapCubeMetadata | null>(null)

  const cubeListLoading = ref(false)
  const cubeListError = ref<string | null>(null)
  const cubeSelectionLoading = ref(false)
  const cubeSelectionError = ref<string | null>(null)
  const queryLoading = ref(false)
  const queryError = ref<string | null>(null)
  const previewLoading = ref(false)
  const previewError = ref<string | null>(null)
  const syncLoading = ref(false)
  const syncError = ref<string | null>(null)

  let cubeListSequence = 0
  let cubeSelectionSequence = 0
  let querySequence = 0
  let previewSequence = 0

  const pivotConfig = ref<PivotConfig>({
    rows: [],
    columns: [],
    measures: [],
    filters: [],
  })
  const expandedItems = ref<Record<string, boolean>>({})
  const queryResult = ref<OlapQueryResult | OlapNaturalQueryResult | null>(null)
  const generatedSQL = ref('')
  const etlConfig = ref<EtlConfig | null>(null)
  const etlSyncResult = ref<EtlSyncResult | null>(null)

  const hasCubes = computed(() => cubes.value.length > 0)
  const dimensions = computed(() => cubeMetadata.value?.dimensions.map(dimension => ({
    ...dimension,
    type: 'dimension',
  })) ?? [])
  const measures = computed(() => cubeMetadata.value?.measures.map(measure => ({
    ...measure,
    aggregator: measure.agg,
    type: 'measure',
  })) ?? [])

  function getNextLevel(dimensionName: string, currentLevel: string) {
    const dimension = cubeMetadata.value?.dimensions.find(item => item.name === dimensionName)
    if (!dimension?.levels) return null
    const currentIndex = dimension.levels.findIndex(level => level.name === currentLevel)
    if (currentIndex < 0 || currentIndex >= dimension.levels.length - 1) return null
    return dimension.levels[currentIndex + 1]
  }

  function hasNextLevel(dimensionName: string, currentLevel: string) {
    return getNextLevel(dimensionName, currentLevel) !== null
  }

  function getDimensionHierarchy(dimensionName: string) {
    return cubeMetadata.value?.dimensions.find(item => item.name === dimensionName)?.levels ?? []
  }

  function resetPivotConfig() {
    querySequence += 1
    previewSequence += 1
    pivotConfig.value = { rows: [], columns: [], measures: [], filters: [] }
    expandedItems.value = {}
    queryResult.value = null
    generatedSQL.value = ''
    queryError.value = null
    previewError.value = null
  }

  async function selectCube(cubeName: string): Promise<boolean> {
    const sequence = ++cubeSelectionSequence
    cubeSelectionLoading.value = true
    cubeSelectionError.value = null
    try {
      const metadata = await olapApi.getCubeMetadata(cubeName)
      if (sequence !== cubeSelectionSequence) return false
      currentCube.value = cubeName
      cubeMetadata.value = metadata
      resetPivotConfig()
      return true
    } catch (cause: unknown) {
      if (sequence !== cubeSelectionSequence) return false
      cubeSelectionError.value = describeOlapError(cause)
      throw cause
    } finally {
      if (sequence === cubeSelectionSequence) cubeSelectionLoading.value = false
    }
  }

  async function loadCubes() {
    const sequence = ++cubeListSequence
    cubeListLoading.value = true
    cubeListError.value = null
    try {
      const response = await olapApi.getCubes()
      if (sequence !== cubeListSequence) return response
      cubes.value = response.cubes

      if (!cubes.value.length) {
        cubeSelectionSequence += 1
        currentCube.value = null
        cubeMetadata.value = null
        cubeSelectionError.value = null
        cubeSelectionLoading.value = false
        resetPivotConfig()
      } else if (!currentCube.value || !cubes.value.includes(currentCube.value)) {
        void selectCube(cubes.value[0]).catch(() => undefined)
      }
      return response
    } catch (cause: unknown) {
      if (sequence !== cubeListSequence) return null
      cubeListError.value = describeOlapError(cause)
      throw cause
    } finally {
      if (sequence === cubeListSequence) cubeListLoading.value = false
    }
  }

  function commitCubeDeletion(cubeName?: string): void {
    if (cubeName === undefined) {
      cubes.value = []
    } else {
      cubes.value = cubes.value.filter(item => item !== cubeName)
    }
    if (cubeName !== undefined && currentCube.value !== cubeName) return

    cubeSelectionSequence += 1
    currentCube.value = null
    cubeMetadata.value = null
    cubeSelectionError.value = null
    cubeSelectionLoading.value = false
    resetPivotConfig()
  }

  async function uploadSchema(file: File) {
    const metadata = await olapApi.uploadSchema(file)
    await loadCubes()
    return metadata
  }

  async function uploadSchemaText(xmlContent: string) {
    const metadata = await olapApi.uploadSchemaText(xmlContent)
    await loadCubes()
    return metadata
  }

  function addToRows(field: PivotField) {
    if (!pivotConfig.value.rows.some(item =>
      item.dimension === field.dimension && item.level === field.level)) {
      pivotConfig.value.rows.push({ ...field })
    }
  }

  function addToColumns(field: PivotField) {
    if (!pivotConfig.value.columns.some(item =>
      item.dimension === field.dimension && item.level === field.level)) {
      pivotConfig.value.columns.push({ ...field })
    }
  }

  function addMeasure(measure: PivotMeasure) {
    if (!pivotConfig.value.measures.some(item => item.name === measure.name)) {
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

  function addFilter(filter: PivotFilter) {
    pivotConfig.value.filters.push(filter)
  }

  function removeFilter(index: number) {
    pivotConfig.value.filters.splice(index, 1)
  }

  function buildDrillDownConfig(): PivotConfig {
    const config: PivotConfig = {
      rows: [...pivotConfig.value.rows],
      columns: [...pivotConfig.value.columns],
      measures: [...pivotConfig.value.measures],
      filters: [...pivotConfig.value.filters],
    }

    for (const key of Object.keys(expandedItems.value)) {
      const [type, dimensionName, level, value] = key.split(':')
      const nextLevel = getNextLevel(dimensionName, level)
      if (!nextLevel) continue

      const fields = type === 'col' ? config.columns : type === 'row' ? config.rows : null
      if (!fields) continue
      const exists = fields.some(field =>
        field.dimension === dimensionName && field.level === nextLevel.name)
      if (!exists) {
        const currentIndex = fields.findIndex(field =>
          field.dimension === dimensionName && field.level === level)
        if (currentIndex >= 0) {
          fields.splice(currentIndex + 1, 0, {
            dimension: dimensionName,
            level: nextLevel.name,
          })
        }
      }
      config.filters.push({
        dimension: dimensionName,
        level,
        operator: '=',
        values: [value],
      })
    }
    return config
  }

  async function executePivotQuery() {
    expandedItems.value = {}
    return executePivotQueryWithDrillDown()
  }

  async function executePivotQueryWithDrillDown() {
    const cubeName = currentCube.value
    if (!cubeName) {
      queryError.value = '큐브를 선택해주세요.'
      return null
    }

    const sequence = ++querySequence
    queryLoading.value = true
    queryError.value = null
    try {
      const result = await olapApi.executePivotQuery({
        cube_name: cubeName,
        ...buildDrillDownConfig(),
      })
      if (sequence !== querySequence || cubeName !== currentCube.value) return null
      queryResult.value = result
      generatedSQL.value = result.sql
      queryError.value = result.error ?? null
      return result
    } catch (cause: unknown) {
      if (sequence === querySequence) queryError.value = describeOlapError(cause)
      return null
    } finally {
      if (sequence === querySequence) queryLoading.value = false
    }
  }

  async function previewSQL() {
    const cubeName = currentCube.value
    if (!cubeName) return ''

    const sequence = ++previewSequence
    previewLoading.value = true
    previewError.value = null
    try {
      const result = await olapApi.previewPivotSQL({
        cube_name: cubeName,
        ...buildDrillDownConfig(),
      })
      if (sequence !== previewSequence || cubeName !== currentCube.value) return ''
      generatedSQL.value = result.sql ?? ''
      previewError.value = result.error ?? null
      return generatedSQL.value
    } catch (cause: unknown) {
      if (sequence === previewSequence) previewError.value = describeOlapError(cause)
      return ''
    } finally {
      if (sequence === previewSequence) previewLoading.value = false
    }
  }

  async function executeNaturalQuery(question: string) {
    const cubeName = currentCube.value
    if (!cubeName) {
      queryError.value = '큐브를 선택해주세요.'
      return null
    }

    const sequence = ++querySequence
    queryLoading.value = true
    queryError.value = null
    try {
      const result = await olapApi.executeNL2SQL(question, cubeName)
      if (sequence !== querySequence || cubeName !== currentCube.value) return null
      queryResult.value = result
      generatedSQL.value = result.sql ?? ''
      queryError.value = result.error ?? null
      return result
    } catch (cause: unknown) {
      if (sequence === querySequence) queryError.value = describeOlapError(cause)
      throw cause
    } finally {
      if (sequence === querySequence) queryLoading.value = false
    }
  }

  async function executeETLSync(cubeName: string, forceFull = false) {
    syncLoading.value = true
    syncError.value = null
    etlSyncResult.value = null
    try {
      const result = await olapApi.executeETLSync(cubeName, forceFull)
      etlSyncResult.value = result
      if (result.status === 'failed') syncError.value = result.error || 'ETL 동기화에 실패했습니다.'
      return result
    } catch (cause: unknown) {
      syncError.value = describeOlapError(cause)
      etlSyncResult.value = { status: 'failed', error: syncError.value }
      throw cause
    } finally {
      syncLoading.value = false
    }
  }

  return {
    cubes,
    currentCube,
    cubeMetadata,
    cubeListLoading,
    cubeListError,
    cubeSelectionLoading,
    cubeSelectionError,
    queryLoading,
    queryError,
    previewLoading,
    previewError,
    syncLoading,
    syncError,
    pivotConfig,
    expandedItems,
    queryResult,
    generatedSQL,
    etlConfig,
    etlSyncResult,
    hasCubes,
    dimensions,
    measures,
    uploadSchema,
    uploadSchemaText,
    loadCubes,
    selectCube,
    commitCubeDeletion,
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
    hasNextLevel,
    getNextLevel,
    getDimensionHierarchy,
    buildDrillDownConfig,
  }
})
