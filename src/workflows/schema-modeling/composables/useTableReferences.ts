import { ref } from 'vue'
import { analyzerApi } from '@/domains/analyzer'
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
  file_name?: string
  file_directory?: string
  file_path?: string
}

export interface FrameworkReference {
  source_name: string
  source_type: string
  access_type: string
  start_line?: number
  end_line?: number
  evidence_line?: number
  file_name?: string
  file_path?: string
  file_directory?: string
  module_name?: string
}

export interface SourcePanelPort {
  openSourceCodePanel: (
    fileName: string,
    fileDirectory: string,
    fileContent: string,
    highlightedLine: number,
    procedureName: string,
    startLine?: number,
    found?: boolean,
    loadError?: boolean,
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
    FROM: '읽기',
    READS: '읽기',
    WRITES: '쓰기',
    REFER_TO: '참조',
  } as Record<string, string>)[accessType] || accessType
}

export function getAccessTypeColor(accessType: string): string {
  if (accessType === 'WRITES') return '#f59e0b'
  if (accessType === 'REFER_TO') return '#a78bfa'
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
  const frameworkReferences = ref<FrameworkReference[]>([])
  const showReferencesPopup = ref(false)
  const referencesPopupPosition = ref({ x: 0, y: 0 })

  const showColumnReferencesPopup = ref(false)
  const columnReferencesError = ref(false)
  const columnReferencesPopupPosition = ref({ x: 0, y: 0 })
  const isLoadingColumnReferences = ref(false)
  const columnReferences = ref<ProcedureReference[]>([])
  const columnFrameworkReferences = ref<FrameworkReference[]>([])
  const activeColumnName = ref('')

  let tableReferenceRequestId = 0
  let columnReferenceRequestId = 0
  let sourceRequestId = 0

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
      frameworkReferences.value = result.framework_references || []
    } catch (error) {
      if (requestId !== tableReferenceRequestId) return
      logger.error('Failed to load procedure references:', error)
      procedureReferences.value = []
      frameworkReferences.value = []
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
      columnFrameworkReferences.value = result.framework_references || []
    } catch (error) {
      if (requestId !== columnReferenceRequestId) return
      logger.error('Failed to load column references:', error)
      columnReferences.value = []
      columnFrameworkReferences.value = []
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

  async function openSourceFromReference(
    filePath: string | undefined,
    fileName: string,
    startLine: number,
    endLine: number,
    evidenceLine: number,
    symbolName: string,
  ) {
    const requestId = ++sourceRequestId
    closeReferencesPopup()
    closeColumnReferencesPopup()
    const panelName = fileName || filePath?.split(/[\\/]/).pop() || symbolName
    if (!filePath) {
      await sourcePanel.openSourceCodePanel(panelName, '', '', evidenceLine, symbolName, startLine, false)
      return
    }
    try {
      const source = await analyzerApi.getSourceContent(filePath, { startLine, endLine })
      if (requestId !== sourceRequestId) return
      const offset = source.found ? (source.start_line || startLine) : startLine
      await sourcePanel.openSourceCodePanel(
        panelName,
        filePath,
        source.found ? source.content : '',
        evidenceLine,
        symbolName,
        offset,
        source.found,
      )
    } catch (error) {
      if (requestId !== sourceRequestId) return
      logger.error('Failed to load source slice:', error)
      await sourcePanel.openSourceCodePanel(
        panelName,
        filePath,
        '',
        evidenceLine,
        symbolName,
        startLine,
        false,
        true,
      )
    }
  }

  function handleProcedureClick(reference: ProcedureReference) {
    const startLine = reference.start_line || 1
    const endLine = reference.end_line || 0
    const evidenceLine = reference.evidence_line || reference.statement_line || startLine
    void openSourceFromReference(
      reference.file_path || reference.file_directory,
      reference.file_name || '',
      startLine,
      endLine,
      evidenceLine,
      reference.procedure_name,
    )
  }

  function handleFrameworkClick(reference: FrameworkReference) {
    const startLine = reference.start_line || 1
    const endLine = reference.end_line || 0
    const evidenceLine = reference.evidence_line || startLine
    void openSourceFromReference(
      reference.file_path || reference.file_directory,
      reference.file_name || '',
      startLine,
      endLine,
      evidenceLine,
      reference.source_name,
    )
  }

  return {
    isLoadingReferences,
    referencesError,
    procedureReferences,
    frameworkReferences,
    showReferencesPopup,
    referencesPopupPosition,
    showColumnReferencesPopup,
    columnReferencesError,
    columnReferencesPopupPosition,
    isLoadingColumnReferences,
    columnReferences,
    columnFrameworkReferences,
    activeColumnName,
    loadProcedureReferences,
    openReferences,
    closeReferencesPopup,
    closeColumnReferencesPopup,
    loadColumnReferences,
    handleColumnSourceClick,
    handleProcedureClick,
    handleFrameworkClick,
    getAccessTypeLabel,
    getAccessTypeColor,
  }
}
