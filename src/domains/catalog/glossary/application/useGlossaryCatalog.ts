import { ref, watch } from 'vue'
import { glossaryApi, type Glossary, type Term } from '../api'

export type GlossaryRetryAction =
  | { kind: 'glossaries' }
  | { kind: 'terms' }
  | { kind: 'selectTerm'; term: Term }
  | { kind: 'editTerm'; term: Term }

interface GlossaryCatalogInput {
  getHeaders: () => Record<string, string>
}

function describeError(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function useGlossaryCatalog(input: GlossaryCatalogInput) {
  const loading = ref(false)
  const metadataLoading = ref(false)
  const error = ref<string | null>(null)
  const glossaries = ref<Glossary[]>([])
  const selectedGlossary = ref<Glossary | null>(null)
  const terms = ref<Term[]>([])
  const selectedTerm = ref<Term | null>(null)
  const retryAction = ref<GlossaryRetryAction | null>(null)
  let glossaryRequest = 0
  let termRequest = 0
  let detailRequest = 0

  function setError(cause: unknown, fallback: string, retry: GlossaryRetryAction) {
    error.value = describeError(cause, fallback)
    retryAction.value = retry
  }

  function clearError() {
    error.value = null
    retryAction.value = null
  }

  async function loadGlossaries() {
    const request = ++glossaryRequest
    loading.value = true
    clearError()
    try {
      const response = await glossaryApi.getGlossaries(input.getHeaders())
      if (request !== glossaryRequest) return
      glossaries.value = response.glossaries
      if (!selectedGlossary.value && response.glossaries.length > 0) {
        selectedGlossary.value = response.glossaries[0]
      } else if (selectedGlossary.value) {
        selectedGlossary.value = response.glossaries.find(
          glossary => glossary.id === selectedGlossary.value?.id,
        ) ?? null
      }
    } catch (cause: unknown) {
      if (request === glossaryRequest) {
        setError(cause, '용어집 목록을 불러오지 못했습니다.', { kind: 'glossaries' })
      }
    } finally {
      if (request === glossaryRequest) loading.value = false
    }
  }

  async function loadTerms() {
    const glossaryId = selectedGlossary.value?.id
    if (!glossaryId) {
      terms.value = []
      selectedTerm.value = null
      return
    }
    const request = ++termRequest
    const selectedTermId = selectedTerm.value?.id
    loading.value = true
    clearError()
    try {
      const response = await glossaryApi.getTerms(input.getHeaders(), glossaryId)
      if (request !== termRequest || selectedGlossary.value?.id !== glossaryId) return
      terms.value = response.terms
      selectedTerm.value = selectedTermId
        ? response.terms.find(term => term.id === selectedTermId) ?? null
        : null
    } catch (cause: unknown) {
      if (request === termRequest && selectedGlossary.value?.id === glossaryId) {
        setError(cause, '용어 목록을 불러오지 못했습니다.', { kind: 'terms' })
      }
    } finally {
      if (request === termRequest && selectedGlossary.value?.id === glossaryId) {
        loading.value = false
      }
    }
  }

  function selectGlossary(glossary: Glossary) {
    selectedGlossary.value = glossary
    selectedTerm.value = null
    metadataLoading.value = false
  }

  async function selectTerm(term: Term) {
    const glossaryId = selectedGlossary.value?.id
    if (!glossaryId) return
    const request = ++detailRequest
    selectedTerm.value = term
    metadataLoading.value = true
    clearError()
    try {
      const detail = await glossaryApi.getTerm(input.getHeaders(), glossaryId, term.id)
      if (
        request === detailRequest
        && selectedGlossary.value?.id === glossaryId
        && selectedTerm.value?.id === term.id
      ) {
        selectedTerm.value = detail
      }
    } catch (cause: unknown) {
      if (request === detailRequest && selectedTerm.value?.id === term.id) {
        setError(cause, '용어 메타데이터를 불러오지 못했습니다.', {
          kind: 'selectTerm',
          term,
        })
      }
    } finally {
      if (request === detailRequest && selectedTerm.value?.id === term.id) {
        metadataLoading.value = false
      }
    }
  }

  async function loadTermForEdit(term: Term): Promise<Term | null> {
    const glossaryId = selectedGlossary.value?.id
    if (!glossaryId) return null
    loading.value = true
    clearError()
    try {
      return await glossaryApi.getTerm(input.getHeaders(), glossaryId, term.id)
    } catch (cause: unknown) {
      setError(cause, '용어 상세 정보를 불러오지 못했습니다.', { kind: 'editTerm', term })
      return null
    } finally {
      loading.value = false
    }
  }

  async function deleteGlossary(glossaryId: string) {
    await glossaryApi.deleteGlossary(input.getHeaders(), glossaryId)
    if (selectedGlossary.value?.id === glossaryId) {
      selectedGlossary.value = null
      terms.value = []
      selectedTerm.value = null
    }
    await loadGlossaries()
  }

  async function deleteTerm(glossaryId: string, termId: string) {
    await glossaryApi.deleteTerm(input.getHeaders(), glossaryId, termId)
    if (selectedTerm.value?.id === termId) selectedTerm.value = null
    await loadTerms()
    await loadGlossaries()
  }

  watch(selectedGlossary, (current, previous) => {
    if (current?.id !== previous?.id) void loadTerms()
  })

  return {
    loading,
    metadataLoading,
    error,
    glossaries,
    selectedGlossary,
    terms,
    selectedTerm,
    retryAction,
    clearError,
    loadGlossaries,
    loadTerms,
    selectGlossary,
    selectTerm,
    loadTermForEdit,
    deleteGlossary,
    deleteTerm,
  }
}
