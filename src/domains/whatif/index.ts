/** Independent What-if service frontend domain. */
export { whatifApi } from './api/client'
export { compareModelsWithFallback, normalizeTTMComparison } from './application/compareModels'
export type {
  AgentAnalysisResult,
  CausalDiscoveryResult,
  ComparisonResult,
  DataDiscoveryResult,
  LiteracyExplanation,
  ValidationResult,
} from './model/contracts'
export * from './ui'
