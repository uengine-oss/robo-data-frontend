# Navigator integrity and semantic labels

## Requirements

- PACKAGE root는 일반 MODULE root보다 먼저 표시한다.
- EXTERNAL은 기본 Navigator에서 숨기고 `숨김 요소까지 모두 보기`에서만 표시한다.
- summary 생성 여부는 표시 조건이 아니다. 아직 summary가 없는 정상 AST 노드도 즉시 표시한다.
- GLOSSARY와 EMBED_META는 시스템 노드이므로 숨김 토글과 무관하게 절대 표시하지 않는다.
- PACKAGE, SCHEMA, TABLE, COLUMN 등 구조 탐색 노드는 summary 없이 유지한다.
- 노드 상세에는 종류와 별도로 모든 명시 stereotype 및 system role(`EXTERNAL`, `INTERNAL`) label을 표시한다.
- Neo4j label 배열 순서로 종류/역할을 결정하지 않는다. `properties.type`, `properties.stereotype`과 marker 계약을 사용한다.
- Navigator 선택으로 캔버스에 노드가 아직 없어도 빈 캔버스 클릭은 node/relationship/Navigator 선택을 모두 해제하고 Overview로 돌아간다.
- graph node id를 잘라 표시명이나 부모를 추론하지 않는다.

## Verification

- [x] PACKAGE-first, summary 비의존/EXTERNAL 기본 숨김 정책 코드 배선 검증
- [x] EXTERNAL 및 ontology stereotype badge와 필터 그룹 코드 배선 검증
- [x] 빈 캔버스와 노드가 있는 캔버스 양쪽의 Overview 복귀 이벤트 배선 검증
- [x] standalone/embedded production bundle build 및 변경 소스 의미 동등성 검증
- [ ] 실제 Electron에서 PACKAGE 순서·역할 badge·빈 캔버스 Overview 복귀를 확인
