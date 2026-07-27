import type {
  DataSourceCategory,
  DataSourceTypeConfig,
  TestConnectionRequest,
} from '../api/contracts.ts'

export type ConnectionParameters = Record<string, string | number | undefined>
export type ConnectorGroups = Record<DataSourceCategory, DataSourceTypeConfig[]>

export const DATA_SOURCE_CATEGORIES: DataSourceCategory[] = [
  'database',
  'nosql',
  'datawarehouse',
  'api',
  'saas',
  'file',
  'streaming',
  'analytics',
  'vector',
  'other',
]

export function createConnectorGroups(): ConnectorGroups {
  return {
    database: [],
    nosql: [],
    datawarehouse: [],
    api: [],
    saas: [],
    file: [],
    streaming: [],
    analytics: [],
    vector: [],
    other: [],
  }
}

export function groupConnectorTypes(
  connectorTypes: DataSourceTypeConfig[],
  searchQuery: string,
): ConnectorGroups {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const groups = createConnectorGroups()

  for (const connectorType of connectorTypes) {
    const matches = normalizedQuery.length === 0 || [
      connectorType.display_name,
      connectorType.type,
      connectorType.description ?? '',
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery))

    if (matches) groups[connectorType.category].push(connectorType)
  }

  return groups
}

export function createConnectionParameters(
  connectorType: DataSourceTypeConfig,
): ConnectionParameters {
  const parameters: ConnectionParameters = {}
  for (const field of connectorType.fields) {
    if (field.default !== undefined) parameters[field.name] = field.default
  }
  return parameters
}

function optionalText(value: string | number | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  return String(value)
}

export function buildConnectionTestRequest(
  connectorType: DataSourceTypeConfig,
  parameters: ConnectionParameters,
): TestConnectionRequest {
  const portValue = parameters.port
  return {
    engine: connectorType.type,
    host: String(parameters.host ?? ''),
    port: portValue === undefined || portValue === '' ? undefined : Number(portValue),
    user: optionalText(parameters.user),
    password: optionalText(parameters.password),
    database: optionalText(parameters.database),
  }
}
