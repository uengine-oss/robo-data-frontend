# Implementation Plan: 분석 진행 메시지 친절화 (개수+이름, 전략 무관 공통)

**Branch**: `029-progress-message-friendly` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/029-progress-message-friendly/spec.md`

## Summary

분석 진행 화면의 콘솔 진행 메시지를 `🧠 코드 N개째 분석 중`(불친절·dbms 무음·구성요소 "항목")에서 **`{종류} {개수}{단위} {동작} — '{이름}'`** 형식으로 바꾼다. 단일 핸들러 `applyProcessingEvent`(전략 분기 없음)가 처리 신호의 `entity_id`로 라이브 그래프(`nodeMap`)에서 노드의 **라벨(종류)·이름**을 조회하고, `step`에서 **동작 문구**를 파생한다. dbms의 `Batch` 신호 건너뛰기를 제거해 dbms도 묶음 건수로 진행이 보이게 하고, `Component` 라벨을 추가하며 죽은 `Question` 매핑·`Split` 문서 드리프트를 정리한다. spec 028(단계 라이브 전진) 블록은 핸들러 맨 앞에 보존.

## Technical Context

**Language/Version**: TypeScript 5 / Vue 3 (Composition API, `<script setup>`), Pinia

**Primary Dependencies**: Pinia store (`useAnalyzerStore`), 기존 스트림 소비 경로(`roboApi.analyze` → `streamFetch` → `applyProcessingEvent`)

**Storage**: N/A (런타임 store 상태만 — `processedIds`, `nodeMap`)

**Testing**: 타입 검사 `npx vue-tsc --noEmit`(내 파일 0에러), 실데이터 렌더 검증(framework 분석 로그/스트림), dbms는 신호 주입/로직 단위 검증

**Target Platform**: Electron 데스크톱(임베드) + vite dev(3000) 브라우저

**Project Type**: web/desktop SPA (단일 기능 폴더 수정)

**Performance Goals**: 진행 메시지는 throttle로 플러드 방지(현행 유지) — 추가 비용 무시 가능(맵 조회 O(1))

**Constraints**: 백엔드/게이트웨이/스트림 와이어 **무변경**(소비만 확장). 신규 라우트/탭/백엔드콜 0. spec 028 동작 보존.

**Scale/Scope**: 변경 파일 1개([analyzer.ts](../../src/features/code-analysis/analyzer.ts))의 함수 1개(`applyProcessingEvent`) + 룩업 테이블 3~4개(종류/동작/throttle). 약 40~60 LOC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tab-Based Single-Route Shell** — 신규 라우트/탭 없음. 기존 code-analysis 진행 화면 내부 동작만. **PASS / N/A.**
- **II. Feature-Folder Modularity** — 변경은 `src/features/code-analysis/analyzer.ts` 단일 슬라이스 내부. 타 기능 내부 접근 없음. **PASS.**
- **III. Gateway-Routed, Session-Headed API** — 신규 백엔드 호출 0. 기존 스트림(`roboApi.analyze`)을 더 소비할 뿐. **PASS / N/A.**
- **IV. Honest State: Wired vs. Mock** — 라이브 그래프의 **실제** 노드 이름/종류를 보여주고, dbms 무음(보이지 않던 진행)을 **실제** 신호로 채운다. 목업 추가 0, 정직성 **향상**. **PASS (강하게 부합).**

**위반 없음 → Complexity Tracking 불필요.**

## Project Structure

### Documentation (this feature)

```text
specs/029-progress-message-friendly/
├── plan.md              # 이 파일
├── spec.md              # 기능 명세
├── research.md          # Phase 0: 결정·근거(실데이터)
├── data-model.md        # Phase 1: 룩업 테이블·상태 구조
├── contracts/
│   └── stream-consumer.md   # 의존하는 스트림 필드(소비자 계약, 변경 아님)
├── quickstart.md        # Phase 1: 검증 시나리오
└── checklists/requirements.md
```

### Source Code (repository root)

```text
src/features/code-analysis/
└── analyzer.ts          # ★유일 변경 파일
    ├── PROCESSING_KIND_KO         # entity_kind 폴백 종류 맵 (Component 추가, Question 제거)
    ├── LABEL_KIND_KO (신규)        # 노드 라벨 → 한국어 종류 (FUNCTION/PROCEDURE/TABLE/…)
    ├── STEP_VERB (신규)            # step → 동작 문구
    ├── PROGRESS_THROTTLE          # 종류별 빈도(Component 추가)
    └── applyProcessingEvent       # 메시지 조립 재작성 (028 블록 보존, Batch skip 제거)
```

**Structure Decision**: 단일 기능 폴더(`code-analysis`) 내 단일 파일 수정. 신규 컴포넌트/스토어/모듈 없음(Constitution II 준수). 룩업 테이블은 같은 파일 상단 상수 영역에 둠(기존 `PHASES`/`STEP_TO_PHASE` 옆).

## Phase 0 — Research (요약, 상세 [research.md](./research.md))

스트림 백엔드 emit과 프론트 소비를 실데이터·코드로 전수조사해 모든 미지를 해소함(별도 NEEDS CLARIFICATION 없음): entity_kind 실제 값(CodeNode/Batch/Module/Table/Component), step 포맷(`stepN.fn`), 노드 라벨/이름이 처리 신호보다 먼저 스트림됨(framework 실증), dbms는 Batch 단위·전략 배타, max_concurrency=30이나 스트림은 단일 직렬 큐. 결정: 전략 분기 없이 entity_id→nodeMap 라벨/이름 조회 + step→동작.

## Phase 1 — Design (요약, 상세 data-model/contracts/quickstart)

- **data-model.md**: 룩업 테이블 4종 + 카운터 상태(`processedIds`) 의미 + 메시지 조립 규칙.
- **contracts/stream-consumer.md**: 이 기능이 의존하는 스트림 필드(processing_event.{step,entity_kind,entity_id,status}, node_event.{id,label,props.name})와 값 도메인 — **와이어 변경 아님**, 소비 계약 명문화.
- **quickstart.md**: framework 실데이터 렌더 검증 + dbms 신호 주입 검증 시나리오.

## Complexity Tracking

*Constitution Check 위반 없음 — 비움.*
