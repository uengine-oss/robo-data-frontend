<template>
  <div class="step-timeline">
    <!-- 스텝 네비게이션 -->
    <div class="step-nav">
      <button class="nav-btn" @click="prevStep" :disabled="currentStepIndex === 0" type="button">
        <IconChevronLeft :size="18" />
      </button>

      <div class="step-indicators">
        <button 
          v-for="(step, index) in sortedSteps" 
          :key="step.iteration" 
          type="button" 
          class="step-indicator"
          :class="{ active: index === currentStepIndex }" 
          @click="currentStepIndex = index"
        >
          <span class="step-number">{{ step.iteration }}</span>
        </button>
      </div>

      <button class="nav-btn" @click="nextStep" :disabled="currentStepIndex === sortedSteps.length - 1" type="button">
        <IconChevronRight :size="18" />
      </button>
    </div>

    <!-- 현재 스텝 카드 -->
    <transition name="slide" mode="out-in">
      <div v-if="currentStep" :key="currentStep.iteration" class="step-card">
        <!-- 스텝 헤더 -->
        <div class="step-header">
          <div class="step-meta">
            <h2 class="step-title">Step {{ currentStep.iteration }}</h2>
            <span class="tool-badge">{{ currentStep.tool_call.name }}</span>
          </div>
          <div class="completeness-badge" :class="{
            complete: currentStep.sql_completeness.is_complete,
            incomplete: !currentStep.sql_completeness.is_complete
          }">
            <span>{{ currentStep.sql_completeness.is_complete ? '✓ SQL 완성' : '⋯ 구성 중' }}</span>
          </div>
        </div>

        <!-- SQL 하이라이트 영역 -->
        <div class="sql-highlight">
          <div class="sql-header">
            <h3>생성된 SQL</h3>
            <button class="btn-copy" @click="copySql(currentStep.partial_sql)" type="button">
              <IconCopy :size="12" />
              복사
            </button>
          </div>
          <div class="sql-content">
            <pre><code>{{ currentStep.partial_sql || 'SQL이 아직 생성되지 않았습니다...' }}</code></pre>
          </div>
        </div>

        <!-- 추론 과정 -->
        <div class="reasoning-section">
          <h3>
            <IconBrain :size="14" />
            AI의 사고 과정
          </h3>
          <p class="reasoning-text">{{ currentStep.reasoning || '설명 없음' }}</p>
        </div>

        <!-- 상세 정보 -->
        <details class="details-section">
          <summary>상세 정보 보기</summary>
          <div class="details-content">
            <div class="detail-block">
              <h4>SQL 완성도</h4>
              <div class="info-row">
                <span class="label">상태:</span>
                <span class="value">{{ currentStep.sql_completeness.is_complete ? '완성' : '미완성' }}</span>
              </div>
              <div class="info-row">
                <span class="label">신뢰도:</span>
                <span class="value">{{ currentStep.sql_completeness.confidence_level }}</span>
              </div>
              <div v-if="currentStep.sql_completeness.missing_info" class="info-row">
                <span class="label">누락 정보:</span>
                <span class="value">{{ currentStep.sql_completeness.missing_info }}</span>
              </div>
            </div>

            <div class="detail-block">
              <h4>도구 호출 정보</h4>
              <div class="info-row">
                <span class="label">도구명:</span>
                <span class="value code">{{ currentStep.tool_call.name }}</span>
              </div>
              <details v-if="currentStep.tool_result" class="nested-details">
                <summary>실행 결과</summary>
                <pre><code>{{ currentStep.tool_result }}</code></pre>
              </details>
            </div>
          </div>
        </details>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReactStepModel } from '@/types'
import { IconChevronLeft, IconChevronRight, IconCopy, IconBrain } from '@/components/icons'

const props = defineProps<{
  steps: ReactStepModel[]
  isRunning?: boolean
}>()

const currentStepIndex = ref(0)

const sortedSteps = computed(() => [...props.steps].sort((a, b) => a.iteration - b.iteration))
const currentStep = computed(() => sortedSteps.value[currentStepIndex.value] || null)

function prevStep() {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
  }
}

function nextStep() {
  if (currentStepIndex.value < sortedSteps.value.length - 1) {
    currentStepIndex.value++
  }
}

function copySql(sql: string) {
  if (sql) {
    navigator.clipboard.writeText(sql)
  }
}
</script>

<style scoped lang="scss">
.step-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  padding: 12px 16px;
  border-radius: var(--radius-lg);
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-light);
  transition: all 0.15s;
}

.nav-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  background: rgba(34, 139, 230, 0.15);
  color: var(--color-accent);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.step-indicators {
  flex: 1;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 4px 0;
}

.step-indicator {
  flex-shrink: 0;
  padding: 6px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
}

.step-indicator .step-number {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-light);
}

.step-indicator.active {
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
  border-color: transparent;
}

.step-indicator.active .step-number {
  color: white;
}

.step-indicator:hover:not(.active) {
  border-color: var(--color-accent);
  background: rgba(34, 139, 230, 0.1);
}

.step-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.step-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-accent);
}

.tool-badge {
  padding: 4px 10px;
  background: rgba(124, 58, 237, 0.2);
  color: var(--color-accent-secondary);
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.completeness-badge {
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
}

.completeness-badge.complete {
  background: rgba(64, 192, 87, 0.2);
  color: var(--color-success);
}

.completeness-badge.incomplete {
  background: rgba(251, 191, 36, 0.2);
  color: var(--color-warning);
}

.sql-highlight {
  margin-bottom: 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-accent);
}

.sql-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
}

.sql-header h3 {
  margin: 0;
  color: white;
  font-size: 14px;
  font-weight: 600;
}

.btn-copy {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.15s;
}

.btn-copy:hover {
  background: rgba(255, 255, 255, 0.3);
}

.sql-content {
  background: var(--color-bg-tertiary);
  padding: 16px;
  max-height: 200px;
  overflow: auto;
}

.sql-content pre {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: pre-wrap;
}

.sql-content code {
  color: var(--color-accent);
}

.reasoning-section {
  background: rgba(34, 139, 230, 0.1);
  border: 1px solid rgba(34, 139, 230, 0.2);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.reasoning-section h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px 0;
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.reasoning-text {
  margin: 0;
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.details-section {
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.details-section summary {
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  cursor: pointer;
  font-weight: 600;
  color: var(--color-text-light);
  font-size: 13px;
  transition: all 0.15s;
}

.details-section summary:hover {
  background: var(--color-bg-elevated);
  color: var(--color-accent);
}

.details-content {
  padding: 16px;
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-block {
  padding: 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
}

.detail-block h4 {
  margin: 0 0 8px 0;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

.info-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  margin-bottom: 4px;
}

.info-row .label {
  font-weight: 600;
  color: var(--color-text-light);
  min-width: 70px;
}

.info-row .value {
  color: var(--color-text);
}

.info-row .value.code {
  font-family: var(--font-mono);
  background: var(--color-bg);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
}

.nested-details {
  margin-top: 8px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.nested-details summary {
  padding: 8px 12px;
  background: var(--color-bg);
  cursor: pointer;
  font-weight: 500;
  color: var(--color-accent);
  font-size: 12px;
}

.nested-details pre {
  margin: 0;
  padding: 12px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 11px;
  overflow-x: auto;
  white-space: pre-wrap;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
