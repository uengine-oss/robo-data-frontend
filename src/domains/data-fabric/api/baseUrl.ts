import { API_GATEWAY_URL } from '@/shared/services/http'

export const DATA_FABRIC_BASE_URL = import.meta.env.VITE_DATA_FABRIC_URL ?? `${API_GATEWAY_URL}/data-fabric`
