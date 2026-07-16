# Feature Specification: Data Fabric 메타데이터 UX 제거

**Created**: 2026-07-17  
**Status**: Implementing

## Requirements

- 데이터소스 생성 화면에서 metadata 추출 checkbox·진행·결과를 제거한다.
- 기존 카드의 수동 추출 버튼·재인증 modal·SSE/sync store/API/type/state를 제거한다.
- 데이터소스 생성·연결검사·목록·삭제와 실제 table/schema/sample 탐색은 유지한다.
- 삭제는 Fabric registry와 MindsDB 연결을 함께 제거하는 기본 계약을 사용한다.
- 현재 GraphTab/visibility WIP를 보존하고 metadata 제거 diff와 충돌 없이 병합한다.

## Acceptance

1. UI와 번들에서 extract-metadata/supported-engines/ExtractionProgress 참조가 0이다.
2. 생성 modal에 metadata checkbox가 없고 생성 후 DataSource만 등록된다.
3. 생성·목록·삭제 Playwright에서 console/network 오류가 0이다.

