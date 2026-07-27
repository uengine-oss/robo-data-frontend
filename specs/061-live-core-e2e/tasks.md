# Tasks: 핵심 영역 실서비스 E2E

## Phase 1: Baseline and Contract

- [x] T001 canonical memory, frontend constitution, spec 060 원문 확인
- [x] T002 리팩토링 상태 whitespace 정리 및 기준 커밋 `f0684d9` 생성
- [x] T003 workspace doctor와 `ROBO_NEO4J_DATABASE=neo4j` 확인
- [x] T004 사용자 정정에 따라 `neo4j` 초기화와 단발성 실제 분석·체크포인트 재사용 계약 작성

## Phase 2: Batch Baseline

- [x] T010 관련 정적/계약 테스트, type-check, production build 실행
- [x] T011 analyzer profile 실제 서비스 시작과 health 확인
- [x] T012 실제 Catalog/Data Fabric/Analyzer 응답 형태와 사용 가능한 데이터 발견

## Phase 3: Live Browser

- [x] T020 Neo4j 초기/완료/후속 fingerprint 수집기 작성
- [x] T021 DataSource 등록과 업로드 개별/전체 삭제 브라우저 계약 작성
- [x] T022 단발성 실제 upload→ANTLR→analyze 스트림 계측 runner 작성·실행
- [x] T023 stream→phase/progress/console/Navigator/graph→Neo4j 객체 정합성 검증
- [x] T024 완료 체크포인트에서 세 영역 후속 live 성공·빈 결과·경계와 실패/재시도 실행
- [x] T025 console/network/pageerror와 1920×1080 스크린샷 수집
- [x] T026 초기화 0건·분석 결과·후속 fingerprint 동일성 검증
- [x] T027 060/goal-verify 기준 스크린샷 직접 비교

## Phase 3B: Automatic Language Contract

- [x] T034 업로드/파싱 요청에서 수동·기본 target을 제거하고 ANTLR 자동 감지 단일 진실 계약을 검증
- [x] T035 그래프 컨텍스트 메뉴 로컬 좌표·가시영역과 스타일 변경 후 카메라 불변 계약을 근본 수정·검증
- [x] T036 Catalog 동일 테이블 비동기 중복 추가 경쟁을 identity 단위로 합치고 실서비스 더블클릭 회귀 검증
- [x] T037 live force를 고정하지 않고 심한 군집 겹침만 정착 후 한 번 최소 이동하고 배율·안정성 회귀 검증

## Phase 4: Repair and Completion

- [x] T028 `goal-verify` Analyzer 정방향 기능을 현재 standalone 체크포인트에 매핑하고 상호작용 E2E 실행
- [x] T029 Catalog 스키마/컬럼/FK/코드 출처와 Data Fabric datasource/health/tables의 live read·실패·재시도 검증
- [x] T030 결함을 원인군·의존 순서로 묶어 근본 수정
- [x] T031 전체 정적/브라우저/DB 보존 배치 재검증
- [x] T032 Git diff, 범위, 시작 프로세스 종료, evidence 최종 감사
- [x] T033 수정과 검증 증거를 별도 커밋으로 고정
