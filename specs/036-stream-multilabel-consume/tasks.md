# Tasks: 스트림 멀티라벨 소비

- [ ] T001 `src/shared/types/index.ts` — AnalyzeEvent에 `labels?: string[]`(node_event) 추가.
- [ ] T002 `src/features/code-analysis/analyzer.ts` — `mergeStreamNode(labels: string[], id, props)`로 변경(labels 직접 사용). dispatch(applyGraphEvent)가 `event.labels ?? (event.label ? [event.label] : [])` 전달.
- [ ] T003 vue-tsc 변경파일 0.
- [ ] T004 라이브 분석 — 역할 필터 섹션이 분석 중 등장 확인(또는 스트림 캡처 labels 확인).
