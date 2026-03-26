<script setup lang="ts">
/**
 * CreateObjectTypeDialog.vue
 * 다양한 데이터 소스로 ObjectType 생성
 * - 자연어 쿼리 → SQL 생성 → 결과 컬럼이 ObjectType의 컬럼이 됨
 * - 직접 SQL 입력
 * - 직접 데이터 입력 (수동 테이블)
 * - Materialized View 생성 옵션
 * - 기존 ObjectType과의 연결 설정
 */
import { ref, computed, watch, onMounted } from 'vue'
import { Teleport } from 'vue'
import Text2SqlTab from '@/components/text2sql/Text2SqlTab.vue'
import { useReactStore } from '@/stores/text2sql'
import { useDatasourcesStore } from '@/stores/datasources'
import { IconX, IconCheck, IconDatabase, IconLink, IconPlus, IconTrash } from '@/components/icons'
import { objectExplorerApi } from '@/services/api'

// 데이터 소스 타입
type DataSourceType = 'natural-language' | 'direct-sql' | 'manual-input'

// 타입 정의
interface ObjectTypeInfo {
  id: string
  name: string
  description?: string
  columns?: Array<{ name: string; type: string }>
}

interface RelationConfig {
  targetType: string
  targetColumn: string
  sourceColumn: string
  matchStrategy: 'EXACT_MATCH' | 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY'
}

// 수동 입력용 컬럼 정의
interface ManualColumn {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date'
}

// 수동 입력용 레코드
interface ManualRecord {
  [key: string]: string | number | boolean | null
}

const props = defineProps<{
  initialSql?: string
  initialQuestion?: string  // 원본 질문 (LLM 이름 생성용)
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', objectType: any): void
}>()

const reactStore = useReactStore()
const datasourcesStore = useDatasourcesStore()

// 상태
const step = ref<'source-select' | 'query' | 'sql-input' | 'manual-input' | 'configure'>('source-select')
const dataSourceType = ref<DataSourceType>('natural-language')
const objectTypeName = ref('')
const objectTypeDescription = ref('')
const createMindsDbView = ref(true)  // MindsDB에 VIEW 생성 (기본 활성화)
const isCreating = ref(false)
const createError = ref<string | null>(null)

// 직접 SQL 입력 관련
const directSqlInput = ref('')
const isExecutingSql = ref(false)
const sqlExecutionError = ref<string | null>(null)
const sqlResultColumns = ref<string[]>([])
const sqlResultRows = ref<any[]>([])
const selectedSqlDatasourceName = ref('')

// LLM 이름 생성 관련
const isGeneratingNames = ref(false)
const suggestedKoreanName = ref('')
const suggestedEnglishName = ref('')
const currentQuestion = ref('')  // 현재 질문 (재생성용)

// 수동 입력 관련
const manualColumns = ref<ManualColumn[]>([{ name: '', type: 'string' }])
const manualRecords = ref<ManualRecord[]>([{}])

// 기존 ObjectType 연결 관련 상태
const existingObjectTypes = ref<ObjectTypeInfo[]>([])
const selectedParentTypes = ref<string[]>([])  // 연결할 ObjectType 목록
const relationConfigs = ref<RelationConfig[]>([])  // 관계 설정
const isLoadingObjectTypes = ref(false)
const showRelationConfig = ref(false)  // 관계 설정 패널 표시 여부

// reactStore에서 결과 가져오기
const hasResult = computed(() => {
  if (dataSourceType.value === 'natural-language') {
    return reactStore.executionResult && 
           reactStore.executionResult.rows && 
           reactStore.executionResult.rows.length > 0
  } else if (dataSourceType.value === 'direct-sql') {
    return sqlResultColumns.value.length > 0
  } else if (dataSourceType.value === 'manual-input') {
    return manualColumns.value.filter(c => c.name.trim()).length > 0
  }
  return false
})

const resultColumns = computed(() => {
  if (dataSourceType.value === 'natural-language') {
    return reactStore.executionResult?.columns || []
  } else if (dataSourceType.value === 'direct-sql') {
    return sqlResultColumns.value
  } else if (dataSourceType.value === 'manual-input') {
    return manualColumns.value.filter(c => c.name.trim()).map(c => c.name)
  }
  return []
})

const resultRowCount = computed(() => {
  if (dataSourceType.value === 'natural-language') {
    return reactStore.executionResult?.row_count || 0
  } else if (dataSourceType.value === 'direct-sql') {
    return sqlResultRows.value.length
  } else if (dataSourceType.value === 'manual-input') {
    return manualRecords.value.filter(r => Object.values(r).some(v => v !== null && v !== '')).length
  }
  return 0
})

const generatedSql = computed(() => {
  if (dataSourceType.value === 'natural-language') {
    return reactStore.finalSql || ''
  } else if (dataSourceType.value === 'direct-sql') {
    return directSqlInput.value
  }
  return ''
})

// 결과가 나오면 자동으로 설정 단계로 이동
watch(hasResult, (has) => {
  if (has && step.value === 'query') {
    step.value = 'configure'
    // 기본 이름 제안
    if (!objectTypeName.value) {
      objectTypeName.value = suggestObjectTypeName()
    }
  }
})

// 데이터 소스 선택 후 다음 단계로 이동
function selectDataSource(type: DataSourceType) {
  dataSourceType.value = type
  if (type === 'natural-language') {
    step.value = 'query'
  } else if (type === 'direct-sql') {
    step.value = 'sql-input'
  } else if (type === 'manual-input') {
    step.value = 'manual-input'
    createMindsDbView.value = false  // 수동 입력은 View 생성 안함
  }
}

function normalizeDatasourceToken(token?: string | null): string {
  return String(token || '')
    .trim()
    .replace(/^[`'"]+/, '')
    .replace(/[`'"]+$/, '')
}

// SQL에서 datasource를 자동 감지
function detectDatasourceFromSql(sql: string): string | null {
  const patterns = [
    // MindsDB federated query: FROM `postgresql` (SELECT ...)
    /(?:FROM|JOIN)\s+[`"]?([a-zA-Z_][\w-]*)[`"]?\s*\(/i,
    // datasource.schema.table
    /(?:FROM|JOIN)\s+[`"]?([a-zA-Z_][\w-]*)[`"]?\s*\.\s*[`"]?([a-zA-Z_][\w-]*)[`"]?\s*\.\s*[`"]?([a-zA-Z_][\w-]*)[`"]?/i
  ]

  for (const pattern of patterns) {
    const match = sql.match(pattern)
    if (match?.[1]) {
      return normalizeDatasourceToken(match[1])
    }
  }

  return null
}

const sqlDatasourceOptions = computed(() => {
  const options: Array<{ name: string; label: string }> = []
  const seen = new Set<string>()
  const detected = detectDatasourceFromSql(directSqlInput.value)

  if (detected) {
    seen.add(detected)
    options.push({
      name: detected,
      label: `${detected} (SQL에서 감지됨)`
    })
  }

  for (const ds of datasourcesStore.sortedDatasources) {
    if (seen.has(ds.name)) continue
    seen.add(ds.name)
    options.push({
      name: ds.name,
      label: ds.name
    })
  }

  return options
})

const resolvedSqlDatasourceName = computed(() => {
  const manual = normalizeDatasourceToken(selectedSqlDatasourceName.value)
  if (manual) return manual

  const detected = detectDatasourceFromSql(directSqlInput.value)
  if (detected) return detected

  const storeSelected = normalizeDatasourceToken(datasourcesStore.selectedDatasource?.name)
  if (storeSelected) return storeSelected

  if (datasourcesStore.datasources.length === 1) {
    return normalizeDatasourceToken(datasourcesStore.datasources[0]?.name)
  }

  return ''
})

const sqlDatasourceSelectModel = computed({
  get: () => resolvedSqlDatasourceName.value,
  set: (value: string) => {
    selectedSqlDatasourceName.value = value
  }
})

// 직접 SQL 실행
async function executeSql() {
  if (!directSqlInput.value.trim()) {
    sqlExecutionError.value = 'SQL을 입력해주세요'
    return
  }
  
  isExecutingSql.value = true
  sqlExecutionError.value = null
  
  try {
    const datasourceName = resolvedSqlDatasourceName.value || undefined
    if (!datasourceName) {
      throw new Error('데이터소스를 선택하거나 SQL에 datasource를 명시해주세요')
    }
    const response = await fetch('/api/gateway/text2sql/direct-sql/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: directSqlInput.value,
        datasource: datasourceName
      })
    })
    
    if (!response.ok) {
      let errorMsg = 'SQL 실행 실패'
      try {
        const errData = await response.json()
        errorMsg = errData.detail || errorMsg
      } catch {
        errorMsg = await response.text() || errorMsg
      }
      throw new Error(errorMsg)
    }
    
    // 스트리밍 응답 처리
    const text = await response.text()
    const lines = text.trim().split('\n')
    
    let columns: string[] = []
    let rows: any[][] = []
    
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const chunk = JSON.parse(line)
        if (chunk.event === 'result') {
          columns = chunk.columns || []
          rows = chunk.rows || []
        } else if (chunk.event === 'error') {
          throw new Error(chunk.message || 'SQL 실행 오류')
        } else if (chunk.type === 'columns' && chunk.data) {
          columns = chunk.data
        } else if (chunk.type === 'row' && chunk.data) {
          rows.push(chunk.data)
        } else if (chunk.type === 'error') {
          throw new Error(chunk.message || 'SQL 실행 오류')
        } else if (chunk.columns) {
          // 일반 JSON 응답 형식
          columns = chunk.columns
          rows = chunk.rows || []
        }
      } catch (parseErr) {
        // JSON 파싱 실패한 줄은 무시
        console.warn('JSON 파싱 실패:', line)
      }
    }
    
    sqlResultColumns.value = columns
    sqlResultRows.value = rows
    
    if (columns.length === 0) {
      throw new Error('결과 컬럼을 파싱할 수 없습니다')
    }
    
    // 설정 단계로 이동
    step.value = 'configure'
    if (!objectTypeName.value) {
      objectTypeName.value = 'CustomQuery'
    }
  } catch (err) {
    sqlExecutionError.value = err instanceof Error ? err.message : 'SQL 실행 실패'
  } finally {
    isExecutingSql.value = false
  }
}

// 수동 컬럼 추가
function addManualColumn() {
  manualColumns.value.push({ name: '', type: 'string' })
  // 기존 레코드에도 새 컬럼 추가
  manualRecords.value.forEach(r => {
    r[`col_${manualColumns.value.length - 1}`] = null
  })
}

// 수동 컬럼 삭제
function removeManualColumn(index: number) {
  if (manualColumns.value.length <= 1) return
  const removedName = manualColumns.value[index].name
  manualColumns.value.splice(index, 1)
  // 레코드에서 해당 컬럼 제거
  manualRecords.value.forEach(r => {
    delete r[removedName]
  })
}

// 수동 레코드 추가
function addManualRecord() {
  const newRecord: ManualRecord = {}
  manualColumns.value.forEach(col => {
    if (col.name) {
      newRecord[col.name] = null
    }
  })
  manualRecords.value.push(newRecord)
}

// 수동 레코드 삭제
function removeManualRecord(index: number) {
  if (manualRecords.value.length <= 1) return
  manualRecords.value.splice(index, 1)
}

// 수동 입력 완료 후 설정 단계로
function proceedFromManualInput() {
  const validColumns = manualColumns.value.filter(c => c.name.trim())
  if (validColumns.length === 0) {
    createError.value = '최소 1개 이상의 컬럼을 정의해주세요'
    return
  }
  step.value = 'configure'
  if (!objectTypeName.value) {
    objectTypeName.value = 'ManualType'
  }
}

// ObjectType 이름 제안
function suggestObjectTypeName(): string {
  const question = reactStore.currentQuestion || ''
  // 간단한 이름 추출 로직
  const words = question.split(/\s+/).filter(w => w.length > 2)
  if (words.length > 0) {
    return words[0].charAt(0).toUpperCase() + words[0].slice(1)
  }
  return 'NewObjectType'
}

// 이름 입력 시 공백을 "_"로 자동 대체
function handleNameInput(event: Event) {
  const input = event.target as HTMLInputElement
  // 공백을 "_"로 대체
  objectTypeName.value = input.value.replace(/\s+/g, '_')
}

// 기존 ObjectType 목록 로드
async function loadExistingObjectTypes() {
  isLoadingObjectTypes.value = true
  try {
    const response = await objectExplorerApi.getObjectTypes()
    existingObjectTypes.value = response.objectTypes
  } catch (err) {
    console.error('Failed to load object types:', err)
  } finally {
    isLoadingObjectTypes.value = false
  }
}

// ObjectType 선택/해제 토글
function toggleObjectType(typeName: string) {
  const index = selectedParentTypes.value.indexOf(typeName)
  if (index === -1) {
    selectedParentTypes.value.push(typeName)
    // 기본 관계 설정 추가
    const objType = existingObjectTypes.value.find(t => t.name === typeName)
    if (objType) {
      relationConfigs.value.push({
        targetType: typeName,
        targetColumn: '',
        sourceColumn: '',
        matchStrategy: 'EXACT_MATCH',
        cardinality: 'MANY_TO_ONE'
      })
    }
  } else {
    selectedParentTypes.value.splice(index, 1)
    // 관계 설정도 제거
    relationConfigs.value = relationConfigs.value.filter(r => r.targetType !== typeName)
  }
}

// 선택된 ObjectType의 컬럼 가져오기
function getColumnsForType(typeName: string): string[] {
  const objType = existingObjectTypes.value.find(t => t.name === typeName)
  return objType?.columns?.map(c => c.name) || []
}

// 연결된 ObjectType 정보 (Text2SqlTab에 전달)
const linkedObjectTypesInfo = computed(() => {
  return selectedParentTypes.value.map(typeName => {
    const objType = existingObjectTypes.value.find(t => t.name === typeName)
    return {
      name: typeName,
      columns: objType?.columns || [],
      description: objType?.description || ''
    }
  })
})

// 이전 단계로 돌아가기
function goBack() {
  if (step.value === 'configure') {
    if (dataSourceType.value === 'natural-language') {
      step.value = 'query'
    } else if (dataSourceType.value === 'direct-sql') {
      step.value = 'sql-input'
    } else if (dataSourceType.value === 'manual-input') {
      step.value = 'manual-input'
    }
  } else if (step.value === 'query' || step.value === 'sql-input' || step.value === 'manual-input') {
    step.value = 'source-select'
  }
}

// ObjectType 생성
async function createObjectType() {
  if (!objectTypeName.value.trim()) {
    createError.value = 'ObjectType 이름을 입력해주세요'
    return
  }
  
  // 수동 입력이 아닌 경우 SQL 필요
  if (dataSourceType.value !== 'manual-input' && !generatedSql.value) {
    createError.value = 'SQL 쿼리가 없습니다'
    return
  }
  
  isCreating.value = true
  createError.value = null
  
  try {
    let requestBody: any = {
      name: objectTypeName.value,
      description: objectTypeDescription.value,
      dataSourceType: dataSourceType.value,
      columns: resultColumns.value.map((col, idx) => ({
        name: col,
        type: dataSourceType.value === 'manual-input' 
          ? manualColumns.value[idx]?.type || 'string'
          : 'string'
      }))
    }
    
    if (dataSourceType.value === 'manual-input') {
      // 수동 입력: 실제 테이블 생성 (View가 아님)
      requestBody.dataSourceType = 'manual'
      requestBody.createMindsDbView = false
      requestBody.createMaterializedView = false
      // 초기 레코드 데이터
      const validRecords = manualRecords.value.filter(r => 
        Object.values(r).some(v => v !== null && v !== '')
      )
      requestBody.initialRecords = validRecords
    } else {
      // 자연어 또는 직접 SQL: SQL 기반 생성
      requestBody.query = generatedSql.value
      requestBody.sourceQuestion = dataSourceType.value === 'natural-language' 
        ? reactStore.currentQuestion 
        : undefined
      requestBody.createMindsDbView = createMindsDbView.value  // MindsDB View 생성
      requestBody.createMaterializedView = false  // PostgreSQL MV는 비활성화
      // LLM이 생성한 영문 View 이름 사용
      if (suggestedEnglishName.value) {
        requestBody.viewName = suggestedEnglishName.value
      }
    }
    
    // 1. ObjectType을 Neo4j에 저장
    const response = await fetch('/api/gateway/ontology/object-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    
    if (!response.ok) {
      const errData = await response.json()
      throw new Error(errData.detail || 'ObjectType 생성 실패')
    }
    
    const result = await response.json()
    
    // 2. 관계 생성 (선택된 ObjectType들과 연결)
    for (const relConfig of relationConfigs.value) {
      if (relConfig.sourceColumn && relConfig.targetColumn) {
        try {
          await fetch('/api/gateway/ontology/relationships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceType: relConfig.targetType,  // 부모 ObjectType
              targetType: objectTypeName.value,   // 새로 생성된 ObjectType
              sourceColumn: relConfig.targetColumn,
              targetColumn: relConfig.sourceColumn,
              matchStrategy: relConfig.matchStrategy,
              cardinality: relConfig.cardinality === 'MANY_TO_ONE' ? 'ONE_TO_MANY' : relConfig.cardinality
            })
          })
        } catch (relErr) {
          console.error('관계 생성 실패:', relErr)
        }
      }
    }
    
    emit('created', result)
    
  } catch (err) {
    createError.value = err instanceof Error ? err.message : 'ObjectType 생성 실패'
  } finally {
    isCreating.value = false
  }
}

// 이름 재생성
async function regenerateNames() {
  if (currentQuestion.value && directSqlInput.value) {
    await generateNamesFromQuestion(currentQuestion.value, directSqlInput.value)
  }
}

// LLM을 통해 ObjectType 이름 생성
async function generateNamesFromQuestion(question: string, sql: string) {
  if (!question || isGeneratingNames.value) return
  
  currentQuestion.value = question  // 재생성용으로 저장
  isGeneratingNames.value = true
  try {
    console.log('[CreateObjectTypeDialog] LLM 이름 생성 시작:', question)
    
    const response = await fetch('/api/gateway/ontology/generate-object-type-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question,
        sql: sql,
        columns: sqlResultColumns.value
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      console.log('[CreateObjectTypeDialog] LLM 이름 생성 결과:', result)
      
      if (result.korean_name) {
        suggestedKoreanName.value = result.korean_name
        objectTypeName.value = result.korean_name
      }
      if (result.english_name) {
        suggestedEnglishName.value = result.english_name
      }
      if (result.description) {
        objectTypeDescription.value = result.description
      }
    } else {
      console.warn('[CreateObjectTypeDialog] LLM 이름 생성 실패:', await response.text())
    }
  } catch (err) {
    console.error('[CreateObjectTypeDialog] LLM 이름 생성 오류:', err)
  } finally {
    isGeneratingNames.value = false
  }
}

// 컴포넌트 마운트 시 ObjectType 목록 로드 및 초기 SQL 처리
onMounted(async () => {
  console.log('[CreateObjectTypeDialog] 마운트됨, initialSql:', !!props.initialSql, 'initialQuestion:', props.initialQuestion)
  
  loadExistingObjectTypes()

  if (!datasourcesStore.hasDatasources) {
    await datasourcesStore.fetchDatasources()
  }
  
  // 초기 SQL이 전달되면 SQL 입력 모드로 자동 전환
  if (props.initialSql) {
    console.log('[CreateObjectTypeDialog] 초기 SQL 전달받음:', props.initialSql.substring(0, 100))
    dataSourceType.value = 'direct-sql'
    directSqlInput.value = props.initialSql
    step.value = 'sql-input'
    
    // 초기 질문이 있으면 LLM으로 이름 생성
    if (props.initialQuestion) {
      console.log('[CreateObjectTypeDialog] 초기 질문 전달받음:', props.initialQuestion)
      currentQuestion.value = props.initialQuestion
      
      // SQL 실행과 이름 생성을 병렬로 진행
      // 1. SQL 실행
      executeSql().then(() => {
        console.log('[CreateObjectTypeDialog] SQL 실행 완료, step:', step.value, '컬럼:', sqlResultColumns.value)
      }).catch((err: unknown) => {
        console.error('[CreateObjectTypeDialog] SQL 실행 오류:', err)
      })
      
      // 2. 이름 생성 (SQL 실행과 병렬로)
      console.log('[CreateObjectTypeDialog] 이름 생성 시작 (병렬)')
      generateNamesFromQuestion(props.initialQuestion, props.initialSql).catch(err => {
        console.error('[CreateObjectTypeDialog] 이름 생성 오류:', err)
      })
    }
  }
})
</script>

<template>
  <Teleport to="body">
    <div class="dialog-overlay" @click.self="$emit('close')">
      <div class="dialog-container">
        <!-- 헤더 -->
        <div class="dialog-header">
          <div class="header-title">
            <span class="dialog-icon">🗂️</span>
            <h2>새 ObjectType 생성</h2>
          </div>
          <button class="close-btn" @click="$emit('close')">
            <IconX :size="18" />
          </button>
        </div>
        
        <!-- 단계 표시 -->
        <div class="steps">
          <div class="step" :class="{ active: step === 'source-select', completed: step !== 'source-select' }">
            <span class="step-number">1</span>
            <span class="step-label">생성 방식</span>
          </div>
          <div class="step-connector"></div>
          <div class="step" :class="{ 
            active: step === 'query' || step === 'sql-input' || step === 'manual-input', 
            completed: step === 'configure' 
          }">
            <span class="step-number">2</span>
            <span class="step-label">
              {{ dataSourceType === 'natural-language' ? '자연어 검색' : 
                 dataSourceType === 'direct-sql' ? 'SQL 입력' : '데이터 입력' }}
            </span>
          </div>
          <div class="step-connector"></div>
          <div class="step" :class="{ active: step === 'configure' }">
            <span class="step-number">3</span>
            <span class="step-label">ObjectType 설정</span>
          </div>
        </div>
        
        <!-- 본문 -->
        <div class="dialog-body">
          <!-- Step 1: 데이터 소스 선택 -->
          <div v-if="step === 'source-select'" class="source-select-step">
            <p class="step-description">
              ObjectType 생성 방식을 선택하세요.
            </p>
            
            <div class="source-options">
              <!-- 옵션 1: 자연어 검색 -->
              <div class="source-option" @click="selectDataSource('natural-language')">
                <div class="option-icon">🔍</div>
                <div class="option-content">
                  <h3>자연어로 피지컬 레이어 검색</h3>
                  <p>자연어 질의를 통해 기존 데이터베이스에서 데이터를 검색하고 SQL을 자동 생성합니다.</p>
                </div>
                <div class="option-arrow">→</div>
              </div>
              
              <!-- 옵션 2: 직접 SQL 입력 -->
              <div class="source-option" @click="selectDataSource('direct-sql')">
                <div class="option-icon">📝</div>
                <div class="option-content">
                  <h3>SELECT 문 직접 입력</h3>
                  <p>기존에 보유한 SELECT SQL 문을 직접 입력하여 ObjectType을 생성합니다.</p>
                </div>
                <div class="option-arrow">→</div>
              </div>
              
              <!-- 옵션 3: 수동 데이터 입력 -->
              <div class="source-option" @click="selectDataSource('manual-input')">
                <div class="option-icon">✏️</div>
                <div class="option-content">
                  <h3>직접 데이터 입력</h3>
                  <p>컬럼을 직접 정의하고 데이터를 수동으로 입력합니다. 실제 테이블이 생성됩니다.</p>
                </div>
                <div class="option-arrow">→</div>
              </div>
            </div>
          </div>
          
          <!-- Step 2a: 자연어 쿼리 -->
          <div v-else-if="step === 'query'" class="query-step">
            <p class="step-description">
              자연어로 데이터를 검색하세요. 검색 결과의 컬럼이 ObjectType의 속성이 됩니다.
            </p>
            
            <!-- 연결할 ObjectType 선택 -->
            <div class="link-section">
              <div class="link-header" @click="showRelationConfig = !showRelationConfig">
                <IconLink :size="16" />
                <span>연결할 ObjectType 선택</span>
                <span class="badge" v-if="selectedParentTypes.length > 0">{{ selectedParentTypes.length }}</span>
                <span class="toggle-icon">{{ showRelationConfig ? '▲' : '▼' }}</span>
              </div>
              
              <div v-if="showRelationConfig" class="link-content">
                <p class="link-hint">
                  연결할 ObjectType을 선택하면 해당 객체의 속성을 기반으로 correlation 컬럼을 자동으로 찾습니다.
                </p>
                
                <div v-if="isLoadingObjectTypes" class="loading-types">
                  <span class="spinner-small"></span>
                  <span>ObjectType 로딩 중...</span>
                </div>
                
                <div v-else class="object-type-list">
                  <div 
                    v-for="objType in existingObjectTypes" 
                    :key="objType.id"
                    class="object-type-item"
                    :class="{ selected: selectedParentTypes.includes(objType.name) }"
                    @click="toggleObjectType(objType.name)"
                  >
                    <input 
                      type="checkbox" 
                      :checked="selectedParentTypes.includes(objType.name)"
                      @click.stop
                      @change="toggleObjectType(objType.name)"
                    />
                    <div class="type-info">
                      <span class="type-name">{{ objType.name }}</span>
                      <span class="type-desc" v-if="objType.description">{{ objType.description }}</span>
                      <span class="type-columns" v-if="objType.columns">
                        {{ objType.columns.length }}개 속성
                      </span>
                    </div>
                  </div>
                  
                  <div v-if="existingObjectTypes.length === 0" class="no-types">
                    등록된 ObjectType이 없습니다.
                  </div>
                </div>
              </div>
            </div>
            
            <Text2SqlTab 
              class="embedded-text2sql" 
              :embedded="true"
              :linked-object-types="linkedObjectTypesInfo"
            />
          </div>
          
          <!-- Step 2b: 직접 SQL 입력 -->
          <div v-else-if="step === 'sql-input'" class="sql-input-step">
            <p class="step-description">
              SELECT SQL 문과 실행할 데이터소스를 확인하세요. 결과 컬럼이 ObjectType의 속성이 됩니다.
            </p>
            
            <div class="sql-editor-container">
              <textarea 
                v-model="directSqlInput"
                class="sql-editor"
                placeholder="SELECT column1, column2, ...&#10;FROM datasource.schema.table&#10;WHERE ..."
                rows="10"
              ></textarea>
              
              <!-- 데이터소스 선택 또는 자동 감지 -->
              <div class="datasource-selector">
                <label class="ds-select-label" for="objecttype-sql-datasource">데이터소스</label>
                <select
                  id="objecttype-sql-datasource"
                  v-model="sqlDatasourceSelectModel"
                  class="ds-select"
                >
                  <option value="">-- 데이터소스 선택 --</option>
                  <option
                    v-for="option in sqlDatasourceOptions"
                    :key="option.name"
                    :value="option.name"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <span v-if="resolvedSqlDatasourceName" class="ds-name">
                  사용 데이터소스: <strong>{{ resolvedSqlDatasourceName }}</strong>
                </span>
                <span v-else class="ds-warning">
                  데이터소스를 선택하거나 SQL에 datasource를 명시해주세요
                </span>
              </div>
              
              <div v-if="sqlExecutionError" class="error-message">
                {{ sqlExecutionError }}
              </div>
              
              <div class="sql-actions">
                <button 
                  class="execute-btn"
                  @click="executeSql"
                  :disabled="isExecutingSql || !directSqlInput.trim() || !resolvedSqlDatasourceName"
                >
                  <span v-if="isExecutingSql" class="spinner"></span>
                  <span>{{ isExecutingSql ? '실행 중...' : 'SQL 실행' }}</span>
                </button>
              </div>
              
              <!-- SQL 결과 미리보기 -->
              <div v-if="sqlResultColumns.length > 0" class="sql-preview-result">
                <h4>실행 결과 ({{ sqlResultRows.length }}건)</h4>
                <div class="preview-table-container">
                  <table class="preview-table">
                    <thead>
                      <tr>
                        <th v-for="col in sqlResultColumns" :key="col">{{ col }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, idx) in sqlResultRows.slice(0, 5)" :key="idx">
                        <td v-for="col in sqlResultColumns" :key="col">{{ row[col] }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p v-if="sqlResultRows.length > 5" class="preview-more">
                    ... 외 {{ sqlResultRows.length - 5 }}건 더
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Step 2c: 수동 데이터 입력 -->
          <div v-else-if="step === 'manual-input'" class="manual-input-step">
            <p class="step-description">
              ObjectType의 컬럼을 정의하고 데이터를 입력하세요. 실제 테이블이 PostgreSQL에 생성됩니다.
            </p>
            
            <!-- 컬럼 정의 -->
            <div class="manual-section">
              <h3>
                컬럼 정의
                <button class="add-btn" @click="addManualColumn" title="컬럼 추가">
                  <IconPlus :size="14" />
                </button>
              </h3>
              
              <div class="columns-definition">
                <div v-for="(col, idx) in manualColumns" :key="idx" class="column-def-row">
                  <input 
                    v-model="col.name" 
                    type="text" 
                    placeholder="컬럼명"
                    class="column-name-input"
                  />
                  <select v-model="col.type" class="column-type-select">
                    <option value="string">문자열</option>
                    <option value="number">숫자</option>
                    <option value="boolean">불린</option>
                    <option value="date">날짜</option>
                  </select>
                  <button 
                    class="remove-btn" 
                    @click="removeManualColumn(idx)"
                    :disabled="manualColumns.length <= 1"
                  >
                    <IconTrash :size="14" />
                  </button>
                </div>
              </div>
            </div>
            
            <!-- 데이터 입력 -->
            <div class="manual-section">
              <h3>
                데이터 입력
                <button class="add-btn" @click="addManualRecord" title="행 추가">
                  <IconPlus :size="14" />
                </button>
              </h3>
              
              <div class="records-table-container">
                <table class="records-table">
                  <thead>
                    <tr>
                      <th v-for="col in manualColumns.filter(c => c.name.trim())" :key="col.name">
                        {{ col.name }}
                      </th>
                      <th class="action-col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(record, rIdx) in manualRecords" :key="rIdx">
                      <td v-for="col in manualColumns.filter(c => c.name.trim())" :key="col.name">
                        <input 
                          v-model="record[col.name]"
                          :type="col.type === 'number' ? 'number' : 'text'"
                          :placeholder="col.type"
                          class="record-input"
                        />
                      </td>
                      <td class="action-col">
                        <button 
                          class="remove-row-btn"
                          @click="removeManualRecord(rIdx)"
                          :disabled="manualRecords.length <= 1"
                        >
                          <IconTrash :size="12" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <div class="manual-actions">
              <button 
                class="proceed-btn"
                @click="proceedFromManualInput"
                :disabled="manualColumns.filter(c => c.name.trim()).length === 0"
              >
                다음 단계로
              </button>
            </div>
          </div>
          
          <!-- Step 3: ObjectType 설정 -->
          <div v-else-if="step === 'configure'" class="configure-step">
            <div class="result-summary">
              <IconDatabase :size="20" />
              <span>
                {{ dataSourceType === 'manual-input' ? '수동 입력' : '쿼리 결과' }}: 
                <strong>{{ resultRowCount }}</strong>건, <strong>{{ resultColumns.length }}</strong>개 컬럼
              </span>
            </div>
            
            <div class="form-section">
              <h3>ObjectType 정보</h3>
              
              <div class="form-row name-input-row">
                <label>이름 <span class="required">*</span></label>
                <div class="name-input-wrapper">
                  <input 
                    :value="objectTypeName"
                    @input="handleNameInput"
                    type="text" 
                    placeholder="예: 정수장, 수질측정소..."
                    :disabled="isGeneratingNames"
                    :class="{ generating: isGeneratingNames }"
                  />
                  <!-- 로딩 스피너 (입력란 내부) -->
                  <span v-if="isGeneratingNames" class="input-spinner">
                    <span class="spinner-small"></span>
                  </span>
                  <!-- 재생성 버튼 -->
                  <button 
                    v-if="currentQuestion && !isGeneratingNames"
                    class="regenerate-btn"
                    @click="regenerateNames"
                    title="AI로 이름 다시 생성"
                  >
                    🔄 재생성
                  </button>
                </div>
                <span v-if="isGeneratingNames" class="input-hint generating-hint">
                  ✨ AI가 적절한 이름을 생성 중...
                </span>
                <span v-else class="input-hint">공백은 자동으로 "_"로 변환됩니다</span>
              </div>
              
              <!-- LLM 제안 영문 View 이름 -->
              <div v-if="suggestedEnglishName && !isGeneratingNames" class="form-row suggested-name">
                <label>View 이름 (자동생성)</label>
                <div class="suggested-view-name">
                  <code>{{ suggestedEnglishName }}</code>
                  <span class="suggestion-hint">MindsDB에 생성될 View 이름입니다</span>
                </div>
              </div>
              
              <div class="form-row">
                <label>설명</label>
                <textarea 
                  v-model="objectTypeDescription" 
                  placeholder="ObjectType에 대한 설명..."
                  rows="2"
                  :disabled="isGeneratingNames"
                ></textarea>
              </div>
            </div>
            
            <div class="form-section">
              <h3>컬럼 (속성)</h3>
              <div class="columns-preview">
                <div v-for="col in resultColumns" :key="col" class="column-tag">
                  {{ col }}
                </div>
              </div>
            </div>
            
            <!-- 관계 설정 -->
            <div v-if="relationConfigs.length > 0" class="form-section">
              <h3>
                <IconLink :size="16" />
                ObjectType 연결 설정
              </h3>
              <p class="section-hint">선택한 ObjectType과의 연결 컬럼을 설정하세요.</p>
              
              <div class="relation-configs">
                <div v-for="(config, idx) in relationConfigs" :key="config.targetType" class="relation-config-item">
                  <div class="relation-header">
                    <span class="relation-target">{{ config.targetType }}</span>
                    <span class="relation-arrow">→</span>
                    <span class="relation-source">{{ objectTypeName || '새 ObjectType' }}</span>
                  </div>
                  
                  <div class="relation-fields">
                    <div class="field-group">
                      <label>{{ config.targetType }} 컬럼</label>
                      <select v-model="relationConfigs[idx].targetColumn">
                        <option value="">-- 선택 --</option>
                        <option 
                          v-for="col in getColumnsForType(config.targetType)" 
                          :key="col" 
                          :value="col"
                        >{{ col }}</option>
                      </select>
                    </div>
                    
                    <div class="field-group">
                      <label>{{ objectTypeName || '새 ObjectType' }} 컬럼</label>
                      <select v-model="relationConfigs[idx].sourceColumn">
                        <option value="">-- 선택 --</option>
                        <option v-for="col in resultColumns" :key="col" :value="col">{{ col }}</option>
                      </select>
                    </div>
                    
                    <div class="field-group">
                      <label>매칭 방식</label>
                      <select v-model="relationConfigs[idx].matchStrategy">
                        <option value="EXACT_MATCH">정확히 일치</option>
                        <option value="CONTAINS">포함</option>
                        <option value="STARTS_WITH">시작 문자열</option>
                        <option value="ENDS_WITH">끝 문자열</option>
                      </select>
                    </div>
                    
                    <div class="field-group">
                      <label>관계 유형</label>
                      <select v-model="relationConfigs[idx].cardinality">
                        <option value="MANY_TO_ONE">N:1 (다대일)</option>
                        <option value="ONE_TO_ONE">1:1 (일대일)</option>
                        <option value="ONE_TO_MANY">1:N (일대다)</option>
                        <option value="MANY_TO_MANY">N:N (다대다)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- MindsDB View (수동 입력이 아닌 경우만) -->
            <div v-if="dataSourceType !== 'manual-input'" class="form-section">
              <h3>View 생성</h3>
              <label class="checkbox-label">
                <input type="checkbox" v-model="createMindsDbView" />
                <span>MindsDB에 View 생성 (데이터 동기화 자동 지원)</span>
              </label>
              <p v-if="createMindsDbView" class="hint-text">
                MindsDB에 {{ suggestedEnglishName || ('mv_' + (objectTypeName || 'ObjectType명')) }} View가 생성됩니다.
              </p>
            </div>
            
            <!-- 수동 입력인 경우 테이블 생성 안내 -->
            <div v-if="dataSourceType === 'manual-input'" class="form-section">
              <h3>테이블 생성</h3>
              <p class="hint-text">
                PostgreSQL에 실제 테이블 "{{ objectTypeName || 'ObjectType명' }}"이 생성되며, 
                입력한 {{ manualRecords.filter(r => Object.values(r).some(v => v !== null && v !== '')).length }}개 레코드가 저장됩니다.
              </p>
            </div>
            
            <!-- SQL 미리보기 (수동 입력이 아닌 경우만) -->
            <div v-if="dataSourceType !== 'manual-input' && generatedSql" class="form-section">
              <h3>생성된 SQL</h3>
              <pre class="sql-preview">{{ generatedSql }}</pre>
            </div>
            
            <div v-if="createError" class="error-message">
              {{ createError }}
            </div>
          </div>
        </div>
        
        <!-- 푸터 -->
        <div class="dialog-footer">
          <button 
            v-if="step !== 'source-select'" 
            class="back-btn" 
            @click="goBack"
          >
            이전
          </button>
          <div class="spacer"></div>
          <button 
            v-if="step === 'configure'"
            class="create-btn" 
            @click="createObjectType"
            :disabled="isCreating || !objectTypeName"
          >
            <span v-if="isCreating" class="spinner"></span>
            <IconCheck v-else :size="16" />
            <span>{{ isCreating ? '생성 중...' : 'ObjectType 생성' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog-container {
  width: 95%;
  max-width: 1200px;
  height: 90%;
  max-height: 90vh;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .dialog-icon {
      font-size: 1.5rem;
    }
    
    h2 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-bright);
    }
  }
  
  .close-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
    }
  }
}

.steps {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .step-number {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--color-bg-secondary);
      border: 2px solid var(--color-border);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }
    
    .step-label {
      font-size: 0.9rem;
      color: var(--color-text-muted);
    }
    
    &.active {
      .step-number {
        background: linear-gradient(135deg, #00d4aa, #00a8cc);
        border-color: transparent;
        color: white;
      }
      
      .step-label {
        color: var(--color-text-bright);
        font-weight: 500;
      }
    }
    
    &.completed {
      .step-number {
        background: #00d4aa;
        border-color: transparent;
        color: white;
      }
    }
  }
  
  .step-connector {
    width: 60px;
    height: 2px;
    background: var(--color-border);
    margin: 0 16px;
  }
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  
  .step-description {
    padding: 16px 24px;
    margin: 0;
    background: rgba(0, 212, 170, 0.1);
    color: var(--color-text-light);
    font-size: 0.9rem;
  }
  
  // 소스 선택 단계
  .source-select-step {
    padding: 24px;
    
    .source-options {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 8px;
    }
    
    .source-option {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 24px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover {
        border-color: #00d4aa;
        background: rgba(0, 212, 170, 0.05);
        
        .option-arrow {
          transform: translateX(4px);
          color: #00d4aa;
        }
      }
      
      .option-icon {
        font-size: 2rem;
        width: 50px;
        text-align: center;
      }
      
      .option-content {
        flex: 1;
        
        h3 {
          margin: 0 0 6px;
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text-bright);
        }
        
        p {
          margin: 0;
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }
      }
      
      .option-arrow {
        font-size: 1.5rem;
        color: var(--color-text-muted);
        transition: all 0.2s;
      }
    }
  }
  
  // 자연어 쿼리 단계
  .query-step {
    height: 100%;
    display: flex;
    flex-direction: column;
    
    .embedded-text2sql {
      flex: 1;
    }
  }
  
  // 직접 SQL 입력 단계
  .sql-input-step {
    padding: 24px;
    
    .sql-editor-container {
      margin-top: 16px;
    }
    
    .sql-editor {
      width: 100%;
      min-height: 200px;
      padding: 16px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      font-family: 'Fira Code', monospace;
      font-size: 0.9rem;
      color: var(--color-text-bright);
      resize: vertical;
      
      &:focus {
        outline: none;
        border-color: #00d4aa;
      }
    }
    
    .sql-actions {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
    
    .execute-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 24px;
      background: linear-gradient(135deg, #00d4aa, #00a8cc);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
    
    .sql-preview-result {
      margin-top: 24px;
      
      h4 {
        margin: 0 0 12px;
        font-size: 0.9rem;
        color: var(--color-text-bright);
      }
    }
    
    .preview-table-container {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: 8px;
    }
    
    .preview-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      
      th, td {
        padding: 10px 14px;
        text-align: left;
        border-bottom: 1px solid var(--color-border);
      }
      
      th {
        background: var(--color-bg-tertiary);
        color: var(--color-text-light);
        font-weight: 600;
      }
      
      td {
        color: var(--color-text-light);
      }
    }
    
    .preview-more {
      margin: 8px 0 0;
      font-size: 0.8rem;
      color: var(--color-text-muted);
      text-align: center;
    }
  }
  
  // 수동 입력 단계
  .manual-input-step {
    padding: 24px;
    
    .manual-section {
      margin-bottom: 24px;
      
      h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 12px;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--color-text-bright);
      }
    }
    
    .add-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: #00d4aa;
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      
      &:hover {
        background: #00b89a;
      }
    }
    
    .columns-definition {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .column-def-row {
      display: flex;
      gap: 8px;
      align-items: center;
      
      .column-name-input {
        flex: 1;
        padding: 8px 12px;
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        color: var(--color-text-bright);
        font-size: 0.9rem;
        
        &:focus {
          outline: none;
          border-color: #00d4aa;
        }
      }
      
      .column-type-select {
        width: 120px;
        padding: 8px 12px;
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        color: var(--color-text-bright);
        font-size: 0.85rem;
      }
      
      .remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        color: var(--color-text-muted);
        cursor: pointer;
        
        &:hover:not(:disabled) {
          border-color: #f87171;
          color: #f87171;
        }
        
        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }
    }
    
    .records-table-container {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .records-table {
      width: 100%;
      border-collapse: collapse;
      
      th, td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--color-border);
      }
      
      th {
        background: var(--color-bg-tertiary);
        color: var(--color-text-light);
        font-weight: 600;
        font-size: 0.85rem;
        position: sticky;
        top: 0;
      }
      
      .action-col {
        width: 40px;
        text-align: center;
      }
      
      .record-input {
        width: 100%;
        padding: 6px 10px;
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        color: var(--color-text-bright);
        font-size: 0.85rem;
        
        &:focus {
          outline: none;
          border-color: #00d4aa;
        }
      }
      
      .remove-row-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        
        &:hover:not(:disabled) {
          color: #f87171;
        }
        
        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }
    }
    
    .manual-actions {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
    
    .proceed-btn {
      padding: 10px 24px;
      background: linear-gradient(135deg, #00d4aa, #00a8cc);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }
  
  // 설정 단계
  .configure-step {
    padding: 24px;
  }
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  background: rgba(0, 212, 170, 0.1);
  border: 1px solid rgba(0, 212, 170, 0.3);
  border-radius: 10px;
  margin-bottom: 24px;
  color: var(--color-text-light);
  
  strong {
    color: #00d4aa;
  }
}

.form-section {
  margin-bottom: 24px;
  
  h3 {
    margin: 0 0 12px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
}

.form-row {
  margin-bottom: 12px;
  
  label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.85rem;
    color: var(--color-text-light);
    
    .required {
      color: #f87171;
    }
  }
  
  input, textarea {
    width: 100%;
    padding: 10px 14px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-bright);
    font-size: 0.9rem;
    
    &:focus {
      outline: none;
      border-color: #00d4aa;
    }
  }
  
  textarea {
    resize: vertical;
  }
  
  .input-hint {
    display: block;
    margin-top: 4px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
}

// 이름 입력란 래퍼
.name-input-row {
  .name-input-wrapper {
    display: flex;
    gap: 8px;
    align-items: center;
    position: relative;
    
    input {
      flex: 1;
      padding-right: 40px;
      
      &.generating {
        background: rgba(16, 185, 129, 0.05);
        border-color: rgba(16, 185, 129, 0.3);
        color: var(--color-text-muted);
      }
    }
    
    .input-spinner {
      position: absolute;
      right: 110px;
      display: flex;
      align-items: center;
      
      .spinner-small {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(16, 185, 129, 0.3);
        border-top-color: #10b981;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
    }
    
    .regenerate-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 6px;
      color: #818cf8;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      
      &:hover {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%);
        border-color: rgba(99, 102, 241, 0.5);
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2);
      }
    }
  }
  
  .generating-hint {
    color: #10b981 !important;
    animation: pulse 1.5s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

// LLM 제안 View 이름
.suggested-name {
  .suggested-view-name {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    code {
      display: inline-block;
      padding: 8px 14px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 6px;
      color: #10b981;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.9rem;
      font-weight: 600;
    }
    
    .suggestion-hint {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 8px;
  
  input[type="checkbox"] {
    width: 18px;
    height: 18px;
  }
  
  span {
    font-size: 0.9rem;
    color: var(--color-text-light);
  }
}

.hint-text {
  margin: 0;
  padding: 8px 12px;
  background: rgba(0, 212, 170, 0.1);
  border-radius: 6px;
  font-size: 0.8rem;
  color: #00d4aa;
}

// 연결 섹션 스타일
.link-section {
  margin: 0 24px 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  
  .link-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--color-bg-tertiary);
    cursor: pointer;
    
    &:hover {
      background: var(--color-bg-secondary);
    }
    
    .badge {
      padding: 2px 8px;
      background: #00d4aa;
      border-radius: 10px;
      font-size: 0.75rem;
      color: white;
      font-weight: 600;
    }
    
    .toggle-icon {
      margin-left: auto;
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }
  }
  
  .link-content {
    padding: 16px;
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
  }
  
  .link-hint {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
}

.object-type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.object-type-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 180px;
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &.selected {
    background: rgba(0, 212, 170, 0.1);
    border-color: #00d4aa;
  }
  
  input[type="checkbox"] {
    margin-top: 2px;
  }
  
  .type-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .type-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text-bright);
  }
  
  .type-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .type-columns {
    font-size: 0.7rem;
    color: #a78bfa;
  }
}

.loading-types, .no-types {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: #00d4aa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

// 관계 설정 스타일
.section-hint {
  margin: 0 0 12px;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.relation-configs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.relation-config-item {
  padding: 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.relation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 0.9rem;
  
  .relation-target {
    color: #a78bfa;
    font-weight: 600;
  }
  
  .relation-arrow {
    color: var(--color-text-muted);
  }
  
  .relation-source {
    color: #00d4aa;
    font-weight: 600;
  }
}

.relation-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    label {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
    
    select {
      padding: 8px 10px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text-bright);
      font-size: 0.85rem;
      
      &:focus {
        outline: none;
        border-color: #00d4aa;
      }
    }
  }
}

.columns-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  
  .column-tag {
    padding: 6px 12px;
    background: rgba(167, 139, 250, 0.15);
    border: 1px solid rgba(167, 139, 250, 0.3);
    border-radius: 20px;
    font-size: 0.85rem;
    color: #a78bfa;
  }
}

.sql-preview {
  padding: 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: 'Fira Code', monospace;
  font-size: 0.8rem;
  color: #00d4aa;
  overflow-x: auto;
  white-space: pre-wrap;
  max-height: 150px;
}

.datasource-selector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  border-radius: 8px;
  font-size: 0.85rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  
  .ds-label,
  .ds-select-label {
    color: var(--color-text-muted);
    font-weight: 600;
  }
  
  .ds-name {
    color: #00d4aa;
    font-weight: 500;
    
    strong {
      font-weight: 700;
      font-family: 'Fira Code', monospace;
    }
  }

  .ds-select {
    min-width: 220px;
    padding: 8px 10px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);

    &:focus {
      outline: none;
      border-color: #00d4aa;
      box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.15);
    }
  }
  
  .ds-warning {
    color: #f87171;
    font-size: 0.85rem;
  }
}

.error-message {
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 0.9rem;
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  
  .spacer {
    flex: 1;
  }
  
  .back-btn {
    padding: 10px 20px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-light);
    cursor: pointer;
    
    &:hover {
      background: var(--color-bg-tertiary);
    }
  }
  
  .create-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    background: linear-gradient(135deg, #00d4aa, #00a8cc);
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(0, 212, 170, 0.4);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
