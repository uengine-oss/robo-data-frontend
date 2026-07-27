import {
  createInstancesFromSql,
  objectExplorerApi,
  ontologyApi,
  type SqlInstanceCreationRequest,
} from '@/domains/ontology'
import { text2sqlApi } from '@/domains/text2sql'

export function listTargetOntologySchemas() {
  return ontologyApi.listSchemas()
}

export function loadTargetOntologySchema(schemaId: string) {
  return ontologyApi.getSchemaById(schemaId)
}

export function createOntologyInstancesFromSql(input: SqlInstanceCreationRequest) {
  return createInstancesFromSql(input, {
    createMaterializedView: request => text2sqlApi.createMaterializedView(request),
    bulkCreateInstances: request => objectExplorerApi.bulkCreateInstances(request),
  })
}
