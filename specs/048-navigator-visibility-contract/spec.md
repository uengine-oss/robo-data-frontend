# Feature Specification: 전략 중립 그래프 표시 계약

**Created**: 2026-07-14
**Status**: Implementing

## Problem

Navigator가 `summary` 유무를 기본 표시 조건으로 사용하면서 스트리밍 중 아직 요약되지 않은
정상 AST Module/File/Function/Procedure까지 숨겼다. 또한 캔버스와 Navigator가 서로 다른
숨김 목록을 가져 같은 그래프를 다르게 표시했다.

## Requirements

- **FR-001**: summary 생성 여부는 노드 표시 여부에 영향을 주지 않는다.
- **FR-002**: 기본 숨김은 명시적으로 등록된 내부/구조/메타 타입과 `EXTERNAL`에만 적용한다.
- **FR-003**: 등록되지 않은 전략 또는 새 AST 타입은 기본적으로 표시한다.
- **FR-004**: 캔버스와 Navigator는 같은 `isNodeHidden` 정책을 사용한다.
- **FR-005**: `숨김 요소 모두 보기`에서는 기본 숨김 노드도 모두 표시한다.
- **FR-006**: PACKAGE root는 일반 Module/File root보다 먼저 정렬한다.
- **FR-007**: Navigator로 선택한 노드가 캔버스에 아직 없어도 빈 캔버스 클릭은 선택을 해제하고 Overview로 복귀한다.

## Acceptance

1. summary가 없는 FILE/CLASS/FUNCTION/METHOD/PROCEDURE와 DBMS 구문이 Navigator에 표시된다.
2. EXTERNAL·변수/상수·자료형·메타 노드는 기본 숨김이고 전체 보기에서 표시된다.
3. Package → Module/File → Routine/AST 관계는 스트리밍 도중에도 유지된다.
4. 새 타입은 별도 등록 전에도 조용히 사라지지 않는다.
