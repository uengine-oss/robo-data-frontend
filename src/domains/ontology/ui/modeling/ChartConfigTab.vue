<script setup lang="ts">
/**
 * ChartConfigTab.vue
 * ObjectType 차트 설정 에디터
 * - 차트 유형 선택 (bar, line, pie, map)
 * - X/Y축에 매핑할 속성 선택
 * - 지도의 경우 위치 속성 선택
 * - 우측에 미리보기 표시
 */
import { ref, computed, watch, onMounted } from 'vue'
import ChartRenderer from '@/shared/charts/ChartRenderer.vue'
import { IconCheck } from '@/shared/icons'

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
  xAxis?: string
  yAxis?: string
  valueField?: string
  labelField?: string
  latitudeField?: string
  longitudeField?: string
  regionField?: string
}

interface ObjectTypeColumn {
  name: string
  type: string
}

const props = defineProps<{
  objectTypeName: string
  columns: ObjectTypeColumn[]
  initialConfig?: ChartConfig
  sampleData?: Record<string, unknown>[]
  sampleDataLoading?: boolean
  sampleDataError?: string | null
}>()

const emit = defineEmits<{
  'save': [config: ChartConfig]
  'cancel': []
}>()

// 차트 설정 상태
const chartConfig = ref<ChartConfig>({
  chartType: 'none',
  ...props.initialConfig
})

// 차트 타입 옵션
const chartTypeOptions = [
  { value: 'none', label: '없음', icon: '❌', description: '차트를 표시하지 않음' },
  { value: 'bar', label: '바 차트', icon: '📊', description: '카테고리별 값 비교' },
  { value: 'line', label: '라인 차트', icon: '📈', description: '시계열 데이터 표시' },
  { value: 'pie', label: '파이 차트', icon: '🥧', description: '비율/구성 표시' },
  { value: 'map', label: '지도', icon: '🗺️', description: '위치 기반 데이터 표시' }
]

// 숫자형 컬럼만 필터링
const numericColumns = computed(() => 
  props.columns.filter(col => 
    ['number', 'float', 'int', 'integer', 'double', 'decimal', 'numeric'].some(t => 
      col.type.toLowerCase().includes(t)
    )
  )
)

// 문자열 컬럼만 필터링
const textColumns = computed(() => 
  props.columns.filter(col => 
    ['string', 'text', 'varchar', 'char'].some(t => 
      col.type.toLowerCase().includes(t)
    ) || !numericColumns.value.find(nc => nc.name === col.name)
  )
)

// 미리보기 데이터 생성
const previewData = computed(() => {
  return props.sampleData?.slice(0, 10) ?? []
})

// 차트 타입 변경 시 기본값 설정
watch(() => chartConfig.value.chartType, (newType) => {
  // 필드 초기화
  if (newType === 'map') {
    // 지도: 지역명 필드 자동 추천
    const regionCol = props.columns.find(c => 
      c.name.toLowerCase().includes('name') || 
      c.name.toLowerCase().includes('지역') ||
      c.name.toLowerCase().includes('위치')
    )
    if (regionCol) {
      chartConfig.value.regionField = regionCol.name
      chartConfig.value.labelField = regionCol.name
    }
  } else if (newType === 'bar' || newType === 'line') {
    // 바/라인: X축, Y축 자동 추천
    if (textColumns.value.length > 0 && !chartConfig.value.xAxis) {
      chartConfig.value.xAxis = textColumns.value[0].name
      chartConfig.value.labelField = textColumns.value[0].name
    }
    if (numericColumns.value.length > 0 && !chartConfig.value.yAxis) {
      chartConfig.value.yAxis = numericColumns.value[0].name
      chartConfig.value.valueField = numericColumns.value[0].name
    }
  } else if (newType === 'pie') {
    // 파이: 라벨, 값 자동 추천
    if (textColumns.value.length > 0 && !chartConfig.value.labelField) {
      chartConfig.value.labelField = textColumns.value[0].name
    }
    if (numericColumns.value.length > 0 && !chartConfig.value.valueField) {
      chartConfig.value.valueField = numericColumns.value[0].name
    }
  }
})

// 저장
function handleSave() {
  emit('save', { ...chartConfig.value })
}

// 취소
function handleCancel() {
  emit('cancel')
}

// 초기 설정 로드
onMounted(() => {
  if (props.initialConfig) {
    chartConfig.value = { ...props.initialConfig }
  }
})
</script>

<template>
  <div class="chart-config-tab">
    <!-- 왼쪽: 설정 패널 -->
    <div class="config-panel">
      <h3 class="panel-title">{{ objectTypeName }} 차트 설정</h3>
      
      <!-- 차트 타입 선택 -->
      <div class="config-section">
        <label class="section-label">차트 유형</label>
        <div class="chart-type-grid">
          <button
            v-for="option in chartTypeOptions"
            :key="option.value"
            class="type-option"
            :class="{ active: chartConfig.chartType === option.value }"
            @click="chartConfig.chartType = option.value as ChartConfig['chartType']"
          >
            <span class="option-icon">{{ option.icon }}</span>
            <span class="option-label">{{ option.label }}</span>
          </button>
        </div>
      </div>
      
      <!-- 바/라인 차트 설정 -->
      <template v-if="chartConfig.chartType === 'bar' || chartConfig.chartType === 'line'">
        <div class="config-section">
          <label class="section-label">X축 (카테고리)</label>
          <select v-model="chartConfig.xAxis" class="config-select">
            <option value="">선택하세요</option>
            <option v-for="col in columns" :key="col.name" :value="col.name">
              {{ col.name }} ({{ col.type }})
            </option>
          </select>
        </div>
        
        <div class="config-section">
          <label class="section-label">Y축 (값)</label>
          <select v-model="chartConfig.yAxis" class="config-select">
            <option value="">선택하세요</option>
            <option v-for="col in numericColumns" :key="col.name" :value="col.name">
              {{ col.name }} ({{ col.type }})
            </option>
          </select>
        </div>
      </template>
      
      <!-- 파이 차트 설정 -->
      <template v-if="chartConfig.chartType === 'pie'">
        <div class="config-section">
          <label class="section-label">라벨 필드</label>
          <select v-model="chartConfig.labelField" class="config-select">
            <option value="">선택하세요</option>
            <option v-for="col in columns" :key="col.name" :value="col.name">
              {{ col.name }} ({{ col.type }})
            </option>
          </select>
        </div>
        
        <div class="config-section">
          <label class="section-label">값 필드</label>
          <select v-model="chartConfig.valueField" class="config-select">
            <option value="">선택하세요</option>
            <option v-for="col in numericColumns" :key="col.name" :value="col.name">
              {{ col.name }} ({{ col.type }})
            </option>
          </select>
        </div>
      </template>
      
      <!-- 지도 설정 -->
      <template v-if="chartConfig.chartType === 'map'">
        <div class="config-section">
          <label class="section-label">지역명 필드</label>
          <select v-model="chartConfig.regionField" class="config-select">
            <option value="">선택하세요</option>
            <option v-for="col in textColumns" :key="col.name" :value="col.name">
              {{ col.name }} ({{ col.type }})
            </option>
          </select>
          <p class="field-hint">지역명이 포함된 필드 (예: 서울, 부산, 고산정수장)</p>
        </div>
        
        <div class="config-section">
          <label class="section-label">라벨 필드</label>
          <select v-model="chartConfig.labelField" class="config-select">
            <option value="">선택하세요</option>
            <option v-for="col in columns" :key="col.name" :value="col.name">
              {{ col.name }} ({{ col.type }})
            </option>
          </select>
        </div>
        
        <div class="config-divider">
          <span>또는 위도/경도 사용</span>
        </div>
        
        <div class="config-row">
          <div class="config-section half">
            <label class="section-label">위도 필드</label>
            <select v-model="chartConfig.latitudeField" class="config-select">
              <option value="">선택</option>
              <option v-for="col in numericColumns" :key="col.name" :value="col.name">
                {{ col.name }}
              </option>
            </select>
          </div>
          
          <div class="config-section half">
            <label class="section-label">경도 필드</label>
            <select v-model="chartConfig.longitudeField" class="config-select">
              <option value="">선택</option>
              <option v-for="col in numericColumns" :key="col.name" :value="col.name">
                {{ col.name }}
              </option>
            </select>
          </div>
        </div>
      </template>
      
      <!-- 버튼 -->
      <div class="config-actions">
        <button class="btn btn-secondary" @click="handleCancel">
          취소
        </button>
        <button class="btn btn-primary" @click="handleSave">
          <IconCheck :size="16" />
          저장
        </button>
      </div>
    </div>
    
    <!-- 오른쪽: 미리보기 -->
    <div class="preview-panel">
      <h4 class="preview-title">미리보기</h4>
      <div class="preview-content">
        <ChartRenderer
          v-if="chartConfig.chartType !== 'none' && previewData.length > 0"
          :config="chartConfig"
          :data="previewData"
          :height="300"
        />
        <div v-else-if="chartConfig.chartType !== 'none'" class="no-preview">
          <p v-if="sampleDataLoading">실제 샘플 데이터를 불러오는 중입니다</p>
          <p v-else-if="sampleDataError">실제 샘플 데이터를 불러오지 못했습니다<br/>{{ sampleDataError }}</p>
          <p v-else>표시할 실제 샘플 데이터가 없습니다</p>
        </div>
        <div v-else class="no-preview">
          <p>차트 유형을 선택하면<br/>미리보기가 표시됩니다</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chart-config-tab {
  display: flex;
  height: 100%;
  gap: 20px;
  padding: 20px;
  background: var(--color-surface);
}

.config-panel {
  flex: 1;
  max-width: 450px;
  
  .panel-title {
    margin: 0 0 24px;
    font-size: 18px;
    font-weight: 700;
    color: #fff;
  }
}

.config-section {
  margin-bottom: 20px;
  
  &.half {
    flex: 1;
  }
  
  .section-label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #e0e0e0;
  }
  
  .field-hint {
    margin-top: 6px;
    font-size: 12px;
    color: #888;
  }
}

.config-row {
  display: flex;
  gap: 12px;
}

.config-select {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #555;
  border-radius: 8px;
  font-size: 14px;
  background: #2a2a3a;
  color: #fff;
  cursor: pointer;
  
  option {
    background: #2a2a3a;
    color: #fff;
    padding: 8px;
  }
  
  &:focus {
    outline: none;
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
  }
  
  &:hover {
    border-color: #777;
  }
}

.chart-type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  
  .type-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 12px;
    background: #2a2a3a;
    border: 2px solid #444;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
      border-color: #60a5fa;
      background: #333348;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    
    &.active {
      border-color: #60a5fa;
      background: rgba(96, 165, 250, 0.15);
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
    }
    
    .option-icon {
      font-size: 28px;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }
    
    .option-label {
      font-size: 13px;
      font-weight: 500;
      color: #e0e0e0;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }
  }
}

.config-divider {
  display: flex;
  align-items: center;
  margin: 16px 0;
  
  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
  
  span {
    padding: 0 12px;
    font-size: 11px;
    color: var(--color-text-muted);
  }
}

.config-actions {
  display: flex;
  gap: 16px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid #444;
  
  .btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    
    &-secondary {
      background: #333;
      border: 1px solid #555;
      color: #e0e0e0;
      
      &:hover {
        background: #444;
        border-color: #666;
      }
    }
    
    &-primary {
      flex: 1;
      justify-content: center;
      background: #60a5fa;
      border: none;
      color: white;
      box-shadow: 0 4px 12px rgba(96, 165, 250, 0.3);
      
      &:hover {
        background: #3b82f6;
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(96, 165, 250, 0.4);
      }
    }
  }
}

.preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e2e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 20px;
  
  .preview-title {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
    color: #e0e0e0;
  }
  
  .preview-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #252535;
    border-radius: 8px;
    padding: 12px;
    min-height: 300px;
  }
  
  .no-preview {
    text-align: center;
    color: #888;
    font-size: 14px;
    
    p {
      line-height: 1.6;
    }
  }
}

@media (max-width: 720px) {
  .chart-config-tab {
    flex-direction: column;
    height: auto;
    gap: 16px;
    padding: 0;
  }

  .config-panel {
    width: 100%;
    max-width: none;
  }

  .chart-type-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .config-row {
    flex-direction: column;
  }

  .preview-panel {
    min-width: 0;
    padding: 14px;

    .preview-content {
      min-height: 240px;
    }
  }
}
</style>
