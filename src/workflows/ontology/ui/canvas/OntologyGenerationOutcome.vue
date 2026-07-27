<script setup lang="ts">
interface GenerationResultSummary {
  nodeCount: number
  relationshipCount: number
  layerBreakdown: Readonly<Record<string, number>>
  synonymSuggestionCount: number
}

defineProps<{
  error: string
  canRetry: boolean
  completed: boolean
  result: GenerationResultSummary
  saveStatus: 'saving' | 'saved' | 'failed'
  saveError: string
}>()

const emit = defineEmits<{
  retry: []
  edit: []
  close: []
  reviewSynonyms: []
  finish: []
}>()
</script>

<template>
  <div v-if="error" class="error-result-view">
    <div class="error-result-icon">⚠️</div>
    <h4 class="error-result-title">온톨로지 생성 오류</h4>
    <p class="error-result-message" role="alert">{{ error }}</p>
    <div class="error-result-actions">
      <button v-if="canRetry" type="button" class="retry-btn" @click="emit('retry')">
        같은 요청 다시 시도
      </button>
      <button type="button" class="retry-btn" @click="emit('edit')">입력 수정</button>
      <button type="button" class="close-error-btn" @click="emit('close')">닫기</button>
    </div>
  </div>

  <div v-else-if="completed" class="generation-complete-view">
    <div class="complete-icon-row">
      <span class="complete-icon">&#x2705;</span>
      <h4 class="complete-title">온톨로지 생성 완료</h4>
    </div>

    <div class="complete-summary">
      <div class="summary-stat">
        <span class="stat-value">{{ result.nodeCount }}</span>
        <span class="stat-label">노드</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">{{ result.relationshipCount }}</span>
        <span class="stat-label">관계</span>
      </div>
      <div class="summary-stat">
        <span class="stat-value">{{ Object.keys(result.layerBreakdown).length }}</span>
        <span class="stat-label">레이어</span>
      </div>
    </div>

    <div class="complete-layer-tags">
      <span v-for="(count, layerName) in result.layerBreakdown" :key="layerName" class="layer-tag">
        {{ layerName }}: {{ count }}개
      </span>
    </div>

    <div class="complete-save-status">
      <template v-if="saveStatus === 'saving'">
        <span class="save-spinner"></span>
        <span>Neo4j에 저장 중...</span>
      </template>
      <template v-else-if="saveStatus === 'saved'">
        <span class="save-check">&#x2714;</span>
        <span>Neo4j에 저장 완료</span>
      </template>
      <template v-else>
        <span class="save-fail">&#x2716;</span>
        <span>저장 실패: {{ saveError }}</span>
      </template>
    </div>

    <div v-if="result.synonymSuggestionCount > 0" class="complete-synonym-section">
      <p class="synonym-info-text">
        문서에서 추출된 용어 중 기존 용어집 항목과 유사한
        <strong>{{ result.synonymSuggestionCount }}건</strong>이 발견되었습니다.
        수락하면 해당 용어의 동의어로 용어집에 자동 추가됩니다.
      </p>
      <button type="button" class="synonym-review-btn" @click="emit('reviewSynonyms')">
        동의어 리뷰하기
      </button>
    </div>
    <div v-else class="complete-synonym-section no-suggestions">
      <p class="synonym-info-text">용어집에 추가할 동의어 후보가 발견되지 않았습니다.</p>
    </div>

    <div class="complete-actions">
      <button type="button" class="complete-close-btn" @click="emit('finish')">
        온톨로지 보기
      </button>
    </div>
  </div>
</template>
