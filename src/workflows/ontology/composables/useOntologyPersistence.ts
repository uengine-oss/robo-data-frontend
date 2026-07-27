import type { Ref } from 'vue'
import {
  ontologyApi,
  type OntologySchema,
} from '@/domains/ontology'
import type {
  OntologyCanvasNode,
  OntologyCanvasRelationship,
} from '../application/ontologyCanvasSchema'

interface OntologyPersistenceClient {
  saveSchema: (schema: OntologySchema) => Promise<{ id?: string }>
}

interface OntologyPersistenceInput {
  nodes: Ref<OntologyCanvasNode[]>
  relationships: Ref<OntologyCanvasRelationship[]>
  schemaId: Ref<string | null>
  schemaName: Ref<string>
  nodePosition: (nodeId: string) => { x: number; y: number } | null
  client?: OntologyPersistenceClient
}

export function useOntologyPersistence(input: OntologyPersistenceInput) {
  const client = input.client ?? ontologyApi

  async function persist(): Promise<string> {
    const nodes = input.nodes.value.map(node => {
      const position = input.nodePosition(node.id)
      return position ? { ...node, position } : node
    })
    const schema: OntologySchema = {
      id: input.schemaId.value || undefined,
      name: input.schemaName.value || `온톨로지_${new Date().toISOString().slice(0, 10)}`,
      domain: 'multi-layer',
      description: '다층 온톨로지 스키마',
      nodes,
      relationships: input.relationships.value,
      labels: [],
    }

    const result = await client.saveSchema(schema)
    if (!result.id) throw new Error('온톨로지 저장 응답에 스키마 ID가 없습니다.')
    input.schemaId.value = result.id
    return result.id
  }

  return { persist }
}
