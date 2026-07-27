import { whatifDomainApi } from '../api/whatIfModeling'

export const whatIfModelingOperations = {
  discoverEdges: (...args: Parameters<typeof whatifDomainApi.discoverEdges>) =>
    whatifDomainApi.discoverEdges(...args),
  getCorrelationMatrix: (...args: Parameters<typeof whatifDomainApi.getCorrelationMatrix>) =>
    whatifDomainApi.getCorrelationMatrix(...args),
  filterEdges: (...args: Parameters<typeof whatifDomainApi.filterEdges>) =>
    whatifDomainApi.filterEdges(...args),
  buildModelGraph: (...args: Parameters<typeof whatifDomainApi.buildModelGraph>) =>
    whatifDomainApi.buildModelGraph(...args),
  trainModels: (...args: Parameters<typeof whatifDomainApi.trainModels>) =>
    whatifDomainApi.trainModels(...args),
  getModelStatus: (...args: Parameters<typeof whatifDomainApi.getModelStatus>) =>
    whatifDomainApi.getModelStatus(...args),
  validate: (...args: Parameters<typeof whatifDomainApi.validate>) =>
    whatifDomainApi.validate(...args),
  deleteModel: (...args: Parameters<typeof whatifDomainApi.deleteModel>) =>
    whatifDomainApi.deleteModel(...args),
}
