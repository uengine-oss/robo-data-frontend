# Implementation Plan: 스트림 멀티라벨 소비

**Branch**: `main` | **Spec**: [spec.md](./spec.md)

## Summary
mergeStreamNode가 node_event.labels 배열을 받아 노드 labels로 설정(없으면 [label] 폴백). AnalyzeEvent에 labels? 추가. 035 위치기반 소비는 그대로 동작.

## Technical Context
- Vue3/TS. 변경: types/index.ts(labels? 추가), analyzer.ts(mergeStreamNode 시그니처+dispatch).
- 검증: vue-tsc 0 + 라이브 분석 스트림(역할 필터 라이브 등장).

## Constitution / 회귀
- labels 없으면 [label] 폴백 = 기존 동작 동일(회귀 0). 위치 소비(035) 불변.

## Project Structure
```
src/shared/types/index.ts                  # AnalyzeEvent.labels?: string[]
src/features/code-analysis/analyzer.ts      # mergeStreamNode(labels), dispatch
```
