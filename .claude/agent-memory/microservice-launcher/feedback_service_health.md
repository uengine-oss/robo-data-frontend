---
name: 헬스체크 엔드포인트 패턴
description: 각 서비스 유형별 정상적인 헬스체크 엔드포인트 및 응답
type: feedback
---

# 헬스체크 엔드포인트 패턴

**Why:** 서비스마다 헬스체크 경로가 다르므로 단순히 `/health`로만 확인하면 오탐이 발생

## 서비스별 헬스 엔드포인트

| 서비스 | 포트 | 헬스 엔드포인트 | 정상 응답 |
|---|---|---|---|
| API Gateway (Spring Cloud) | 9000 | `GET /actuator/health` | 200 |
| ANTLR Parser (Spring Boot) | 8081 | `GET /actuator/health` | 500이어도 프로세스는 살아있음. 실제 기능은 `/antlr/**` |
| ROBO Analyzer (FastAPI) | 5502 | `GET /health` | 200 |
| Text2SQL (FastAPI) | 8000 | `GET /health` | 200 |
| Architect/LangChain (FastAPI) | 8001 | `GET /api/health` | 500은 내부 오류, 프로세스는 정상 |
| OLAP/Ontology (FastAPI) | 8002 | `GET /health` | 200 |
| Risk Calculator (FastAPI) | 8003 | `GET /health` | 200 |
| Data Fabric (FastAPI) | 8004 | `GET /health` | 200 |
| What-If Simulator (FastAPI) | 8005 | `GET /` | 200 (root에서 status: running 반환) |
| Data Secure Guard | 8006 | `GET /health` | 200 |
| Agent Scheduler | 8089 | `GET /health` | 200 |
| Node Agent Scheduler | 8091 | `GET /health` | 200 |

## ANTLR Parser HikariPool 경고
- `Thread starvation or clock leap detected` 로그는 시스템 슬립 후 재개 시 정상적으로 발생
- 실제 서비스 기능에는 영향 없음
