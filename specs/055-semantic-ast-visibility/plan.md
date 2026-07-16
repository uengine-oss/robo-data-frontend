# Implementation Plan: 의미 AST 뼈대 표시/숨김 + 폴백 스트림

**Branch**: `055-semantic-ast-visibility` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary

analyzer가 그래프에 보존하는 구조 노드(제어문 + 호출/생성/import)를 `HIDDEN_NODE_LABELS`에 추가해 기본
숨기고, 기존 `showHidden` 토글과 `navigator.ts`의 PARENT_OF 중첩 로직을 재사용해 함수 아래 뼈대를 노출한다.
Navigator의 DBMS 전용 명칭을 공통 의미 AST 표현으로 일반화하고, 폴백 스트림 이벤트를 콘솔에 표시한다.
대부분 기존 인프라 재사용이라 신규 컴포넌트는 최소.

## Technical Context

**Language/Version**: Vue 3 + TypeScript, Vite
**Primary Dependencies**: 기존 `graphVisibility.ts`, `navigator.ts`, `analyzer.ts`, `templateRouter.ts`
**Storage**: N/A (그래프 상태는 store)
**Testing**: `vue-tsc --noEmit`(타입), Vitest(있으면), **실제 브라우저 캡처**(Playwright 미설치 — 수동/스크립트
캡처). 데브 포트 3000.
**Project Type**: Vue SPA(+ MF remote)
**Performance**: 기본 화면 노드 수 불변(숨김 유지). 숨김보기에서만 구조 노드 증가.
**Constraints**: 현재 dirty WIP(`NodeDetailPanel.vue`, `types/index.ts`) 및 untracked `specs/054-search-...`와
충돌 금지.
**Scale/Scope**: 라벨 목록 + Navigator 일반화 + 상세 카드 명칭 정리 + 스트림 표시.

## Constitution Check

이 저장소 constitution은 별도 확인 대상이나(프론트 `.specify/`), 이 변경은 기존 가시성/Navigator 계약의
일반화·확장이라 신규 원칙 위반 소지가 낮다. 실물 캡처 검증(UI 원칙)을 완료 조건에 포함한다.

## Project Structure

```text
specs/055-semantic-ast-visibility/
├── spec.md
├── plan.md            # 이 문서
└── tasks.md

# 변경 소스 (실제 경로)
src/shared/utils/graphVisibility.ts     # HIDDEN_NODE_LABELS + 구조 노드 라벨
src/shared/stores/navigator.ts          # PARENT_OF 중첩 주석·명칭 공통화(DBMS→의미 AST 일반)
src/shared/utils/nodeClassify.ts        # 구조 노드 badge/라벨 구분(첫 글자 충돌 회피)
src/features/code-analysis/components/graph/node-detail/templateRouter.ts  # 구조 노드→구문 카드 확인
src/features/code-analysis/components/graph/node-detail/SqlStatementCard.vue # 명칭 언어무관 정리(또는 공통 카드)
src/features/code-analysis/analyzer.ts  # Fragment 폴백 이벤트 표시/throttle
src/shared/config/graphStyles.ts        # (선택) 제어문군 전용 색
```

**Structure Decision**: 기존 파일 확장 중심. `SqlStatementCard`의 SQL 전용 문구를 언어무관으로 정리하거나,
명칭이 강하게 SQL-특화면 공통 `StatementCard`로 일반화(구현 시 실제 문구 확인 후 최소 변경 선택).

## 핵심 설계

- **가시성**: `HIDDEN_NODE_LABELS`에 구조 노드 8~9개 라벨 추가. `PARENT_OF`는 `HIDDEN_LINK_TYPES`에 넣지
  않는다(자식 숨기면 관계도 자연 소멸, 숨김보기 시 함께 노출). 시스템 노드 예외는 기존 `SYSTEM_NODE_LABELS`
  로 유지.
- **Navigator**: `buildSubtree`/`buildChildIndexes`의 `astChildren` `start_line` 정렬은 그대로. 주석·변수·
  타입명의 "DBMS 구문" 표현을 "의미 AST 구조 노드"로 일반화(로직 무변경).
- **상세**: `templateRouter`가 `code_text` 보유·비-DML·비-callable 노드를 구문 카드로 보내는 기존 fallback을
  Framework 제어문에도 적용. 카드에 규칙/예시 섹션 없음(기존). 카드 헤더·문구를 언어무관으로.
- **스트림**: `applyProcessingEvent`의 `entity_kind` 스위치에 `Fragment` 표시 문구 추가. `PROGRESS_THROTTLE`
  에 `Fragment` 조정 여지(기본 5로도 동작).

## 위험과 완화

- **DBMS 회귀**: Navigator 일반화가 기존 DBMS 구문 표시를 깨지 않게, DBMS 분석 그래프로 회귀 확인.
- **WIP 충돌**: `NodeDetailPanel.vue`는 검색 클러스터 WIP가 있으므로, 구조 노드 상세 변경은
  `templateRouter`/카드 쪽에서 처리해 충돌 최소화.
- **badge 충돌**: CASE/CATCH/CLASS 'C' 충돌 → 라벨 텍스트 표기로 회피, 범례 확인(UI 원칙).

## Complexity Tracking

*위반 없음 — 비워둔다.*
