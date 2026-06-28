# Implementation Plan: 스키마 탭 전면 고도화

**Branch**: `043-schema-tab-overhaul` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

## Summary

스키마 탭의 세 축을 한 피처로 정리한다. **(A) 소스 코드뷰 근본수정** = 브라우저 업로드(`uploadedFiles`) 의존을 폐기하고 analyzer가 디스크에서 원본을 읽어 주는 `GET /robo/source` 엔드포인트로 전환(웹·데스크톱 공통). **(B) 버그·잔여물 정리** = 가짜 "N/A 코드" 폐기·정직한 빈 상태, ✓ 방문 마커 제거. **(C) UI 일관화** = 닫기(X)/제거 버튼 단일 스타일, '상위10개/전체 보기' 단일 보기모드 컨트롤화 + 논리명/물리명 토글 중복 제거, remove-chip 정렬·간격 정돈. 재분석 없음, 신규 영속 스키마 0.

## Technical Context

**Language/Version**: 프론트 Vue3+TS(SFC) / 백엔드 analyzer FastAPI(Python), gateway Spring Cloud Gateway(yaml), catalog FastAPI

**Primary Dependencies**: VueFlow(스키마 캔버스), Pinia(schemaCanvas store), 공유 http 코어(ROBO_BASE_URL/gateway). 백엔드: `SourceFileCache`(기존 재사용)

**Storage**: N/A 변경(neo4j 스키마·영속 0). 소스는 디스크 기존 파일 읽기만

**Testing**: vite dev(3000) + Playwright 헤드리스 스샷(neo4j 실데이터, gateway 9000). 빌드·재분석 없이 검증, 최종에만 빌드

**Project Type**: web frontend + 다서비스 백엔드(소스 계약 공유 = [contracts/source-endpoint.md](./contracts/source-endpoint.md))

**Constraints**: 재분석 금지·신규 영속 스키마 0·기존 동작 회귀 0. UI는 구조 정리(분기/스타일 난립 → 단일 패턴)로 코드가 늘지 않게

**Scale/Scope**: 스키마 feature 컴포넌트(SchemaCanvas/TableNode/TableDetailPanel/CardinalityModal/EditRelationshipDialog) + schemaCanvas store + 신규 api 메서드; analyzer 신규 라우터 1 + gateway 라우트 1 + catalog 쿼리 1줄

## Constitution Check

- **I. Tab-Based Single-Route Shell**: 기존 schema 탭 내부 수정, 신규 라우트/탭 0. **PASS**
- **II. Feature-Folder Modularity**: 변경은 `src/features/schema/` 내부 + 공유 http 사용. 다른 기능 내부 침범 0. **PASS**
- **III. Gateway-Routed API**: 신규 소스 호출도 **게이트웨이 경유**(`/api/gateway/robo/source`), 공유 http(ROBO_BASE_URL) 사용. 포트 하드코딩 0. **PASS**
- **IV. Honest State (Wired vs Mock)**: 가짜 "N/A 코드"(목업을 실데이터처럼)를 **제거**하고 실데이터 또는 정직한 빈 상태로 전환 → 원칙 **강화**. **PASS**

위반 0 → Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/043-schema-tab-overhaul/
├── plan.md
├── spec.md
├── contracts/source-endpoint.md     # 소스 서빙 계약(analyzer/gateway/frontend 공유)
├── checklists/requirements.md
└── tasks.md
```

### Source Code (변경 파일)

```text
# 백엔드 (소스 서빙 계약 구현)
robo-data-analyzer/
├── api/source_router.py             # 신규: GET /robo/source (SourceFileCache.slice + 경로이탈 차단)
└── main.py                          # source_router 등록
api-gateway/src/main/resources/application.yml   # /api/gateway/robo/source → 5502 라우트 추가
robo-data-catalog/service/schema_query_service.py # proc_query에 p.file_path 추가

# 프론트 (소비 + 버그정리 + UI 일관화)
robo-data-frontend/src/features/schema/
├── api.ts                           # 신규 getSourceContent()
├── components/nodes/TableNode.vue   # 핸들러 백엔드호출 재배선 / ✓마커 제거 / 참조팝업 닫기 일관화
├── components/SchemaCanvas.vue      # 보기모드 단일화 + 논리명/물리명 토글 중복제거 + 닫기/remove-chip 일관화
├── components/TableDetailPanel.vue  # 닫기/제거 버튼 일관화
├── components/CardinalityModal.vue  # 닫기 버튼 일관화
├── components/EditRelationshipDialog.vue # 닫기 버튼 일관화
└── schemaCanvas.ts                  # tableViewMode 상태(보기모드 단일화) / 소스패널 열기 경로
```

**Structure Decision**: 스키마 feature 내부 수정 + 소스 서빙은 계약 기반 백엔드 최소변경. 닫기 버튼은 **공통 클래스/작은 컴포넌트 1개로 수렴**(스타일 난립 제거 = 코드 감소). 보기 컨트롤은 `tableViewMode` 단일 enum으로 두 버튼+토글 분기를 흡수.

## Complexity Tracking

위반 없음 — 해당 없음.
