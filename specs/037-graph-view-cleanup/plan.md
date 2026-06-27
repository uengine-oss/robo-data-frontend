# Plan: 그래프 뷰 정리

**Branch**: main | **Spec**: [spec.md](./spec.md)

## Summary
(A) handleResetGraph에 clearPanelLoad() 추가(캔버스 비우기=선택·active 해제). (B) HIDDEN_LINK_TYPES·EXCLUDED_RELS에 INIT_BY 추가(REFERENCES와 동일=일관). 데이터 보존, 표시만 차단.

## Technical Context
- Vue3/TS. 변경: GraphTab.vue(handleResetGraph), analyzer.ts(HIDDEN_LINK_TYPES), nodeRelationships.ts(EXCLUDED_RELS).
- 검증: vue-tsc 0 + 앱/playwright(캔버스 비우기 후 칩 active 0, INIT_BY/REFERENCES 미표시).

## 회귀
- clearPanelLoad는 기존 함수(handleClearFilters서 사용). INIT_BY 추가는 set 멤버만 — 데이터·식별 불변.

## Structure
```
src/features/code-analysis/components/graph/GraphTab.vue   # handleResetGraph += clearPanelLoad
src/features/code-analysis/analyzer.ts                      # HIDDEN_LINK_TYPES += INIT_BY
src/shared/utils/nodeRelationships.ts                       # EXCLUDED_RELS += INIT_BY
```
