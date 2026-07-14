# Implementation Plan: Electron 데이터 연결 단일 라우팅

## Flow

`Electron active connection → session.getHeaders → Gateway → Data Fabric request context → selected Neo4j`

`Schema metadata/relationship/description → Analyzer/Catalog Neo4j API`

`Table rows → Data Fabric query API → registered PostgreSQL source`

## Design

- base URL은 공유 HTTP 상수 한 곳에서 정의한다.
- DataSource store의 일반 요청과 streaming 요청이 같은 세션 헤더 계약을 사용한다.
- schemaCanvas에서 옛 Text2SQL 분기와 상태를 제거하고 저장 책임을 명확히 나눈다.
- 연결 비밀번호는 화면 상태나 로그에 출력하지 않고 요청 헤더로만 전달한다.
- 백엔드는 요청별 ContextVar로 override를 격리한다. 이 저장소는 소비자 배선만 담당한다.

## Verification

- 변경 파일 TypeScript 오류 0건.
- Vite production build.
- 실제 Electron에서 PostgreSQL 등록·추출·재조회와 DB 격리 확인.
