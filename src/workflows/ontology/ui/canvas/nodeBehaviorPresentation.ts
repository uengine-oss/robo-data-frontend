export interface NodeBehaviorPresentation {
  modelId: string
  name: string
  role: string
  status: string
  description?: string
  metrics?: string
  inputs: Array<{ field: string }>
  outputs: Array<{ field: string }>
}
