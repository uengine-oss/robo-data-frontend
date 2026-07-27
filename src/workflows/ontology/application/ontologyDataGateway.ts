import {
  createInstancesFromSql,
  objectExplorerApi,
  type SqlInstanceCreationRequest,
} from '@/domains/ontology'
import { text2sqlApi } from '@/domains/text2sql'

export function createOntologyInstancesFromQuery(request: SqlInstanceCreationRequest) {
  return createInstancesFromSql(request, {
    createMaterializedView: payload => text2sqlApi.createMaterializedView(payload),
    bulkCreateInstances: payload => objectExplorerApi.bulkCreateInstances(payload),
  })
}

export function askOntologyEntityQuery(
  question: string,
  datasource: string,
  limit: number,
) {
  return text2sqlApi.ask(question, datasource, limit)
}

export function loadOntologySourceDatasources() {
  return text2sqlApi.getDatasources()
}

export function loadOntologySourceSchemas(datasource: string) {
  return text2sqlApi.getDatasourceSchemas(datasource)
}

export function generateOntologyFromDatasource(
  request: Parameters<typeof objectExplorerApi.generateFromSchema>[0],
) {
  return objectExplorerApi.generateFromSchema(request)
}

export function runOntologyDirectSqlStream(
  ...args: Parameters<typeof text2sqlApi.directSqlStream>
) {
  return text2sqlApi.directSqlStream(...args)
}

export function loadOntologyObjectTypes() {
  return objectExplorerApi.getObjectTypes()
}

export function deleteOntologyObjectType(name: string, confirmationName: string) {
  return objectExplorerApi.deleteObjectType(name, confirmationName)
}
