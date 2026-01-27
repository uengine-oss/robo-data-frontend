<script setup lang="ts">
/**
 * OntologyTab.vue
 * 도메인 온톨로지 스키마 생성 및 모니터링 메인 탭
 */
import { ref, computed, onMounted } from 'vue'
import OntologyWizard from './OntologyWizard.vue'
import OntologyCanvas from './OntologyCanvas.vue'
import InstancePanel from './InstancePanel.vue'
import FeedbackModal from './FeedbackModal.vue'
import SchemaSelector from './SchemaSelector.vue'
import { useOntologyStore } from '@/stores/ontology'
import { storeToRefs } from 'pinia'
import type { OntologySchema } from '@/types'

const store = useOntologyStore()
const { 
  wizard,
  schema, 
  selectedNode,
  isFeedbackModalOpen
} = storeToRefs(store)

// 디버깅
console.log('[OntologyTab] mounted, wizard:', wizard.value, 'schema:', schema.value)

// 피드백 텍스트
const feedbackText = ref('')

// 위저드 완료 여부 (binding 단계 완료 후)
const isWizardCompleted = computed(() => wizard.value.step === 'binding' && schema.value !== null)

// 로딩 상태
const isGenerating = computed(() => wizard.value.isGenerating)

// 인스턴스 패널 상태
const isInstancePanelOpen = ref(false)

// 피드백 제출
async function handleFeedbackSubmit() {
  if (!feedbackText.value.trim()) return
  
  await store.applyFeedback(feedbackText.value)
  feedbackText.value = ''
}

// 노드 선택 시 인스턴스 패널 열기
function handleNodeSelect(nodeId: string) {
  store.selectNode(nodeId)
  isInstancePanelOpen.value = true
}

// 인스턴스 패널 닫기
function closeInstancePanel() {
  isInstancePanelOpen.value = false
}

// 새 온톨로지 생성
function handleNewOntology() {
  store.reset()
}

// 스키마 선택 시
function handleSchemaSelected(selectedSchema: OntologySchema) {
  store.applySchema(selectedSchema)
  store.setWizardStep('binding')
}

// 스키마 저장
async function handleSaveSchema() {
  if (schema.value) {
    await store.saveSchema()
  }
}
</script>

<template>
  <div class="ontology-tab">
    <!-- 디버깅 정보 -->
    <div v-if="false" style="background: #333; padding: 10px; color: #fff; font-size: 12px;">
      wizard.step: {{ wizard?.step }}, schema: {{ schema ? 'exists' : 'null' }}, isWizardCompleted: {{ isWizardCompleted }}
    </div>
    
    <!-- 위저드 모드 (초기 설정) -->
    <OntologyWizard 
      v-if="!isWizardCompleted" 
      @open-feedback="isFeedbackModalOpen = true"
    />
    
    <!-- 모니터링 모드 (위저드 완료 후) -->
    <template v-else>
      <!-- 상단 툴바 -->
      <div class="ontology-toolbar">
        <div class="toolbar-left">
          <!-- 스키마 선택기 -->
          <SchemaSelector 
            @new-schema="handleNewOntology"
            @schema-selected="handleSchemaSelected"
          />
          <h2 class="toolbar-title">
            <span class="title-icon">🔮</span>
            {{ schema?.name || '도메인 온톨로지' }}
          </h2>
          <span class="node-count">{{ schema?.nodes?.length || 0 }} 노드</span>
        </div>
        <div class="toolbar-right">
          <button class="toolbar-btn save-btn" @click="handleSaveSchema">
            <span>💾</span>
            저장
          </button>
          <button class="toolbar-btn feedback-btn" @click="isFeedbackModalOpen = true">
            <span>💬</span>
            스키마 수정
          </button>
          <button class="toolbar-btn new-btn" @click="handleNewOntology">
            <span>✨</span>
            새 온톨로지
          </button>
        </div>
      </div>
      
      <!-- 메인 콘텐츠 영역 -->
      <div class="ontology-content">
        <!-- VueFlow 캔버스 -->
        <OntologyCanvas 
          :schema="schema"
          @node-select="handleNodeSelect"
        />
        
        <!-- 인스턴스 패널 (우측) -->
        <Transition name="slide-right">
          <InstancePanel 
            v-if="isInstancePanelOpen && selectedNode"
            :node="selectedNode"
            @close="closeInstancePanel"
          />
        </Transition>
      </div>
    </template>
    
    <!-- 피드백 모달 -->
    <FeedbackModal
      :is-open="isFeedbackModalOpen"
      :is-loading="isGenerating"
      v-model:feedback="feedbackText"
      @close="isFeedbackModalOpen = false"
      @submit="handleFeedbackSubmit"
    />
  </div>
</template>

<style scoped lang="scss">
.ontology-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

.ontology-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-bright);
  
  .title-icon {
    font-size: 1.2rem;
  }
}

.node-count {
  font-size: 0.8rem;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  color: var(--color-text-muted);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--color-bg-hover);
    border-color: var(--color-accent);
  }
  
  &.save-btn:hover {
    border-color: #34d399;
    color: #34d399;
  }
  
  &.feedback-btn:hover {
    border-color: #a78bfa;
    color: #a78bfa;
  }
  
  &.new-btn:hover {
    border-color: #38bdf8;
    color: #38bdf8;
  }
}

.ontology-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

// 슬라이드 애니메이션
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
