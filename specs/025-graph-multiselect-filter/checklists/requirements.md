# Specification Quality Checklist: 노드패널 칩 = 캔버스 누적 로드(isolate) + 관계 숨김 필터 + 스타일

**Created**: 2026-06-23 | **Feature**: [spec.md](../spec.md)

## Content Quality
- [x] 구현 세부보다 사용자 가치(누른 노드/관계를 캔버스에 함께 보기) 중심
- [x] 비기술 이해관계자가 읽을 수 있음
- [x] 필수 섹션 완료

## Requirement Completeness
- [x] [NEEDS CLARIFICATION] 없음 — 모호점은 Assumptions로 명시(isolate 의미·preset 해제·데드 ref 범위)
- [x] 요구가 검증 가능(노드/관계 칩 캔버스 누적 로드·관계 양끝노드·경고0·스타일 영속)
- [x] Success Criteria 측정 가능(2개 이상 누적 union·경고0·영속·회귀 0)
- [x] Edge cases 식별(보기모드 중 클릭→preset해제·노드+관계 union·전체 해제)
- [x] 범위 경계 명확(노드패널 isolate vs 필터▾ 숨김 분리·기존 GraphStylePanel 재사용·데드 ref는 리팩토링 범위·spec021 supersede)
- [x] 의존·가정 명시

## Feature Readiness
- [x] 각 FR에 수용 기준 대응
- [x] User Story가 주요 흐름 커버
- [x] 측정 가능 결과 정의

## Notes
- 전수조사로 확정한 사실(노드패널 칩이 표시필터를 쓰면 보기모드 가상그래프와 충돌해 "매치 0" 경고·`labelFilters`/`relFilter`가 노드패널 분리 후 데드·GraphStylePanel 기존 존재)을 배경에 박제 → 추측 0.
- 핵심 = **노드패널 칩 = 캔버스 누적 로드(isolate)**(노드 라벨 노드 ∪ 관계 양끝 노드 union). 표시 숨김 필터(필터▾ `hiddenRelTypes`)는 별도. 스타일은 기존 재사용.
- **정정 이력(SDD)**: 처음 "다중선택 표시필터(whitelist)"로 기획했으나 사용자 의도("노드패널에서 누르는 건 필터링이 아님")에 따라 isolate로 전면 재정합. 옛 기획 흔적은 git 이력·spec 021에 보존. 데드 ref 제거는 refactor-estimate 범위.
- spec 021(단일 isolate)과의 충돌은 FR-008로 다중 누적 isolate가 supersede 명시.
