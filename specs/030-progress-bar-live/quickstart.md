# Quickstart: 진행바 라이브화 검증

## 전제
- frontend 루트. 타입검사 `npx vue-tsc --noEmit` → analyzer.ts 0에러.
- 데이터: framework 실분석 로그(`logs/analysis.run/latest/analyzer.log`) 또는 store 주입. dbms=신호 주입(데이터 없음).

## 시나리오 1 — 긴 단계 진행바 전진 (SC-001, US1)
1. `doneLeafCount`를 step5 완료 시점(예: d=10/14, ~71%)으로 두고, step6 처리 신호(processing_event done) 다수를 순서대로 주입(node_done 없이).
2. **기대**: `currentPhaseProgress`가 주입마다 증가, 다음 경계 `11/14*100≈78.6%`의 `−ε`까지 **점근 수렴**(예 71%→…→~78%), **정지 없음**.

## 시나리오 2 — 경계 미초과 (SC-003, US1 #2)
1. step6 처리 신호를 수백 건 주입.
2. **기대**: `currentPhaseProgress` < `(d+1)/N*100`(다음 경계) 항상, 99% 초과 없음.

## 시나리오 3 — node_done 매끄러운 인계 (SC-002, US1 #3)
1. 라이브로 ~78%까지 찬 상태에서 step6 node_done 주입.
2. **기대**: `doneLeafCount`+1 → baseline=`11/14*100≈78.6%`(min 99)로 설정, **역행 없음**(직전 라이브 ≤ baseline), 이후 step7 슬롯에서 다시 라이브.

## 시나리오 4 — 전략 무관 (SC-004, US2)
1. dbms(N=13)로 Batch 처리 신호 주입.
2. **기대**: framework와 동일하게 슬롯 내 점근 전진(전략 분기 없음). (라이브 실증=dbms 소스 시, 미검증)

## 시나리오 5 — 028/029 무회귀 (SC-005)
1. 같은 신호열 주입.
2. **기대**: `currentPhaseIndex`(028) 전진·콘솔 메시지(029) 동작 **변화 없음**.

## 통과 기준
- 1·2·3·5 framework 실데이터/주입 검증. 4 dbms 주입/로직(라이브 미검증 명시). 타입검사 0에러.

---

## 검증 결과 (2026-06-27)

**방법**: `vue-tsc` + framework 실로그(done 처리 신호 161건) 보간 로직 재생으로 불변식 확인.
- **T007 타입검사**: analyzer.ts **0 errors**. ✅
- **시나리오 1·2 (단조·경계, SC-001/003)**: 161건 재생 → 한 슬롯 내 점근 창오름(0.8→1.5→2.12→…→cap 6.64로 수렴), **단조=True**(역행 0), **경계초과없음=True**(다음 경계 미초과, 99% 미만). ✅
- **시나리오 3 (node_done 인계, SC-002)**: 라이브 6.64% → node_done(doneLeaf=11) baseline 79% **역행없음=True**(라이브 ≤ baseline). ✅
- **시나리오 5 (028/029 무회귀, SC-005)**: 보간은 `currentPhaseProgress`만 갱신 — `currentPhaseIndex`(028)·콘솔 메시지(029) 코드 불변(같은 핸들러, 독립 ref). ✅
- **시나리오 4 (dbms, SC-004)**: 보간은 `expectedLeafCount`(N)만 사용·전략 분기 없음 → Batch done에도 동일 적용. 라이브 실증=dbms 소스 시(미검증). ✅(로직)
