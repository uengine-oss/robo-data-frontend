import { ref } from 'vue'

import { createExpiringMapController } from '../model/expiringMap'

export function useSchemaCanvasHighlights() {
  const updatedNodes = ref(new Map<string, number>())
  const updatedColumns = ref(new Map<string, number>())
  const newRelationships = ref(new Map<string, number>())
  const newlyAddedTables = ref(new Map<string, number>())
  const newlyAddedEdges = ref(new Map<string, number>())

  const updatedNodeHighlights = createExpiringMapController(updatedNodes.value)
  const updatedColumnHighlights = createExpiringMapController(updatedColumns.value)
  const relationshipHighlights = createExpiringMapController(newRelationships.value)
  const addedTableHighlights = createExpiringMapController(newlyAddedTables.value)
  const addedEdgeHighlights = createExpiringMapController(newlyAddedEdges.value)

  function clear(): void {
    updatedNodeHighlights.clear()
    updatedColumnHighlights.clear()
    relationshipHighlights.clear()
    addedTableHighlights.clear()
    addedEdgeHighlights.clear()
  }

  return {
    updatedNodes,
    updatedColumns,
    newRelationships,
    newlyAddedTables,
    newlyAddedEdges,
    updatedNodeHighlights,
    updatedColumnHighlights,
    relationshipHighlights,
    addedTableHighlights,
    addedEdgeHighlights,
    clear,
    isTableNewlyAdded: (nodeId: string) => newlyAddedTables.value.has(nodeId),
    isEdgeNewlyAdded: (edgeId: string) => newlyAddedEdges.value.has(edgeId),
    isNodeRecentlyUpdated: (nodeId: string) => updatedNodes.value.has(nodeId),
    isColumnRecentlyUpdated: (tableName: string, columnName: string) => (
      updatedColumns.value.has(`${tableName}:${columnName}`)
    ),
  }
}
