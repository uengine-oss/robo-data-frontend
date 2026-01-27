<template>
  <div class="scenario-input">
    <h3 class="section-title">📝 분석 시나리오 정의</h3>
    <p class="section-desc">
      예측하고자 하는 내용을 자연어로 서술해주세요. 
      시스템이 관련된 데이터와 인과관계를 자동으로 탐색합니다.
    </p>
    
    <div class="input-area">
      <textarea
        :value="modelValue"
        @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        placeholder="예: 환율 변동이 제품 원가와 최종 수익에 미치는 영향을 분석하고 싶습니다."
        class="scenario-textarea"
        rows="4"
      ></textarea>
      
      <div class="example-queries">
        <span class="example-label">예시 쿼리:</span>
        <button 
          v-for="example in examples" 
          :key="example"
          class="example-btn"
          @click="setExample(example)"
        >
          {{ example }}
        </button>
      </div>
    </div>
    
    <div class="action-area">
      <button 
        class="discover-btn"
        :disabled="!modelValue.trim() || loading"
        @click="$emit('discover')"
      >
        <svg v-if="loading" class="spinner" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        {{ loading ? '데이터 탐색 중...' : '데이터 발견 시작' }}
      </button>
    </div>
    
    <div class="info-cards">
      <div class="info-card">
        <div class="card-icon">🔍</div>
        <div class="card-content">
          <h4>자동 테이블 탐색</h4>
          <p>Text2SQL을 통해 관련된 데이터베이스 테이블을 자동으로 찾습니다.</p>
        </div>
      </div>
      <div class="info-card">
        <div class="card-icon">🧠</div>
        <div class="card-content">
          <h4>인과관계 추정</h4>
          <p>Granger Causality, Partial Correlation 등을 사용해 인과관계를 발견합니다.</p>
        </div>
      </div>
      <div class="info-card">
        <div class="card-icon">📊</div>
        <div class="card-content">
          <h4>모델 검증</h4>
          <p>Train/Test 분할로 과적합을 방지하고 MindsDB 모델과 비교합니다.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'discover'): void
}>()

const examples = [
  '환율 변화가 수익에 미치는 영향',
  '마케팅 비용과 판매량의 상관관계',
  '고객 만족도와 재구매율의 관계'
]

function setExample(example: string) {
  emit('update:modelValue', example)
}
</script>

<style scoped>
.scenario-input {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-accent);
  margin: 0;
}

.section-desc {
  color: var(--color-text-light);
  font-size: 0.9rem;
  margin: 0;
  line-height: 1.6;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.scenario-textarea {
  width: 100%;
  padding: 0.875rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-bright);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
  transition: all 0.2s ease;
}

.scenario-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb, 59, 130, 246), 0.15);
}

.scenario-textarea::placeholder {
  color: var(--color-text-muted);
}

.example-queries {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.example-label {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.example-btn {
  padding: 0.35rem 0.7rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  color: var(--color-text-light);
  font-family: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.example-btn:hover {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.action-area {
  display: flex;
  justify-content: center;
}

.discover-btn {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1.5rem;
  background: var(--color-accent);
  border: none;
  border-radius: 8px;
  color: white;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.discover-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.discover-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.discover-btn svg {
  width: 18px;
  height: 18px;
}

.spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.info-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.875rem;
  margin-top: 0.75rem;
}

.info-card {
  display: flex;
  gap: 0.875rem;
  padding: 1rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.info-card:hover {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
}

.card-icon {
  font-size: 1.25rem;
}

.card-content h4 {
  margin: 0 0 0.35rem 0;
  font-size: 0.9rem;
  color: var(--color-text-bright);
}

.card-content p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-light);
  line-height: 1.5;
}
</style>
