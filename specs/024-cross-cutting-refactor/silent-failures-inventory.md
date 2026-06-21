# 조용한 실패 인벤토리 (전 코드베이스)

**작성**: 2026-06-22 (배치 ①) | **방법**: `catch {}`·`catch(e){}`·`.catch(()=>…)` 전수 grep + 맥락 점검.

"모든 오류는 원인을 알아야 수정 가능"(사용자 원칙). 본 배치에서 처리하지 않는 것도 **빠짐없이 추적**해 후속 배치에 인계한다.

## 분류 기준
- **A. 배치① 처리완료** — code-analysis 데이터 경로. 본 배치에서 표면화.
- **B. 이미 표면화(보존)** — logger/사용자 메시지로 이미 기록 중. 건드리지 않음.
- **C. 안전 폴백(표면화 불필요)** — 에러 처리가 아닌 부재/형식 폴백. 오탐 방지 위해 건드리지 않음.
- **D. 후속 배치** — 다른 feature. god-component 회귀 위험으로 해당 feature 분해 배치에서 처리.

---

## A. 배치① 처리완료 ✅

| 파일 | 위치 | 전 | 후 |
|---|---|---|---|
| `shared/services/http.ts` | `parseJsonLine` | 무방어 `JSON.parse`(스트림 즉사) | `logger.warn`+null 스킵+지속 |
| `shared/services/http.ts` | SSE `flushEvent` | 무방어 `JSON.parse` | `logger.warn`+이벤트 스킵+지속 |
| `code-analysis/.../NvlGraph.vue` | L418·477·484·486·495 | 빈 `catch{/*무해*/}`(NVL 가드) | `logger.debug`(동작 보존, 추적 가능) |

## B. 이미 표면화 — 보존 ✅ (점검 완료, 변경 없음)

| 파일 | 위치 | 처리 방식 |
|---|---|---|
| `code-analysis/analyzer.ts` | catch 13곳(L171·186·524·664·674·717·763·807·856·910·920·931·948) | 전부 `logger.warn`/`logger.error` 또는 `addMessage('error',…)`. 삼키는 곳 0. |
| `code-analysis/.../NvlGraph.vue` | L749 | `logger.warn('[NvlGraph] drop payload 파싱 실패')` |

## C. 안전 폴백 — 표면화 불필요 ✅ (오탐 방지, 건드리지 않음)

| 파일 | 위치 | 사유 |
|---|---|---|
| `shared/services/http.ts` | `parseErrorMessage` catch | "JSON 아니면 원문 폴백" — 의도된 폴백, 원문은 이미 사용자에게 전달 |
| `shared/services/http.ts` | `response.text().catch(()=>'')` | 에러 본문 읽기 실패 시 빈 문자열 폴백(방어) |
| `code-analysis/.../node-detail/AttachedCard.vue`, `upload/JsonViewer.vue` | JSON 표시용 `catch` | 파싱 실패 시 원문 표시 폴백(표시 전용) |
| 전역 다수 | `node.properties || {}`, `?? ''`, `?? 0` | 에러 처리가 아닌 **부재 기본값**(속성 opaque 계약). 조용한 실패 아님. |

## D. 후속 배치 인계 ⏭️ (빠짐없이 추적 — 해당 feature 분해 시 처리)

빈 `catch {}`(완전 침묵) 22곳/6파일 중 code-analysis(5곳)는 A에서 처리. 나머지:

| 파일 | 빈 catch 수 | 위치 | 성격 | 담당 배치 |
|---|---|---|---|---|
| `domain/components/BpmnViewer.vue` | 7 | L134·171·220·225·313·318·323 | bpmn-js 라이브러리 가드(zoom 등) | domain feature 배치 |
| `domain/components/MultiLayerOntologyViewer.vue` | 5 | L2961·3067·8136·8652·8658 | 파싱·스케줄러·localStorage 삼킴 | 🔴 MLOV 전용 배치(견적 1순위) |
| `ontology/.../whatif/StepModelManager.vue` | 2 | L24·41 | whatifDomainApi 호출 삼킴 `/*무시*/` | whatif/ontology 배치 |
| `ontology/.../whatif/StepTrainModels.vue` | 2 | L51·67 | 동일 | whatif/ontology 배치 |
| `domain/api.ts` | 1 | L471 | `/*ignore parse error*/` | domain feature 배치 |

추가 삼킴(변수 미사용 `catch(e){}`·`.catch(()=>…)`)은 각 feature(olap·text2sql·schema·observability·security·glossary·datasources)에 산재 — 해당 feature 분해 배치에서 동일 원칙(표면화 vs 안전폴백 분류)으로 처리한다.

**원칙**: god-component(MLOV 14k·BpmnViewer)의 catch를 지금 건드리면 그 거대 컴포넌트를 수정해 회귀 위험. 표면화는 분해와 함께 가는 게 안전. 본 인벤토리가 "빠뜨리지 않음"의 보증서다.
