---
name: Robo Analyzer 마이크로서비스 아키텍처
description: 게이트웨이 라우팅, 포트 매핑, 각 서비스 실행 방법
type: project
---

# Robo Analyzer 마이크로서비스 아키텍처

**Why:** 다수의 마이크로서비스를 API Gateway(Spring Cloud Gateway, 포트 9000)를 통해 통합 라우팅
**How to apply:** 서비스 시작 전 항상 `/Users/uengine/robo-analyz/start-all-services.sh` 참조

## 루트 경로
`/Users/uengine/robo-analyz/`

## 게이트웨이
- **API Gateway** (Spring Cloud Gateway): 포트 9000
  - 경로: `/Users/uengine/robo-analyz/api-gateway/`
  - 설정: `src/main/resources/application.yml`
  - 실행: `./mvnw spring-boot:run` (Java)
  - 헬스: `GET /actuator/health` → 200

## 백엔드 마이크로서비스

| 서비스명 | 포트 | 경로 | 실행방법 | 게이트웨이 prefix |
|---|---|---|---|---|
| ANTLR Code Parser | 8081 | `antlr-code-parser/` | `./mvnw spring-boot:run` (Java) | `/api/gateway/antlr/**`, `/antlr/**` |
| ROBO Analyzer | 5502 | `robo-analyzer/` | `uvicorn main:app --port 5502` (Python/.venv) | `/api/gateway/robo/**`, `/robo/**` |
| Text2SQL (neo4j) | 8000 | `neo4j-text2sql/` | `uv run python main.py` | `/api/gateway/text2sql/**`, `/text2sql/**` |
| ROBO Architect / LangChain | 8001 | `process-gpt-bpmn-extractor/` | `python run.py api --port 8001` (Python 3.11) | `/api/gateway/architect/**`, `/api/gateway/langchain/**` |
| OLAP / Ontology / Domain | 8002 | `domain-layer/` 또는 유사 | uvicorn | `/api/gateway/olap/**`, `/api/gateway/ontology/**` |
| Risk Calculator | 8003 | `risk-calculator/` | uvicorn | `/api/gateway/risk-calculator/**`, `/risk-calculator/**` |
| Data Fabric | 8004 | `data-fabric/backend/` | uvicorn | `/api/gateway/data-fabric/**`, `/data-fabric/**` |
| What-If Simulator | 8005 | `what-if-simulator/` | Python (run_api.py) | `/api/gateway/whatif/**`, `/whatif/**` |
| Data Secure Guard | 8006 | `data-secure-guard/` | Python API | `/api/gateway/security/**`, `/api/security/**` |
| Agent Scheduler | 8089 | `agent-scheduler/` | uv run | `/api/gateway/agent-scheduler/**` |
| Node-Local Agent Scheduler | 8091 | `node-local-agent-scheduler/` | Node.js | `/api/gateway/node-agent-scheduler/**` |

## 프론트엔드
- **Vue3 (Vite)**: 포트 3000
  - 경로: `/Users/uengine/robo-analyz/robo-analyzer-vue3/`
  - 게이트웨이에서 `/**` → localhost:3000 라우팅

## 실행 스크립트
- 전체 시작: `/Users/uengine/robo-analyz/start-all-services.sh`
- 전체 중지: `/Users/uengine/robo-analyz/stop-all-services.sh`

## 주의사항
- port 8001은 `process-gpt-bpmn-extractor/run.py api --port 8001`로 실행됨 (architect/langchain 서비스)
- ANTLR Parser(8081)는 Spring Boot이므로 `/actuator/health`가 500 반환하는 경우 DB 연결 문제(HikariPool) 가능
- What-If Simulator(8005)의 헬스 엔드포인트는 `/api/health`가 아닌 `/` (root endpoint)
