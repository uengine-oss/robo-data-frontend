import type cytoscape from 'cytoscape'
import type { Ref } from 'vue'

import {
  applyLocalGraphDelete,
  changeLocalGraphNodeLayer,
  commitLocalGraphRelationship,
  createLocalGraphNode,
  createLocalGraphRelationshipDraft,
  createNodeDeleteTarget,
  createRelationshipDeleteTarget,
  renameLocalGraphNode,
  type LocalGraphDeleteTarget,
} from '../model/localGraphMutation'
import type {
  OntologyCanvasNode,
  OntologyCanvasRelationship,
} from '../application/ontologyCanvasSchema'

export interface NewOntologyRelationDraft {
  relationId: string
  sourceId: string
  targetId: string
  type: string
  description: string
}

interface OntologyLocalGraphEditingOptions {
  nodes: Ref<OntologyCanvasNode[]>
  relationships: Ref<OntologyCanvasRelationship[]>
  selectedNodeId: Ref<string | null>
  pendingRelationSourceId: Ref<string | null>
  pendingRelationPreviousSelectionId: Ref<string | null>
  showRelationDialog: Ref<boolean>
  relationDraft: Ref<NewOntologyRelationDraft>
  editingName: Ref<boolean>
  editingNameValue: Ref<string>
  layerSelectorOpen: Ref<boolean>
  deleteTarget: Ref<LocalGraphDeleteTarget | null>
  getCanvas: () => cytoscape.Core | null
  getSelectedNode: () => OntologyCanvasNode | null
  getEditingRelationship: () => OntologyCanvasRelationship | null
  resolveLayer: (layerId: string) => { name: string; color: string }
  checkpoint: () => void
  selectNode: (nodeId: string) => void
  deselectNode: () => void
  removeNodeFilters: (nodeId: string) => void
  closeRelationEditor: () => void
  initializeEdgehandles: () => void
  upsertRelationship: (relationship: OntologyCanvasRelationship) => void
  removeRelationship: (relationshipId: string) => void
}

const EMPTY_RELATION_DRAFT: NewOntologyRelationDraft = {
  relationId: '',
  sourceId: '',
  targetId: '',
  type: 'CAUSES',
  description: '',
}

export function useOntologyLocalGraphEditing(options: OntologyLocalGraphEditingOptions) {
  function addNode(layerId: string, position: { x: number; y: number }): OntologyCanvasNode | null {
    const layer = options.resolveLayer(layerId)
    const result = createLocalGraphNode(options.nodes.value, {
      layerId,
      layerName: layer.name,
      position,
      now: Date.now(),
    })
    if (!result.changed || !result.node) return null

    options.checkpoint()
    options.nodes.value = result.nodes
    const canvas = options.getCanvas()
    if (canvas) {
      canvas.add({
        data: {
          id: result.node.id,
          label: result.node.name,
          layer: layerId,
          color: layer.color,
        },
        position: result.node.position,
      })
      options.selectNode(result.node.id)
      options.initializeEdgehandles()
    }
    return result.node
  }

  function startPendingRelation(sourceId: string): void {
    options.pendingRelationPreviousSelectionId.value = options.selectedNodeId.value
    options.pendingRelationSourceId.value = sourceId
    options.deselectNode()
    options.getCanvas()?.getElementById(sourceId).addClass('eh-source')
  }

  function cancelPendingRelation(): void {
    const sourceId = options.pendingRelationSourceId.value
    const previousSelectionId = options.pendingRelationPreviousSelectionId.value
    if (sourceId) options.getCanvas()?.getElementById(sourceId).removeClass('eh-source')
    options.pendingRelationSourceId.value = null
    options.pendingRelationPreviousSelectionId.value = null
    if (
      previousSelectionId
      && options.nodes.value.some(node => node.id === previousSelectionId)
    ) {
      options.selectNode(previousSelectionId)
    }
  }

  function completePendingRelation(targetNodeId: string): void {
    const sourceId = options.pendingRelationSourceId.value
    cancelPendingRelation()
    if (sourceId) openRelationDraft(sourceId, targetNodeId)
  }

  function selectOrCompleteRelation(nodeId: string): void {
    if (options.pendingRelationSourceId.value) {
      completePendingRelation(nodeId)
    } else {
      options.selectNode(nodeId)
    }
  }

  function startNameEditing(): void {
    const selectedNode = options.getSelectedNode()
    if (!selectedNode) return
    options.editingNameValue.value = selectedNode.name
    options.editingName.value = true
  }

  function saveName(): void {
    const selectedNode = options.getSelectedNode()
    if (!selectedNode || !options.editingName.value) return

    const result = renameLocalGraphNode(
      options.nodes.value,
      selectedNode.id,
      options.editingNameValue.value,
    )
    if (result.changed && result.node) {
      options.checkpoint()
      options.nodes.value = result.nodes
      options.getCanvas()?.getElementById(selectedNode.id).data('label', result.node.name)
    }
    options.editingName.value = false
  }

  function cancelNameEditing(): void {
    options.editingName.value = false
    options.editingNameValue.value = ''
  }

  function changeLayer(layerId: string): void {
    const selectedNode = options.getSelectedNode()
    if (!selectedNode) return

    const result = changeLocalGraphNodeLayer(options.nodes.value, selectedNode.id, layerId)
    if (result.changed && result.node) {
      options.checkpoint()
      options.nodes.value = result.nodes
      const canvasNode = options.getCanvas()?.getElementById(selectedNode.id)
      canvasNode?.data('layer', layerId)
      canvasNode?.data('color', options.resolveLayer(layerId).color)
    }
    options.layerSelectorOpen.value = false
  }

  function requestNodeDelete(): void {
    const selectedNode = options.getSelectedNode()
    if (!selectedNode) return
    options.deleteTarget.value = createNodeDeleteTarget(
      selectedNode,
      options.relationships.value,
    )
  }

  function requestRelationshipDelete(relationship: OntologyCanvasRelationship): void {
    options.deleteTarget.value = createRelationshipDeleteTarget(
      relationship,
      options.nodes.value,
    )
  }

  function confirmDelete(): void {
    const target = options.deleteTarget.value
    if (!target) return

    const targetExists = target.kind === 'node'
      ? options.nodes.value.some(node => node.id === target.id)
      : options.relationships.value.some(relationship => relationship.id === target.id)
    if (!targetExists) {
      options.deleteTarget.value = null
      return
    }

    options.checkpoint()
    const result = applyLocalGraphDelete(
      options.nodes.value,
      options.relationships.value,
      target,
    )
    options.nodes.value = result.nodes
    options.relationships.value = result.relationships

    if (result.removedNodeId) {
      options.removeNodeFilters(result.removedNodeId)
      options.getCanvas()?.getElementById(result.removedNodeId).remove()
      if (options.selectedNodeId.value === result.removedNodeId) options.deselectNode()
    }
    if (result.removedRelationshipId) {
      options.getCanvas()?.getElementById(result.removedRelationshipId).remove()
      if (options.getEditingRelationship()?.id === result.removedRelationshipId) {
        options.closeRelationEditor()
      }
    }
    options.deleteTarget.value = null
  }

  function openRelationDraft(sourceId: string, targetId: string): boolean {
    const result = createLocalGraphRelationshipDraft(
      options.nodes.value,
      options.relationships.value,
      { sourceId, targetId, now: Date.now() },
    )
    if (!result.relationship) return false

    const relationship = result.relationship
    options.relationDraft.value = {
      relationId: relationship.id,
      sourceId: relationship.source,
      targetId: relationship.target,
      type: relationship.type,
      description: '',
    }
    options.upsertRelationship(relationship)
    options.showRelationDialog.value = true
    return true
  }

  function resetRelationDraft(): void {
    options.showRelationDialog.value = false
    options.relationDraft.value = { ...EMPTY_RELATION_DRAFT }
  }

  function discardRelationDraft(): void {
    if (options.relationDraft.value.relationId) {
      options.removeRelationship(options.relationDraft.value.relationId)
    }
    resetRelationDraft()
  }

  function commitRelationDraft(): OntologyCanvasRelationship | null {
    const draft: OntologyCanvasRelationship = {
      id: options.relationDraft.value.relationId,
      source: options.relationDraft.value.sourceId,
      target: options.relationDraft.value.targetId,
      type: 'CAUSES',
    }
    const result = commitLocalGraphRelationship(
      options.relationships.value,
      draft,
      {
        type: options.relationDraft.value.type,
        description: options.relationDraft.value.description,
        fromField: undefined,
        toField: undefined,
      },
    )
    if (!result.changed || !result.relationship) {
      discardRelationDraft()
      return null
    }

    options.checkpoint()
    options.relationships.value = result.relationships
    options.upsertRelationship(result.relationship)
    resetRelationDraft()
    return result.relationship
  }

  function requestEditingRelationshipDelete(): void {
    const relationship = options.getEditingRelationship()
    if (relationship) requestRelationshipDelete(relationship)
  }

  return {
    addNode,
    startPendingRelation,
    cancelPendingRelation,
    completePendingRelation,
    selectOrCompleteRelation,
    startNameEditing,
    saveName,
    cancelNameEditing,
    changeLayer,
    requestNodeDelete,
    requestRelationshipDelete,
    confirmDelete,
    openRelationDraft,
    resetRelationDraft,
    discardRelationDraft,
    commitRelationDraft,
    requestEditingRelationshipDelete,
  }
}
