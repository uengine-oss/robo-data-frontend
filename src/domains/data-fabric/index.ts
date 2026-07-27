/** Data Fabric frontend domain public boundary. */
export { default as DataSourcesTab } from './ui/DataSourcesTab.vue'
export { useDatasourcesStore } from './state/datasources.ts'
export { getAllDataSourceTypes } from './catalog/connectors.ts'
export { dataFabricApi } from './api/index.ts'
export type {
  ConnectionTestResult,
  DataSource,
  DataSourceCategory,
  DataSourceField,
  DataSourceTable,
  DataSourceTypeConfig,
  DataQueryRequest,
  DataQueryResponse,
  HealthCheckResult,
  TestConnectionRequest,
} from './api/contracts.ts'
