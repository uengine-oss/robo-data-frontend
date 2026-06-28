# Phase 1 Data Model: 표시 엔티티

> 새 영속 모델 없음 — 기존 그래프/카탈로그 데이터의 **표시 형태(view model)**. 같은 의미는 모든 표면에서 같은 색·규칙을 공유한다(FR-019).

## 표시 엔티티

### Column (테이블 컬럼) — 카드·상세패널·스키마검색
| 필드 | 출처 | 표시 규칙 |
|---|---|---|
| name(물리명) | catalog/그래프 properties.name | 카드 1차(또는 논리명 우선 시 2차), ellipsis |
| logical_name(논리명) | properties.logical_name | **1차 우선**(없으면 물리명 폴백) |
| dtype(타입) | properties.dtype | 카드=간단표기·맨오른쪽 고정 / 패널=풀타입·우측정렬, 모든 행 같은 위치 |
| is_primary_key / FK 여부 | properties / 이름규칙 | PK/FK 텍스트 태그 |
| nullable | properties.nullable | NOT NULL = **주황** 마커(카드 별표) / "NOT NULL" 텍스트(패널) |
| 소속 테이블 | id prefix(`테이블.컬럼`) | 2차 줄 흐리게 |

### Node (그래프 노드) — Overview 노드검색
| 필드 | 출처 | 표시 규칙 |
|---|---|---|
| kind(종류) | `kindOf(labels)` = labels[0] | **배지 1개**(종류만), 색=`getNodeColor`(실제 노드색) |
| role(역할) | labels[1:] (stereotype) | 배지 텍스트엔 미표시(툴팁만) — 색은 종류 기준 |
| logical_name | properties.logical_name | **1차 우선** |
| name(물리명) | properties.name / id | 2차 줄 |
| 소속 | id prefix(`패키지.모듈.함수`) | 2차 줄 흐리게(물리명 · 소속) |

### SearchResult (검색 결과 항목) — 그래프·스키마 공통 톤
- 구성 = **[종류 배지] + 1차(논리명) + 2차(물리명 · 소속)**, 컴팩트 행·세로 가운데, 각 필드 ellipsis.
- 헤더 = "검색 결과 (N개)" — **N=실제 전체값**, 드롭다운 스크롤로 전체 도달.
- 스키마탭: 이름검색 결과 + **의미검색(semantic) 섹션 보존**(유사도 % 배지). 의미검색 불가 시 사유 정직 안내.

### OnCanvas (캔버스 상태) — 사이드바
- on-canvas = **흐림 + 초록 점(●) 행 맨 오른쪽**(그래프 네비게이터 동일), hover 시 × 제거.
- selected(상세패널 열림) = 배경 하이라이트.

## 일관 규칙(횡단)
- 같은 의미 = 같은 색: NOT NULL=주황 / 캔버스에 있음=초록 점 / 노드 종류=`getNodeColor` 단일 출처.
- 위치 고정: 카드는 "타입 앞 딱붙임", 패널은 NOT NULL 고정 슬롯, 타입은 어디서나 맨 오른쪽 정렬(지그재그 0).
- 레이아웃 계산식(flex/grid·상대단위), 매직 px 금지(FR-020).
