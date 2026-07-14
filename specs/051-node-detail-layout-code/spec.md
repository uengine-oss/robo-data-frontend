# Feature Specification: 노드 상세 패널 레이아웃·원문 코드

**Created**: 2026-07-14
**Status**: Implementing

## User outcomes

- 식별 카드 아래와 다음 카드 위의 여백이 충분하고, 모든 카드 사이 간격이 동일하다.
- 식별 카드의 아이콘·이름·종류/역할 배지가 같은 기준선에 정렬된다.
- FILE/FUNCTION/MODULE/DATATYPE/VARIABLE/PACKAGE/SQL/비코드 노드가 같은 카드 header/body/padding 계약을 쓴다.
- `notes`/주석은 별도 카드로 중복 표시하지 않는다. 주석은 `code_text` 원문 안에서만 보인다.
- 원문 코드는 파일 경로·확장자 또는 명시 언어 힌트로 언어를 결정해 읽기 전용 코드 뷰어로 표시한다.
- 알 수 없는 확장자도 내용을 잃지 않고 plain text 코드 뷰어로 표시한다.
- 원본 파일명·경로·소속·패키지·라인은 식별 영역에 유지하며 내부 분석 속성은 추가 노출하지 않는다.

## Acceptance criteria

- 공통 카드 stack gap과 body padding이 한 파일의 토큰으로 관리된다.
- 업무 규칙 안내문도 공통 body 안에 들어가 다른 카드와 같은 위쪽 여백을 갖는다.
- 노드 상세 카드에서 독립된 `주석`/`메모` 섹션이 0개다.
- 원문 코드 표시의 직접 `<pre>`/일반 `TextViewer` 구현이 공통 코드 뷰어로 통합된다.
- C/C++/Java/JavaScript/TypeScript/Python/SQL/PHP/Go/C#/Ruby/Shell/JSON/YAML/XML 및 미확인 확장자 경로를 처리한다.
- 실제 Electron에서 함수·파일·SQL·미확인 확장자 노드를 열어 간격, 스크롤, 구문 표시를 캡처로 확인한다.
