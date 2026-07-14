# Feature Specification: 시스템 노드 절대 비표시

**Created**: 2026-07-14
**Status**: Implementing

## Requirements

- `GLOSSARY`, `EMBED_META`는 캔버스·네비게이터·필터·통계·상세 패널·라이브 그래프 이벤트에 표시하지 않는다.
- `숨김 요소 모두 보기`를 켜도 시스템 노드는 표시하지 않는다.
- 사용자 선택형 기본 숨김과 시스템 절대 비표시를 서로 다른 정책으로 관리한다.
- 구버전 Catalog 응답이나 예기치 않은 라이브 이벤트가 와도 프런트 사용자 그래프 상태에 적재하지 않는다.
