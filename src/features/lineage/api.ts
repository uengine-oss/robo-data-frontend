/** lineage api — 데이터 리니지(OLAP ETL 개요 + Neo4j 그래프/분석). 공유 http 코어 사용. */
import { API_GATEWAY_URL, ROBO_BASE_URL, handleHttpError, type Headers } from '@/shared/services/http'

// OLAP 서비스는 게이트웨이 경유: /api/gateway/olap/api/*
const OLAP_API_BASE = `${API_GATEWAY_URL}/olap/api`

export const lineageApi = {
  /** OLAP ETL 리니지 개요 — /olap/api/etl/lineage/overview */
  async getOlapOverview(): Promise<any> {
    const response = await fetch(`${OLAP_API_BASE}/etl/lineage/overview`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * Neo4j 리니지 그래프 — /robo/lineage/ (catalog).
   * headers 로 Neo4j override(X-Neo4j-*)·세션 헤더를 전달한다(Electron 모드 필수).
   */
  async getNeo4jLineage(headers: Headers = {}): Promise<any> {
    const response = await fetch(`${ROBO_BASE_URL}/lineage/`, { headers })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * ETL 코드 리니지 분석 — /robo/lineage/analyze/ (catalog).
   * headers 로 Neo4j override·세션 헤더 전달.
   */
  async analyzeEtlCode(
    body: { sqlContent: string; fileName: string; dbms: string },
    headers: Headers = {}
  ): Promise<any> {
    const response = await fetch(`${ROBO_BASE_URL}/lineage/analyze/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  }
}
