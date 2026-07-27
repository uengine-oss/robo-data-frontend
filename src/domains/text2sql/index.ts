/** Text2SQL service frontend domain public boundary. */
export { text2sqlApi } from './api/client.ts'
export {
  parseDirectSqlStreamEvent,
  toRecordRows,
  toTabularRows,
} from './api/contracts.ts'
export { useReactStore } from './state/query.ts'
export { useHistoryStore } from './state/history.ts'
export { useText2SqlSchemaStore } from './state/schema.ts'
export type {
  AskResponse,
  DirectSqlResponse,
  DirectSqlStreamEvent,
  QueryHistoryItem,
  QueryHistoryResponse,
  QueryStep,
  Text2SqlMetaObjectType,
} from './api/contracts.ts'
export type {
  CepStatus,
  EventRule,
  ExtractedEventConfig,
  SimulationRequest,
  SimulationResult,
} from './api/eventContracts.ts'
export type {
  QueryQualityGate,
  QueryQualityGateRound,
  ReactExecutionResult,
  ReactPhase,
  ReactPhaseData,
  ReactRequest,
  ReactResponseModel,
  ReactSQLCompleteness,
  ReactStatus,
  ReactStepModel,
  ReactStreamEvent,
  ReactToolCallModel,
  Text2SqlColumnInfo,
  Text2SqlTableInfo,
} from './model/react.ts'
export type { SqlResultInstanceExport } from './model/instanceExport.ts'
export { default as Text2SqlTab } from './ui/Text2SqlTab.vue'
export { default as ResultTable } from './ui/ResultTable.vue'
