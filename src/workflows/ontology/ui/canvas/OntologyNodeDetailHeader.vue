<template>
  <div class="ontology-node-detail-header">
    <div class="detail-header">
      <h3>📋 노드 상세</h3>
      <div class="detail-header-actions">
        <button type="button" class="delete-node-btn" title="노드 삭제" @click="emit('delete')">
          🗑️ 삭제
        </button>
        <button
          type="button"
          class="detail-close-btn"
          aria-label="노드 상세 닫기"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="detail-tabs" role="tablist" aria-label="노드 상세 보기">
      <button
        v-for="tab in tabs"
        :id="`ontology-node-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`ontology-node-panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        :data-tab-id="tab.id"
        :aria-busy="tab.id === 'behavior' ? behaviorLoading : undefined"
        :disabled="tab.disabled"
        :title="tab.title"
        @click="emit('select-tab', tab.id)"
        @keydown="handleTabKeydown($event, tab.id)"
      >
        {{ tab.icon }} {{ tab.label }}
        <span v-if="tab.indicated" class="data-indicator">●</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type OntologyNodeDetailTab = 'info' | 'data' | 'analysis' | 'behavior' | 'bpmn'

interface NodeDetailTabPresentation {
  id: OntologyNodeDetailTab
  icon: string
  label: string
  disabled: boolean
  indicated: boolean
  title?: string
}

const props = defineProps<{
  activeTab: OntologyNodeDetailTab
  hasDataSource: boolean
  isMeasure: boolean
  isKpiOrMeasure: boolean
  behaviorLoading: boolean
  behaviorCount: number
  isProcess: boolean
  hasBpmn: boolean
}>()

const emit = defineEmits<{
  (event: 'delete' | 'close'): void
  (event: 'select-tab', tab: OntologyNodeDetailTab): void
}>()

const tabs = computed<NodeDetailTabPresentation[]>(() => {
  const result: NodeDetailTabPresentation[] = [
    {
      id: 'info',
      icon: 'ℹ️',
      label: '정보',
      disabled: false,
      indicated: false,
    },
    {
      id: 'data',
      icon: '📊',
      label: '데이터',
      disabled: !props.hasDataSource && !props.isMeasure,
      indicated: props.hasDataSource,
      title: props.hasDataSource
        ? '데이터 조회'
        : props.isMeasure
          ? '데이터 소스 연결 또는 ObjectType 생성'
          : '연결된 데이터 소스 없음',
    },
    {
      id: 'analysis',
      icon: '🔍',
      label: '분석',
      disabled: !props.hasDataSource || !props.isKpiOrMeasure,
      indicated: props.hasDataSource && props.isKpiOrMeasure,
      title: !props.hasDataSource
        ? '연결된 데이터 소스 없음'
        : !props.isKpiOrMeasure
          ? 'KPI/Measure 노드만 분석 가능'
          : '원인 분석',
    },
    {
      id: 'behavior',
      icon: '🧠',
      label: 'Behavior',
      disabled: false,
      indicated: props.behaviorCount > 0,
    },
  ]
  if (props.isProcess) {
    result.push({
      id: 'bpmn',
      icon: '📐',
      label: 'BPMN',
      disabled: !props.hasBpmn,
      indicated: props.hasBpmn,
      title: props.hasBpmn ? 'BPMN 다이어그램 보기' : 'BPMN 데이터 없음',
    })
  }
  return result
})

function handleTabKeydown(event: KeyboardEvent, currentTab: OntologyNodeDetailTab): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const enabledTabs = tabs.value.filter(tab => !tab.disabled)
  const currentIndex = enabledTabs.findIndex(tab => tab.id === currentTab)
  if (currentIndex < 0) return

  event.preventDefault()
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? enabledTabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + enabledTabs.length)
        % enabledTabs.length
  const nextTab = enabledTabs[nextIndex]
  emit('select-tab', nextTab.id)
  const tabList = (event.currentTarget as HTMLElement).closest('[role="tablist"]')
  const nextButton = tabList?.querySelector<HTMLElement>(`[data-tab-id="${nextTab.id}"]`)
  nextButton?.focus()
}
</script>

<style scoped>
.ontology-node-detail-header {
  flex-shrink: 0;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.detail-header h3 {
  margin: 0;
  padding: 14px 20px;
  color: #fff;
  font-size: 1.05rem;
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
}

.detail-close-btn {
  display: inline-grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.detail-close-btn:hover {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.detail-close-btn:focus-visible,
.delete-node-btn:focus-visible,
.tab-btn:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.delete-node-btn {
  padding: 5px 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}

.delete-node-btn:hover {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.detail-tabs {
  display: flex;
  flex-shrink: 0;
  overflow-x: auto;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-btn {
  position: relative;
  flex: 1 0 auto;
  min-height: 42px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
}

.tab-btn.active {
  border-bottom-color: #818cf8;
  color: #c7d2fe;
  background: rgba(99, 102, 241, 0.08);
}

.tab-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.data-indicator {
  margin-left: 3px;
  color: #22c55e;
  font-size: 0.58rem;
}

:global(.light-mode) .detail-header h3 {
  color: #0f172a;
}

:global(.light-mode) .detail-close-btn {
  border-color: rgba(15, 23, 42, 0.15);
  background: rgba(15, 23, 42, 0.04);
  color: #475569;
}

:global(.light-mode) .detail-tabs {
  border-bottom-color: rgba(15, 23, 42, 0.1);
}

:global(.light-mode) .tab-btn {
  color: #64748b;
}

:global(.light-mode) .tab-btn.active {
  border-bottom-color: #4f46e5;
  background: rgba(79, 70, 229, 0.06);
  color: #4338ca;
}
</style>
