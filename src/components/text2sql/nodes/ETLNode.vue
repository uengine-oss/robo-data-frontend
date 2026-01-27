<script setup lang="ts">
/**
 * ETLNode.vue
 * ETL 프로세스 노드 - 스토어드 프로시저의 ETL 작업을 시각화
 * 
 * 클릭 시 해당 프로시저의 코드 위치를 코드 뷰어에서 보여줌
 */
import { Handle, Position } from '@vue-flow/core'
import { inject, computed } from 'vue'

interface ETLNodeData {
  etlId: string
  etlName: string
  procedureName: string
  statementType: string
  lineNumber: number
  sourceTable: string
  targetTable: string
  fileName: string
  columnMappingCount: number
}

interface Props {
  data: ETLNodeData
}

const props = defineProps<Props>()

// 부모에서 주입받은 핸들러
const onOpenSourceCode = inject<(procedureName: string, lineNumber: number, fileName: string) => void>('onOpenSourceCode')

// 노드 스타일 (ETL 타입에 따라)
const typeColors: Record<string, { bg: string; border: string; icon: string }> = {
  INSERT: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', icon: '📥' },
  MERGE: { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', icon: '🔀' },
  UPDATE: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', icon: '✏️' },
  DELETE: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', icon: '🗑️' },
  default: { bg: 'rgba(100, 116, 139, 0.15)', border: '#64748b', icon: '⚙️' }
}

const nodeStyle = computed(() => {
  return typeColors[props.data.statementType] || typeColors.default
})

// 프로시저 이름에서 짧은 표시명 추출
const shortProcName = computed(() => {
  const name = props.data.procedureName || ''
  if (name.length > 25) {
    return name.substring(0, 22) + '...'
  }
  return name
})

// 클릭 핸들러
function handleClick() {
  console.log('[ETLNode] 클릭됨:', {
    procedureName: props.data.procedureName,
    lineNumber: props.data.lineNumber,
    fileName: props.data.fileName,
    hasHandler: !!onOpenSourceCode
  })
  
  if (onOpenSourceCode && props.data.procedureName) {
    onOpenSourceCode(
      props.data.procedureName,
      props.data.lineNumber || 1,
      props.data.fileName || ''
    )
  } else if (!onOpenSourceCode) {
    console.warn('[ETLNode] onOpenSourceCode 핸들러가 inject되지 않음')
  }
}
</script>

<template>
  <div 
    class="etl-node"
    :style="{ 
      backgroundColor: nodeStyle.bg,
      borderColor: nodeStyle.border
    }"
    @click="handleClick"
  >
    <!-- 왼쪽 핸들 (입력) -->
    <Handle
      id="input"
      type="target"
      :position="Position.Left"
      class="handle handle--input"
    />
    
    <!-- 헤더 -->
    <div class="etl-header">
      <span class="etl-icon">{{ nodeStyle.icon }}</span>
      <div class="etl-info">
        <span class="etl-type" :style="{ color: nodeStyle.border }">
          {{ data.statementType || 'ETL' }}
        </span>
        <span class="etl-line">Line {{ data.lineNumber }}</span>
      </div>
    </div>
    
    <!-- 프로시저 이름 -->
    <div class="etl-procedure">
      <span class="proc-icon">📦</span>
      <span class="proc-name" :title="data.procedureName">{{ shortProcName }}</span>
    </div>
    
    <!-- 데이터 흐름 표시 -->
    <div class="etl-flow">
      <div class="flow-source" v-if="data.sourceTable">
        <span class="flow-icon">📥</span>
        <span class="flow-table">{{ data.sourceTable }}</span>
      </div>
      <span class="flow-arrow">→</span>
      <div class="flow-target" v-if="data.targetTable">
        <span class="flow-icon">📤</span>
        <span class="flow-table">{{ data.targetTable }}</span>
      </div>
    </div>
    
    <!-- 컬럼 매핑 카운트 -->
    <div class="etl-meta" v-if="data.columnMappingCount > 0">
      <span class="meta-icon">🔗</span>
      <span>{{ data.columnMappingCount }} 컬럼 매핑</span>
    </div>
    
    <!-- 오른쪽 핸들 (출력) -->
    <Handle
      id="output"
      type="source"
      :position="Position.Right"
      class="handle handle--output"
    />
    
    <!-- 클릭 힌트 -->
    <div class="click-hint">🔍 클릭하여 코드 보기</div>
  </div>
</template>

<style scoped lang="scss">
.etl-node {
  min-width: 200px;
  max-width: 280px;
  background: rgba(139, 92, 246, 0.15);
  border: 2px solid #8b5cf6;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(139, 92, 246, 0.3);
    
    .click-hint {
      opacity: 1;
    }
  }
}

.etl-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.etl-icon {
  font-size: 24px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.etl-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.etl-type {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.etl-line {
  font-size: 10px;
  color: var(--color-text-muted, #5c5f66);
}

.etl-procedure {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  margin-bottom: 10px;
  
  .proc-icon {
    font-size: 12px;
  }
  
  .proc-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-bright, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
  }
}

.etl-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  margin-bottom: 8px;
}

.flow-source, .flow-target {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  
  .flow-icon {
    font-size: 12px;
    flex-shrink: 0;
  }
  
  .flow-table {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text, #c1c2c5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.flow-source .flow-table {
  color: #3b82f6;
}

.flow-target .flow-table {
  color: #10b981;
}

.flow-arrow {
  font-size: 14px;
  font-weight: 700;
  color: #f59e0b;
  flex-shrink: 0;
}

.etl-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--color-text-light, #909296);
  
  .meta-icon {
    font-size: 11px;
  }
}

.click-hint {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--color-text-muted, #5c5f66);
  background: var(--color-bg-secondary, #25262b);
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

// 핸들 스타일
.handle {
  width: 12px;
  height: 12px;
  background: var(--color-bg-secondary, #25262b);
  border: 2px solid;
  border-radius: 50%;
  transition: all 0.2s;
  
  &--input {
    border-color: #3b82f6;
    left: -6px;
  }
  
  &--output {
    border-color: #10b981;
    right: -6px;
  }
  
  &:hover {
    transform: scale(1.3);
    background: var(--color-accent, #228be6);
  }
}
</style>
