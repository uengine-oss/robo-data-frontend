<script setup lang="ts">
/**
 * DataSourceManager.vue
 * 데이터 소스 등록 및 관리 컴포넌트 - 모던 UI
 * MindsDB 지원 전체 데이터 소스 유형 포함
 */
import { ref, onMounted, computed } from 'vue'
import { useDatasourcesStore, type DataSourceTypeConfig, type DataSource, type DataSourceCategory, getAllDataSourceTypes } from '@/features/datasources/datasources'

const store = useDatasourcesStore()

// Modal state
const showAddModal = ref(false)
const selectedType = ref<DataSourceTypeConfig | null>(null)
const selectedCategory = ref<DataSourceCategory | null>(null)
const formData = ref<Record<string, any>>({})
const connectionName = ref('')
const creating = ref(false)
const createSuccess = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)
const searchQuery = ref('')
const typeSearchQuery = ref('')

// Data source icons and colors - comprehensive mapping
const datasourceConfig: Record<string, { icon: string; color: string; gradient: string }> = {
  // 관계형 데이터베이스
  postgres: { icon: '🐘', color: '#336791', gradient: 'linear-gradient(135deg, #336791 0%, #264D73 100%)' },
  postgresql: { icon: '🐘', color: '#336791', gradient: 'linear-gradient(135deg, #336791 0%, #264D73 100%)' },
  mysql: { icon: '🐬', color: '#00758F', gradient: 'linear-gradient(135deg, #00758F 0%, #00546B 100%)' },
  mariadb: { icon: '🦭', color: '#003545', gradient: 'linear-gradient(135deg, #003545 0%, #00232D 100%)' },
  mssql: { icon: '🪟', color: '#CC2927', gradient: 'linear-gradient(135deg, #CC2927 0%, #A32220 100%)' },
  oracle: { icon: '🔴', color: '#F80000', gradient: 'linear-gradient(135deg, #F80000 0%, #CC0000 100%)' },
  sqlite: { icon: '📦', color: '#003B57', gradient: 'linear-gradient(135deg, #003B57 0%, #002940 100%)' },
  cockroachdb: { icon: '🪳', color: '#6933FF', gradient: 'linear-gradient(135deg, #6933FF 0%, #5429CC 100%)' },
  tidb: { icon: '⚡', color: '#DD2B2B', gradient: 'linear-gradient(135deg, #DD2B2B 0%, #B82424 100%)' },
  singlestore: { icon: '⚡', color: '#9238D6', gradient: 'linear-gradient(135deg, #9238D6 0%, #7530B0 100%)' },
  vitess: { icon: '🌊', color: '#F16728', gradient: 'linear-gradient(135deg, #F16728 0%, #D05520 100%)' },
  
  // NoSQL
  mongodb: { icon: '🍃', color: '#47A248', gradient: 'linear-gradient(135deg, #47A248 0%, #3D8B40 100%)' },
  neo4j: { icon: '🔵', color: '#018BFF', gradient: 'linear-gradient(135deg, #018BFF 0%, #0066CC 100%)' },
  cassandra: { icon: '👁️', color: '#1287B1', gradient: 'linear-gradient(135deg, #1287B1 0%, #0E6B8E 100%)' },
  scylladb: { icon: '🦂', color: '#53CADD', gradient: 'linear-gradient(135deg, #53CADD 0%, #42A3B5 100%)' },
  redis: { icon: '🔴', color: '#DC382D', gradient: 'linear-gradient(135deg, #DC382D 0%, #B52D24 100%)' },
  couchbase: { icon: '🛋️', color: '#EA2328', gradient: 'linear-gradient(135deg, #EA2328 0%, #C01D21 100%)' },
  dynamodb: { icon: '⚡', color: '#4053D6', gradient: 'linear-gradient(135deg, #4053D6 0%, #3343AB 100%)' },
  arangodb: { icon: '🥑', color: '#6DC24B', gradient: 'linear-gradient(135deg, #6DC24B 0%, #5AAA3E 100%)' },
  
  // 데이터 웨어하우스
  snowflake: { icon: '❄️', color: '#29B5E8', gradient: 'linear-gradient(135deg, #29B5E8 0%, #2196BA 100%)' },
  bigquery: { icon: '📊', color: '#4285F4', gradient: 'linear-gradient(135deg, #4285F4 0%, #3672CC 100%)' },
  redshift: { icon: '🔴', color: '#8C4FFF', gradient: 'linear-gradient(135deg, #8C4FFF 0%, #7040CC 100%)' },
  clickhouse: { icon: '🏠', color: '#FFCC00', gradient: 'linear-gradient(135deg, #FFCC00 0%, #E6B800 100%)' },
  databricks: { icon: '🧱', color: '#FF3621', gradient: 'linear-gradient(135deg, #FF3621 0%, #DD2D1B 100%)' },
  duckdb: { icon: '🦆', color: '#FEF054', gradient: 'linear-gradient(135deg, #FEF054 0%, #E8DA4D 100%)' },
  trino: { icon: '🔷', color: '#DD00A1', gradient: 'linear-gradient(135deg, #DD00A1 0%, #B50084 100%)' },
  presto: { icon: '🔷', color: '#5890FF', gradient: 'linear-gradient(135deg, #5890FF 0%, #4674CC 100%)' },
  athena: { icon: '🏛️', color: '#FF9900', gradient: 'linear-gradient(135deg, #FF9900 0%, #E68A00 100%)' },
  druid: { icon: '🐉', color: '#29F1C3', gradient: 'linear-gradient(135deg, #29F1C3 0%, #21C49E 100%)' },
  vertica: { icon: '📈', color: '#0098D5', gradient: 'linear-gradient(135deg, #0098D5 0%, #007AAB 100%)' },
  teradata: { icon: '🟠', color: '#F37440', gradient: 'linear-gradient(135deg, #F37440 0%, #D56235 100%)' },
  starrocks: { icon: '⭐', color: '#4B8BBE', gradient: 'linear-gradient(135deg, #4B8BBE 0%, #3D729B 100%)' },
  doris: { icon: '🌟', color: '#7352C7', gradient: 'linear-gradient(135deg, #7352C7 0%, #5D42A0 100%)' },
  
  // API
  rest_api: { icon: '🔌', color: '#61AFFE', gradient: 'linear-gradient(135deg, #61AFFE 0%, #4E8CCE 100%)' },
  api: { icon: '🔌', color: '#61AFFE', gradient: 'linear-gradient(135deg, #61AFFE 0%, #4E8CCE 100%)' },
  graphql: { icon: '◈', color: '#E535AB', gradient: 'linear-gradient(135deg, #E535AB 0%, #C02C8E 100%)' },
  odata: { icon: '📡', color: '#0075C9', gradient: 'linear-gradient(135deg, #0075C9 0%, #005FA1 100%)' },
  
  // SaaS
  stripe: { icon: '💳', color: '#635BFF', gradient: 'linear-gradient(135deg, #635BFF 0%, #4F49CC 100%)' },
  shopify: { icon: '🛍️', color: '#95BF47', gradient: 'linear-gradient(135deg, #95BF47 0%, #7A9C3A 100%)' },
  salesforce: { icon: '☁️', color: '#00A1E0', gradient: 'linear-gradient(135deg, #00A1E0 0%, #0081B3 100%)' },
  hubspot: { icon: '🧡', color: '#FF7A59', gradient: 'linear-gradient(135deg, #FF7A59 0%, #E66248 100%)' },
  zendesk: { icon: '💬', color: '#03363D', gradient: 'linear-gradient(135deg, #03363D 0%, #022830 100%)' },
  slack: { icon: '💬', color: '#4A154B', gradient: 'linear-gradient(135deg, #4A154B 0%, #3A113B 100%)' },
  github: { icon: '🐙', color: '#181717', gradient: 'linear-gradient(135deg, #333333 0%, #181717 100%)' },
  jira: { icon: '📋', color: '#0052CC', gradient: 'linear-gradient(135deg, #0052CC 0%, #0041A3 100%)' },
  notion: { icon: '📝', color: '#000000', gradient: 'linear-gradient(135deg, #333333 0%, #000000 100%)' },
  airtable: { icon: '📊', color: '#18BFFF', gradient: 'linear-gradient(135deg, #18BFFF 0%, #13A0D6 100%)' },
  google_analytics: { icon: '📈', color: '#E37400', gradient: 'linear-gradient(135deg, #E37400 0%, #C06200 100%)' },
  google_sheets: { icon: '📗', color: '#34A853', gradient: 'linear-gradient(135deg, #34A853 0%, #2B8A44 100%)' },
  twitter: { icon: '🐦', color: '#000000', gradient: 'linear-gradient(135deg, #333333 0%, #000000 100%)' },
  youtube: { icon: '📺', color: '#FF0000', gradient: 'linear-gradient(135deg, #FF0000 0%, #D60000 100%)' },
  
  // 파일 스토리지
  s3: { icon: '🪣', color: '#FF9900', gradient: 'linear-gradient(135deg, #FF9900 0%, #E68A00 100%)' },
  gcs: { icon: '☁️', color: '#4285F4', gradient: 'linear-gradient(135deg, #4285F4 0%, #3672CC 100%)' },
  azure_blob: { icon: '☁️', color: '#0078D4', gradient: 'linear-gradient(135deg, #0078D4 0%, #0060AA 100%)' },
  hdfs: { icon: '🐘', color: '#FFD000', gradient: 'linear-gradient(135deg, #FFD000 0%, #E6BB00 100%)' },
  minio: { icon: '🪣', color: '#C72E49', gradient: 'linear-gradient(135deg, #C72E49 0%, #A0253B 100%)' },
  ftp: { icon: '📁', color: '#2196F3', gradient: 'linear-gradient(135deg, #2196F3 0%, #1A78C2 100%)' },
  sharepoint: { icon: '📂', color: '#038387', gradient: 'linear-gradient(135deg, #038387 0%, #02696C 100%)' },
  
  // 스트리밍
  kafka: { icon: '📨', color: '#231F20', gradient: 'linear-gradient(135deg, #444444 0%, #231F20 100%)' },
  pulsar: { icon: '💫', color: '#188FFF', gradient: 'linear-gradient(135deg, #188FFF 0%, #1373CC 100%)' },
  rabbitmq: { icon: '🐰', color: '#FF6600', gradient: 'linear-gradient(135deg, #FF6600 0%, #E65C00 100%)' },
  kinesis: { icon: '🌊', color: '#FF9900', gradient: 'linear-gradient(135deg, #FF9900 0%, #E68A00 100%)' },
  nats: { icon: '⚡', color: '#27AAE1', gradient: 'linear-gradient(135deg, #27AAE1 0%, #208AB3 100%)' },
  
  // 분석/검색
  elasticsearch: { icon: '🔍', color: '#005571', gradient: 'linear-gradient(135deg, #FEC514 0%, #E6B100 100%)' },
  opensearch: { icon: '🔍', color: '#005EB8', gradient: 'linear-gradient(135deg, #005EB8 0%, #004B93 100%)' },
  solr: { icon: '☀️', color: '#D9411E', gradient: 'linear-gradient(135deg, #D9411E 0%, #B03518 100%)' },
  splunk: { icon: '📊', color: '#000000', gradient: 'linear-gradient(135deg, #65A637 0%, #52862C 100%)' },
  prometheus: { icon: '🔥', color: '#E6522C', gradient: 'linear-gradient(135deg, #E6522C 0%, #C04525 100%)' },
  influxdb: { icon: '📈', color: '#22ADF6', gradient: 'linear-gradient(135deg, #22ADF6 0%, #1B8BC5 100%)' },
  timescaledb: { icon: '⏱️', color: '#FDB515', gradient: 'linear-gradient(135deg, #FDB515 0%, #E6A512 100%)' },
  questdb: { icon: '🔷', color: '#3949AB', gradient: 'linear-gradient(135deg, #3949AB 0%, #2E3A8A 100%)' },
  
  // 벡터 DB
  pinecone: { icon: '🌲', color: '#000000', gradient: 'linear-gradient(135deg, #444444 0%, #000000 100%)' },
  milvus: { icon: '🔷', color: '#00C7FF', gradient: 'linear-gradient(135deg, #00C7FF 0%, #00A0CC 100%)' },
  weaviate: { icon: '🟢', color: '#01D8AE', gradient: 'linear-gradient(135deg, #01D8AE 0%, #01AD8C 100%)' },
  qdrant: { icon: '🟣', color: '#DC244C', gradient: 'linear-gradient(135deg, #DC244C 0%, #B01D3E 100%)' },
  chroma: { icon: '🎨', color: '#FFA723', gradient: 'linear-gradient(135deg, #FFA723 0%, #E6971F 100%)' },
  pgvector: { icon: '📐', color: '#336791', gradient: 'linear-gradient(135deg, #336791 0%, #264D73 100%)' },
  
  // 기타
  factordb: { icon: '📊', color: '#4CAF50', gradient: 'linear-gradient(135deg, #4CAF50 0%, #3D8C40 100%)' },
  binance: { icon: '💰', color: '#F0B90B', gradient: 'linear-gradient(135deg, #F0B90B 0%, #D6A50A 100%)' },
  coinbase: { icon: '💰', color: '#0052FF', gradient: 'linear-gradient(135deg, #0052FF 0%, #0041CC 100%)' },
  plaid: { icon: '🔗', color: '#111111', gradient: 'linear-gradient(135deg, #333333 0%, #111111 100%)' },
  email: { icon: '📧', color: '#EA4335', gradient: 'linear-gradient(135deg, #EA4335 0%, #C0382C 100%)' },
  web_scraper: { icon: '🕷️', color: '#6C5CE7', gradient: 'linear-gradient(135deg, #6C5CE7 0%, #5649BA 100%)' },
  web: { icon: '🌐', color: '#2196F3', gradient: 'linear-gradient(135deg, #2196F3 0%, #1A78C2 100%)' },
  pdf: { icon: '📄', color: '#FF0000', gradient: 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)' },
  rss: { icon: '📰', color: '#FFA500', gradient: 'linear-gradient(135deg, #FFA500 0%, #E69500 100%)' },
  weather: { icon: '🌤️', color: '#00BCD4', gradient: 'linear-gradient(135deg, #00BCD4 0%, #0097A7 100%)' },
  openai: { icon: '🤖', color: '#412991', gradient: 'linear-gradient(135deg, #412991 0%, #352174 100%)' },
  anthropic: { icon: '🧠', color: '#D97757', gradient: 'linear-gradient(135deg, #D97757 0%, #B86246 100%)' },
  huggingface: { icon: '🤗', color: '#FFD21E', gradient: 'linear-gradient(135deg, #FFD21E 0%, #E6BC1B 100%)' },
}

// Category icons
const categoryIcons: Record<DataSourceCategory, string> = {
  database: '🗄️',
  nosql: '📦',
  datawarehouse: '🏢',
  api: '🔌',
  saas: '☁️',
  file: '📁',
  streaming: '📡',
  analytics: '📊',
  vector: '🔷',
  other: '⚙️'
}

// Filtered datasources
const filteredDatasources = computed(() => {
  if (!searchQuery.value) return store.sortedDatasources
  const query = searchQuery.value.toLowerCase()
  return store.sortedDatasources.filter(ds => 
    ds.name.toLowerCase().includes(query) ||
    ds.engine.toLowerCase().includes(query) ||
    (ds.display_name?.toLowerCase().includes(query))
  )
})

// Filtered types by search
const filteredTypesByCategory = computed(() => {
  const allTypes = getAllDataSourceTypes()
  const query = typeSearchQuery.value.toLowerCase()
  
  if (!query) {
    // 그룹화만 수행
    const grouped: Record<DataSourceCategory, DataSourceTypeConfig[]> = {
      database: [], nosql: [], datawarehouse: [], api: [], saas: [],
      file: [], streaming: [], analytics: [], vector: [], other: []
    }
    allTypes.forEach(t => {
      const cat = t.category || 'other'
      grouped[cat].push(t)
    })
    return grouped
  }
  
  // 검색 필터링 후 그룹화
  const filtered = allTypes.filter(t => 
    t.display_name.toLowerCase().includes(query) ||
    t.type.toLowerCase().includes(query) ||
    (t.description?.toLowerCase().includes(query))
  )
  
  const grouped: Record<DataSourceCategory, DataSourceTypeConfig[]> = {
    database: [], nosql: [], datawarehouse: [], api: [], saas: [],
    file: [], streaming: [], analytics: [], vector: [], other: []
  }
  filtered.forEach(t => {
    const cat = t.category || 'other'
    grouped[cat].push(t)
  })
  return grouped
})

// Count of filtered types
const filteredTypesCount = computed(() => {
  return Object.values(filteredTypesByCategory.value).reduce((sum, arr) => sum + arr.length, 0)
})

// Props & Emits
const props = defineProps<{
  mode?: 'full' | 'compact' | 'selector'
}>()

const emit = defineEmits<{
  (e: 'select', datasource: any): void
  (e: 'close'): void
}>()

onMounted(async () => {
  await Promise.all([
    store.fetchTypes(),
    store.fetchDatasources(),
  ])
  // 데이터소스 로드 후 헬스 체크 실행
  store.checkAllHealth()
})

function getConfig(engine: string) {
  return datasourceConfig[engine] || datasourceConfig[engine.toLowerCase()] || 
    { icon: '📦', color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }
}

function getHealthClass(source: any) {
  const status = source.health?.status
  if (status === 'healthy') return 'health-healthy'
  if (status === 'partial') return 'health-partial'
  if (status === 'disconnected') return 'health-disconnected'
  if (status === 'checking') return 'health-checking'
  return 'health-unknown'
}

function getHealthTooltip(source: any) {
  const health = source.health
  if (!health) return '연결 상태 확인 중...'
  if (health.status === 'healthy') return '✓ 연결 정상'
  if (health.status === 'partial') return `⚠ ${health.message}`
  if (health.status === 'disconnected') return `✕ ${health.message}`
  return '? 상태 알 수 없음'
}

function openAddModal() {
  showAddModal.value = true
  selectedType.value = null
  selectedCategory.value = null
  formData.value = {}
  connectionName.value = ''
  createSuccess.value = false
  testResult.value = null
  typeSearchQuery.value = ''
}

function selectType(type: DataSourceTypeConfig) {
  selectedType.value = type
  formData.value = {}
  type.fields?.forEach(field => {
    if (field.default !== undefined) {
      formData.value[field.name] = field.default
    }
  })
}

function closeModal() {
  showAddModal.value = false
  selectedType.value = null
  selectedCategory.value = null
  formData.value = {}
  connectionName.value = ''
  createSuccess.value = false
  testResult.value = null
  typeSearchQuery.value = ''
}

async function createConnection() {
  if (!selectedType.value || !connectionName.value) return
  
  creating.value = true
  store.clearError()
  
  // 1. 데이터 소스 등록
  const success = await store.createDatasource(
    connectionName.value,
    selectedType.value.type,
    formData.value
  )
  
  if (!success) {
    creating.value = false
    return
  }
  
  creating.value = false
  createSuccess.value = true
  
  setTimeout(() => {
    closeModal()
  }, 1500)
}

async function deleteSource(name: string) {
  if (confirm(`"${name}" 데이터 소스를 삭제하시겠습니까?`)) {
    await store.deleteDatasource(name)
  }
}

function selectSource(source: DataSource) {
  if (props.mode === 'selector') {
    emit('select', source)
  } else {
    store.selectDatasource(source)
  }
}

async function testConnection() {
  if (!connectionName.value || !selectedType.value) return
  
  // 생성 폼에서는 입력된 파라미터로 직접 DB 연결 테스트
  testResult.value = await store.testConnectionWithParams({
    engine: selectedType.value.type,
    host: formData.value.host || '',
    port: formData.value.port ? Number(formData.value.port) : undefined,
    user: formData.value.user || '',
    password: formData.value.password || '',
    database: formData.value.database || '',
  })
}

</script>

<template>
  <div class="datasource-manager" :class="{ compact: mode === 'compact', selector: mode === 'selector' }">
    <!-- Hero Header -->
    <div class="hero-header">
      <div class="hero-content">
        <div class="hero-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <div class="hero-text">
          <h1>데이터 소스</h1>
          <p>외부 데이터베이스 및 API 연결을 등록하고 관리합니다</p>
        </div>
      </div>
      <button @click="openAddModal" class="btn-add">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        새 연결 추가
      </button>
    </div>

    <!-- Search & Stats Bar -->
    <div class="action-bar">
      <div class="search-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="데이터 소스 검색..." 
        />
      </div>
      <div class="stats">
        <span class="stat-item">
          <span class="stat-value">{{ store.datasources.length }}</span>
          <span class="stat-label">연결됨</span>
        </span>
      </div>
    </div>

    <!-- Data Sources Grid -->
    <div class="sources-container">
      <div v-if="store.loading" class="loading-state">
        <div class="loading-spinner"></div>
        <span>데이터 소스 불러오는 중...</span>
      </div>
      
      <div v-else-if="!store.hasDatasources" class="empty-state">
        <div class="empty-illustration">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5">
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        </div>
        <h3>등록된 데이터 소스가 없습니다</h3>
        <p>다양한 데이터베이스, API, SaaS 플랫폼과 연결하세요</p>
        <button @click="openAddModal" class="btn-empty-add">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          첫 번째 데이터 소스 추가
        </button>
      </div>
      
      <div v-else class="sources-grid">
        <div
          v-for="source in filteredDatasources"
          :key="source.name"
          @click="selectSource(source)"
          :class="['source-card', { selected: store.selectedDatasource?.name === source.name }]"
        >
          <div class="card-header" :style="{ background: getConfig(source.engine).gradient }">
            <span class="card-icon">{{ getConfig(source.engine).icon }}</span>
            <!-- 헬스 상태 표시 - 부드러운 인디케이터 -->
            <span 
              class="health-indicator" 
              :class="getHealthClass(source)"
              :title="getHealthTooltip(source)"
            >
              <span v-if="source.health?.status === 'checking'" class="health-spinner"></span>
              <span v-else-if="source.health?.status === 'healthy'">✓</span>
              <span v-else-if="source.health?.status === 'partial'">!</span>
              <span v-else-if="source.health?.status === 'disconnected'" class="disconnected-icon"></span>
              <span v-else>?</span>
            </span>
            <!-- 삭제 버튼 - 호버 시에만 표시 -->
            <button
              v-if="mode !== 'selector'"
              @click.stop="deleteSource(source.name)"
              class="btn-delete"
              title="삭제"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
          <div class="card-body">
            <h3 class="source-name">{{ source.display_name || source.name }}</h3>
            <span class="source-engine" :style="{ color: getConfig(source.engine).color }">
              {{ source.engine.toUpperCase() }}
            </span>
            <div class="source-details" v-if="source.host">
              <span class="detail-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                {{ source.host }}
              </span>
              <span v-if="source.database" class="detail-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
                </svg>
                {{ source.database }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Selected DataSource Details Panel -->
    <Transition name="slide-up">
      <div v-if="mode === 'full' && store.selectedDatasource" class="detail-panel">
        <div class="panel-header">
          <div class="panel-title">
            <span class="panel-icon" :style="{ background: getConfig(store.selectedDatasource.engine).gradient }">
              {{ getConfig(store.selectedDatasource.engine).icon }}
            </span>
            <div>
              <h3>{{ store.selectedDatasource.display_name || store.selectedDatasource.name }}</h3>
              <span class="panel-engine">{{ store.selectedDatasource.engine }}</span>
            </div>
          </div>
          <button class="btn-close-panel" @click="store.selectedDatasource = null">✕</button>
        </div>

        <div class="panel-content">
          <div class="panel-section">
            <h4>📋 실제 DB 테이블</h4>
            <div v-if="store.tables.length === 0" class="empty-section">
              테이블이 없습니다
            </div>
            <div v-else class="table-list">
              <div v-for="table in store.tables" :key="table.name" class="table-item">
                <span class="table-name">{{ table.name }}</span>
                <span v-if="table.column_count" class="table-count">{{ table.column_count }} 컬럼</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Add Data Source Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddModal" class="modal-overlay" @click.self="closeModal">
          <div class="modal" :class="{ 'modal-wide': !selectedType }">
            <div class="modal-header">
              <h2>
                {{ selectedType ? `${selectedType.display_name} 연결` : '새 데이터 소스' }}
              </h2>
              <button @click="closeModal" class="btn-modal-close">✕</button>
            </div>

            <div class="modal-body">
              <!-- Success -->
              <div v-if="createSuccess" class="success-state">
                <div class="success-icon">✅</div>
                <h3>연결 완료!</h3>
                <p>데이터 소스가 성공적으로 추가되었습니다</p>
              </div>

              <!-- Type Selection with Categories -->
              <div v-else-if="!selectedType" class="type-selection">
                <!-- Search -->
                <div class="type-search-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input 
                    v-model="typeSearchQuery" 
                    type="text" 
                    placeholder="데이터 소스 유형 검색... (예: postgres, kafka, s3)" 
                  />
                </div>
                
                <p class="type-count">{{ filteredTypesCount }}개의 데이터 소스 유형 사용 가능</p>

                <!-- Categories -->
                <div class="categories-container">
                  <template v-for="(label, category) in store.categoryLabels" :key="category">
                    <div 
                      v-if="filteredTypesByCategory[category]?.length > 0" 
                      class="category-section"
                    >
                      <h3 class="category-title">
                        <span class="category-icon">{{ categoryIcons[category] }}</span>
                        {{ label }}
                        <span class="category-count">{{ filteredTypesByCategory[category].length }}</span>
                      </h3>
                      <div class="type-grid">
                        <button
                          v-for="type in filteredTypesByCategory[category]"
                          :key="type.type"
                          @click="selectType(type)"
                          class="type-card"
                          :style="{ '--accent-color': getConfig(type.type).color }"
                        >
                          <div class="type-icon-wrapper" :style="{ background: getConfig(type.type).gradient }">
                            <span class="type-icon">{{ getConfig(type.type).icon }}</span>
                          </div>
                          <div class="type-info">
                            <span class="type-name">{{ type.display_name }}</span>
                            <span v-if="type.description" class="type-desc">{{ type.description }}</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Connection Form -->
              <div v-else class="connection-form">
                <button @click="selectedType = null" class="btn-back">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  다른 유형 선택
                </button>

                <div class="form-type-badge" :style="{ background: getConfig(selectedType.type).gradient }">
                  <span>{{ getConfig(selectedType.type).icon }}</span>
                  <span>{{ selectedType.display_name }}</span>
                </div>
                
                <p v-if="selectedType.description" class="form-type-desc">
                  {{ selectedType.description }}
                </p>

                <form @submit.prevent="createConnection">
                  <div class="form-group">
                    <label>연결 이름 <span class="required">*</span></label>
                    <input
                      v-model="connectionName"
                      type="text"
                      placeholder="my_database"
                      required
                    />
                  </div>

                  <div class="form-grid">
                    <div v-for="field in selectedType.fields" :key="field.name" class="form-group">
                      <label>
                        {{ field.label }}
                        <span v-if="field.required" class="required">*</span>
                      </label>
                      <input
                        v-model="formData[field.name]"
                        :type="field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'"
                        :placeholder="field.placeholder || field.default?.toString() || ''"
                        :required="field.required"
                      />
                    </div>
                  </div>

                  <div v-if="store.error" class="error-alert">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                    {{ store.error }}
                  </div>

                  <div v-if="testResult" :class="['test-alert', testResult.success ? 'success' : 'error']">
                    {{ testResult.success ? '✅' : '❌' }} {{ testResult.message }}
                  </div>

                  <div class="form-actions">
                    <button type="button" @click="testConnection" :disabled="!connectionName || creating" class="btn-test">
                      연결 테스트
                    </button>
                    <button type="submit" :disabled="creating || !connectionName" class="btn-create">
                      <span v-if="creating">등록 중...</span>
                      <span v-else>연결 생성</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped lang="scss">
.datasource-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

// Hero Header
.hero-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32px 40px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
  border-bottom: 1px solid var(--color-border);
}

.hero-content {
  display: flex;
  align-items: center;
  gap: 20px;
}

.hero-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 16px;
  color: white;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.25);
}

.hero-text {
  h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: -0.02em;
  }
  
  p {
    margin: 4px 0 0;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25);
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(99, 102, 241, 0.35);
  }
}

// Action Bar
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 40px;
  border-bottom: 1px solid var(--color-border);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  width: 320px;
  transition: all 0.2s;
  
  &:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
  
  svg {
    color: var(--color-text-muted);
  }
  
  input {
    flex: 1;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.9rem;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
    }
  }
}

.stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #6366f1;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

// Sources Container
.sources-container {
  flex: 1;
  padding: 32px 40px;
  overflow-y: auto;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--color-text-muted);
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  
  h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--color-text);
  }
  
  p {
    margin: 0;
    max-width: 300px;
  }
}

.empty-illustration {
  color: var(--color-text-muted);
  opacity: 0.3;
}

.btn-empty-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 24px;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: #5457e5;
  }
}

// Sources Grid
.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.source-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
    border-color: transparent;
  }
  
  &.selected {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  min-height: 80px;
}

.card-icon {
  font-size: 2.5rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

// 헬스 상태 표시 - 부드러운 인디케이터
.health-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 600;
  color: white;
  transition: all 0.3s ease;
  
  &.health-healthy {
    background: rgba(34, 197, 94, 0.9);
    box-shadow: 0 1px 4px rgba(34, 197, 94, 0.3);
  }
  
  &.health-partial {
    background: rgba(251, 191, 36, 0.9);
    box-shadow: 0 1px 4px rgba(251, 191, 36, 0.3);
  }
  
  &.health-disconnected {
    background: rgba(255, 255, 255, 0.25);
    border: 1.5px solid rgba(255, 255, 255, 0.4);
    box-shadow: none;
  }
  
  &.health-checking {
    background: rgba(251, 191, 36, 0.7);
  }
  
  &.health-unknown {
    background: rgba(255, 255, 255, 0.2);
    border: 1px dashed rgba(255, 255, 255, 0.4);
  }
}

.disconnected-icon {
  width: 8px;
  height: 8px;
  position: relative;
  
  &::before, &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 2px;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 1px;
  }
  
  &::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }
  
  &::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }
}

.health-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.card-header {
  position: relative;
}

// 삭제 버튼 - 더 작고 부드럽게
.btn-delete {
  position: absolute;
  top: 8px;
  right: 34px;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  
  .source-card:hover & {
    opacity: 0.7;
  }
  
  &:hover {
    opacity: 1 !important;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.15);
  }
}

.card-body {
  padding: 20px;
}

.source-name {
  margin: 0 0 4px;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
}

.source-engine {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.source-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  
  svg {
    opacity: 0.6;
  }
}

.source-meta {
  margin-top: 12px;
}

.meta-badge {
  display: inline-block;
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
}

// Detail Panel
.detail-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 50%;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 16px;
  
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }
}

.panel-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 1.5rem;
}

.panel-engine {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.btn-close-panel {
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.25rem;
  cursor: pointer;
  
  &:hover {
    color: var(--color-text);
  }
}

.panel-content {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
}

.panel-section {
  margin-bottom: 24px;
  
  h4 {
    margin: 0 0 12px;
    font-size: 0.9rem;
    color: var(--color-text-muted);
  }
}

.empty-section {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-style: italic;
}

.schema-list, .table-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schema-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    border-color: #6366f1;
  }
  
  &.selected {
    background: rgba(99, 102, 241, 0.1);
    border-color: #6366f1;
  }
}

.schema-name {
  font-weight: 500;
}

.schema-count, .table-count {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.table-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--color-bg);
  border-radius: 8px;
}

.table-name {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
}

// Modal
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overflow: hidden;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  
  &.modal-wide {
    max-width: 900px;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  
  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
}

.btn-modal-close {
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.25rem;
  cursor: pointer;
  
  &:hover {
    color: var(--color-text);
  }
}

.modal-body {
  padding: 28px;
  overflow-y: auto;
  flex: 1;
}

// Success State
.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 0;
  
  .success-icon {
    font-size: 4rem;
    margin-bottom: 16px;
  }
  
  h3 {
    margin: 0 0 8px;
    font-size: 1.5rem;
    color: var(--color-text);
  }
  
  p {
    margin: 0;
    color: var(--color-text-muted);
  }
}

// Type Selection
.type-selection {
  display: flex;
  flex-direction: column;
}

.type-search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  margin-bottom: 16px;
  
  &:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
  
  svg {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  
  input {
    flex: 1;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.95rem;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
    }
  }
}

.type-count {
  margin: 0 0 20px;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.categories-container {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.category-icon {
  font-size: 1.2rem;
}

.category-count {
  padding: 2px 8px;
  background: var(--color-bg);
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.type-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  
  &:hover {
    border-color: var(--accent-color, #6366f1);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  }
}

.type-icon-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.type-icon {
  font-size: 1.25rem;
}

.type-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.type-name {
  font-weight: 600;
  color: var(--color-text);
  font-size: 0.9rem;
}

.type-desc {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// Connection Form
.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  margin-bottom: 20px;
  background: none;
  border: none;
  color: #6366f1;
  font-size: 0.9rem;
  cursor: pointer;
  
  &:hover {
    text-decoration: underline;
  }
}

.form-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 12px;
  color: white;
  font-weight: 600;
  margin-bottom: 12px;
}

.form-type-desc {
  margin: 0 0 24px;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.form-group {
  margin-bottom: 16px;
  
  label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--color-text-light);
  }
  
  input {
    width: 100%;
    padding: 12px 16px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 0.95rem;
    transition: all 0.15s;
    
    &:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
}

.error-alert, .test-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.error-alert {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.test-alert.success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #4ade80;
}

.test-alert.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-test, .btn-create {
  flex: 1;
  padding: 14px 24px;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-test {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  
  &:hover:not(:disabled) {
    border-color: #6366f1;
    color: #6366f1;
  }
}

.btn-create {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.35);
  }
}

// Transitions
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.modal-enter-active, .modal-leave-active {
  transition: all 0.25s ease;
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
  
  .modal {
    transform: scale(0.95) translateY(20px);
  }
}

</style>
