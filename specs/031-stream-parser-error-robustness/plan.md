# Implementation Plan: 스트림 파서 견고화 (error 비종결)

**Branch**: `031-stream-parser-error-robustness` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

## Summary

공유 NDJSON 파서 `src/shared/services/http.ts`의 `processBuffer`에서 종결 판정을 `event.type === 'complete' || event.type === 'error'` → **`event.type === 'complete'`** 로 좁힌다. `error`는 더 이상 버퍼를 비우지(잔여 라인 폐기) 않고 일반 이벤트처럼 콜백 전달 후 계속 파싱. 스트림 종결은 reader 루프의 HTTP done이 담당(현행). `complete` 종결은 유지(다른 소비처 회귀 0).

## Technical Context
**Language**: TypeScript / Vue. **변경 파일**: `src/shared/services/http.ts`(공유 스트림 유틸) 1곳(`processBuffer` 1줄). **Testing**: `vue-tsc`(0에러) + 라인 시퀀스 파싱 로직 검증. **Constraints**: 분석·파싱 양 소비처 회귀 0. ~1 LOC.

## Constitution Check
- I/II/III/IV: 신규 라우트/탭/백엔드콜 0, 공유 유틸 정확성 수정, 정직성 향상(데이터 유실 방지). **PASS.**

## 설계
```
// before
if (event.type === 'complete' || event.type === 'error') return ''
// after
if (event.type === 'complete') return ''   // error 는 데이터성 — 종결로 보지 않음(잔여 라인 보존)
```
- `error`는 onEvent로 전달(콘솔 표시) 후 루프 계속 → 같은 청크 뒤 라인·부분 라인 보존.
- 종결 = HTTP done(processStream while 루프 break) — 현행.

## Project Structure
```
specs/031-stream-parser-error-robustness/{spec,plan,tasks}.md, checklists/requirements.md
src/shared/services/http.ts   # processBuffer 종결 조건 1줄
```

## Complexity Tracking
*위반 없음.*
