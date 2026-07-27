import { createHttpClient } from '@/shared/services/http'

export const whatIfHttp = createHttpClient({
  serviceName: 'What-If Simulator',
  unavailableMessage:
    '🔧 What-If 시뮬레이터 서비스가 동작하지 않습니다.\n\n' +
    '다음을 확인해주세요:\n' +
    '• What-If 서비스가 실행 중인지 확인 (포트 8005)\n' +
    '• API Gateway가 정상 동작하는지 확인 (포트 9000)',
})

export const whatIfTtmComparisonHttp = createHttpClient({
  serviceName: 'What-If TTM comparison',
  unavailableMessage: 'TTM 비교 엔드포인트를 사용할 수 없습니다.',
})

export const whatIfMindsDbComparisonHttp = createHttpClient({
  serviceName: 'What-If MindsDB comparison',
  unavailableMessage: 'MindsDB 비교 엔드포인트를 사용할 수 없습니다.',
})
