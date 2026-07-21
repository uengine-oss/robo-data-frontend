# Feature Specification: External graph integration

**Created**: 2026-07-21
**Status**: Implementing

## Requirements

- Analyzer의 최종 8단계 순서와 Framework 18개/DBMS 17개 leaf 완료 신호를 진행 UI에 반영한다.
- 외부 파일 적재·포맷 학습·연결 단계가 각각 사용자 문구로 표시되고 병렬 step2/step3 완료 순서가
  바뀌어도 미완료 leaf를 건너뛰지 않는다.
- 새 external node는 `name`, `key`, `title`, 기존 fallback 순서로 표시명을 정하며 opaque ID를 파싱하지 않는다.
- external support node/relationship은 기존 단일 visibility 정책에서 기본 숨김이고 `showHidden`에서만 드러난다.
- 기존 READS/WRITES는 계속 기본 표시하며 시스템 노드 규칙은 바꾸지 않는다.
- 기존 dirty `package.json`, `graphCanvas.ts`, `scripts/`, spec057, panel projection, tsconfig를 수정하지 않는다.

## Acceptance

1. 순수 계약 테스트가 8단계, 두 전략 leaf 목록/개수, 외부 단계 문구, 표시명 우선순위를 검증한다.
2. visibility 테스트가 새 노드 10종과 관계 7종의 기본 숨김, show-all 기반 정책, READS/WRITES 비숨김을 검증한다.
3. strict TypeScript와 production build가 통과한다.
4. 대상 외 기존 WIP 파일의 SHA-256과 diff가 작업 전후 동일하다.
