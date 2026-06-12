<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { glossaryApi } from '@/features/glossary/api'

interface SynonymSuggestion {
  termId: string
  termName: string
  glossaryId: string
  glossaryName: string
  suggestedSynonym: string
  similarity: number
  sourceNodeName: string
  sourceLayer: string
  accepted: boolean
}

const props = defineProps<{
  suggestions: SynonymSuggestion[]
}>()

const emit = defineEmits<{
  close: []
  applied: [count: number]
}>()

const sessionStore = useSessionStore()
const localSuggestions = ref<SynonymSuggestion[]>([])
const applying = ref(false)
const error = ref<string | null>(null)
const applyProgress = ref({ completed: 0, total: 0 })
const applyResults = ref<Array<{
  termName: string
  glossaryName: string
  count: number
  success: boolean
  error?: string
}>>([])

watch(
  () => props.suggestions,
  (suggestions) => {
    localSuggestions.value = suggestions.map((suggestion) => ({ ...suggestion }))
    error.value = null
    applyResults.value = []
    applyProgress.value = { completed: 0, total: 0 }
  },
  { immediate: true }
)

const acceptedCount = computed(() =>
  localSuggestions.value.filter((suggestion) => suggestion.accepted).length
)

const groupedByTerm = computed(() => {
  const groups = new Map<string, {
    termId: string
    termName: string
    glossaryId: string
    glossaryName: string
    suggestions: SynonymSuggestion[]
  }>()

  for (const suggestion of localSuggestions.value) {
    const key = `${suggestion.glossaryId}::${suggestion.termId}`
    if (!groups.has(key)) {
      groups.set(key, {
        termId: suggestion.termId,
        termName: suggestion.termName,
        glossaryId: suggestion.glossaryId,
        glossaryName: suggestion.glossaryName,
        suggestions: []
      })
    }
    groups.get(key)?.suggestions.push(suggestion)
  }

  return Array.from(groups.values())
})

function similarityLabel(similarity: number): string {
  const percent = similarity * 100
  if (percent >= 90) return '매우 유사'
  if (percent >= 80) return '유사'
  return '관련 있음'
}

function similarityClass(similarity: number): string {
  const percent = similarity * 100
  if (percent >= 90) return 'sim-very-high'
  if (percent >= 80) return 'sim-high'
  return 'sim-related'
}

function toggleAll(accepted: boolean) {
  localSuggestions.value.forEach((suggestion) => {
    suggestion.accepted = accepted
  })
}

async function applySelected() {
  const acceptedSuggestions = localSuggestions.value.filter((suggestion) => suggestion.accepted)
  if (acceptedSuggestions.length === 0) {
    emit('close')
    return
  }

  applying.value = true
  error.value = null
  applyResults.value = []

  const headers = sessionStore.getHeaders()
  const groupedEntries = new Map<string, {
    glossaryId: string
    glossaryName: string
    termId: string
    termName: string
    newSynonyms: string[]
  }>()

  for (const suggestion of acceptedSuggestions) {
    const key = `${suggestion.glossaryId}::${suggestion.termId}`
    if (!groupedEntries.has(key)) {
      groupedEntries.set(key, {
        glossaryId: suggestion.glossaryId,
        glossaryName: suggestion.glossaryName,
        termId: suggestion.termId,
        termName: suggestion.termName,
        newSynonyms: []
      })
    }
    groupedEntries.get(key)?.newSynonyms.push(suggestion.suggestedSynonym)
  }

  const entries = Array.from(groupedEntries.values())
  applyProgress.value = { completed: 0, total: entries.length }

  let totalApplied = 0
  for (const entry of entries) {
    try {
      const term = await glossaryApi.getTerm(headers, entry.glossaryId, entry.termId)
      const existingSynonyms = term.synonyms || []
      const dedupedNewSynonyms = entry.newSynonyms.filter((synonym, index, collection) => {
        const normalized = synonym.trim().toLowerCase()
        if (!normalized) return false
        return collection.findIndex((item) => item.trim().toLowerCase() === normalized) === index
      })
      const mergedSynonyms = [
        ...existingSynonyms,
        ...dedupedNewSynonyms.filter((synonym) =>
          !existingSynonyms.some((existing) => existing.toLowerCase() === synonym.toLowerCase())
        )
      ]

      await glossaryApi.updateTerm(headers, entry.glossaryId, entry.termId, {
        synonyms: mergedSynonyms
      })

      totalApplied += mergedSynonyms.length - existingSynonyms.length
      applyResults.value.push({
        termName: entry.termName,
        glossaryName: entry.glossaryName,
        count: mergedSynonyms.length - existingSynonyms.length,
        success: true
      })
    } catch (caughtError) {
      applyResults.value.push({
        termName: entry.termName,
        glossaryName: entry.glossaryName,
        count: entry.newSynonyms.length,
        success: false,
        error: caughtError instanceof Error ? caughtError.message : '업데이트 실패'
      })
    }
    applyProgress.value.completed += 1
  }

  applying.value = false
  const hasFailures = applyResults.value.some((result) => !result.success)
  if (hasFailures) {
    const successCount = applyResults.value.filter((result) => result.success).length
    const failureCount = applyResults.value.filter((result) => !result.success).length
    error.value = `일부 용어의 동의어 업데이트에 실패했습니다. 성공: ${successCount}, 실패: ${failureCount}`
    return
  }

  emit('applied', totalApplied)
}
</script>

<template>
  <div class="modal-overlay" @click.self="!applying && emit('close')">
    <div class="synonym-modal">
      <header>
        <h3>동의어 제안</h3>
        <p class="subtitle">
          문서에서 추출된 용어 중 기존 용어집 항목과 유사한 {{ localSuggestions.length }}건이 발견되었습니다.
          수락하면 해당 용어의 동의어로 용어집에 추가됩니다.
        </p>
        <p class="subtitle-hint">이 단계는 건너뛰어도 됩니다. 용어집 탭에서 언제든 동의어를 수정할 수 있습니다.</p>
      </header>

      <div class="actions-bar">
        <button type="button" @click="toggleAll(true)">모두 선택</button>
        <button type="button" @click="toggleAll(false)">모두 해제</button>
      </div>

      <div class="suggestion-list">
        <div v-for="group in groupedByTerm" :key="`${group.glossaryId}::${group.termId}`" class="term-group">
          <div class="term-header">
            <span class="term-name">{{ group.termName }}</span>
            <span class="term-glossary">{{ group.glossaryName }}</span>
          </div>
          <label
            v-for="suggestion in group.suggestions"
            :key="`${group.glossaryId}::${group.termId}::${suggestion.suggestedSynonym}`"
            class="suggestion-item"
          >
            <input v-model="suggestion.accepted" type="checkbox" />
            <span class="synonym-name">{{ suggestion.suggestedSynonym }}</span>
            <span class="synonym-similarity" :class="similarityClass(suggestion.similarity)">
              {{ similarityLabel(suggestion.similarity) }} {{ (suggestion.similarity * 100).toFixed(0) }}%
            </span>
            <span class="synonym-layer">{{ suggestion.sourceLayer }}</span>
          </label>
        </div>
      </div>

      <div v-if="applying" class="apply-progress">
        {{ applyProgress.completed }}/{{ applyProgress.total }} 용어 업데이트 중...
      </div>

      <div v-if="applyResults.length > 0 && applyResults.some((result) => !result.success)" class="apply-results">
        <div
          v-for="result in applyResults.filter((entry) => !entry.success)"
          :key="`${result.glossaryName}::${result.termName}`"
          class="result-fail"
        >
          {{ result.glossaryName }} · {{ result.termName }} - {{ result.error }}
        </div>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <footer>
        <button type="button" @click="emit('close')" :disabled="applying">건너뛰기</button>
        <button
          type="button"
          class="primary"
          @click="applySelected"
          :disabled="applying || acceptedCount === 0"
        >
          {{ applying ? `${applyProgress.completed}/${applyProgress.total} 처리 중...` : `${acceptedCount}개 동의어 추가` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.synonym-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

header {
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--color-border);
}

h3 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.subtitle,
.subtitle-hint {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.subtitle-hint {
  margin-top: 8px;
}

.actions-bar {
  display: flex;
  gap: 8px;
  padding: 16px 24px 0;
}

.actions-bar button,
footer button {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  cursor: pointer;
}

.actions-bar button:hover,
footer button:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.suggestion-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.term-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-bg-secondary);
}

.term-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.term-name {
  font-weight: 600;
  color: var(--color-text);
}

.term-glossary {
  font-size: 12px;
  color: var(--color-text-muted);
}

.suggestion-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  color: var(--color-text);
}

.synonym-name {
  font-weight: 500;
}

.synonym-similarity,
.synonym-layer {
  font-size: 12px;
  color: var(--color-text-muted);
}

.sim-very-high {
  color: #16a34a;
}

.sim-high {
  color: #2563eb;
}

.sim-related {
  color: #b45309;
}

.apply-progress,
.apply-results,
.error-message {
  padding: 0 24px 16px;
  font-size: 13px;
}

.result-fail,
.error-message {
  color: var(--color-error, #dc2626);
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px 24px;
  border-top: 1px solid var(--color-border);
}

footer .primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
