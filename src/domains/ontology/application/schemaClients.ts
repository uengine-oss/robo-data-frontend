import { ontologyApi } from '../api/schema'
import type { OntologySchema } from '../model/schema'
import type { OntologyDataSourceCatalogClient } from './useOntologyDataSourceCatalog'
import type { OntologySchemaLifecycleClient } from './useOntologySchemaLifecycle'
import type { OntologySchemaLibraryClient } from './useOntologySchemaLibrary'

export const ontologySchemaLibraryClient: OntologySchemaLibraryClient = {
  listSchemas: () => ontologyApi.listSchemas(),
}

export const ontologySchemaLifecycleClient: OntologySchemaLifecycleClient<OntologySchema> = {
  updateSchemaName: (schemaId, name) => ontologyApi.updateSchemaName(schemaId, name),
  deleteSchemaById: schemaId => ontologyApi.deleteSchemaById(schemaId),
  activateSchema: schemaId => ontologyApi.activateSchema(schemaId),
  getSchemaById: schemaId => ontologyApi.getSchemaById(schemaId),
}

export const ontologyDataSourceCatalogClient: OntologyDataSourceCatalogClient = {
  getAvailableDataSources: () => ontologyApi.getAvailableDataSources(),
}
