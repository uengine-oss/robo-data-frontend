# Phase 1 Data Model: 진행바 상태·보간 규칙

## 상태 (기존 ref 재사용)
- **`currentPhaseProgress: number`** (0~100) — 표시 진행바. 단조 증가.
- **`doneLeafCount: number`** — 완료 단계(leaf) 수. node_done에서 +1.
- **`expectedLeafCount: number`** — 전체 단계 수(framework 14 / dbms 13).
- (신규 상태 없음 — 보간은 위 ref만으로 계산)

## 상수
- `LIVE_FILL_K = 0.12` — 점근 계수.
- `BOUNDARY_EPS = 0.5` — 경계 직전 여유(%).
- (전체 상한 99는 기존 유지.)

## 보간 규칙
### applyProcessingEvent (신규 — 라이브 보간)
```
on processing_event (status==='done', 또는 신호 도착마다):
  N = expectedLeafCount; d = doneLeafCount
  if N <= 0: return
  boundary = (d + 1) / N * 100
  cap = min(99, boundary - BOUNDARY_EPS)
  if currentPhaseProgress < cap:
     currentPhaseProgress += (cap - currentPhaseProgress) * LIVE_FILL_K
```
> 위치: spec 029 메시지 throttle과 무관하게 **모든 done 처리 신호**에 적용(throttle 통과 여부와 별개로 바는 매 신호 전진 가능). 028 단계전진 블록 뒤, 메시지 조립과 독립.

### applyPhaseEvent node_done (기존 — 베이스라인, 유지)
```
d += 1
currentPhaseProgress = min(99, d / N * 100)   # cap(=boundary-ε) 이상 → 역행 0
```
### complete / start (기존 유지)
- complete: `currentPhaseProgress = 100`
- start/재시작: `currentPhaseProgress = 0`, `doneLeafCount = 0`

## 불변식 (검증 대상)
- **단조**: 분석 중 `currentPhaseProgress` 감소 0(시작/재시작 제외). (보간은 증가만, node_done baseline ≥ 직전 cap)
- **경계**: 라이브 값 < `(d+1)/N*100`(다음 경계) 항상. 완료 전 < 100.
- **멈춤 없음**: 처리 신호가 오는 한 cap 미만이면 매 신호 증가(SC-001).
- **전략 무관**: framework/dbms 동일(N만 다름).
- **028/029 무영향**: `currentPhaseIndex`·콘솔 메시지 불변.
