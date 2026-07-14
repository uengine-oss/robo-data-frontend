# Implementation Plan: 노드 상세 패널 레이아웃·원문 코드

## Current flow

`NodeDetailBase + 종류별 임의 section CSS + TextViewer/<pre> 혼재 → 서로 다른 간격과 평문 코드`

## Target flow

`NodeDetailBase 공통 토큰 → 모든 종류의 detail-card → CodeViewer(language resolver → read-only Monaco/plaintext fallback)`

## Design

- `nodeDetailPanel.shared.scss`가 카드 간격·label·body padding의 단일 진실이다.
- 식별 영역은 공통 body padding을 사용하고 title row 기준으로 아이콘과 텍스트를 정렬한다.
- 종류별 카드는 의미 콘텐츠만 정의하고 외곽 레이아웃은 `.detail-card` 계약을 재사용한다.
- `CodeViewer.vue`가 코드 스크롤·줄 번호·구문 강조·읽기 전용 상태를 소유한다.
- 언어 결정은 명시 힌트가 우선이고, 없으면 원본 `file_path`/`file_name` 확장자로 결정하며 마지막은 `plaintext`다.
- `TextViewer`는 설명·요약 전용으로 유지한다.
- analyzer/Neo4j 계약은 바꾸지 않는다. 기존 `code_text`, `file_path`, `file_name`만 소비한다.

## Constitution check

- 기존 단일 탭 구조와 API 계약을 변경하지 않는다.
- 공통 UI 의미·간격을 단일 컴포넌트/토큰으로 관리한다.
- mock 데이터 없이 실제 그래프 속성만 표시한다.
- Vite 빌드뿐 아니라 Electron 실물과 콘솔 오류를 확인한다.
