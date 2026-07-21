# Implementation Plan: 응집도·결합도 그래프 보기

**Branch**: `059-cohesion-coupling-view` (브랜치 미생성 — 이 저장소는 `main`에서 spec 디렉터리로 작업)

**Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/059-cohesion-coupling-view/spec.md`

## Summary

영역(패키지) 안의 관계는 응집도가 높은 정상 상태이므로 기본 화면에서 접고, **영역을 넘는 관계만**
남겨 결합 지점을 즉시 드러낸다. 테이블은 쓰기가 가장 많은 영역에 소속시켜 별도 테이블 구역을 없애고,
소속 아닌 영역이 건드리면 그것이 영역 간 선으로 나타나게 한다. 색은 관계 종류(색상)와 영역 통과
여부(진하기) 두 축으로 나눈다. 보기 모드는 둘로 줄이고 건강은 "발견된 문제" 목록으로 옮긴다.

기술 접근은 **순수 계산을 새 파일 하나에 모으고 기존 단일 진실을 재사용하는 것**이다. 층 판정은
`nodeClassify.ts`(기존)를, R/W 출발점 해소는 `graphCanvas.ts`의 `PARENT_OF` 역추적 방식을 따른다.
분석기는 건드리지 않는다.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Vue 3.4 `<script setup>`

**Primary Dependencies**: `@neo4j-nvl/base` 1.x(캔버스 렌더), Pinia 2.x(상태), Vite 5(빌드)

**Storage**: 없음. 이미 로드된 Neo4j 그래프(`analyzer` 스토어의 `nodeMap`/`linkMap`)만 읽는다.

**Testing**: 순수 모듈 계약 테스트(`node <경로>.mjs` 직접 실행) + 전용 tsconfig strict 검사
(`tsc -p specs/059-cohesion-coupling-view/tsconfig.json`) + 저장소 전체 `npm run type-check` +
Playwright 실화면 캡처

**Target Platform**: 브라우저(standalone) 및 Module Federation remote(Architect 호스트·Electron)

**Project Type**: 단일 프론트엔드 SPA

**Performance Goals**: 캔버스 재계산이 노드/관계 변화 시에만 일어나고, 그래프 규모 3,445 노드 ·
1,073 관계(2026-07-21 실측 기준선)에서 조작 지연이 체감되지 않을 것

**Constraints**:

- 진행 중인 057·058의 dirty 파일(`package.json`, `analyzer.ts`, `graphVisibility.ts`,
  `panelGraphProjection.ts`, `scripts/`, `tests/`, `tsconfig.panel-projection.json`)을 수정하지 않는다.
  `graphCanvas.ts`만 057 hunk와 겹치지 않는 세 지점을 최소 수정한다(근거: research R3).
- `robo-data-analyzer` 저장소를 변경하지 않는다.
- 분석 전략(framework/dbms) 분기를 새로 만들지 않는다.
- 층 판정·소속 판정·색 결정은 각각 단일 함수 하나만 존재해야 한다.

**Scale/Scope**: 화면 1개(그래프 탭), 신규 순수 모듈 1개, 수정 파일 5개, 삭제 대상 3종

## Constitution Check

*GATE: Phase 0 전 통과 필요. Phase 1 설계 후 재확인.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. Tab-Based Single-Route Shell** | ✅ PASS | 라우트를 추가하지 않는다. 기존 `graph` 탭 안에서만 동작한다. |
| **II. Feature-Folder Modularity** | ✅ PASS | 신규 코드는 `src/features/code-analysis/`에 두고, 공용 판정(`nodeClassify`·`graphStyles`)만 `src/shared/`의 기존 파일을 쓴다. 다른 feature 내부에 손대지 않는다. `ObjectExplorerGraph.vue`의 동명 지역 함수는 건드리지 않는다. |
| **III. Gateway-Routed, Session-Headed API** | ✅ PASS (해당 없음) | 새 백엔드 호출이 없다. 이미 로드된 그래프만 읽는다. |
| **IV. Honest State: Wired vs. Mock** | ✅ PASS | "발견된 문제" 목록은 그래프에 실제 저장된 `risk_level`·`in_call_cycle`과 화면에서 계산 가능한 값만 쓴다. 저장되지 않은 지표(거대 루틴 등)를 만들어내지 않고, 정보가 없으면 FR-024대로 사유를 표시한다. |

**Cross-Service Contracts**: 이 기능은 `robo-analyzer`의 그래프 응답 계약을 **소비만** 한다. 계약을
바꾸지 않으므로 게이트웨이 경로 영향 없음.

**Post-Design 재확인 (Phase 1 이후)**: 설계 산출물(`data-model.md`, `contracts/`)이 새 라우트·새 백엔드
호출·mock 데이터를 도입하지 않음을 확인했다. 네 원칙 모두 PASS 유지.

## Project Structure

### Documentation (this feature)

```text
specs/059-cohesion-coupling-view/
├── spec.md
├── plan.md              # 이 파일
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (검증 실행 안내)
├── contracts/
│   ├── area-graph.contract.md          # 순수 모듈 입출력 계약
│   └── test-area-graph.mjs             # 계약 테스트(실측 정답지 내장)
├── tsconfig.json        # 순수 모듈 strict 검사 (058 관례를 따름)
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/
├── features/code-analysis/
│   ├── areaGraph.ts                    # ★신규 — 순수 계산 단일 처
│   │                                   #   층 소속 해소 · 테이블 주인 판정 ·
│   │                                   #   영역 간 관계 집계 · 펼침 상태 → 표시 그래프
│   ├── graphCanvas.ts                  # 최소 수정 3곳 (057 hunk 비중첩)
│   │                                   #   ① CanvasPreset 에서 'health-rw' 제거
│   │                                   #   ② canvasGraphData 프리셋 분기 머리
│   │                                   #   ③ buildHealthGraph·makeRoutineResolver 삭제
│   └── components/graph/
│       ├── GraphTab.vue                # 보기 모드 4→2, 협력군집·건강 제거, 문제 목록 연결
│       ├── NvlGraph.vue                # colorMode 제거, 관계 색·캡션, 더블클릭 핸들러 의미 변경
│       └── useGroupHulls.ts            # 교차 엣지 색에 영역 통과 여부 반영
└── shared/
    ├── config/graphStyles.ts           # 관계 색 2축 + 라벨 팔레트 hue 예약 + 표시명
    └── utils/nodeLabels.ts             # rolesOf 삭제, colorLabelOf 를 semanticRoleLabels 로
```

**Structure Decision**: 순수 계산을 `areaGraph.ts` 한 곳에 모으고 Vue/Pinia 의존을 없애 계약
테스트와 strict 타입검사를 독립 실행한다. 이는 057이 `panelGraphProjection.ts`에서 쓴 것과 같은
패턴이며(검증된 관례), 스토어·컴포넌트는 그 결과를 소비만 한다.

## 구현 슬라이스

각 슬라이스는 `구현 → 국소 검증 → 반대 사례 → 전체 회귀 → diff 재감사`를 한 묶음으로 끝낸다
(speckit §8). 슬라이스 사이에 빌드가 깨진 상태를 남기지 않는다.

| # | 슬라이스 | 대상 | 완료 증거 |
|---|---|---|---|
| S1 | `rolesOf` 결함 수정 (B1) | `nodeLabels.ts` + 소비처 2곳 | 역할 선택 시 캔버스·상세 패널 색이 바뀌는 캡처. 옛 `rolesOf` grep 0 |
| S2 | 관계 색 2축 + 표시명 + 팔레트 hue 예약 (US4) | `graphStyles.ts`, `NvlGraph.vue`, `useGroupHulls.ts` | 색 계약 테스트. 범례·통계·패널 색 일치 캡처 |
| S3 | 보기 모드 4→2, 협력군집·건강·`colorMode` 제거 (US5 전반) | `GraphTab.vue`, `NvlGraph.vue`, `graphCanvas.ts` | R4 목록 전 항목 삭제. `component_id`·`health-rw`·`colorMode` grep 0 |
| S4 | 순수 모듈 `areaGraph.ts` — 층 소속·테이블 주인·영역 간 집계 (US1·US2) | 신규 파일 + 계약 테스트 | 실측 정답지(테이블 22개 소속) 일치. strict 타입검사 통과 |
| S5 | 영역 간 관계 보기 배선 (US1·US2) | `graphCanvas.ts` 프리셋, `GraphTab.vue` | SC-001(같은 영역 선 0), SC-004(따로 그려진 테이블 0) 캡처 |
| S6 | 드릴다운 3단 + 빈 층 생략 (US3) | 스토어 상태 + `GraphTab.vue` 핸들러 | FR-009~014 시나리오 캡처. 전역 펼치기 부재 확인 |
| S7 | 발견된 문제 목록 (US5) | `GraphTab.vue` 개요 영역 | 개수와 그래프 실제 값 대조. 0건·정보없음 사유 표시 캡처 |
| S8 | 용어 중립화 (US6) | 화면 문자열 전수 | 서로 다른 언어 결과 2개에서 층 이름 동일 캡처 |

**의존 순서**: S1·S2는 독립. S3는 S2 이후(색 제거와 색 신설이 같은 파일을 만짐). S4는 독립.
S5는 S3·S4 이후. S6는 S5 이후. S7·S8은 S3 이후 독립.

## 위험과 대응

| 위험 | 대응 |
|---|---|
| `graphCanvas.ts`에서 057과 충돌 | 수정 지점을 3곳으로 고정하고 착수 직전 `git diff`로 057 hunk 위치를 재확인한다. 겹치면 즉시 멈추고 사용자에게 알린다. |
| 실물 검증 불가 (현재 `PACKAGE` 1개) | 구현·계약검증은 진행 가능. **화면 검증은 샘플 폴더 분리가 선행돼야 한다**(spec Assumptions). 그 전에는 FR-004 사유 표시 경로만 검증하고, 미검증 항목으로 분리 보고한다. |
| 색 시그니처 변경이 6개 소비처에 파급 | 두 번째 인자를 선택적으로 두어 기존 호출부를 깨지 않는다. 소비처 전수는 research R5에 고정. |
| 삭제 후 죽은 코드 잔존 | research R4의 소비처 목록을 tasks 체크리스트로 옮기고, 완료 게이트에서 `component_id`·`health`·`rolesOf` grep 0을 확인한다. |
| NVL `dashed` 미검증 | 059는 점선에 의존하지 않는다(research R8). |

## Complexity Tracking

> Constitution Check 위반 없음. 이 절은 비어 있다.
