import { createHttpClient } from '@/shared/services/http'

export const parserHttp = createHttpClient({
  serviceName: 'ANTLR Parser',
  unavailableMessage:
    '🔧 ANTLR 파서 서비스가 동작하지 않습니다.\n\n' +
    '다음을 확인해주세요:\n' +
    '• ANTLR 서비스가 실행 중인지 확인 (포트 8081)\n' +
    '• API Gateway가 정상 동작하는지 확인 (포트 9000)\n\n' +
    '서비스 시작 명령어:\n' +
    'cd antlr-code-parser && mvn spring-boot:run',
})
