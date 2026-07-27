# Implementation Plan: 핵심 영역 실서비스 E2E

## Technical Context

- Vue 3 + Pinia frontend: `robo-data-frontend`
- Runtime authority: `robo-workspace/workspace.json`, standalone `analyzer` profile
- Services: frontend 3000, gateway 9000, analyzer 15502, catalog 15503, data-fabric 8404
- Database: existing Neo4j database `neo4j`
- Browser: repository Playwright package, 1920×1080
- Explicit non-scope: Architect host/API/Electron and all Architect workflows

## Constitution Check

- Spec-first: 이 문서와 tasks를 먼저 고정한다.
- Source of truth: 실제 service route, runtime config, live response를 함께 확인한다.
- Honest live/mock: 정상 흐름은 interception 없이 실행하고 실패 UI만 별도 interception한다.
- Data preservation: 공유 `neo4j`에는 read-only 쿼리와 GET 요청만 허용한다.
- Root-cause repair: 오류를 service/domain/application/UI 책임과 의존 순서로 군집화한다.
- Evidence: command, response, console/network, screenshot, DB inventory를 남긴다.

## Execution Design

1. 현재 커밋과 workspace/Neo4j 구성을 기록한다.
2. type-check, build, 관련 구조·계약 테스트를 한 배치로 실행한다.
3. analyzer profile 서비스를 시작하고 실제 endpoint에서 사용 가능한 데이터 이름을 발견한다.
4. 공식 reset 범위를 확인한 뒤 `neo4j`를 0건으로 만들고 DataSource를 UI에서 한 번 등록한다.
5. 업로드 modal의 개별/전체 삭제를 검증한 뒤 최종 source·DDL을 한 번 업로드한다.
6. Playwright가 analyze stream 원본과 phase/progress/console/Navigator/graph 상태를 계속 표본화한다.
7. complete 뒤 graph fingerprint와 객체 정합성을 봉인한다.
8. Catalog → Data Fabric → Analyzer 후속 탐색은 봉인된 체크포인트에서 독립 실행한다.
9. 별도 페이지에서 의도된 read 503과 재시도 UI 계약을 검증한다.
10. 스크린샷을 기준 화면과 직접 대조하고 결함은 원인군별로 수정한 뒤 전체 배치를 재실행한다.
11. 시작한 서비스를 종료하고 Git diff 및 증거를 최종 감사한다.

12. Parser transport를 업로드 저장 계약(`targetFolder`)과 자동 감지 파싱 계약(`project_root`)으로 분리하고,
    UploadModal의 가짜 언어 기본값을 제거한다. `detected` 이후 Analyzer metadata만 언어를 가진다.
13. 군집 보기의 live force가 정착한 뒤 심한 convex-hull 교차만 minimum-translation-vector로 한 번
    평행 이동한다. 내부 노드 배치와 force/drag는 유지하고, topology 세대마다 한 번만 적용해 반복 보정과
    카메라 출렁임을 막는다. 실제 shopmall 체크포인트에서 겹침과 배율 손실을 함께 계측한다.
14. Catalog 컬럼 출처는 관계 증거 줄 주변의 정확한 컬럼 토큰으로 한정하고, 관련 테이블 조회는
    `FK_TO_TABLE`과 Analyzer-native `FK` 속성명을 읽기 경계에서 정규화한다. 실제 `orders`의
    테이블 출처·`member_id` 근거·`channel_cd` 빈값·원문 소스 줄과 5개 FK를 UI에서 대조한다.

## Safety Contract

- 대상 database가 정확히 `neo4j`인지 재확인하고 초기화 전 inventory를 증거로 남긴다. `system`은 금지한다.
- 초기화는 노드·관계를 지우며 database 자체를 drop/recreate하지 않는다.
- DataSource 등록과 Analyzer upload/analyze는 최초 흐름에 한 번만 허용한다.
- 분석 완료 뒤 write method와 mutation path는 브라우저 request 단계에서 abort하고 실패시킨다.
- 단계 실패 시 유효 fingerprint/checkpoint가 있으면 앞단 mutation을 재실행하지 않는다.
- 서비스 시작 전 이미 실행 중인 프로세스를 기록하고 테스트가 시작한 analyzer profile만 종료한다.

## Evidence Layout

- `evidence/neo4j-before-reset.json`, `neo4j-after-reset.json`,
  `neo4j-shopmall-complete.json`, `neo4j-final.json`: reset·완료·보존 inventory와 fingerprint
- `evidence/upload-payload-checkpoint.json`: 최종 UI multipart 파일 집합
- `evidence/analyzer-live-once-result.json`, `live-checkpoint-verification.json`:
  원본 stream timing과 Neo4j 객체 대조
- `evidence/analyzer-checkpoint-interactions.json`,
  `analyzer-cluster-overlap-checkpoint.json`: Analyzer 후속 상호작용과 NVL 회귀
- `evidence/schema-checkpoint-interactions.json`,
  `data-fabric-checkpoint-interactions.json`: Schema/Data Source live·빈값·실패·재시도
- `evidence/screenshots/*.png`, `evidence/screenshots/checkpoint/*.png`
- `evidence/visual-review.md`
- `evidence/completion-audit.md`: 정적·브라우저·DB·Git·프로세스 최종 감사
