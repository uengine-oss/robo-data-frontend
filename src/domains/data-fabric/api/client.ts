import type {
  ConnectionTestResult,
  DataSource,
  DataSourceCreateRequest,
  DataSourceTable,
  DataQueryRequest,
  DataQueryResponse,
  HealthCheckResult,
  TestConnectionRequest,
} from './contracts.ts'

export interface DataFabricClientDependencies {
  baseUrl: string
  getHeaders: () => Record<string, string>
  fetchImpl?: typeof fetch
}

function errorDetail(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null || !('detail' in body)) return fallback
  const detail = body.detail
  return detail ? String(detail) : fallback
}

export function createDataFabricClient({
  baseUrl,
  getHeaders,
  fetchImpl = fetch,
}: DataFabricClientDependencies) {
  async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders(),
        ...options.headers,
      },
    })

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(errorDetail(body, 'API request failed'))
    }

    return response.json() as Promise<T>
  }

  return {
    list: () => request<{ datasources: DataSource[] }>('/api/datasources'),

    create: (data: DataSourceCreateRequest) =>
      request<DataSource>('/api/datasources', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    get: (name: string) => request<DataSource>(`/api/datasources/${name}`),

    delete: (name: string) =>
      request<{ message: string }>(`/api/datasources/${name}`, { method: 'DELETE' }),

    getTables: (name: string) =>
      request<{ tables: DataSourceTable[] }>(`/api/datasources/${name}/tables`),

    testConnection: (name: string, source = 'mindsdb') =>
      request<ConnectionTestResult>(`/api/datasources/${name}/test?source=${source}`, {
        method: 'POST',
      }),

    testConnectionWithParams: (params: TestConnectionRequest) =>
      request<ConnectionTestResult>('/api/datasources/test-connection', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    checkHealth: (name: string) =>
      request<HealthCheckResult>(`/api/datasources/${name}/health`),

    query: (data: DataQueryRequest) =>
      request<DataQueryResponse>('/api/query', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  }
}

export type DataFabricClient = ReturnType<typeof createDataFabricClient>
