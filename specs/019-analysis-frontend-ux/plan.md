# Implementation Plan: 분석 화면 UX 정합

**Branch**: `019-analysis-frontend-ux` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

## Summary

소비처(frontend) UX 정리 — 019 라벨·020 속성 위에. ① 노드패널을 보고서형(식별→개요→원문→관계)으로, 식별부에 이름·논리명·종류·소속 분리 + raw-id 제거(이름 없으면 `종류[라인]`), 관계 의미 묶음("멤버→"·"연결" 제거), 020 속성 반영(notes·params/return·risk_level). ② 업로드 소스타입 수동 UI 삭제(antlr 자동감지).

## Technical Context

**Language**: TypeScript/Vue 3. **Storage**: Neo4j(읽기, catalog 경유). **Testing**: 재분석 그래프 + Playwright(패널·모달 스크린샷; NVL 캔버스는 헤드리스 한계).
**Constraints**: 회귀 0 / raw-id 노출 0 / 019·020 결과 전제 / 빈 속성은 영역 생략(에러 0).
**Scope**: NodeDetailBase + 카드 6종(File/Function/SqlStatement/Variable/Module/Datatype) + UploadModal/DropZone.

## Constitution Check (frontend)

| 항목 | 평가 |
|---|---|
| 단일 진실(라벨/배지/관계 헬퍼) | ✅ nodeClassify·nodeRelationships 공용 헬퍼 재사용. raw-id 표시폴백 = graphDisplay 단일점 |
| 회귀 0 | ✅ 업로드 수동 UI 삭제는 antlr 자동감지가 덮어써 strategy/UML 불변 |
| 소비처 계약 | ✅ 020 속성(notes·params/return·risk_level) 읽기 정합(이미 020에서 일부 반영) |

## Project Structure (blast radius)

```text
src/features/code-analysis/components/graph/node-detail/
  NodeDetailBase.vue        # 식별부(이름·논리명·종류·소속·raw-id제거)·순서·관계 영역 공용
  FileCard.vue · FunctionCard.vue · SqlStatementCard.vue · VariableCard.vue · ModuleCard.vue · DatatypeCard.vue
  templateRouter.ts         # (라우팅 — 019에서 정합 완료)
src/shared/utils/
  nodeClassify.ts (nodeTypeLabel) · nodeRelationships.ts(관계 그룹) · graphDisplay.ts(표시명·raw-id 방어)
src/features/code-analysis/components/upload/
  UploadModal.vue · DropZone.vue   # 소스타입 수동 UI 삭제
```

**Structure Decision**: 식별/순서/관계는 NodeDetailBase 공용 슬롯에서, 종류별 본문(원문·멤버)은 각 카드. raw-id 방어는 graphDisplay 단일점. 업로드는 UploadModal에서 소스타입 블록 제거.

## Complexity Tracking
> 위반 없음.
