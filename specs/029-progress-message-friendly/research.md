# Phase 0 Research: 분석 진행 메시지 친절화

모든 결정은 **실데이터(framework 분석 로그·neo4j 쿼리)와 백엔드/프론트 코드 전수조사**로 확정. NEEDS CLARIFICATION 없음.

## R1. 처리 신호(processing_event)는 무엇을 담는가
- **결정**: `{ type:'processing_event', step, entity_kind, entity_id, sub_action, status }`. 이름은 **없음**.
- **근거**: 백엔드 `shared/log/processing_progress.py:127`(emit), framework 실로그 `step5.build_context · entity_kind: CodeNode · entity_id: zapamcom.zapamcom10060.a000_input_validation · sub_action: one_liner · status: done`.
- **대안**: 신호에 이름을 싣게 백엔드 수정 → **기각**(와이어 변경 불필요, 이름은 프론트가 이미 가진 그래프에서 조회 가능).

## R2. 이름·종류는 어디서 가져오나
- **결정**: `entity_id`로 `nodeMap` 조회 → 노드의 `properties.name`(이름)·`labels`(종류). 처리 신호보다 노드가 **먼저** 스트림되므로 조회 가능.
- **근거(framework 실증)**: 함수 노드 38개가 `03:18:02`에 `node_event{label:FUNCTION, props:{name:'a000_input_validation'}}`로 스트림 → 같은 id의 처리 신호는 `03:18:21`(step5)에 도착. 순서 보장됨.
- **엣지**: 노드 미존재(예: 일부 step7 Component) → 이름 생략, 종류는 `entity_kind` 폴백.

## R3. entity_kind 실제 값 집합 (전수)
- **결정**: `CodeNode`, `Batch`, `Module`, `Table`, `Component`. (`Question`은 미발생=죽은 매핑, `Split`은 docstring에만=문서 드리프트.)
- **근거**: `track_processing("…")` 호출처 전수 grep — build_context/analyze_code/three_split=`CodeNode`, batch_analyze=`Batch`, module_pre_analysis/summarize_module=`Module`, enrich_table_description=`Table`, build_components_step=`Component`. framework 실로그 분포: CodeNode 294·Module 8·Table 14·Component 6.

## R4. 종류(한국어)는 라벨 기반 — 전략 무관
- **결정**: 노드 라벨 → 한국어(`FUNCTION→함수`, `PROCEDURE→프로시저`, `TRIGGER→트리거`, `MODULE→모듈`, `TABLE→테이블`, …). 라벨 없으면 `entity_kind` 폴백(`CodeNode→코드`, `Batch→코드 묶음`, `Module→모듈`, `Table→테이블`, `Component→구성요소`).
- **근거**: framework 라벨 = FUNCTION/FILE/PACKAGE/GLOBAL_VARIABLE/DEFINE/TABLE(실로그), dbms 라벨 = PROCEDURE/TRIGGER/… (spec 044, dbms 코드데이터 없어 코드 기준). 라벨 기반이면 핸들러가 전략을 몰라도 함수/프로시저가 자동으로 갈림.

## R5. step → 동작 문구
- **결정**: `step5.build_context→분석`, `step6.analyze_code→분석`, `step6.module_pre_analysis→살펴봄`, `step7.summarize_module→정리`, `step7.enrich_table_description→설명 채움`, `step7.build_components→묶음`. 미등록 → "처리".
- **근거**: framework 실로그 step 분포 = step5.build_context/step6.analyze_code/step6.module_pre_analysis/step7.summarize_module/step7.enrich_table_description/step7.build_components.

## R6. dbms는 Batch 단위 — 건너뛰면 안 됨
- **결정**: `Batch` 신호도 처리. dbms 진행 개수 단위 = **배치 건수**. framework(CodeNode)와 dbms(Batch)는 **전략 배타**(`analyze_code_step.py:152` `if strategy=='dbms': run_dbms_batch_analysis`)이므로 단일 "코드" 줄기로 합산해도 충돌 없음.
- **근거**: 현재 `analyzer.ts:646 if rawKind==='Batch' return`이 dbms를 통째로 무음으로 만듦. `batch_analyze.py:191 track_processing("Batch", parent_id or node_ids[0])`.
- **대안(기각)**: 배치 부모를 상위 프로시저로 역산해 "프로시저 단위"로 묶기 → dbms 코드데이터가 없어 라이브 실증 불가 + 중첩 부모 이름이 빌 수 있어 불확실 → **건수 + 현재 이름**(확실한 것만)으로 단순화.

## R7. 병렬과 메시지 흐름
- **결정**: 병렬도(30, `ROBO_PIPELINE_MAX_CONCURRENCY`)와 무관하게 스트림은 **단일 직렬 큐**(`ndjson_stream.py` asyncio.Queue → iter 한 줄씩). 메시지는 완료 순서대로 1줄씩 + throttle → 도배 없음.
- **근거**: `analyze_code_step.py:188`/`batch_analyze.py:95` semaphore=30, `ndjson_stream.py:232-239` 단일 소비 iter.

## R8. 카운트·throttle·dedup
- **결정**: framework=함수 id로 dedup(같은 함수의 step5/step6/sub_action 다중 신호를 1회로) → 함수 개수. dbms=배치마다 1건(부모 id 공유라 dedup하면 과소 → 배치 단위로 카운트). 종류별 throttle 유지(+Component 추가).
- **근거**: 실로그상 한 함수가 step5 one_liner + step6 analyze + sub_action들로 다중 done → dedup 필수. 현행 `processedIds`(Set per kind) 재사용.

## 검증 데이터 가용성
- framework: `neo4j` DB(코드분석 완비, FUNCTION 38 등) + 실분석 로그(`logs/analysis.run/latest/analyzer.log`) → 라이브 렌더 검증 가능.
- dbms: `test` DB = 스키마만(TABLE 388·COLUMN 3383, 코드노드 0) → 라이브 실증 불가. **신호 주입/로직 단위로 검증**, 라이브는 dbms 소스 확보 시(미검증으로 명시).
