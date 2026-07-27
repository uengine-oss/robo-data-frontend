<script setup lang="ts">
/**
 * ObjectChartPanel.vue
 * 우측 차트 영역 - ObjectType별로 분할하여 차트 표시
 * 각 ObjectType의 chartConfig 설정에 따라 적절한 차트 렌더링
 */
import { ref, computed } from 'vue'
import ChartRenderer from '@/shared/charts/ChartRenderer.vue'
import { IconChevronDown } from '@/shared/icons'

interface ObjectNode {
  id: string
  name: string
  type: string
  labels: string[]
  properties: Record<string, unknown>
}

interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
  xAxis?: string
  yAxis?: string
  valueField?: string
  labelField?: string
  latitudeField?: string
  longitudeField?: string
  regionField?: string
}

interface ObjectType {
  id: string
  name: string
  description?: string
  columns: Array<{ name: string; type: string }>
  chartConfig?: ChartConfig
}

const props = defineProps<{
  nodesByType: Record<string, ObjectNode[]>
  objectTypes: ObjectType[]
}>()

// 접힌 섹션 상태
const collapsedSections = ref<Set<string>>(new Set())

// ObjectType별 차트 설정 가져오기
function getChartConfig(typeName: string): ChartConfig {
  const objectType = props.objectTypes.find(ot => ot.name === typeName)
  return objectType?.chartConfig || getDefaultChartConfig(typeName)
}

// 기본 차트 설정 (ObjectType 이름에 따라 추론)
function getDefaultChartConfig(typeName: string): ChartConfig {
  const lowerName = typeName.toLowerCase()
  
  // 지도가 적합한 타입
  if (lowerName.includes('정수장') || lowerName.includes('위치') || lowerName.includes('지역')) {
    return {
      chartType: 'map',
      regionField: 'SUJ_NAME',
      labelField: 'name'
    }
  }
  
  // 시계열/라인 차트가 적합한 타입
  if (lowerName.includes('탁도') || lowerName.includes('수질') || lowerName.includes('측정')) {
    return {
      chartType: 'line',
      xAxis: 'LOG_TIME',
      yAxis: 'TURBIDITY',
      labelField: 'TAG_DESC'
    }
  }
  
  // 기본: 바 차트
  return {
    chartType: 'bar',
    labelField: 'name',
    valueField: 'count'
  }
}

// 섹션 토글
function toggleSection(typeName: string) {
  const newSet = new Set(collapsedSections.value)
  if (newSet.has(typeName)) {
    newSet.delete(typeName)
  } else {
    newSet.add(typeName)
  }
  collapsedSections.value = newSet
}

// 섹션이 접혀있는지 확인
function isCollapsed(typeName: string): boolean {
  return collapsedSections.value.has(typeName)
}

// 차트 데이터 추출
function getChartData(nodes: ObjectNode[]): Record<string, unknown>[] {
  return nodes.map(node => ({
    ...node.properties,
    name: node.name,
    id: node.id
  }))
}

// 차트 높이 계산 (ObjectType 수에 따라)
const chartHeight = computed(() => {
  const typeCount = Object.keys(props.nodesByType).length
  if (typeCount <= 1) return 300
  if (typeCount <= 2) return 200
  return 150
})

function chartSectionId(typeName: string): string {
  return `object-chart-section-${encodeURIComponent(typeName).replace(/%/g, '_')}`
}
</script>

<template>
  <div class="chart-panel">
    <div class="panel-header">
      <h3>차트 뷰</h3>
      <span class="type-count">{{ Object.keys(nodesByType).length }}개 타입</span>
    </div>
    
    <div class="chart-sections">
      <div 
        v-for="(nodes, typeName) in nodesByType"
        :key="typeName"
        class="chart-section"
        :class="{ collapsed: isCollapsed(String(typeName)) }"
      >
        <!-- 섹션 헤더 -->
        <div class="section-header">
          <button
            type="button"
            class="section-title section-toggle"
            :aria-expanded="!isCollapsed(String(typeName))"
            :aria-controls="chartSectionId(String(typeName))"
            @click="toggleSection(String(typeName))"
          >
            <IconChevronDown 
              :size="16" 
              :class="{ 'rotated': !isCollapsed(String(typeName)) }"
            />
            <span class="type-name">{{ typeName }}</span>
            <span class="node-count">({{ nodes.length }})</span>
          </button>
        </div>
        
        <!-- 차트 영역 -->
        <Transition name="collapse">
          <div 
            v-show="!isCollapsed(String(typeName))"
            :id="chartSectionId(String(typeName))"
            class="section-content"
          >
            <ChartRenderer
              :config="getChartConfig(String(typeName))"
              :data="getChartData(nodes)"
              :title="String(typeName)"
              :height="chartHeight"
            />
          </div>
        </Transition>
      </div>
      
      <!-- 빈 상태 -->
      <div v-if="Object.keys(nodesByType).length === 0" class="empty-state">
        <p>그래프에 노드를 추가하면<br/>여기에 차트가 표시됩니다</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chart-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }
  
  .type-count {
    font-size: 12px;
    color: var(--color-text-muted);
  }
}

.chart-sections {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.chart-section {
  margin-bottom: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  
  &.collapsed {
    .section-header {
      border-bottom: none;
    }
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--color-border);
  
  &:hover {
    background: var(--color-hover);
  }
  
  .section-title {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 3px;
      border-radius: 4px;
    }
    
    .rotated {
      transform: rotate(-180deg);
      transition: transform 0.2s ease;
    }
    
    .type-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text);
    }
    
    .node-count {
      font-size: 11px;
      color: var(--color-text-muted);
    }
  }
}

.section-content {
  padding: 12px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  
  p {
    line-height: 1.6;
  }
}

// 접기/펼치기 애니메이션
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
