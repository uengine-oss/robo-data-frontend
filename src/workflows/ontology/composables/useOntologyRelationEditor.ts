import { objectExplorerApi, type OntologyNodeDataResult } from '@/domains/ontology'
import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  type Ref,
} from 'vue'
import {
  createRelationEditorForm,
  normalizeRelationColumnNames,
  projectRelationEditorFormAfterColumnLoad,
  readInlineRelationColumns,
  relationEditorTarget,
  resolveRelationEditorRelationship,
  type OntologyRelationColumnState,
  type OntologyRelationEditorForm,
  type OntologyRelationEditorNode,
  type OntologyRelationEditorTarget,
} from '../application/relationEditorLifecycle'
import {
  updateLocalGraphRelationship,
  type LocalGraphRelationship,
} from '../model/localGraphMutation'
import { validateRelationFieldMapping } from '../model/relationFieldMapping'

interface OntologyRelationEditorDependencies {
  loadNodeData: (
    nodeId: string,
    signal: AbortSignal,
  ) => Promise<Pick<OntologyNodeDataResult, 'columns'>>
}

interface UseOntologyRelationEditorInput<
  TNode extends OntologyRelationEditorNode,
  TRelationship extends LocalGraphRelationship,
> {
  nodes: Ref<TNode[]>
  relationships: Ref<TRelationship[]>
  beforeOpen: () => void
  beforeCommit: () => void
  afterCommit: (relationship: TRelationship) => void
  dependencies?: Partial<OntologyRelationEditorDependencies>
}

function emptyColumnState(): OntologyRelationColumnState {
  return {
    status: 'no_datasource',
    columns: [],
  }
}

function loadingColumnState(
  previous: OntologyRelationColumnState,
): OntologyRelationColumnState {
  return {
    status: 'loading',
    columns: [...previous.columns],
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useOntologyRelationEditor<
  TNode extends OntologyRelationEditorNode,
  TRelationship extends LocalGraphRelationship,
>(input: UseOntologyRelationEditorInput<TNode, TRelationship>) {
  const dependencies: OntologyRelationEditorDependencies = {
    loadNodeData: (nodeId, signal) =>
      objectExplorerApi.getNodeData(nodeId, 'limit=1', signal),
    ...input.dependencies,
  }

  const showRelationEditor = ref(false)
  const editingRelation = shallowRef<TRelationship | null>(null)
  const editingRelationForm = ref<OntologyRelationEditorForm>({
    type: '',
    description: '',
    fromField: '',
    toField: '',
  })
  const sourceColumnState = ref<OntologyRelationColumnState>(emptyColumnState())
  const targetColumnState = ref<OntologyRelationColumnState>(emptyColumnState())
  const relationEditorError = ref('')

  const sourceNodeColumns = computed(() => sourceColumnState.value.columns)
  const targetNodeColumns = computed(() => targetColumnState.value.columns)
  const sourceColumnStatus = computed(() => sourceColumnState.value.status)
  const targetColumnStatus = computed(() => targetColumnState.value.status)
  const sourceColumnError = computed(() => sourceColumnState.value.error || '')
  const targetColumnError = computed(() => targetColumnState.value.error || '')
  const canRetryRelationColumns = computed(
    () =>
      sourceColumnState.value.status === 'error'
      || targetColumnState.value.status === 'error',
  )

  let columnRequestSequence = 0
  let columnController: AbortController | null = null

  async function loadNodeColumns(
    nodeId: string,
    signal: AbortSignal,
  ): Promise<OntologyRelationColumnState> {
    const node = input.nodes.value.find(candidate => candidate.id === nodeId)
    if (!node) {
      return {
        status: 'error',
        columns: [],
        error: '노드 정보를 찾을 수 없습니다.',
      }
    }
    if (!node.dataSource) {
      return {
        status: 'no_datasource',
        columns: [],
      }
    }

    const inlineColumns = readInlineRelationColumns(node.dataSourceSchema)
    if (inlineColumns !== null) {
      return {
        status: 'ready',
        columns: inlineColumns,
      }
    }

    try {
      const result = await dependencies.loadNodeData(node.id, signal)
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return {
        status: 'ready',
        columns: normalizeRelationColumnNames(result.columns),
      }
    } catch (error: unknown) {
      if (signal.aborted || isAbortError(error)) throw error
      return {
        status: 'error',
        columns: [],
        error: errorMessage(
          error,
          `데이터 소스 '${node.dataSource}'의 컬럼 정보를 조회하지 못했습니다.`,
        ),
      }
    }
  }

  function isCurrentColumnRequest(
    sequence: number,
    controller: AbortController,
    target: OntologyRelationEditorTarget,
  ): boolean {
    return (
      sequence === columnRequestSequence
      && columnController === controller
      && !controller.signal.aborted
      && showRelationEditor.value
      && editingRelation.value?.id === target.id
    )
  }

  async function loadRelationColumns(
    target: OntologyRelationEditorTarget,
  ): Promise<'committed' | 'stale'> {
    const sequence = ++columnRequestSequence
    columnController?.abort()
    const controller = new AbortController()
    columnController = controller
    sourceColumnState.value = loadingColumnState(sourceColumnState.value)
    targetColumnState.value = loadingColumnState(targetColumnState.value)
    relationEditorError.value = ''

    try {
      const [source, targetColumns] = await Promise.all([
        loadNodeColumns(target.source, controller.signal),
        loadNodeColumns(target.target, controller.signal),
      ])
      if (!isCurrentColumnRequest(sequence, controller, target)) return 'stale'

      sourceColumnState.value = source
      targetColumnState.value = targetColumns
      editingRelationForm.value = projectRelationEditorFormAfterColumnLoad(
        editingRelationForm.value,
        source,
        targetColumns,
      )
      return 'committed'
    } catch (error: unknown) {
      if (
        !isCurrentColumnRequest(sequence, controller, target)
        || isAbortError(error)
      ) return 'stale'
      relationEditorError.value = errorMessage(
        error,
        '관계 컬럼 정보를 불러오지 못했습니다.',
      )
      return 'committed'
    } finally {
      if (sequence === columnRequestSequence && columnController === controller) {
        columnController = null
      }
    }
  }

  async function openRelationEditor(edgeId: string): Promise<boolean> {
    const relationship = resolveRelationEditorRelationship(
      input.relationships.value,
      edgeId,
    )
    if (!relationship) return false

    input.beforeOpen()
    editingRelation.value = relationship
    editingRelationForm.value = createRelationEditorForm(relationship)
    showRelationEditor.value = true
    relationEditorError.value = ''
    sourceColumnState.value = emptyColumnState()
    targetColumnState.value = emptyColumnState()
    await loadRelationColumns(relationEditorTarget(relationship))
    return true
  }

  async function retryRelationColumns(): Promise<void> {
    if (!editingRelation.value) return
    await loadRelationColumns(relationEditorTarget(editingRelation.value))
  }

  function applyRelationNodeColumns(
    nodeId: string,
    columns: unknown,
    fallbackError: string,
  ): void {
    const relationship = editingRelation.value
    if (!relationship) return

    const normalizedColumns = normalizeRelationColumnNames(columns)
    const nextState: OntologyRelationColumnState = normalizedColumns.length > 0
      ? {
          status: 'ready',
          columns: normalizedColumns,
        }
      : {
          status: 'error',
          columns: [],
          error: fallbackError,
        }

    if (relationship.source === nodeId) {
      sourceColumnState.value = nextState
    }
    if (relationship.target === nodeId) {
      targetColumnState.value = nextState
    }
    editingRelationForm.value = projectRelationEditorFormAfterColumnLoad(
      editingRelationForm.value,
      sourceColumnState.value,
      targetColumnState.value,
    )
  }

  function closeRelationEditor(): void {
    columnRequestSequence += 1
    columnController?.abort()
    columnController = null
    showRelationEditor.value = false
    editingRelation.value = null
    editingRelationForm.value = {
      type: '',
      description: '',
      fromField: '',
      toField: '',
    }
    sourceColumnState.value = emptyColumnState()
    targetColumnState.value = emptyColumnState()
    relationEditorError.value = ''
  }

  function saveRelationEditor(): boolean {
    if (!editingRelation.value) return false
    relationEditorError.value = ''

    const validationError = validateRelationFieldMapping(
      editingRelationForm.value,
      sourceColumnState.value,
      targetColumnState.value,
    )
    if (validationError) {
      relationEditorError.value = validationError
      return false
    }

    const result = updateLocalGraphRelationship(
      input.relationships.value,
      editingRelation.value.id,
      editingRelationForm.value,
    )
    if (!result.changed || !result.relationship) return false

    input.beforeCommit()
    input.relationships.value = result.relationships
    editingRelation.value = result.relationship
    input.afterCommit(result.relationship)
    return true
  }

  onScopeDispose(closeRelationEditor)

  return {
    showRelationEditor,
    editingRelation,
    editingRelationForm,
    sourceNodeColumns,
    targetNodeColumns,
    sourceColumnStatus,
    targetColumnStatus,
    sourceColumnError,
    targetColumnError,
    relationEditorError,
    canRetryRelationColumns,
    openRelationEditor,
    retryRelationColumns,
    applyRelationNodeColumns,
    closeRelationEditor,
    saveRelationEditor,
  }
}
