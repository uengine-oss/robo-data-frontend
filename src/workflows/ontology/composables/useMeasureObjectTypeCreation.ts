import { ref, type Ref } from 'vue'
import { objectExplorerApi } from '@/domains/ontology'

export interface MeasureObjectTypeTarget {
  nodeId: string
  nodeName: string
  description?: string
  unit?: string
}

interface MeasureNode {
  id: string
  name: string
  description?: string
  unit?: string
  dataSource?: string
}

interface MeasureObjectTypeClient {
  createObjectTypeFromNode: typeof objectExplorerApi.createObjectTypeFromNode
}

interface MeasureObjectTypeCreationInput<TNode extends MeasureNode> {
  nodes: Ref<TNode[]>
  refreshNodeData: (nodeId: string) => Promise<void>
  lastDataError: Ref<string | null>
  client?: MeasureObjectTypeClient
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'ObjectType 생성에 실패했습니다.'
}

export function useMeasureObjectTypeCreation<TNode extends MeasureNode>(
  input: MeasureObjectTypeCreationInput<TNode>,
) {
  const client = input.client ?? objectExplorerApi
  const target = ref<MeasureObjectTypeTarget | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const refreshWarning = ref<string | null>(null)

  function open(node: TNode): void {
    target.value = {
      nodeId: node.id,
      nodeName: node.name,
      description: node.description,
      unit: node.unit,
    }
    error.value = null
  }

  function close(): void {
    if (pending.value) return
    target.value = null
    error.value = null
  }

  async function confirm(): Promise<void> {
    const frozenTarget = target.value
    if (!frozenTarget || pending.value) return

    pending.value = true
    error.value = null
    notice.value = null
    refreshWarning.value = null
    try {
      const result = await client.createObjectTypeFromNode(frozenTarget.nodeId, {
        node_id: frozenTarget.nodeId,
        node_name: frozenTarget.nodeName,
        description: frozenTarget.description,
        unit: frozenTarget.unit,
      })
      const node = input.nodes.value.find(candidate => candidate.id === frozenTarget.nodeId)
      if (node) {
        node.dataSource = result.objectTypeName
        await input.refreshNodeData(frozenTarget.nodeId)
        if (input.lastDataError.value) {
          refreshWarning.value =
            `ObjectType은 생성됐지만 노드 데이터를 다시 불러오지 못했습니다: ${input.lastDataError.value}`
        }
      } else {
        refreshWarning.value =
          'ObjectType은 생성됐지만 대상 노드가 현재 캔버스에 없어 연결 상태를 반영하지 못했습니다.'
      }
      notice.value = `ObjectType '${result.objectTypeName}'이(가) 생성되었습니다.`
      target.value = null
    } catch (cause: unknown) {
      error.value = errorMessage(cause)
    } finally {
      pending.value = false
    }
  }

  return {
    target,
    pending,
    error,
    notice,
    refreshWarning,
    open,
    close,
    confirm,
  }
}
