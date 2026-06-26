# Consumer Contract: 분석 스트림 (이 기능이 의존하는 필드)

> **이것은 와이어 변경이 아니다.** 백엔드/게이트웨이 무변경. 이 기능이 **소비**하는 기존 스트림 필드와 그 값 도메인을 명문화해, 백엔드가 이 계약을 깨면 진행 메시지가 영향받음을 표시한다. (생산자=robo-data-analyzer, 경유=gateway 패스스루.)

## processing_event (소비: 메시지 생성)
| 필드 | 타입 | 사용 | 값 도메인(검증된 실제) |
|---|---|---|---|
| `step` | string | 동작 문구 파생 + 028 단계전진 | `step5.build_context`·`step6.analyze_code`·`step6.module_pre_analysis`·`step7.summarize_module`·`step7.enrich_table_description`·`step7.build_components` (포맷 `stepN.fn`) |
| `entity_kind` | string | 단위·폴백 종류 | `CodeNode`·`Batch`·`Module`·`Table`·`Component` |
| `entity_id` | string | nodeMap 이름/라벨 조회 키 | 논리 id (framework 함수: `owner.module.fn`; dbms batch: 부모 id `or` node_ids[0]) |
| `status` | string | `done`만 카운트 | `start`·`done`·`failed` |
| `sub_action` | string | (배치 고유키 보조, 선택) | 예: `one_liner`·`warmup_summary` |

## node_event (소비: 이름·종류 원천)
| 필드 | 타입 | 사용 | 비고 |
|---|---|---|---|
| `id` | string | nodeMap 키(=processing_event.entity_id와 동일 논리 id) | spec 027로 스트림·fetch 키 통일됨 |
| `label` | string | 한국어 종류 매핑 입력 | framework: FUNCTION/TABLE/PACKAGE/… · dbms: PROCEDURE/TRIGGER/… |
| `props.name` | string | 표시 이름 | 빈값이면 이름 생략 |

## 순서 가정 (의존)
- 대상 노드의 `node_event`가 그 대상의 `processing_event`보다 **먼저** 도착한다(앞 단계 노드 스트림). framework 실로그로 검증. 어기면 → 이름만 일시 누락(종류+개수는 정상, 안전한 열화).

## 계약 위반 시 영향(표면화 대상)
- entity_kind에 **새 값** 추가 → 폴백 종류 미매핑 시 '항목'으로 표시(열화, 무해). → 매핑 추가 필요 신호.
- step 포맷 변경(`stepN.` 깨짐) → 동작 문구 '처리 중' 폴백 + 028 단계전진 영향. → 회귀 표면화.
- node_event가 이름 없이 오거나 라벨 변경 → 이름 생략/종류 폴백. → 안전 열화.

## 비목표
- 이 기능은 스트림 와이어를 **바꾸지 않는다**. 백엔드가 이름을 신호에 싣게 하는 변경은 범위 밖(R1 기각).
