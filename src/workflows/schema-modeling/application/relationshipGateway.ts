import { objectExplorerApi, relationshipApi } from '@/domains/ontology'

export const schemaRelationshipGateway = {
  listObjectTypes: () => objectExplorerApi.getObjectTypes(),
  loadObjectType: (name: string) => objectExplorerApi.getObjectType(name),
  loadRelationship: (...args: Parameters<typeof relationshipApi.get>) =>
    relationshipApi.get(...args),
  createRelationship: (...args: Parameters<typeof relationshipApi.create>) =>
    relationshipApi.create(...args),
  updateRelationship: (...args: Parameters<typeof relationshipApi.update>) =>
    relationshipApi.update(...args),
  deleteRelationship: (...args: Parameters<typeof relationshipApi.remove>) =>
    relationshipApi.remove(...args),
}
