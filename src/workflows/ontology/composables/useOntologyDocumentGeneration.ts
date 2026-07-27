import {
  computed,
  onScopeDispose,
  ref,
  watch,
} from 'vue'
import {
  objectExplorerApi,
  type MultiLayerGenerationEvent,
} from '@/domains/ontology'
import { glossaryApi, type Glossary } from '@/domains/catalog/glossary'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  canCreateOntologyDocumentGenerationTarget,
  createOntologyDocumentGenerationTarget,
  isPdfDocument,
  OntologyDocumentGenerationValidationError,
  type OntologyDocumentGenerationForm,
  type OntologyDocumentGenerationTarget,
  type OntologyDocumentInputType,
} from '../application/documentGeneration'

interface UseOntologyDocumentGenerationInput {
  loadGlossaries?: (signal: AbortSignal) => Promise<Glossary[]>
  generate?: (
    body: OntologyDocumentGenerationTarget['body'],
    onEvent: (event: MultiLayerGenerationEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>
  onStart: (inputType: OntologyDocumentInputType) => void
  onEvent: (event: MultiLayerGenerationEvent) => void
  onCancel: () => void
  onFailure: (message: string) => void
  encodePdf?: (file: File, signal: AbortSignal) => Promise<string>
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function encodePdfFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }

    const reader = new FileReader()
    const abort = () => reader.abort()
    signal.addEventListener('abort', abort, { once: true })
    reader.onload = () => {
      signal.removeEventListener('abort', abort)
      const result = typeof reader.result === 'string' ? reader.result : ''
      const separator = result.indexOf(',')
      if (separator < 0 || !result.slice(separator + 1)) {
        reject(new Error('PDF 파일을 인코딩하지 못했습니다.'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.onerror = () => {
      signal.removeEventListener('abort', abort)
      reject(reader.error ?? new Error('PDF 파일을 읽지 못했습니다.'))
    }
    reader.onabort = () => {
      signal.removeEventListener('abort', abort)
      reject(abortError())
    }
    reader.readAsDataURL(file)
  })
}

export function useOntologyDocumentGeneration(
  input: UseOntologyDocumentGenerationInput,
) {
  const showGenerateDialog = ref(false)
  const generationMode = ref<'document' | 'schema'>('document')
  const generating = ref(false)
  const generateError = ref('')
  const failedGenerationTarget = ref<OntologyDocumentGenerationTarget | null>(null)
  const generateForm = ref<OntologyDocumentGenerationForm>({
    inputType: 'text',
    text: '',
    pdfUrl: '',
    selectedGlossaryIds: [],
  })
  const useAllGlossaries = ref(true)
  const glossariesForSelect = ref<Glossary[]>([])
  const glossaryLoading = ref(false)
  const glossaryError = ref('')
  const uploadedFile = ref<File | null>(null)
  const isDraggingFile = ref(false)
  const fileUploadError = ref('')

  let glossarySequence = 0
  let glossaryController: AbortController | null = null
  let generationSequence = 0
  let generationController: AbortController | null = null
  let activeGenerationTarget: OntologyDocumentGenerationTarget | null = null
  const loadGlossaries = input.loadGlossaries ?? (async signal => {
    const result = await glossaryApi.getGlossaries(useRuntimeStore().getHeaders(), signal)
    return result.glossaries
  })
  const generate = input.generate ?? (
    (body, onEvent, signal) => objectExplorerApi.generateMultiLayer(body, onEvent, signal)
  )

  const canGenerate = computed(() => canCreateOntologyDocumentGenerationTarget(
    generateForm.value,
    useAllGlossaries.value,
    uploadedFile.value !== null,
  ))

  function abortGlossaryRead() {
    glossarySequence += 1
    glossaryController?.abort()
    glossaryController = null
    glossaryLoading.value = false
  }

  async function loadGlossariesForGeneration() {
    const sequence = ++glossarySequence
    glossaryController?.abort()
    const controller = new AbortController()
    glossaryController = controller
    glossaryLoading.value = true
    glossaryError.value = ''

    try {
      const glossaries = await loadGlossaries(controller.signal)
      if (sequence !== glossarySequence || controller.signal.aborted) return
      glossariesForSelect.value = glossaries
    } catch (error: unknown) {
      if (sequence !== glossarySequence || controller.signal.aborted || isAbortError(error)) return
      glossaryError.value = error instanceof Error
        ? error.message
        : '용어집 목록을 불러오지 못했습니다.'
    } finally {
      if (sequence === glossarySequence) {
        glossaryLoading.value = false
        glossaryController = null
      }
    }
  }

  function openGenerateDialog(mode: 'document' | 'schema') {
    generationMode.value = mode
    showGenerateDialog.value = true
    generateError.value = ''
    failedGenerationTarget.value = null
  }

  function closeGenerateDialog() {
    if (generating.value) return
    showGenerateDialog.value = false
    generateError.value = ''
    failedGenerationTarget.value = null
    abortGlossaryRead()
  }

  function onToggleAllGlossaries() {
    if (useAllGlossaries.value) {
      generateForm.value.selectedGlossaryIds = []
    }
  }

  function acceptPdfFile(file: File) {
    if (!isPdfDocument(file)) {
      uploadedFile.value = null
      fileUploadError.value = 'PDF 파일만 업로드할 수 있습니다.'
      return false
    }
    uploadedFile.value = file
    fileUploadError.value = ''
    return true
  }

  function removePdfFile() {
    uploadedFile.value = null
    fileUploadError.value = ''
  }

  async function createTarget(signal: AbortSignal): Promise<OntologyDocumentGenerationTarget> {
    let pdfContent: string | undefined
    if (generateForm.value.inputType === 'pdf') {
      if (!uploadedFile.value) {
        throw new OntologyDocumentGenerationValidationError('생성할 PDF 파일을 선택해주세요.')
      }
      pdfContent = await (input.encodePdf ?? encodePdfFile)(uploadedFile.value, signal)
    }
    return createOntologyDocumentGenerationTarget(
      generateForm.value,
      useAllGlossaries.value,
      pdfContent,
    )
  }

  async function runGeneration(target?: OntologyDocumentGenerationTarget) {
    const sequence = ++generationSequence
    generationController?.abort()
    const controller = new AbortController()
    generationController = controller
    generating.value = true
    generateError.value = ''
    failedGenerationTarget.value = null

    try {
      const frozenTarget = target ?? await createTarget(controller.signal)
      if (sequence !== generationSequence || controller.signal.aborted) return
      activeGenerationTarget = frozenTarget
      input.onStart(frozenTarget.inputType)

      await generate(
        frozenTarget.body,
        event => {
          if (sequence !== generationSequence || controller.signal.aborted) return
          input.onEvent(event)
          if (event.event === 'error') {
            throw new Error(event.message || '온톨로지 생성 중 오류가 발생했습니다.')
          }
          if (event.event === 'complete' && !event.data.success) {
            throw new Error(event.data.error || '온톨로지 생성에 실패했습니다.')
          }
        },
        controller.signal,
      )
      if (sequence === generationSequence && !controller.signal.aborted) {
        activeGenerationTarget = null
      }
    } catch (error: unknown) {
      if (sequence !== generationSequence || controller.signal.aborted || isAbortError(error)) return
      const message = error instanceof Error
        ? error.message
        : '온톨로지 생성 중 오류가 발생했습니다.'
      generateError.value = message
      failedGenerationTarget.value = activeGenerationTarget
      input.onFailure(message)
    } finally {
      if (sequence === generationSequence) {
        generating.value = false
        generationController = null
        activeGenerationTarget = null
      }
    }
  }

  async function retryGeneration() {
    const target = failedGenerationTarget.value
    if (!target) return
    await runGeneration(target)
  }

  function editGenerationInput() {
    generateError.value = ''
    failedGenerationTarget.value = null
  }

  function cancelGeneration() {
    if (!generating.value) return
    generationSequence += 1
    generationController?.abort()
    generationController = null
    activeGenerationTarget = null
    generating.value = false
    input.onCancel()
  }

  watch(
    [showGenerateDialog, generationMode],
    ([isOpen, mode]) => {
      if (isOpen && mode === 'document') {
        void loadGlossariesForGeneration()
      } else {
        abortGlossaryRead()
      }
    },
  )

  onScopeDispose(() => {
    abortGlossaryRead()
    generationSequence += 1
    generationController?.abort()
    generationController = null
  })

  return {
    showGenerateDialog,
    generationMode,
    generating,
    generateError,
    failedGenerationTarget,
    generateForm,
    useAllGlossaries,
    glossariesForSelect,
    glossaryLoading,
    glossaryError,
    uploadedFile,
    isDraggingFile,
    fileUploadError,
    canGenerate,
    openGenerateDialog,
    closeGenerateDialog,
    loadGlossariesForGeneration,
    onToggleAllGlossaries,
    acceptPdfFile,
    removePdfFile,
    runGeneration,
    retryGeneration,
    editGenerationInput,
    cancelGeneration,
  }
}
