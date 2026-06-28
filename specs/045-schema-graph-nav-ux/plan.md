# Implementation Plan: 스키마 탭 & 그래프 탐색 UI/UX 모던화 정합

**Branch**: `045-schema-graph-nav-ux` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/045-schema-graph-nav-ux/spec.md`

## Summary

스키마 탭(테이블 카드·상세패널·사이드바·검색)과 그래프 탭 노드검색(Overview)의 **표시 계층**을 일관·명확·모던하게 정합한다. 같은 의미(NOT NULL·캔버스에 그려짐·노드 종류·소속)는 어디서나 같은 색·위치·표현 규칙을 따르고, 마커는 의미가 읽히게(범례/텍스트), 비개발자를 위해 **논리명 우선**으로 보여준다. 잘 구현된 그래프 네비게이터/Overview가 정합 기준. **새 백엔드 호출·계약 변경 없음**(기존 그래프/카탈로그 데이터를 다르게 표시할 뿐). US1~US4는 이번 세션 구현 완료(사후 명세·검증), US5(스키마탭 검색)·US6(상단 전체검색)은 본 계획으로 구현.

## Technical Context

**Language/Version**: TypeScript 5.x / Vue 3 (SFC, `<script setup>`)

**Primary Dependencies**: Vue 3 · Pinia · Vue Flow(스키마 캔버스) · NVL(그래프) · Vite. 공유 유틸 재사용 = `shared/utils/nodeLabels.ts`(`kindOf`), `shared/config/graphStyles.ts`(`getNodeColor`), `shared/utils/graphDisplay.ts`(논리/물리명).

**Storage**: N/A — 표시 계층. 기존 Pinia 스토어(`schemaCanvas`, `analyzer`, `navigator`, `session`)가 보유한 데이터를 렌더만 한다.

**Testing**: Playwright 헤드리스 자가검증(`robo-data-frontend/.unittest`, 스크린샷을 직접 Read) + `npx vite build` 컴파일 게이트. (UI 단위테스트 별도 미요청 — 원칙 §6 실행검증.)

**Target Platform**: 웹(vite dev 3000 standalone) + Electron/Module Federation 임베드. 둘 다 같은 SFC.

**Project Type**: Web frontend (단일 프로젝트, 기능 폴더 모듈성 — constitution II).

**Performance Goals**: 검색 입력→드롭다운 즉시 반응(체감 <100ms). 카드/패널 렌더는 기존 수준 유지(노드 수백 규모).

**Constraints**: 매직 px 금지 → 상대단위·flex/grid 정렬(FR-020). 임베드/다해상도에서 정렬 유지. 기능 삭제 금지(의미검색 보존, FR-016).

**Scale/Scope**: 5개 SFC 수정 + 공유 유틸 재사용. 그래프 378노드/스키마 수십 테이블 규모에서 검증.

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 후 재확인.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 단일 라우트 + 탭** | ✅ PASS | 새 라우트 0. 기존 탭(schema·graph) 안에서만 동작. 상단 전체검색도 `session.activeTab` 기준 라우팅(URL 미사용). |
| **II. 기능 폴더 모듈성** | ✅ PASS | 변경은 `features/schema/*`·`features/code-analysis/*`·`shared/components/TopToolbar`에 한정. 교차 사용은 `shared/utils`·`shared/config`의 **명시적 import**(kindOf·getNodeColor)만 — 타 기능 내부 침투 없음. |
| **III. 게이트웨이 경유 + 세션 헤더** | ✅ PASS | **새 API 호출 0**. 기존 스토어/검색을 재사용·재배치만. 의미검색은 기존 `store.performSemanticSearch` 보존. raw fetch 추가 없음. |
| **IV. 실연동 vs 목업 정직성** | ✅ PASS (강화) | 본 기능이 **정직성 위반을 적극 해소**: 상단 전체검색의 거짓 placeholder·빈 장식 제거(FR-017), 의미검색 불가 시 사유 정직 안내(FR-016). 목업 추가 0. |

**위반 없음** → Complexity Tracking 비움.

## Project Structure

### Documentation (this feature)

```text
specs/045-schema-graph-nav-ux/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 표시 설계 결정 기록
├── data-model.md        # Phase 1 — 표시 엔티티(컬럼·노드·검색결과·온캔버스)
├── quickstart.md        # Phase 1 — Playwright 자가검증 시나리오(US별)
├── checklists/
│   └── requirements.md  # spec 품질 체크(전 항목 통과)
└── tasks.md             # /speckit-tasks 산출(이 명령 아님)
```

> `contracts/` 없음 — 외부 인터페이스(REST/이벤트) 변경이 없는 **내부 표시 계층**이라 생략(plan 워크플로 허용). 표시 "계약"은 data-model.md의 엔티티 형태로 대신.

### Source Code (repository root)

```text
src/
├── features/schema/components/
│   ├── nodes/TableNode.vue          # US1 카드(컬럼 정렬·NOT NULL 별표·타입·ellipsis) — 구현됨
│   ├── TableDetailPanel.vue         # US2 상세패널(카드 일관·배경카드·파란선 제거·줄바꿈) — 구현됨
│   └── SchemaCanvas.vue             # US2 범례 / US3 사이드바·컨트롤 / US5 스키마탭 검색결과
├── features/code-analysis/components/graph/
│   └── NodeDetailPanel.vue          # US4 그래프 Overview 노드검색(논리명우선·소속·종류배지·cap제거) — 구현됨
├── shared/components/
│   └── TopToolbar.vue               # US6 상단 전체검색(현재 탭 맥락 라우팅·장식 정리) — 미구현
└── shared/{utils/nodeLabels.ts, config/graphStyles.ts, utils/graphDisplay.ts}  # 재사용(변경 없음 또는 최소)
```

**Structure Decision**: 단일 프론트 프로젝트, 기능 폴더 유지(constitution II). 신규 파일 최소 — 기존 SFC 수정 위주. 공유 색/라벨/이름 유틸을 **단일 출처로 재사용**해 일관성(FR-019) 달성.

## Implementation Phasing (스토리 단위)

- **US1~US4 (P1·P2)** = **이미 구현됨**(이번 세션). tasks에서 "구현됨 → quickstart로 사후 검증" 으로 표기. 회귀만 막는다.
- **US5 (P2, 미구현)** = 스키마탭 검색결과를 NodeDetailPanel 검색 톤(논리명 우선·소속·컴팩트·종류 표시)으로 정합. **의미검색 보존**. SchemaCanvas 검색결과 영역(이름검색 + semantic-section) 재설계.
- **US6 (P3, 미구현)** = TopToolbar 상단 전체검색을 **현재 탭 맥락 라우팅**으로(그래프→노드검색, 스키마→테이블검색), placeholder를 탭 따라 정직하게, "All▾"·"⌘K" 빈 장식 정리/제거.

각 스토리 후 **Playwright 스크린샷 자가검증 필수**(사용자 명시) + `vite build` 통과 + pageerror 0.

## Complexity Tracking

> Constitution 위반 없음 — 비움.
