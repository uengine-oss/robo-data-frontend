# Implementation Plan: 분석 실패 정직한 표면화

**Branch**: `047-analysis-failure-honesty` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

## Summary

Analyzer의 terminal NDJSON 오류 계약 `error(fatal=true)`를 소비해 `doAnalyze`가 실패를 throw하도록 한다. 성공은 `phase_event complete`로만 확정하며, 실패 시 완료 처리와 기존 그래프 재조회에 도달하지 않는다.

## Constitution Check

- III Gateway-routed API: 기존 `/api/gateway/robo/analyze` 유지 — PASS.
- IV Honest State: 실패를 성공으로 표시하지 않음 — PASS.
- spec 031: error 이벤트 자체는 파서 종결 신호로 쓰지 않고 스트림을 끝까지 소비 — PASS.

## Flow

```text
Analyzer exception → error{fatal:true,message,...} → stream_end
→ frontend callback 기록/표시 → stream 종료 후 throw
→ executeRestartPipeline catch → 처리 실패
→ 완료 메시지·100%·graph fetch 없음
```

## Changed Files

```text
src/shared/types/index.ts
src/features/code-analysis/analyzer.ts
specs/047-analysis-failure-honesty/
```

## Verification

- 타입 검사.
- callback에 fatal error 후 stream 종료: `doAnalyze` reject.
- complete 없는 종료: reject.
- complete 정상 종료: 완료 및 graph fetch.
- 실제 Electron에서 정상/실패 상태와 콘솔 메시지 캡처.

## Complexity Tracking

위반 없음.
