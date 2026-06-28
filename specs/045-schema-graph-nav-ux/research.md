# Phase 0 Research: 표시 설계 결정

NEEDS CLARIFICATION 0건(clarify에서 FR-018 확정). 아래는 표시 계층 핵심 결정과 근거 — 대부분 구현 중 실측으로 확정됨.

## R1. 노드/컬럼 "소속" 파생 방법

- **Decision**: 소속(부모)은 **식별자 `id`의 계층 prefix**에서 파생한다. COLUMN `테이블.컬럼` → 테이블, FUNCTION `패키지.모듈.함수` → 패키지·모듈.
- **Rationale**: 식별자 통일(analyzer spec 017) 이후 소속은 엣지로만 존재하고 노드 속성(table_name 등)엔 없다. 패널엔 엣지(allLinks) prop이 없으나, **id 마지막 `.` 앞**이 곧 소속이라 추가 데이터 없이 즉시 파생(실측 확인: `zngm_comm_cd_dtl.comm_cd_id`, `zapamcom.zapamcom10060.zapamcom10060`).
- **Alternatives**: ①allLinks prop 추가 후 엣지로 부모 조회 — 데이터 plumbing 큼, 불필요. ②노드 속성 신설 — 백엔드 변경 필요(계약 변경), 거부.

## R2. 검색 결과 배지 색 = "종류"

- **Decision**: 배지 텍스트는 **종류(자기 자신 라벨, `kindOf(labels)`) 1개**만, 색은 `getNodeColor`(=종류색).
- **Rationale**: 실제 캔버스 노드 색 로직 `resolveNodeColor`→`getNodeColor([colorLabelOf(labels)])`, 그리고 `colorLabelOf` 기본값이 `kindOf`(종류). 즉 **캔버스는 종류색**. 배지를 종류로 칠하면 배지=실제 노드색 일치. 역할(stereotype)로 칠하면 캔버스와 불일치 → 거부.
- **Alternatives**: 역할 색(Overview 역할 칩 색) — 캔버스 노드 색과 안 맞아 "실제 노드색" 위배.

## R3. 1차=논리명 우선(비개발자)

- **Decision**: 검색 결과·표시는 **논리명(logical_name) 우선**(없으면 물리명), 물리명·소속은 흐린 2차 줄.
- **Rationale**: 1차 사용자가 비개발자라 코드 식별자(물리명)만으론 의미 파악 불가. 논리명(한글)이 즉시 의미를 준다(spec Assumptions).

## R4. 검색 결과 개수·도달성

- **Decision**: 임의 상한(MAX 10) 제거 → **전체 매칭 표시**, 개수는 **실제 전체값**, 드롭다운 `max-height + overflow-y:auto`로 **스크롤 전체 도달**.
- **Rationale**: 사용자가 "날것 개수"와 "아래 결과 도달"을 요구. cap+"10개+" 특수표기 둘 다 제거하면 코드도 줄고(근본정리) 도달성 확보. 매칭 filter는 가볍고 드롭다운 스크롤로 렌더 수용.

## R5. 상단 전체검색 = 현재 탭 맥락 라우팅

- **Decision**: 상단 전체검색은 **`session.activeTab` 기준 라우팅** — 그래프 탭이면 노드검색, 스키마 탭이면 테이블검색. placeholder·동작이 탭에 맞게 정직. "All▾"·"⌘K" 빈 장식은 실제 동작 연결 또는 제거.
- **Rationale**: 각 탭에 이미 잘 만든 검색이 있어 재사용이 저위험·즉시 정직(constitution IV). 진짜 글로벌 통합 인덱스는 가치는 크나 작업이 크다(clarify에서 사용자 A 선택).
- **Alternatives**: 진짜 글로벌(B)·장식만 정리(C)·제거(D) — clarify에서 A로 확정.

## R6. 마커·정렬 규칙(일관성)

- **Decision**: NOT NULL = **주황(#f59e0b 계열)** — 카드는 별표(*) 마커, 상세패널은 "NOT NULL" 텍스트(맥락별 형태, **색·의미는 일관**). 카드 컬럼 행은 이름(flex) | 마커(타입 앞 딱붙임) | 타입(맨오른쪽 고정)로 **요소만 오른쪽에 모음**(빈칸 없이). 상세패널은 NOT NULL 고정 슬롯으로 타입 위치 고정(지그재그 방지). 긴 텍스트는 `…` ellipsis.
- **Rationale**: ui-principles(일관성·지그재그 금지·정보전달·맥락별 형태). 매직 px 대신 flex/grid·상대단위(FR-020).
- **Alternatives**: 그리드 빈칸 유지(요소 떠 보임) — 사용자 거부, "타입 앞 딱붙임"으로 확정.
