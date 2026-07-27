export type OntologyLabelType =
  | 'Asset'
  | 'System'
  | 'Component'
  | 'Event'
  | string

export interface OntologyLabel {
  name: string
  description?: string
  icon?: string
  color?: string
}

export interface OntologyNodeProperty {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json'
  description?: string
  required?: boolean
}

export interface OntologyDataSourceSchema {
  columns?: string[]
  sql?: string
  row_count?: number
  datasource?: string
}

export interface OntologyFilterField {
  column: string
  label: string
  type: string
  dataType: string
}

export interface OntologyNode {
  id: string
  name: string
  label: OntologyLabelType
  layer?: string
  description?: string
  properties?: OntologyNodeProperty[]
  dataSource?: string
  dataSourceSchema?: string | OntologyDataSourceSchema
  materializedView?: string
  instanceCount?: number
  filterFields?: OntologyFilterField[]
  position?: { x: number; y: number }
}

export type OntologyRelationshipType =
  | 'CONTAINS'
  | 'OPERATES'
  | 'GENERATES'
  | 'BELONGS_TO'
  | 'MONITORS'
  | 'TRIGGERS'
  | string

export interface OntologyRelationship {
  id: string
  source: string
  target: string
  type: OntologyRelationshipType
  description?: string
  properties?: Record<string, unknown>
  fromField?: string
  toField?: string
  from_field?: string
  to_field?: string
}

export interface OntologySchema {
  id?: string
  name: string
  description?: string
  domain?: string
  nodes: OntologyNode[]
  relationships: OntologyRelationship[]
  labels: OntologyLabel[]
  createdAt?: string
  updatedAt?: string
  version?: number
}

export interface NodeInstanceData {
  nodeId: string
  nodeName: string
  dataSource: string
  totalCount: number
  previewData: {
    columns: string[]
    rows: unknown[][]
  }
  lastUpdated?: string
}

export interface GenerateSchemaRequest {
  inputType: 'text' | 'pdf'
  text?: string
  pdfUrl?: string
  pdfContent?: string
  domainHint?: string
}

export interface GenerateSchemaResponse {
  success: boolean
  schema?: OntologySchema
  error?: string
  warnings?: string[]
}

export interface ApplyFeedbackRequest {
  currentSchema: OntologySchema
  feedback: string
}

export interface ApplyFeedbackResponse {
  success: boolean
  schema?: OntologySchema
  changes?: string[]
  error?: string
}

export interface BindDataSourceRequest {
  nodeId: string
  dataSource: string
  schema?: string
}

export interface CreateMaterializedViewRequest {
  nodeId: string
  viewName?: string
  refreshInterval?: number
}
