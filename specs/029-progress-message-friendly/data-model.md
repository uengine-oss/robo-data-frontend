# Phase 1 Data Model: 진행 메시지 조립

런타임 store 상태와 룩업 테이블만 다룬다(영속 데이터 없음).

## 룩업 테이블 (analyzer.ts 상수)

### LABEL_KIND_KO (신규) — 노드 라벨 → 한국어 종류
| 라벨 | 한국어 | 전략 |
|---|---|---|
| FUNCTION | 함수 | framework |
| FILE | 파일 | framework |
| PACKAGE | 패키지 | 공통 |
| MODULE | 모듈 | 공통 |
| GLOBAL_VARIABLE | 전역변수 | framework |
| TABLE | 테이블 | 공통 |
| PROCEDURE | 프로시저 | dbms |
| FUNCTION(dbms) | 함수 | dbms (동일 키) |
| TRIGGER | 트리거 | dbms |
| METHOD | 메서드 | dbms |

> 멀티라벨 노드는 기존 `extractSubLabel`로 주 라벨을 고른 뒤 이 표를 적용. 미등록 라벨 → `entity_kind` 폴백.

### PROCESSING_KIND_KO (수정) — entity_kind 폴백 종류 + 단위
| entity_kind | 한국어 | 단위 | 비고 |
|---|---|---|---|
| CodeNode | 코드 | 개 | framework 함수 폴백 |
| Batch | 코드 묶음 | 건 | dbms — **건너뛰기 제거** |
| Module | 모듈 | 개 | |
| Table | 테이블 | 개 | |
| Component | 구성요소 | 개 | **신규(기존 '항목' 제거)** |
| ~~Question~~ | — | — | **삭제(미발생 죽은 매핑)** |

> 단위: 라벨이 코드류면 entity_kind로 단위 결정 — `Batch→건`, 그 외 코드/모듈/테이블/구성요소→`개`.

### STEP_VERB (신규) — step → 동작 문구
| step | 동작 |
|---|---|
| step5.build_context | 분석 중 |
| step6.analyze_code | 분석 중 |
| step6.module_pre_analysis | 살펴보는 중 |
| step7.summarize_module | 정리 중 |
| step7.enrich_table_description | 설명 채우는 중 |
| step7.build_components | 묶는 중 |
| (미등록) | 처리 중 |

### PROGRESS_THROTTLE (수정)
`{ CodeNode: 5, Batch: 5, Module: 1, Table: 1, Component: 1 }`, 기본 5. (Question 제거, Batch·Component 추가.)

## 상태 (기존 재사용)

- **`processedIds: Map<string, Set<string>>`** — 종류별 처리한 식별자 집합. 카운트=집합 크기.
  - framework `CodeNode`: 같은 함수 id가 step5/step6/sub_action으로 다중 도착 → 집합이 1회만 보유(dedup).
  - dbms `Batch`: 신호마다 entity_id가 들어오나 배치별 고유 식별이 필요 → 카운트 단위=배치. (구현: Batch는 dedup 집합 대신 누적 카운터 사용하거나, entity_id+sub_action 등 배치 고유키로 집합 관리. 상세는 tasks/구현에서 확정하되 "배치마다 +1, 단조 증가" 불변식 유지.)
- **`nodeMap: Map<string, GraphNode>`** — 라이브 그래프. `get(entity_id)?.properties?.name`, `.labels`.

## 메시지 조립 규칙 (FR-001)

```
입력: processing_event{ step, entity_kind, entity_id, status }
1. status !== 'done' → 종료(메시지 없음)   ※ 028 단계전진 블록은 이 판정 '전'에 실행
2. node = nodeMap.get(entity_id)
3. 종류 = LABEL_KIND_KO[주라벨(node)] ?? PROCESSING_KIND_KO[entity_kind].한국어 ?? '항목'
4. 단위 = (entity_kind==='Batch') ? '건' : '개'
5. 동작 = STEP_VERB[step] ?? '처리 중'
6. 카운트 = 종류줄기 누계(단조 증가) — throttle 통과 시에만 출력
7. 이름 = node?.properties?.name  (없으면 생략)
8. 출력 = `{이모지} {종류} {카운트}{단위} {동작}{ 이름? " — '"+이름+"'" : "" }`
```

이모지: 코드/함수/프로시저=🧠, 모듈=📦, 테이블=🗂️, 구성요소=🧩, 기타=🔹.

## 불변식 (검증 대상)
- 한 분석에서 "코드" 카운트는 **감소·리셋 없음**(SC-003).
- `Batch` 신호가 메시지를 **만든다**(무음 아님, SC-002).
- 원시 entity_id는 출력에 노출되지 않음(이름만, FR-010).
- 028 단계 전진은 핸들러 맨 앞에서 그대로(SC-005).
