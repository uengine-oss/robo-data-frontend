import { catalogLineageApi } from '@/domains/catalog'
import type { Headers } from '@/shared/services/http'

export function analyzeLineageEtlCode(
  sqlContent: string,
  fileName: string,
  headers: Headers,
) {
  return catalogLineageApi.analyzeEtlCode(
    { sqlContent, fileName, dbms: 'oracle' },
    headers,
  )
}
