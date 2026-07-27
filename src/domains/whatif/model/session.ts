import type {
  AgentAnalysisResult,
  CausalDiscoveryResult,
  ComparisonResult,
  DataDiscoveryResult,
  LiteracyExplanation,
  ValidationResult,
} from './contracts'

export interface WhatIfSessionData {
  agentResult?: AgentAnalysisResult
  discoveryResult?: DataDiscoveryResult
  selectedTables?: string[]
  customSql?: string
  causalResult?: CausalDiscoveryResult
  validationResult?: ValidationResult
  comparisonResult?: ComparisonResult
  literacyExplanation?: LiteracyExplanation
}

export interface SavedWhatIfSession {
  id: string
  scenario: string
  currentStep: number
  createdAt: string
  updatedAt: string
  data: WhatIfSessionData
}

export interface WhatIfSessionSnapshot {
  id: string
  scenario: string
  currentStep: number
  data: WhatIfSessionData
}
