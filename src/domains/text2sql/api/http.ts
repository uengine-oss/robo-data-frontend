import { createHttpClient } from '@/shared/services/http'

export const text2SqlHttp = createHttpClient({
  serviceName: 'Text2SQL',
  unavailableMessage:
    '🔧 Text2SQL 서비스가 동작하지 않습니다.\n\n' +
    '다음을 확인해주세요:\n' +
    '• neo4j-text2sql 서비스가 실행 중인지 확인 (포트 8000)\n' +
    '• API Gateway가 정상 동작하는지 확인 (포트 9000)',
})
