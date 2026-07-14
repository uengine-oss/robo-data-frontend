# Feature Specification: Electron 데이터 연결 단일 라우팅

**Created**: 2026-07-14
**Status**: Implementing

## Problem

Electron 런처에서 선택한 Neo4j 연결과 DataSource 등록 대상이 서로 다른 기본 연결을 사용하면,
사용자는 연결을 추가했지만 다른 DB에 저장된 것처럼 보인다. 또한 제거된 Text2SQL과 현재
Data Fabric 경로가 동시에 남아 스키마 조회·행 조회·설명 수정의 저장소가 갈라져 있었다.

## Requirements

- 데이터소스 API의 단일 base는 `DATA_FABRIC_BASE_URL`이며 Gateway 기본 경로를 사용한다.
- 모든 DataSource 요청과 메타데이터 추출 스트림에 세션의 `X-Neo4j-*` 헤더를 전달한다.
- 스키마·관계·설명은 Analyzer/Catalog Neo4j API만 사용한다.
- 실제 테이블 행 조회만 Data Fabric의 query API를 사용한다.
- 제거된 Text2SQL 데이터소스 전환·직접 SQL 경로를 다시 사용하지 않는다.
- Electron 헤더가 없을 때는 각 백엔드의 환경설정 연결로 폴백해 웹 실행을 유지한다.

## Acceptance

1. Electron에서 선택한 DB에 DataSource 노드가 등록·조회·삭제된다.
2. PostgreSQL 메타데이터 추출 요청도 같은 Neo4j 연결에 결과를 저장한다.
3. 스키마 설명 수정과 관계 편집이 현재 Neo4j API에 반영된다.
4. 테이블 행 미리보기는 Data Fabric을 통해 대상 데이터소스에서 조회된다.
5. 브라우저 단독 실행은 헤더 없이 기존 환경설정 연결을 사용한다.
