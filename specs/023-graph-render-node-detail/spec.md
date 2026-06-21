# Feature Specification: 그래프 오버레이 NVL-스타일 렌더 + 노드 식별 패널 재구조

**Feature Branch**: `main` | **Created**: 2026-06-21 | **Status**: ✅ 구현완료·라이브검증(2026-06-21)

**Input**: 라이브 리뷰에서 누적 확인된 근본 문제 — ① 그래프 오버레이가 직접 그린 엣지/라벨/헐이 NVL 네이티브보다 안 이쁨(화살표가 노드를 찌름·관계라벨 떡칠·줌하면 라벨 거대) ② 영역(헐)을 거대 원으로 통일해 끌면 사방으로 부풂 ③ 앵커가 뜬금없는 점·영역 이름 위치 조잡 ④ 노드 상세 "식별" 영역이 정보가 흩어지고 둘로 쪼개져(2분할) 어색·누락. 전부 UI 가독성용 → **프론트 전용·재분석0·백엔드0**.

## 배경 — 022 일부 supersede + 020/021 노드패널 정련
- ★**022의 "free layout(위치 고정·physics OFF)" 방향 = 폐기.** 실측 확인: NVL `physics:{enabled:false}` 등은 **존재하지 않는 옵션**(base.mjs 에 `physics` 문자열 0회; 진짜 정적 배치는 `layout:'free'`+`setLayout`). 게다가 free=JS 배치는 사용자가 "딱딱/개판"으로 반려. → **physics ON(출렁) 유지** + 앵커↔멤버 옅은 링크를 force 에 넣어 원형 군집 형성을 최종 채택. (022 FR-004 supersede.)
- 본 스펙 = 022의 **오버레이 렌더 품질**과 020의 **노드 식별 패널**을 정련(NVL 동일 스타일 + 식별 정보 통합).

## 데이터 사실 (Neo4j·NVL 전수확인 — 추측0)
- **노드 종류별 저장 속성**(`db.schema.nodeTypeProperties`, 실측): 공통 `logical_name`·`file_path`(절대경로)·`start_line`/`end_line`·`stereotype`·`summary`·`notes`·`code_text` / 루틴 `params`·`return_type`·`risk_level`·`component_name` / 테이블 `schema`·`db`·`table_type` / 컬럼 `dtype`·`is_primary_key`·`nullable`·`default_value` / 변수 `var_type`·`init_value` / 청크 `chunk_type`·`config_key_path`. ★`directory` 속성 **없음**(경로=디렉토리 중복 아님).
- **NVL 사실**(base.mjs 실측): 노드 화면 반지름 = `size·scale`(size가 곧 반지름) / 관계 라벨 = `translate(중점)→rotate(엣지각도)→fillText` = **엣지 각도로 회전**·회색`#818790`·배경/외곽선 0 / `NodeGap=4`·`HeadHeight=9`·`HeadWidth=7` / `relationshipLabelFontSize:10`.

## User Scenarios *(mandatory)*

### US1 — 그래프 관계가 NVL 네이티브처럼 그려진다 (P1) 🎯
오버레이 엣지·화살촉·라벨이 NVL 기본과 **동일 스타일**: 노드 경계에서 출발(안 찌름)·불투명 솔리드·두께 2·화살촉 NVL 치수, **관계 라벨은 엣지 각도로 회전 + 회색 + ~9px + 줌 연동**(가까이서 또렷, 멀어지면 사라짐).
**Acceptance**: 줌인 시 라벨이 선을 따라 눕고, 줌아웃 시 사라진다. 화살표가 노드 안에서 출발하는 일 0.

### US2 — 영역이 군집 모양에 맞는 둥근 도형 (P1)
영역(헐) = 볼록헐 + 2R 둥근선(Minkowski) **모양맞춤**. 원으로 통일하지 않아(끌면 사방 부풂 X) 그 노드 쪽으로만 늘어난다. **모든 클러스터 보기**(모듈간·협력군집·영역구조·건강) + **테이블도 한 영역**.
**Acceptance**: 흩어진 군집은 넓게, 뭉친 군집은 둥글게 감싼다. 끌면 끈 노드 방향으로만 확장.

### US3 — 영역 이름·앵커 라벨 (P2)
영역 이름 = **앵커 바로 위 일정 위치**(앵커 화면반지름 + 고정 간격)의 알약 `[● 영역색] 이름`(줌 무관 고정). 앵커 노드도 자체 NVL 캡션을 가진다(다른 노드처럼).
**Acceptance**: 어떤 줌·군집 모양에서도 영역 이름이 앵커와 안 겹치고 일정한 위치.

### US4 — 노드 상세 "식별"이 빠짐없는 정보 목록 (P1) 🎯
식별 카드 = 헤더(아이콘 + 물리명 + 타입 배지) + **라벨+값 행 목록**: `논리명·경로·라인·분류` + 종류별(`파라미터·반환·협력군집` / `스키마·DB·종류` / `타입·PK·NULL·기본값` / `초기값` / `청크 타입·키 경로`). 값 있는 항목만, 종류 무관 일관. **2분할·중복 0**. 경로는 `data/source/` 접두를 잘라 상대화.
**Acceptance**: 파일·구문·함수·테이블·컬럼·변수·청크 등 모든 종류가 자기 식별 정보를 빠짐없이 한 목록으로 표시. 옛 "소속 한 줄 + 파일명 별도 밴드(2분할)" 폐기.

### Edge Cases
- 라인 0~0(파일 등) → 라인 행 생략. 값 없는 속성 → 행 자체 미생성.
- 최소 노드(PACKAGE 등 buildIdentityRows 빈 경우) → 카드가 준 `subInfo`(fqn 등)를 "소속" 폴백 행으로.
- 청크 타입/키 경로 등 framework 전용 속성도 같은 목록에 자연 포함.

## Requirements *(mandatory)*
- **FR-001**: 오버레이 엣지/화살촉/관계라벨 = NVL 네이티브 스타일·치수와 동일(`useGroupHulls`). 라벨은 엣지 각도 회전 + 회색 + 줌 연동(멀면 사라짐, ~9px 상한).
- **FR-002**: 엣지 노드 경계 트림 = 노드 화면 반지름(`size·scale`, 실측) + `NodeGap 4` → 찌름 0(전 줌).
- **FR-003**: 헐 = 볼록헐 + 2R 둥근 **모양맞춤**(원 통일 폐기). 전 클러스터 보기 + 테이블 영역 포함.
- **FR-004**: 영역 이름 라벨 = 앵커 위 고정 위치 알약(색점 + 이름, 줌 무관). 앵커는 자체 NVL 캡션.
- **FR-005**: **physics ON(출렁) 유지** — 022 FR-004(위치 고정 free layout) **supersede**. 앵커↔멤버 링크를 force 에 넣어 군집 형성.
- **FR-006**: 노드 식별 행 = **단일 생성처 `buildIdentityRows(node)`**(DRY)·종류별·값 있는 것만. 경로 `data/source/` 상대화. `NodeDetailBase` 가 통합 렌더, 카드별 `subInfo`/`sub-header`/`headerLogical`·중복 "역할" 섹션 폐기.
- **FR-007**: ★성능 — `buildHierarchyMap` 를 **캐시 computed `hierarchyMap`** 로(보기 computed 5곳이 1회 공유, 렌더당 nodeMap+linkMap 5회 순회 → 1회).
- **FR-008**: 회귀 0 — 드롭·1-hop·필터·논리명·스트림·색상크래시0·전 보기모드(모듈간·협력군집·영역구조·건강) 유지.

## Success Criteria *(mandatory)*
- **SC-001**: 엣지 찌름 0(경계 트림, 라이브 dpr2 검증). **SC-002**: 관계 라벨 = NVL 스타일(회전·회색·줌연동, 줌아웃 시 사라짐).
- **SC-003**: 영역 = 둥근 모양맞춤(전 보기, 원 통일 0). **SC-004**: 식별 = 빠짐없는 행 목록(파일·구문·프로시저 3종+ 라이브 검증).
- **SC-005**: physics ON 유지 + 전 보기모드 라이브 검증 에러 0. **SC-006**: 백엔드 0·재분석 0·회귀 0.

## Supersedes / 범위
- ★**022 FR-004(위치 고정 free layout) → physics ON 유지로 supersede.** 022 의 클러스터 분리·그룹 앵커·헐 enclosure·성능(FR-001~003,005,007)은 **유지**.
- **020/021 의 노드패널 `subInfo`(카드별 문자열 조립) 방식 → `buildIdentityRows` 단일 생성으로 supersede.**
- ★본 작업은 **비SDD 반응형으로 구현된 뒤 본 스펙으로 소급 박제**(speckit 정상화). 백엔드/노드/모델 무변경.
- 손댄 파일: `useGroupHulls.ts`·`GraphTab.vue`·`NvlGraph.vue`·`graphCanvas.ts`·`shared/utils/nodeIdentity.ts`(신규)·`node-detail/{NodeDetailBase·FileCard·FunctionCard·ModuleCard·NonCodeCard·nodeDetailPanel.shared.scss}`.
- 남은 minor: 일부 카드(Table·Column·Variable·Datatype·SqlStatement)에 `subInfo` computed 잔존(소속 폴백 전용·rich 노드선 미렌더) — 다음 리팩토링 세션 정리.
