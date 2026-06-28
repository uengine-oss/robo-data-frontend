# Implementation Plan: 노드 검색 결과 위치 교정 (캔버스 비우기 오조작 방지)

**Branch**: `042-search-dropdown-anchor` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/042-search-dropdown-anchor/spec.md`

## Summary

Overview(노드 미선택) 노드 이름 검색에서 결과 드롭다운이 **검색 입력칸이 아니라 검색 섹션 전체 바닥**에 앵커돼, 입력칸과 결과 사이에 상시 노출되는 파괴적 "캔버스 비우기" 버튼이 클릭 경로를 가로막아 오조작을 유발한다. 근본수정은 동작/로직을 건드리지 않고 **드롭다운의 앵커 기준점만 입력칸으로 바로잡는 구조 교정**이다: `.search-results-dropdown` 요소를 `.search-section`의 자식에서 `.search-input-wrapper`(이미 `position:relative`)의 자식으로 옮긴다. 그러면 결과가 입력칸 바로 아래에 뜨고, 기존 `z-index:9999`로 그 아래 `.reset-graph-btn`("캔버스 비우기")을 검색 중 자연스럽게 덮어 클릭 경로에서 사라진다. 더는 앵커 기준으로 쓰이지 않는 `.search-section { position: relative }`는 제거한다(분기·플래그 추가가 아니라 코드가 줄어드는 정리).

## Technical Context

**Language/Version**: TypeScript + Vue 3 (`<script setup>`), SFC scoped SCSS

**Primary Dependencies**: Vue 3 / Pinia (변경 없음). NVL·그래프 스토어는 이 수정과 무관(검색 결과 선택 핸들러 불변)

**Storage**: N/A (UI 위치 교정만)

**Testing**: vite dev(3000) + Playwright 헤드리스 스크린샷 자가검증(neo4j 실데이터, gateway 9000)

**Target Platform**: 데스크톱 임베드(Electron) 및 브라우저 — 동일 컴포넌트

**Project Type**: web frontend (단일 라우트 + 탭 SPA, Constitution I)

**Performance Goals**: N/A (렌더 비용 변화 없음)

**Constraints**: 동작/로직 무변경 — 위치(앵커 기준점)만 교정. 새 분기·플래그·상태·CSS 규칙 추가 금지

**Scale/Scope**: 단일 파일·단일 컴포넌트(`NodeDetailPanel.vue`)의 검색 섹션. 마크업 1블록 이동 + 죽은 CSS 1줄 제거

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tab-Based Single-Route Shell**: 신규 라우트·탭 없음. 기존 code-analysis 기능 내부 컴포넌트 수정. **PASS (무관)**
- **II. Feature-Folder Modularity**: 변경은 `src/features/code-analysis/components/graph/NodeDetailPanel.vue` 내부에 한정. 다른 기능 내부에 손대지 않음. **PASS**
- **III. Gateway-Routed API**: 백엔드 호출 추가·변경 없음. **PASS (무관)**
- **IV. Honest State (Wired vs Mock)**: 데이터 표현 변경 없음(목업 추가 없음). **PASS (무관)**

위반 없음 → Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/042-search-dropdown-anchor/
├── plan.md              # This file
├── research.md          # Phase 0 — 앵커 교정 방식 결정
├── quickstart.md        # Phase 1 — 자가검증 시나리오
├── checklists/
│   └── requirements.md  # spec 품질 체크리스트
└── tasks.md             # Phase 2 (/speckit-tasks)
```

data-model.md / contracts/ 는 생성하지 않음 — 데이터 엔티티·외부 인터페이스 변화가 없는 순수 내부 UI 위치 교정(plan-template의 "purely internal" 예외).

### Source Code (repository root)

```text
src/features/code-analysis/components/graph/
└── NodeDetailPanel.vue        # 유일 변경 파일
    ├── <template> .search-section
    │     · .search-input-wrapper  ← 여기 자식으로 .search-results-dropdown 이동
    │     · .reset-graph-btn ("캔버스 비우기")  ← 위치·조건 불변
    └── <style scoped>
          · .search-section { position: relative }  ← 죽은 규칙 제거
          · .search-results-dropdown { top:100% … z-index:9999 }  ← 규칙 불변(앵커 부모만 바뀜)
```

**Structure Decision**: 단일 파일 수정. 마크업에서 `.search-results-dropdown` 블록을 `.search-input-wrapper` 내부(클리어 버튼 다음)로 옮기고, 더 이상 앵커 기준이 아닌 `.search-section`의 `position: relative` 선언을 제거한다. 스토어·핸들러·검색 로직·버튼 표시 조건은 일절 손대지 않는다.

## Complexity Tracking

위반 없음 — 해당 없음.
