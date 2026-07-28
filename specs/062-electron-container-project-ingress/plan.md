# Implementation Plan: Electron container project ingress

1. Desktop filesystem browser contract에 `stageProject(root)` 결과 타입을 추가한다.
2. Analyzer store가 bridge 존재 여부로 packaged staging과 direct-path 개발 모드를 분기한다.
3. staged mode에서는 parse/analyze metadata에서 `project_root`를 제거한다.
4. build와 packaged Docker live analysis로 양쪽 계약을 검증한다.

기존 browser upload, graph rendering, Neo4j routing, standalone direct-path 모드는 비범위다.
