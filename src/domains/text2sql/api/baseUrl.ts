import { API_GATEWAY_URL } from '@/shared/services/http'

export const TEXT2SQL_BASE_URL = import.meta.env.VITE_TEXT2SQL_API_URL || `${API_GATEWAY_URL}/text2sql`
