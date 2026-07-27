import { DATA_FABRIC_BASE_URL } from './baseUrl'
import { useRuntimeStore } from '@/shared/stores/runtime'
import { createDataFabricClient } from './client.ts'

export const dataFabricApi = createDataFabricClient({
  baseUrl: DATA_FABRIC_BASE_URL,
  getHeaders: () => useRuntimeStore().getHeaders(),
})
