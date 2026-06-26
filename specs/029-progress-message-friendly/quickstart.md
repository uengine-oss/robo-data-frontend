# Quickstart: 진행 메시지 검증

## 전제
- frontend 루트에서 작업. 타입검사: `npx vue-tsc --noEmit` → **내 파일(analyzer.ts) 0에러**(프로젝트 전역 기존 에러는 무관).
- 라이브: 백엔드 기동 `pwsh -File robo-architect\scripts\dev-desktop.ps1 -NoElectron`(catalog 5503·gateway 9000·analyzer 5502·antlr 8081), vite dev 3000.
- Playwright 하니스: `robo-data-frontend\.unittest\node_modules\playwright`. store 접근 `#app.__vue_app__.config.globalProperties.$pinia._s.get('analyzer')`.
- 데이터 ground truth: neo4j `neo4j` DB=framework(코드분석 완비), `test` DB=dbms(스키마만).

## 시나리오 1 — framework 실데이터 렌더 (SC-001, US1)
1. framework 분석 실행(또는 `logs/analysis.run/latest/analyzer.log`의 processing_event/node_event를 store에 순서대로 주입).
2. **기대**: 콘솔에 `🧠 함수 N개 분석 중 — '<실제 함수명>'`(예 `a000_input_validation`), `🗂️ 테이블 N개 설명 채우는 중 — '<실제 테이블명>'`(예 `zord_acnt`)가 흐르고 N이 단조 증가.
3. **확인**: `store` 콘솔 메시지 배열에 위 형식 줄 존재, 원시 id(`zapamcom.zapamcom10060.…`) **미노출**.

## 시나리오 2 — 단계별 동작 문구 (US1 #2)
1. step7 구간(설명 보강/모듈 요약/구성요소) 신호 주입.
2. **기대**: `🗂️ 테이블 N개 설명 채우는 중 — '…'`, `📦 모듈 N개 정리 중 — '…'`, `🧩 구성요소 N개 묶는 중`(이름 없으면 이름 생략).

## 시나리오 3 — dbms Batch 무음 제거 (SC-002, US2)
1. dbms 코드데이터가 없으므로 **신호 주입**: `processing_event{ step:'step6.analyze_code', entity_kind:'Batch', entity_id:<id>, status:'done' }`를 여러 건, 일부는 nodeMap에 PROCEDURE 노드 존재/일부는 부재로.
2. **기대**: 각 배치마다 `🧠 코드 묶음 N건 분석 중`이 뜨고(무음 아님) N 단조 증가. 노드 있으면 `— '<이름>'` 붙고, 없으면 이름 생략.
3. **확인(코드/로직)**: `applyProcessingEvent`가 `Batch`에서 더 이상 early-return 하지 않음.

## 시나리오 4 — 카운트 단조성 (SC-003, US3)
1. framework: 같은 함수 id를 step5(one_liner)+step6(analyze)+sub_action으로 여러 번 주입.
2. **기대**: 그 함수는 카운트에 **1회만** 반영(중복 제거), 전체 카운트는 감소·리셋 없이 증가.

## 시나리오 5 — 028 회귀 없음 (SC-005)
1. processing_event `step:'step6.…'` 주입.
2. **기대**: `currentPhaseIndex`가 5(코드 분석)로 전진(028 동작 유지) — 메시지 변경과 무관하게 동일.

## 통과 기준
- 시나리오 1·2·4·5 = framework 실데이터/주입으로 **검증 가능**.
- 시나리오 3 = dbms **신호 주입/로직**으로 검증(라이브 실증은 dbms 소스 확보 시, 미검증 명시).
- 타입검사 내 파일 0에러.

---

## 검증 결과 (2026-06-27)

**방법**: ① `vue-tsc --noEmit` ② 새 `applyProcessingEvent` 결정 로직을 1:1 복제해 **framework 실분석 로그**(`logs/analysis.run/latest/analyzer.log`, processing_event 322건 + node_event)에 재생 + **dbms Batch 신호 주입**. (Electron `app://` 헤드리스 불가·console-text 변경이라 풀스택 라이브 런 대신 실데이터 로직 재생으로 검증; 풀앱 라이브는 dev-desktop 기동 시 가능.)

- **T013 타입검사**: `analyzer.ts` **0 errors**(프로젝트 전역 기존 에러는 무관). ✅
- **시나리오 1·2 (framework, SC-001)**: 실제 함수명으로 `🧠 함수 35개 분석 중 — 'd600_check_possible_yn'`, `🗂️ 테이블 1개 설명 채우는 중 — 'zngm_comm_cd_dtl'`, `🧩 구성요소 3개 묶는 중`(이름 폴백) 출력. 단계별 동작 문구 정확. ✅
- **시나리오 3 (dbms Batch, SC-002)**: Batch 12건 주입 → `🧠 코드 묶음 1/5/10건 분석 중 — 'PRC_PAY_AUTH'/'PRC_SETTLE'/(무명 폴백)`. **무음 아님**, throttle로 3줄. ✅ (라이브 실증=dbms 소스 확보 시, 미검증)
- **시나리오 4 (단조, SC-003)**: 함수 카운트 1→5→…→35 단조, 같은 함수 다중 신호 1회만(dedup). ✅
- **시나리오 5 (028 회귀, SC-005)**: 단계전진 블록 핸들러 맨 앞 보존, 메시지 변경과 독립. ✅
- **FR-010 원시 id 미노출**: 출력에 `zapamcom.…`/`:STMT:` 등 원시 id 노출 0(검사 PASS). ✅
