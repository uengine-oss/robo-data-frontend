# Implementation Plan: 노드 패널 원본 파일 식별과 정렬

`node_event/Neo4j properties.file_path → buildIdentityRows → 원본 파일 + 경로`

- 종류별 카드가 아니라 공용 identity builder에서 FILE 행을 만든다.
- 공용 NodeDetailBase의 제목 행과 패딩을 수정해 모든 카드 정렬을 일치시킨다.
- 대상 타입 검사, Vite build, 실제 Electron 캡처로 검증한다.
