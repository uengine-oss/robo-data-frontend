/**
 * semanticSearch.ts (spec 046)
 *
 * 그래프 탭 Overview 의미 기반 코드 검색의 세션 상태.
 * 질의 하나에 대한 진행(스트림)·결과 뭉치·취소를 보유한다. 한 번에 하나의 활성 검색만
 * 유지하며, 새 검색은 이전 것을 취소한다. query 는 Overview 입력·상단 ⌘K 진입의 단일 출처.
 *
 * 계약 = specs/046 contracts/search-stream.md. 상태/뷰 = data-model.md.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { roboApi } from '@/features/code-analysis/api'
import { useSessionStore } from '@/shared/stores/session'
import type { SearchCluster, SearchPhase, SearchEvent } from '@/shared/types'

export type SearchStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

export const useSemanticSearchStore = defineStore('semanticSearch', () => {
  const query = ref('')
  const status = ref<SearchStatus>('idle')
  const phases = ref<SearchPhase[]>([])
  const elapsedSec = ref(0)
  const clusters = ref<SearchCluster[]>([])
  const errorMessage = ref<string | null>(null)

  // 비노출 내부 — 취소 핸들·타이머. 새 검색/취소가 이전 것을 정리한다.
  let abort: AbortController | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const isSearching = computed(() => status.value === 'running')
  const currentPhaseLabel = computed(() => phases.value.at(-1)?.label ?? '')
  const hasResults = computed(() => status.value === 'done' && clusters.value.length > 0)
  const isEmpty = computed(() => status.value === 'done' && clusters.value.length === 0)

  function setQuery(q: string): void {
    query.value = q
  }

  function stopTimer(): void {
    if (timer !== null) { clearInterval(timer); timer = null }
  }

  /** 검색 실행. 이전 검색은 취소된다(FR-010). query 가 비어 있으면 무시. */
  async function run(): Promise<void> {
    const q = query.value.trim()
    if (!q) return

    // 이전 검색 취소 + 상태 초기화.
    abort?.abort()
    stopTimer()
    const myAbort = new AbortController()
    abort = myAbort

    status.value = 'running'
    phases.value = []
    clusters.value = []
    errorMessage.value = null
    elapsedSec.value = 0
    timer = setInterval(() => { elapsedSec.value += 1 }, 1000)

    const headers = useSessionStore().getHeaders()

    // 취소/교체 가드 — 이 run 이 여전히 현재 검색일 때만 상태를 건드린다(SC-007).
    const isCurrent = () => abort === myAbort

    const onEvent = (e: SearchEvent): void => {
      if (!isCurrent()) return
      switch (e.type) {
        case 'progress':
          phases.value = [...phases.value, {
            stage: e.stage ?? '',
            label: e.label ?? '',
            detail: e.detail,
          }]
          break
        case 'result':
          clusters.value = e.clusters ?? []
          status.value = 'done'
          stopTimer()
          break
        case 'error':
          errorMessage.value = e.message ?? '검색에 실패했습니다'
          status.value = 'error'
          stopTimer()
          break
        case 'stream_end':
          // 종결 센티넬 — result/error 를 못 받은 채 끝나면 방어적으로 done.
          if (status.value === 'running') { status.value = 'done'; stopTimer() }
          break
      }
    }

    try {
      await roboApi.searchSemantic({ query: q }, headers, onEvent, myAbort.signal)
      // HTTP done 인데 result/error 를 못 받았으면 실패로 표면화.
      if (isCurrent() && status.value === 'running') {
        status.value = 'error'
        errorMessage.value = '검색 결과를 받지 못했습니다'
        stopTimer()
      }
    } catch (err) {
      if (!isCurrent()) return                 // 취소로 교체됨 — 무시.
      if (err instanceof DOMException && err.name === 'AbortError') return  // 취소 정상.
      status.value = 'error'
      errorMessage.value = err instanceof Error ? err.message : '검색에 실패했습니다'
      stopTimer()
    }
  }

  /** 진행 중 취소 — 이후 도착 이벤트는 가드로 무시된다(SC-007). */
  function cancel(): void {
    abort?.abort()
    abort = null
    stopTimer()
    status.value = 'cancelled'
    phases.value = []
  }

  /** 초기 상태로 되돌림. */
  function reset(): void {
    abort?.abort()
    abort = null
    stopTimer()
    query.value = ''
    status.value = 'idle'
    phases.value = []
    clusters.value = []
    errorMessage.value = null
    elapsedSec.value = 0
  }

  return {
    query, status, phases, elapsedSec, clusters, errorMessage,
    isSearching, currentPhaseLabel, hasResults, isEmpty,
    setQuery, run, cancel, reset,
  }
})
