import { whatifApi } from '../api/client'

export async function persistCausalModel(sessionId: string): Promise<string> {
  const result = await whatifApi.saveToNeo4j(sessionId)
  if (!result.saved) {
    throw new Error(result.message || '서비스가 저장 실패를 반환했습니다.')
  }
  return result.message
    || `${result.nodes_count}개 노드와 ${result.edges_count}개 관계를 저장했습니다.`
}
