<script setup lang="ts">
/**
 * ObjectTypeEditDialog.vue
 * ObjectType 편집 다이얼로그 (탭 형식)
 * - 일반 탭: 이름 변경
 * - 차트 탭: 차트 설정
 */
import { ref, computed, watch, nextTick } from 'vue'
import { IconX, IconEdit, IconCheck, IconBarChart } from '@/shared/icons'
import ChartConfigTab from './ChartConfigTab.vue'
import { objectExplorerApi } from '@/domains/ontology'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

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

export interface ObjectTypeColumn {
  name: string
  type: string
}

export interface ObjectTypeInfo {
  name: string
  description?: string
  columns?: ObjectTypeColumn[]
  chartConfig?: ChartConfig
}

const props = defineProps<{
  objectType: ObjectTypeInfo
  visible: boolean
}>()

const emit = defineEmits<{
  'close': []
  'saved': [objectType: ObjectTypeInfo]
}>()
const timers = useManagedTimeouts()
const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const chartStatusRef = ref<HTMLElement | null>(null)

// 탭 상태
const activeTab = ref<'general' | 'chart'>('general')

// 일반 탭 상태
const newName = ref('')
const isRenaming = ref(false)
const renameError = ref<string | null>(null)

// 차트 탭 상태
const chartConfig = ref<ChartConfig>({
  chartType: 'none'
})
const isSavingChart = ref(false)
const mutationPending = computed(() => isRenaming.value || isSavingChart.value)
const chartSaveMessage = ref<string | null>(null)
const sampleData = ref<Record<string, unknown>[]>([])
const sampleDataLoading = ref(false)
const sampleDataError = ref<string | null>(null)

// 초기화
watch(() => props.visible, (visible) => {
  if (visible && props.objectType) {
    newName.value = props.objectType.name
    chartConfig.value = props.objectType.chartConfig || { chartType: 'none' }
    renameError.value = null
    chartSaveMessage.value = null
    activeTab.value = 'general'
  } else {
    timers.cancel('chart-save-message')
    chartSaveMessage.value = null
  }
}, { immediate: true })

// 이름 변경
async function handleRename() {
  if (!newName.value.trim() || newName.value === props.objectType.name) return
  
  isRenaming.value = true
  renameError.value = null
  
  try {
    await objectExplorerApi.renameObjectType(props.objectType.name, newName.value.replace(/\s+/g, '_'))
    emit('saved', { ...props.objectType, name: newName.value })
  } catch (err) {
    renameError.value = err instanceof Error ? err.message : '이름 변경에 실패했습니다.'
  } finally {
    isRenaming.value = false
  }
}

// 차트 설정 저장
async function handleSaveChartConfig(config: ChartConfig) {
  isSavingChart.value = true
  timers.cancel('chart-save-message')
  chartSaveMessage.value = null
  
  try {
    await objectExplorerApi.updateChartConfig(props.objectType.name, config)
    chartConfig.value = config
    chartSaveMessage.value = '차트 설정이 저장되었습니다.'
    timers.schedule('chart-save-message', () => {
      chartSaveMessage.value = null
    }, 3000)
    emit('saved', { ...props.objectType, chartConfig: config })
  } catch (err) {
    chartSaveMessage.value = err instanceof Error ? err.message : '저장에 실패했습니다.'
    await nextTick()
    chartStatusRef.value?.scrollIntoView({ block: 'nearest' })
  } finally {
    isSavingChart.value = false
  }
}

function handleClose() {
  if (!mutationPending.value) emit('close')
}

useDialogFocusLifecycle({
  active: () => props.visible,
  dialog: dialogRef,
  requestClose: handleClose,
  initialFocus: () => closeButtonRef.value,
  canClose: () => !mutationPending.value,
})

// 이름 입력 시 공백을 "_"로 자동 대체
function handleNameInput(event: Event) {
  const input = event.target as HTMLInputElement
  newName.value = input.value.replace(/\s+/g, '_')
}

// 컬럼을 ChartConfigTab 형식으로 변환
const formattedColumns = computed(() => {
  return props.objectType.columns?.map(col => ({
    name: col.name,
    type: col.type || 'string'
  })) || []
})

async function loadSampleData() {
  sampleDataLoading.value = true
  sampleDataError.value = null
  try {
    const response = await objectExplorerApi.getObjectTypeData(props.objectType.name, 10)
    sampleData.value = response.rows
  } catch (cause: unknown) {
    sampleData.value = []
    sampleDataError.value = cause instanceof Error ? cause.message : '실제 샘플 데이터를 불러오지 못했습니다.'
  } finally {
    sampleDataLoading.value = false
  }
}

watch(
  [() => props.visible, activeTab, () => props.objectType.name],
  ([visible, tab]) => {
    if (visible && tab === 'chart') void loadSampleData()
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <div
          ref="dialogRef"
          class="dialog-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="object-type-edit-title"
          :aria-busy="mutationPending"
          tabindex="-1"
        >
          <!-- Header -->
          <div class="dialog-header">
            <h2 id="object-type-edit-title">{{ objectType.name }} 편집</h2>
            <button
              ref="closeButtonRef"
              type="button"
              class="close-btn"
              aria-label="ObjectType 편집 닫기"
              :disabled="mutationPending"
              @click="handleClose"
            >
              <IconX :size="20" />
            </button>
          </div>
          
          <!-- Tabs -->
          <div class="dialog-tabs" role="tablist" aria-label="ObjectType 편집 영역">
            <button 
              class="tab-btn"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'general'"
              aria-controls="object-type-general-panel"
              :class="{ active: activeTab === 'general' }"
              @click="activeTab = 'general'"
            >
              <IconEdit :size="16" />
              일반
            </button>
            <button 
              class="tab-btn"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'chart'"
              aria-controls="object-type-chart-panel"
              :class="{ active: activeTab === 'chart' }"
              @click="activeTab = 'chart'"
            >
              <IconBarChart :size="16" />
              차트 설정
            </button>
          </div>
          
          <!-- Tab Content -->
          <div class="dialog-content">
            <!-- 일반 탭 -->
            <div
              v-show="activeTab === 'general'"
              id="object-type-general-panel"
              class="tab-content general-tab"
              role="tabpanel"
            >
              <div class="form-group">
                <label>ObjectType 이름</label>
                <div class="input-with-hint">
                  <input 
                    :value="newName"
                    @input="handleNameInput"
                    type="text"
                    :placeholder="objectType.name"
                  />
                  <span class="hint">공백은 자동으로 "_"로 변환됩니다</span>
                </div>
              </div>
              
              <div class="form-group">
                <label>설명</label>
                <p class="readonly-value">{{ objectType.description || '-' }}</p>
              </div>
              
              <div class="form-group">
                <label>컬럼 ({{ objectType.columns?.length || 0 }}개)</label>
                <div class="columns-list">
                  <div 
                    v-for="col in objectType.columns" 
                    :key="col.name"
                    class="column-item"
                  >
                    <span class="col-name">{{ col.name }}</span>
                    <span class="col-type">{{ col.type }}</span>
                  </div>
                  <p v-if="!objectType.columns?.length" class="no-columns">컬럼 없음</p>
                </div>
              </div>
              
              <div v-if="renameError" class="error-message">
                {{ renameError }}
              </div>
              
              <div class="form-actions">
                <button 
                  class="btn btn-primary"
                  @click="handleRename"
                  :disabled="isRenaming || !newName.trim() || newName === objectType.name"
                >
                  <span v-if="isRenaming" class="spinner"></span>
                  <IconCheck v-else :size="16" />
                  <span>{{ isRenaming ? '저장 중...' : '이름 변경' }}</span>
                </button>
              </div>
            </div>
            
            <!-- 차트 탭 -->
            <div
              v-show="activeTab === 'chart'"
              id="object-type-chart-panel"
              class="tab-content chart-tab"
              role="tabpanel"
            >
              <div
                v-if="chartSaveMessage"
                ref="chartStatusRef"
                class="save-message"
                :class="{ error: chartSaveMessage.includes('실패') }"
                :role="chartSaveMessage.includes('실패') ? 'alert' : 'status'"
              >
                {{ chartSaveMessage }}
              </div>
              <ChartConfigTab
                :object-type-name="objectType.name"
                :columns="formattedColumns"
                :initial-config="chartConfig"
                :sample-data="sampleData"
                :sample-data-loading="sampleDataLoading"
                :sample-data-error="sampleDataError"
                @save="handleSaveChartConfig"
                @cancel="activeTab = 'general'"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  background: var(--bg-secondary, #1e1e2e);
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: min(85dvh, 900px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #333);
  
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary, #fff);
  }
  
  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #888);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    
    &:hover {
      background: var(--bg-hover, #333);
      color: var(--text-primary, #fff);
    }
  }
}

.dialog-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px 0;
  border-bottom: 1px solid var(--border-color, #333);
  
  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: none;
    border: none;
    color: var(--text-secondary, #888);
    font-size: 14px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all 0.2s;
    
    &:hover {
      color: var(--text-primary, #fff);
    }
    
    &.active {
      color: var(--accent-color, #60a5fa);
      border-bottom-color: var(--accent-color, #60a5fa);
    }
  }
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tab-content {
  height: 100%;
}

.general-tab {
  .form-group {
    margin-bottom: 20px;
    
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary, #888);
      margin-bottom: 8px;
    }
    
    input {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-tertiary, #2a2a3a);
      border: 1px solid var(--border-color, #333);
      border-radius: 6px;
      color: var(--text-primary, #fff);
      font-size: 14px;
      
      &:focus {
        outline: none;
        border-color: var(--accent-color, #60a5fa);
      }
    }
    
    .input-with-hint {
      .hint {
        display: block;
        font-size: 11px;
        color: var(--text-muted, #666);
        margin-top: 4px;
      }
    }
    
    .readonly-value {
      color: var(--text-primary, #fff);
      font-size: 14px;
      margin: 0;
    }
  }
  
  .columns-list {
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-tertiary, #2a2a3a);
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    padding: 8px;
    
    .column-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 4px;
      
      &:hover {
        background: var(--bg-hover, #333);
      }
      
      .col-name {
        color: var(--text-primary, #fff);
        font-size: 13px;
      }
      
      .col-type {
        color: var(--text-muted, #666);
        font-size: 12px;
      }
    }
    
    .no-columns {
      color: var(--text-muted, #666);
      font-size: 13px;
      text-align: center;
      padding: 12px;
      margin: 0;
    }
  }
  
  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color, #333);
  }
}

.chart-tab {
  :deep(.chart-config-tab) {
    background: transparent;
    padding: 0;
  }
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &.btn-primary {
    background: var(--accent-color, #60a5fa);
    border: none;
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--accent-hover, #3b82f6);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.error-message {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
}

.save-message {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
  
  &.error {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 720px) {
  .dialog-overlay {
    padding: 8px;
  }

  .dialog-container {
    width: 100%;
    max-height: calc(100dvh - 16px);
  }

  .dialog-header {
    padding: 14px 16px;
  }

  .dialog-tabs {
    padding-inline: 12px;

    .tab-btn {
      flex: 1;
      justify-content: center;
      padding-inline: 10px;
    }
  }

  .dialog-content {
    min-width: 0;
    padding: 12px;
  }
}

// Modal transition
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
  
  .dialog-container {
    transition: transform 0.2s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  
  .dialog-container {
    transform: scale(0.95);
  }
}
</style>
