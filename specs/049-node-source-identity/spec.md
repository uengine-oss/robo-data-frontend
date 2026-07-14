# Feature Specification: 노드 패널 원본 파일 식별과 정렬

**Created**: 2026-07-14
**Status**: Implementing

## Requirements

- 소스 기반 노드 식별 카드에 확장자를 포함한 실제 원본 파일명과 상대 경로를 표시한다.
- 파일명은 `file_path`에서만 얻고 graph id를 분해하지 않는다.
- `owner_id`의 실제 노드와 `BELONGS_TO` 관계를 따라 사람이 읽을 소속과 Package를 표시한다.
- embedding, search_text, domain_terms 등 내부 분석 재료는 표시하지 않는다.
- 공용 식별 제목 행의 아이콘·이름·배지는 세로 중앙에 정렬한다.
- 식별 카드 본문은 상하 대칭 여백을 사용한다.
