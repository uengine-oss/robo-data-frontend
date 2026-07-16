# Feature Specification: Data Fabric 메타데이터 UX 제거

**Created**: 2026-07-17  
**Status**: Implementing

## Requirements

- 데이터소스 생성 화면에서 metadata 추출 checkbox·진행·결과를 제거한다.
- 기존 카드의 수동 추출 버튼·재인증 modal·SSE/sync store/API/type/state를 제거한다.
- 데이터소스 생성·연결검사·목록·삭제와 실제 table/schema/sample 탐색은 유지한다.
- 테이블 행 조회는 raw MindsDB query가 아니라 `{datasource, query, max_rows}` read-only 계약을 사용하고,
  datasource를 SQL 문자열에 중복 삽입하지 않는다.
- 전역 AlarmToast는 선택적인 text2sql alarm backend가 명시적으로 활성화된 경우에만 SSE를 연결한다.
  서비스가 없는 기본 구성에서 무한 재연결과 전역 500을 만들지 않는다.
- 삭제는 Fabric registry와 MindsDB 연결을 함께 제거하는 기본 계약을 사용한다.
- 현재 GraphTab/visibility WIP를 보존하고 metadata 제거 diff와 충돌 없이 병합한다.

## Acceptance

1. UI와 번들에서 extract-metadata/supported-engines/ExtractionProgress 참조가 0이다.
2. 생성 modal에 metadata checkbox가 없고 생성 후 DataSource만 등록된다.
3. 생성·목록·삭제 Playwright에서 console/network 오류가 0이다.
4. 실제 테이블 조회가 요청 row limit 안에서 성공하고 mutation SQL을 생성하는 UI 경로가 0이다.
5. 기본 구성의 앱 load·그래프·datasource 상호작용에서 text2sql alarm 요청이 0이다.

