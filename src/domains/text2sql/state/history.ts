/** Text2SQL query-history state. */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { text2sqlApi } from '../api/client.ts'
import type {
  QueryHistoryItem,
  SaveQueryHistoryRequest,
} from '../api/contracts.ts'

export const useHistoryStore = defineStore('text2sql-history', () => {
  const items = ref<QueryHistoryItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedItem = ref<QueryHistoryItem | null>(null)
  const activeSearch = ref('')
  const activeStatus = ref('')
  let fetchSequence = 0

  // 히스토리 목록 불러오기
  async function fetchHistory(options?: { page?: number; search?: string; status?: string }): Promise<void> {
    const requestedSearch = options?.search ?? activeSearch.value
    const requestedStatus = options?.status ?? activeStatus.value
    const filterChanged = requestedSearch !== activeSearch.value || requestedStatus !== activeStatus.value
    const requestedPage = options?.page ?? (filterChanged ? 1 : page.value)
    const sequence = ++fetchSequence

    loading.value = true
    error.value = null

    try {
      const data = await text2sqlApi.getHistory({
        page: requestedPage,
        pageSize: pageSize.value,
        search: requestedSearch || undefined,
        status: requestedStatus || undefined,
      })
      if (sequence !== fetchSequence) return
      items.value = data.items
      total.value = data.total
      page.value = data.page
      activeSearch.value = requestedSearch
      activeStatus.value = requestedStatus
    } catch (err) {
      if (sequence !== fetchSequence) return
      error.value = err instanceof Error ? err.message : 'Failed to fetch history'
    } finally {
      if (sequence === fetchSequence) loading.value = false
    }
  }

  // 히스토리 항목 저장
  async function saveToHistory(entry: SaveQueryHistoryRequest): Promise<QueryHistoryItem> {
    const saved = await text2sqlApi.saveHistory(entry)
    items.value = [saved, ...items.value]
    total.value++
    return saved
  }

  // 히스토리 항목 삭제
  async function deleteHistory(id: string): Promise<void> {
    await text2sqlApi.deleteHistory(id)

    items.value = items.value.filter(item => item.id !== id)
    total.value = Math.max(0, total.value - 1)
    if (selectedItem.value?.id === id) {
      selectedItem.value = null
    }
  }

  // 전체 삭제
  async function deleteAllHistory(): Promise<void> {
    await text2sqlApi.deleteAllHistory()

    items.value = []
    total.value = 0
    selectedItem.value = null
  }

  // 히스토리 항목 선택
  function selectItem(item: QueryHistoryItem | null) {
    selectedItem.value = item
  }

  // 다음 페이지
  async function nextPage() {
    if (page.value * pageSize.value < total.value) {
      await fetchHistory({
        page: page.value + 1,
        search: activeSearch.value,
        status: activeStatus.value,
      })
    }
  }

  // 이전 페이지
  async function prevPage() {
    if (page.value > 1) {
      await fetchHistory({
        page: page.value - 1,
        search: activeSearch.value,
        status: activeStatus.value,
      })
    }
  }

  return {
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    selectedItem,
    activeSearch,
    activeStatus,
    fetchHistory,
    saveToHistory,
    deleteHistory,
    deleteAllHistory,
    selectItem,
    nextPage,
    prevPage
  }
})
