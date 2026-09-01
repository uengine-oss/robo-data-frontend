# Implementation Plan: 스키마 탭 참조 UX 근본 재설계 + 컨트롤 배치 일관화

**Branch**: `044-reference-source-view` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/044-reference-source-view/spec.md`

## Summary

스키마 탭 "참조 열기"가 파일 전체를 덤프하던 것을, **참조가 가리키는 코드 노드(함수/프로시저)의 라인 범위(start_line~end_line)만** 슬라이스해 보여주고 **테이블 접근 줄(evidence_line)을 강조**하도록 근본 교체한다. 데이터는 그래프에 이미 존재(노드 start/end_line, READS/WRITES 엣지 evidence_line) — 근본수정의 본체는 **catalog 참조쿼리가 이 값들을 끝까지 내보내고(공유 계약 보강), 프론트가 그 범위로 기존 소스 엔드포인트(spec 043, slice 지원)를 호출**하는 것. 더불어 (a) 참조 트리거를 발견 가능한 명시 액션으로, (b) "참조 없음"과 "불러오기 실패"를 구분, (c) "테이블 보기"·논리/물리명 토글·범례 등 스키마 탭 캔버스 컨트롤을 그래프 탭처럼 캔버스 위 floating 그룹으로 일관 배치한다.

## Technical Context

**Language/Version**: TypeScript + Vue 3 (Composition API, `<script setup>`), Vite, Pinia — frontend. Python 3 + FastAPI + Neo4j — catalog(읽기쿼리 1곳). Python 3 — analyzer(검증만, 코드변경 후보 최소).

**Primary Dependencies**: 기존만 사용 — `@vue-flow/core`(스키마 캔버스), shared http 코어(`src/shared/services/http.ts`, gateway base), Neo4j 드라이버(catalog).

**Storage**: Neo4j(읽기). 신규 스키마/라벨/관계 **0**. 원문은 참조 노드의 줄번호 포함 `code_text`를 사용한다.

**Testing**: 프론트 UI = vite(3000)+Playwright 헤드리스 자가검증(.unittest 하니스 재사용) + Neo4j 직접쿼리·HTTP E2E 대조. 단위테스트 프레임워크 신규 도입 없음.

**Target Platform**: 웹(임베드 포함 — Electron/MF). 단일 `/` 라우트 + 탭(헌법 I).

**Project Type**: Web application — 다중 레포(frontend feature + catalog service 계약). 본체=frontend, 경계=catalog 참조 응답 계약.

**Performance Goals**: 슬라이스로 전송량↓(파일 전체→함수 1개). 참조 열기 체감 즉시(<1s, 기존 대비 개선). 정량 목표는 SC-002(추가 스크롤 0).

**Constraints**: 신규 백엔드 스키마 0. CSS는 매직 px 금지·레이아웃 계산식(헌법/원칙). 슬라이스 시 **표시 줄번호 = 실제 파일 줄번호**(start_line 오프셋) 유지.

**Scale/Scope**: 스키마 탭 1개 영역. 변경 파일 = 프론트 4~6개 + catalog 1~2개. analyzer 0~1(검증 결과에 따라).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tab-Based Single-Route Shell**: ✅ 신규 라우트 0. 스키마 탭 내부 동작만. 통과.
- **II. Feature-Folder Modularity**: ✅ 변경은 `src/features/schema/` 내부(컴포넌트·store·api). 그래프 탭 floating 패턴은 참조만(복붙 아니라 동일 사상). 공용 컨트롤 추출 시 schema 폴더 내. 통과.
- **III. Gateway-Routed, Session-Headed API**: ✅ 참조·소스 호출 모두 shared http 코어(`ROBO_BASE_URL` = `/api/gateway/robo`) 경유, 포트 하드코딩 0. 신규 엔드포인트 없음 — 기존 `/robo/schema/tables/{t}/references` 응답 **필드 추가**(하위호환). 통과.
- **IV. Honest State (Wired vs Mock)**: ✅ 강화 — 가짜 코드 금지(FR-007), "없음/실패" 구분(FR-006). 목업 추가 0. 통과.
- **Cross-Service Contract**: catalog `/robo/schema/tables/{t}/references` = 경계. 응답에 `end_line`·`evidence_line`(+DBMS 오너 루틴 범위) **추가**(필드 추가형, 기존 소비 무회귀). 권위표=게이트웨이 라우트. → contracts/ 에 명문화.

**위반 없음 — Complexity Tracking 불필요.**

## Project Structure

### Documentation (this feature)

```text
specs/044-reference-source-view/
├── plan.md              # 본 파일
├── research.md          # Phase 0 — slice 줄오프셋·DBMS 오너루틴·LLM evidence_line·트리거 UX
├── data-model.md        # Phase 1 — 참조/코드노드/접근지점/코드패널 상태 형태
├── quickstart.md        # Phase 1 — vite+Playwright 자가검증 시나리오
├── contracts/
│   └── references-endpoint.md   # catalog 참조 응답 계약(end_line·evidence_line·오너루틴)
└── checklists/requirements.md   # (specify 산출, 통과)
```

### Source Code (real paths)

```text
robo-data-frontend/  (본체)
└── src/features/schema/
    ├── api.ts                                  # 참조 타입에 code_text·end_line·evidence_line 추가
    ├── schemaCanvas.ts                         # openSourceCodePanel: start_line 오프셋·evidence_line 하이라이트 / 소스패널 state / 테이블보기 컨트롤 state
    └── components/
        ├── nodes/TableNode.vue                 # 참조 트리거 재설계 / handleProcedure·FrameworkClick → 노드범위 slice 호출 / 참조목록 접근지점별 N행 / 없음·실패 구분
        ├── SchemaCanvas.vue                    # 소스패널 렌더(슬라이스+실줄번호+오토스크롤) / "테이블 보기"·범례·논리물리토글 → 캔버스 위 floating 그룹
        └── (필요시) FloatingControls·NameModeSwitch  # 그래프 탭식 floating 그룹·논리물리 토글 DRY 추출

# 참조(그래프 탭 floating 패턴 — 복제 아님, 동일 배치 사상)
robo-data-frontend/src/features/code-analysis/components/graph/GraphTab.vue   # .floating-controls left-top

robo-architect/robo-analyzer/robo-data-catalog/  (경계 — dev-desktop이 실행하는 catalog 체크아웃)
└── service/schema_query_service.py             # fetch_table_references: end_line·evidence_line 추가, DBMS=오너 루틴(PARENT_OF 상위 routine) 범위 + 접근 구문줄

robo-data-analyzer/  (검증만 — 변경 후보 최소)
└── analysis_flow/step4_linking/stage3_residual_patterns/  # LLM이 만든 R/W 엣지 evidence_line 채움 여부 라이브 1회 확인(research)
```

**Structure Decision**: 본체는 frontend `features/schema`. 유일한 백엔드 변경은 catalog **읽기쿼리 1곳**(필드 추가). analyzer는 접근 줄을 이미 영속하므로 원칙상 무변경 — stage3 LLM 엣지만 라이브 확인 후 필요시 보강. ★이중 체크아웃 주의: catalog 변경은 **dev-desktop이 실행하는 서브모듈 체크아웃**(`robo-architect/robo-analyzer/robo-data-catalog`)에 가해야 반영(handoff §6).

## Complexity Tracking

> Constitution Check 위반 없음 — 작성 불필요.
