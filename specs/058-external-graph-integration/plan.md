# Implementation Plan: External graph integration

Analyzer producer contract `specs/075-external-file-linking/contracts/frontend-contract.md`를 소비한다.
`analyzer.ts`의 기존 진행·표시명 단일 소유자와 `graphVisibility.ts`의 기존 숨김 단일 소유자만 확장한다.
새 필터나 그래프 복사본은 만들지 않는다. Node 기반 계약 테스트는 설치된 TypeScript compiler로 두 대상의
순수 선언만 평가하므로 package.json과 사용자 scripts WIP를 수정하지 않는다.

작업 전 기준은 Frontend `main@1f8baa4f929117282dd62ad679f049fc97bf10a2`이며 대상 SHA-256은
`analyzer.ts=8B29CD8420702B15F0F50A1F98DA839DA26707DABC47F7F0E71CA55405597AA6`,
`graphVisibility.ts=56A9F0E9A209A0707E07D755B72D8084A352BA0F7494BECD303887A6C981B85A`이다.
