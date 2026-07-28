# Feature Specification: Electron container project ingress

## Goal

Electron에서 선택한 Windows 프로젝트 폴더를 Linux Parser 컨테이너가 읽을 수 있는
Gateway upload ingress로 반입한 뒤 기존 parse/analyze 파이프라인을 실행한다.

## Scenarios

1. Electron preload가 `stageProject`를 제공하면 분석 시작 전에 선택 루트를 staging한다.
2. staging 후 Parser와 Analyzer 요청에는 Windows 절대경로 `project_root`를 보내지 않는다.
3. preload bridge가 없는 standalone/동일-filesystem 개발 모드는 기존 `project_root` 경로를 유지한다.
4. staging이 실패하면 분석을 시작하지 않고 사용자 콘솔에 실패 원인을 표시한다.
5. 새 project root를 받으면 이전 staging 상태를 폐기한다.

## Requirements

- Renderer는 host filesystem을 직접 읽지 않고 `window.desktop.fs.stageProject`만 호출한다.
- staging 결과의 source/DDL 개수를 분석 콘솔에 표시한다.
- Neo4j connection headers와 기존 upload mode 동작은 변경하지 않는다.
- 대상 파일 선별, 크기 제한, 경로 보존, Gateway loopback 검증은 Electron main의 책임이다.

## Acceptance

- frontend production build와 Electron TypeScript build가 통과한다.
- Windows 샘플 폴더를 staging한 뒤 Parser canonical roots에 source와 DDL이 분리된다.
- 뒤따르는 live GPU 분석이 완료되고 결과가 app-owned Neo4j에 적재된다.
