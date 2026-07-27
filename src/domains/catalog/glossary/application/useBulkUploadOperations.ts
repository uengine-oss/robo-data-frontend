import { computed, onScopeDispose, ref } from 'vue'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import {
  glossaryApi,
  type BulkExtractRequest,
  type BulkExtractResponse,
  type BulkImportRequest,
  type BulkImportResponse,
  type BulkUploadResponse,
} from '../api'

interface BulkUploadOperationsInput {
  getGlossaryId: () => string
  getHeaders: () => Record<string, string>
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function useBulkUploadOperations(input: BulkUploadOperationsInput) {
  const timers = useManagedTimeouts()
  const uploading = ref(false)
  const extracting = ref(false)
  const importing = ref(false)
  const rollingBack = ref(false)
  const uploadPhaseMessage = ref('')
  const error = ref<string | null>(null)
  const confirmationError = ref<string | null>(null)
  const extractionProgress = ref<{
    processed: number
    total: number
    estimated_remaining_seconds?: number
  } | null>(null)
  let extractController: AbortController | null = null
  let extractionSequence = 0

  const isBusy = computed(() =>
    uploading.value || extracting.value || importing.value || rollingBack.value,
  )

  async function upload(files: File[]): Promise<BulkUploadResponse | null> {
    if (files.length === 0) {
      error.value = '업로드할 파일을 선택해주세요.'
      return null
    }
    uploading.value = true
    error.value = null
    uploadPhaseMessage.value = '파일을 읽고 있습니다...'
    timers.schedule('bulk-upload-phase', () => {
      uploadPhaseMessage.value = 'AI가 파일 구조를 분석하고 있습니다...'
    }, 700)
    try {
      return await glossaryApi.bulkUploadTerms(
        input.getHeaders(),
        input.getGlossaryId(),
        files,
      )
    } catch (cause: unknown) {
      error.value = errorMessage(cause, '파일 업로드에 실패했습니다.')
      return null
    } finally {
      timers.cancel('bulk-upload-phase')
      uploadPhaseMessage.value = ''
      uploading.value = false
    }
  }

  async function extract(
    request: BulkExtractRequest,
    useAiEnrichment: boolean,
    totalRows: number,
    failureMessage = '용어 추출에 실패했습니다.',
  ): Promise<BulkExtractResponse | null> {
    const sequence = ++extractionSequence
    extractController?.abort()
    extracting.value = true
    extractionProgress.value = null
    error.value = null
    const headers = input.getHeaders()
    try {
      if (!useAiEnrichment) {
        return await glossaryApi.bulkExtractTerms(
          headers,
          input.getGlossaryId(),
          request,
        )
      }

      const controller = new AbortController()
      extractController = controller
      extractionProgress.value = { processed: 0, total: totalRows }
      let completedResult: BulkExtractResponse | null = null
      await glossaryApi.bulkExtractStream(
        headers,
        input.getGlossaryId(),
        request,
        event => {
          if (sequence !== extractionSequence) return
          if (event.event === 'progress') extractionProgress.value = event.data
          if (event.event === 'complete') completedResult = event.data
        },
        { signal: controller.signal },
      )
      return completedResult
    } catch (cause: unknown) {
      if (sequence !== extractionSequence) return null
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        try {
          const partial = await glossaryApi.bulkExtractTerms(
            headers,
            input.getGlossaryId(),
            request,
          )
          error.value = 'AI 보강을 취소했고, 현재까지 처리된 결과를 불러왔습니다.'
          return partial
        } catch {
          error.value = 'AI 보강을 취소했습니다. 필요하면 다시 추출을 시작해주세요.'
          return null
        }
      }
      error.value = errorMessage(cause, failureMessage)
      return null
    } finally {
      if (sequence === extractionSequence) {
        extractController = null
        extracting.value = false
      }
    }
  }

  function cancelExtraction() {
    extractController?.abort()
  }

  async function importTerms(request: BulkImportRequest): Promise<BulkImportResponse | null> {
    importing.value = true
    confirmationError.value = null
    try {
      return await glossaryApi.bulkImportTerms(
        input.getHeaders(),
        input.getGlossaryId(),
        request,
      )
    } catch (cause: unknown) {
      confirmationError.value = errorMessage(cause, '일괄 가져오기에 실패했습니다.')
      return null
    } finally {
      importing.value = false
    }
  }

  async function rollback(batchId: string): Promise<number | null> {
    rollingBack.value = true
    confirmationError.value = null
    try {
      const result = await glossaryApi.bulkRollback(
        input.getHeaders(),
        input.getGlossaryId(),
        batchId,
      )
      return result.deleted
    } catch (cause: unknown) {
      confirmationError.value = errorMessage(cause, '일괄 롤백에 실패했습니다.')
      return null
    } finally {
      rollingBack.value = false
    }
  }

  onScopeDispose(() => {
    extractionSequence += 1
    extractController?.abort()
    extractController = null
  })

  return {
    uploading,
    extracting,
    importing,
    rollingBack,
    isBusy,
    uploadPhaseMessage,
    error,
    confirmationError,
    extractionProgress,
    upload,
    extract,
    cancelExtraction,
    importTerms,
    rollback,
  }
}
