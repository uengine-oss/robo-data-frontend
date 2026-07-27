import { createHttpClient } from '@/shared/services/http'

export const analyzerHttp = createHttpClient({
  serviceName: 'ROBO Analyzer',
  unavailableMessage:
    '🔧 ROBO 백엔드 서비스가 동작하지 않습니다.\n\n' +
    '다음을 확인해주세요:\n' +
    '• 요청한 Analyzer 또는 Catalog 서비스가 실행 중인지 확인\n' +
    '• API Gateway가 정상 동작하는지 확인 (포트 9000)',
})
