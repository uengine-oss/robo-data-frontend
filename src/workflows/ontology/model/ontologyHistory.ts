const RECENT_SCHEMAS_KEY = 'robo-analyzer-recent-schemas'
const SELECTED_NODES_KEY = 'robo-analyzer-selected-nodes'
const MAX_RECENT_SCHEMAS = 50
const MAX_SELECTED_NODES = 100

export interface SelectedNodeInfo {
  schemaId: string
  nodeId: string
  timestamp: number
}

function isSelectedNodeInfo(value: unknown): value is SelectedNodeInfo {
  return typeof value === 'object'
    && value !== null
    && 'schemaId' in value
    && typeof value.schemaId === 'string'
    && 'nodeId' in value
    && typeof value.nodeId === 'string'
    && 'timestamp' in value
    && typeof value.timestamp === 'number'
}

function parseArray(storage: Storage, key: string): unknown[] {
  const stored = storage.getItem(key)
  if (!stored) return []
  const parsed: unknown = JSON.parse(stored)
  return Array.isArray(parsed) ? parsed : []
}

export function getRecentSchemaIds(storage: Storage = localStorage): string[] {
  try {
    return parseArray(storage, RECENT_SCHEMAS_KEY).filter((id): id is string => typeof id === 'string')
  } catch (cause) {
    console.warn('최근 스키마 기록을 읽지 못했습니다.', cause)
    return []
  }
}

export function saveRecentSchemaId(schemaId: string, storage: Storage = localStorage): void {
  try {
    const updated = [schemaId, ...getRecentSchemaIds(storage).filter(id => id !== schemaId)]
      .slice(0, MAX_RECENT_SCHEMAS)
    storage.setItem(RECENT_SCHEMAS_KEY, JSON.stringify(updated))
  } catch (cause) {
    console.warn('최근 스키마 기록을 저장하지 못했습니다.', cause)
  }
}

export function removeRecentSchemaId(schemaId: string, storage: Storage = localStorage): void {
  try {
    const updated = getRecentSchemaIds(storage).filter(id => id !== schemaId)
    storage.setItem(RECENT_SCHEMAS_KEY, JSON.stringify(updated))
  } catch (cause) {
    console.warn('최근 스키마 기록을 제거하지 못했습니다.', cause)
  }
}

export function getSelectedNodes(storage: Storage = localStorage): SelectedNodeInfo[] {
  try {
    return parseArray(storage, SELECTED_NODES_KEY).filter(isSelectedNodeInfo)
  } catch (cause) {
    console.warn('선택 노드 기록을 읽지 못했습니다.', cause)
    return []
  }
}

export function saveSelectedNode(
  schemaId: string,
  nodeId: string,
  storage: Storage = localStorage,
  timestamp = Date.now(),
): void {
  try {
    const remaining = getSelectedNodes(storage).filter(
      selected => selected.schemaId !== schemaId || selected.nodeId !== nodeId,
    )
    const updated = [{ schemaId, nodeId, timestamp }, ...remaining].slice(0, MAX_SELECTED_NODES)
    storage.setItem(SELECTED_NODES_KEY, JSON.stringify(updated))
  } catch (cause) {
    console.warn('선택 노드 기록을 저장하지 못했습니다.', cause)
  }
}

export function removeSelectedNode(
  schemaId: string,
  nodeId: string,
  storage: Storage = localStorage,
): void {
  try {
    const updated = getSelectedNodes(storage).filter(
      selected => selected.schemaId !== schemaId || selected.nodeId !== nodeId,
    )
    storage.setItem(SELECTED_NODES_KEY, JSON.stringify(updated))
  } catch (cause) {
    console.warn('선택 노드 기록을 제거하지 못했습니다.', cause)
  }
}

export function removeSelectedNodesForSchema(
  schemaId: string,
  storage: Storage = localStorage,
): void {
  try {
    const updated = getSelectedNodes(storage).filter(selected => selected.schemaId !== schemaId)
    storage.setItem(SELECTED_NODES_KEY, JSON.stringify(updated))
  } catch (cause) {
    console.warn('스키마 선택 기록을 제거하지 못했습니다.', cause)
  }
}

export function getSelectedNodeIdForSchema(
  schemaId: string,
  storage: Storage = localStorage,
): string | null {
  return getSelectedNodes(storage).find(selected => selected.schemaId === schemaId)?.nodeId ?? null
}
