# Implementation Plan: 횡단 안전 리팩토링 배치 ①

**Branch**: `024-cross-cutting-refactor` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-cross-cutting-refactor/spec.md`

## Summary

3개의 독립 횡단 부채를 **화면 출력 0변경**으로 제거한다: (1) 노드 표시이름 규칙을 3곳(`navigator.pickDisplayName`·`NvlGraph.resolveCaption`·`graphDisplay.technicalNodeName`)에서 **단일 결정처**로 수렴, (2) 데이터 스트림 파서(`http.ts`)의 무방어 `JSON.parse`를 **표면화+복원력**으로 교체, (3) `graphStyleStorage`에 **메모이즈 캐시**를 도입해 렌더당 수백 회의 `localStorage` 동기 접근 제거. 회귀 안전망은 **골든 마스터 대조**(리팩토링 전 출력/반환값을 전수 캡처 → 후 대조 diff 0) + 풀스택 Playwright 시각 검증.

## Technical Context

**Language/Version**: TypeScript 5.x (Vue 3.4 SFC, `<script setup>`)

**Primary Dependencies**: Vue 3, Pinia, `@neo4j-nvl/base` (캔버스), ECharts, Vite. MF host = robo-architect(Electron).

**Storage**: `localStorage`(그래프 사용자 스타일). 백엔드 데이터는 gateway 9000 경유(불변).

**Testing**: 골든 마스터 노드 스크립트(`d:/tmp/name_*.mjs` 계열, 실그래프 catalog 5503) + Playwright 헤드리스 스샷 + 콘솔 NDJSON 스트림 관측. 단위 테스트 프레임워크는 레포에 미도입 — 검증은 실데이터 대조 + 풀스택 관측으로 수행([[principles]]§6).

**Target Platform**: 브라우저(dev 3000) + Electron 임베드(MF remote `robo-analyzer-frontend`).

**Project Type**: Web SPA(단일 라우트 + 탭, constitution I).

**Performance Goals**: 500노드 그래프 렌더 프레임에서 스타일 결정의 `localStorage` 동기 접근 = 변경당 1회 수준(현재 노드·관계마다 1회).

**Constraints**: ★화면 픽셀·글자·동작 0변경(최상위). 보존계약(`refactor-contracts`) 전부 불변.

**Scale/Scope**: 3 shared 파일 중심(`graphDisplay.ts`·`nodeClassify.ts`·`graphStyleStorage.ts`·`http.ts`) + 호출측 수렴(`navigator.ts`·`NvlGraph.vue`). 실그래프 1106노드/37라벨종류로 검증.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 준수 여부 | 근거 |
|---|---|---|
| **I. 단일 라우트 + 탭** | ✅ 영향 없음 | 라우트·탭 변경 없음. 내부 유틸/스토어만. |
| **II. 기능 폴더 모듈성** | ✅ 강화 | 이름 규칙을 `shared/utils` 단일처로 모아 feature가 내부를 복붙하지 않게 함. cross-feature 침범 없음. |
| **III. 게이트웨이 + 세션헤더** | ✅ 영향 없음 | `http.ts`의 스트림 파서 내부만 손봄. base URL·`handleHttpError`·헤더 디스패치 불변. |
| **IV. 실연동/목업 정직** | ✅ 영향 없음 | 데이터 출처·연동 상태 불변. mock 추가 없음. |
| **교차 계약(보존계약)** | ✅ 게이트 통과 | 백엔드 API·tri-channel·MF 경계·스토어 public·props·화면출력 = 전부 불변(FR-001·FR-002). |

위반 없음 → Phase 0 진행 가능.

## Project Structure

### Documentation (this feature)

```text
specs/024-cross-cutting-refactor/
├── plan.md              # 본 파일
├── research.md          # Phase 0 — 단일화 설계 결정·골든마스터 전략
├── data-model.md        # Phase 1 — 표시이름·StyleMap·StreamEvent 개념
├── quickstart.md        # Phase 1 — 회귀 검증 실행 가이드
├── contracts/
│   └── internal-apis.md # Phase 1 — 이름/스타일/스트림 함수의 보존 시그니처
├── checklists/
│   └── requirements.md  # specify 단계 품질 체크리스트(통과)
└── tasks.md             # /speckit-tasks 출력(다음 단계)
```

### Source Code (repository root: `src/`)

본 배치가 건드리는 실제 파일(보존계약 외 내부만):

```text
src/shared/utils/graphDisplay.ts      # US1 — 공유 헬퍼 typeWithLine·applyLogicalMode 신설, technicalNodeName 정리
src/shared/utils/nodeClassify.ts      # US1 — logicalModeName/structureLogicalName 공유 유지, 필요시 헬퍼 통합
src/shared/stores/navigator.ts        # US1 — pickDisplayName → 단일 결정처 호출로 수렴(트리 출력 보존)
src/features/code-analysis/components/graph/NvlGraph.vue  # US1 — resolveCaption → 단일 결정처 호출(캔버스 출력 보존)
src/shared/services/http.ts           # US2 — parseJsonLine / SSE flushEvent 표면화·복원력
src/shared/utils/graphStyleStorage.ts # US3 — loadStyles 메모이즈 캐시 + mutation 무효화
src/shared/utils/logger.ts            # US2 — (참조) 표면화 로깅 대상
```

**Structure Decision**: 단일 프로젝트(SPA) 기존 구조 유지. 신규 디렉토리 0. 변경은 위 7개 파일에 국한되며, 모든 변경은 외부에서 관찰 가능한 출력/반환값을 보존한다.

## Complexity Tracking

> Constitution Check 위반 없음 — 비움.
