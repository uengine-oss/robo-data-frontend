import { ref } from 'vue'
import { catalogSchemaApi } from '@/domains/catalog'
import { logger } from '@/shared/utils/logger'
import { useRuntimeStore } from '@/shared/stores/runtime'

export interface ProcedureReference {
  procedure_name: string
  procedure_type: string
  start_line: number
  end_line?: number
  access_type: string
  statement_type?: string
  statement_line?: number
  evidence_line?: number
  file_path?: string
  code_text?: string
}

export interface SourcePanelPort {
  openSourceCodePanel: (
    fileName: string,
    filePath: string,
    fileContent: string,
    highlightedLine: number,
    procedureName: string,
    startLine?: number,
    found?: boolean,
  ) => void | Promise<void>
}

export function clampReferencePopupY(clientY: number, viewportHeight: number): number {
  const popupHeight = 360
  return Math.max(12, Math.min(clientY, viewportHeight - popupHeight))
}

export function clampReferencePopupX(clientX: number, viewportWidth: number): number {
  const popupWidth = Math.min(400, Math.max(0, viewportWidth - 24))
  const halfWidth = popupWidth / 2
  return Math.max(12 + halfWidth, Math.min(clientX, viewportWidth - 12 - halfWidth))
}

function referencePopupAnchor(event: MouseEvent | KeyboardEvent): { x: number; y: number } {
  const target = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : null
  const targetRect = target?.getBoundingClientRect()
  const isKeyboardActivation = event instanceof KeyboardEvent
    || (event instanceof MouseEvent
      && event.detail === 0
      && event.clientX === 0
      && event.clientY === 0)
  const rawX = isKeyboardActivation
    ? (targetRect ? targetRect.left + targetRect.width / 2 : 12)
    : event.clientX
  const rawY = isKeyboardActivation
    ? (targetRect?.bottom ?? 12)
    : event.clientY
  return {
    x: clampReferencePopupX(rawX, window.innerWidth),
    y: clampReferencePopupY(rawY, window.innerHeight),
  }
}

export function getAccessTypeLabel(accessType: string): string {
  return ({
    READS: '읽기',
    WRITES: '쓰기',
  } as Record<string, string>)[accessType] || accessType
}

export function getAccessTypeColor(accessType: string): string {
  if (accessType === 'WRITES') return '#f59e0b'
  return '#38bdf8'
}

export function useTableReferences(
  getTable: () => { tableName: string; schema: string },
  sourcePanel: SourcePanelPort,
) {
  const runtimeStore = useRuntimeStore()
  const catalogContext = () => ({ headers: runtimeStore.getHeaders() })
  const isLoadingReferences = ref(false)
  const referencesError = ref(false)
  const procedureReferences = ref<ProcedureReference[]>([])
  const showReferencesPopup = ref(false)
  const referencesPopupPosition = ref({ x: 0, y: 0 })

  const showColumnReferencesPopup = ref(false)
  const columnReferencesError = ref(false)
  const columnReferencesPopupPosition = ref({ x: 0, y: 0 })
  const isLoadingColumnReferences = ref(false)
  const columnReferences = ref<ProcedureReference[]>([])
  const activeColumnName = ref('')

  let tableReferenceRequestId = 0
  let columnReferenceRequestId = 0

  async function loadProcedureReferences() {
    const requestId = ++tableReferenceRequestId
    const table = getTable()
    isLoadingReferences.value = true
    referencesError.value = false
    try {
      const result = await catalogSchemaApi.getTableReferences(
        table.tableName,
        { schema: table.schema },
        catalogContext(),
      )
      if (requestId !== tableReferenceRequestId) return
      procedureReferences.value = result.references || []
    } catch (error) {
      if (requestId !== tableReferenceRequestId) return
      logger.error('Failed to load procedure references:', error)
      procedureReferences.value = []
      referencesError.value = true
    } finally {
      if (requestId === tableReferenceRequestId) isLoadingReferences.value = false
    }
  }

  function openReferences(event: MouseEvent | KeyboardEvent) {
    referencesPopupPosition.value = referencePopupAnchor(event)
    void loadProcedureReferences()
    showReferencesPopup.value = true
    event.stopPropagation()
  }

  function closeReferencesPopup() {
    showReferencesPopup.value = false
  }

  function closeColumnReferencesPopup() {
    showColumnReferencesPopup.value = false
    activeColumnName.value = ''
  }

  async function loadColumnReferences(columnName: string) {
    const requestId = ++columnReferenceRequestId
    const table = getTable()
    isLoadingColumnReferences.value = true
    columnReferencesError.value = false
    try {
      const result = await catalogSchemaApi.getTableReferences(
        table.tableName,
        { schema: table.schema, columnName },
        catalogContext(),
      )
      if (requestId !== columnReferenceRequestId) return
      columnReferences.value = result.references || []
    } catch (error) {
      if (requestId !== columnReferenceRequestId) return
      logger.error('Failed to load column references:', error)
      columnReferences.value = []
      columnReferencesError.value = true
    } finally {
      if (requestId === columnReferenceRequestId) isLoadingColumnReferences.value = false
    }
  }

  function handleColumnSourceClick(event: MouseEvent | KeyboardEvent, columnName: string) {
    columnReferencesPopupPosition.value = referencePopupAnchor(event)
    activeColumnName.value = columnName
    void loadColumnReferences(columnName)
    showColumnReferencesPopup.value = true
    event.stopPropagation()
  }

  function openSourceFromReference(
    codeText: string | undefined,
    filePath: string | undefined,
    startLine: number,
    evidenceLine: number,
    symbolName: string,
  ) {
    closeReferencesPopup()
    closeColumnReferencesPopup()
    const panelName = filePath?.split(/[\\/]/).pop() || symbolName
    const found = Boolean(codeText?.trim())
    void sourcePanel.openSourceCodePanel(
      panelName,
      filePath || '',
      found ? codeText! : '',
      evidenceLine,
      symbolName,
      startLine,
      found,
    )
  }

  function handleProcedureClick(reference: ProcedureReference) {
    const startLine = reference.start_line || 1
    const evidenceLine = reference.evidence_line || reference.statement_line || startLine
    openSourceFromReference(
      reference.code_text,
      reference.file_path,
      startLine,
      evidenceLine,
      reference.procedure_name,
    )
  }

  return {
    isLoadingReferences,
    referencesError,
    procedureReferences,
    showReferencesPopup,
    referencesPopupPosition,
    showColumnReferencesPopup,
    columnReferencesError,
    columnReferencesPopupPosition,
    isLoadingColumnReferences,
    columnReferences,
    activeColumnName,
    loadProcedureReferences,
    openReferences,
    closeReferencesPopup,
    closeColumnReferencesPopup,
    loadColumnReferences,
    handleColumnSourceClick,
    handleProcedureClick,
    getAccessTypeLabel,
    getAccessTypeColor,
  }
}
