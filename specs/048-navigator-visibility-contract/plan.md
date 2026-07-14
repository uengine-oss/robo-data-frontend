# Implementation Plan: 전략 중립 그래프 표시 계약

## Flow

`Analyzer labels/properties → nodeMap(raw) → graphVisibility.isNodeHidden → canvas + Navigator`

## Design

- Analyzer가 만든 원시 타입은 그대로 보존한다.
- UI 기본 숨김은 `graphVisibility.ts` 한 곳의 명시 목록으로만 판단한다.
- summary는 늦게 채워지는 분석 결과이므로 구조 탐색 조건으로 사용하지 않는다.
- 미등록 타입은 visible-by-default로 처리해 새 언어/전략의 조용한 소실을 막는다.
- `EXTERNAL`은 전략 타입이 아닌 공통 의미 마커이므로 기본 숨김한다.

## Verification

- 정적 검색으로 Navigator의 별도 숨김 목록과 summary 기반 제외가 0건인지 확인.
- `npm run type-check`, `npm run build` 통과.
- 실제 Electron 재빌드 후 summary 없는 AST와 숨김 토글을 화면에서 확인.
