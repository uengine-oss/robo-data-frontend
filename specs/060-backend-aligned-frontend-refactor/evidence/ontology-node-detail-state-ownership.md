# Ontology node-detail state ownership evidence

## 교정한 책임

- layer group header는 연결된 node list의 이름, `aria-expanded`, `aria-controls`를 소유하는 native
  disclosure다.
- 선택 노드의 layer badge는 option list의 disclosure이고 각 layer option은 현재 layer의
  `aria-pressed` 상태를 표현한다.
- Behavior model read는 `(schemaId, nodeId)` target, request sequence, `AbortController`, last-valid
  result, visible pending/error, frozen retry attempt를 각각 소유한다.
- 새 target은 이전 결과를 비우고 이전 요청을 취소한다. 같은 target의 refresh 실패는 마지막 유효
  model을 유지하면서 오류와 정확 재시도를 함께 보여 준다. abort 또는 stale response는 UI에 commit하지
  않는다.

## 브라우저 계약

`verify-ontology-observability-ui.mjs`의 saved ontology fixture에서 다음을 실제 조작으로 검증했다.

- KPI Space layer group을 마우스로 접고 Enter로 다시 펼쳤다.
- 선택 노드 layer를 Enter/Space로 KPI → Measure → KPI로 변경하고 pressed state와 기존 graph
  mutation/history 결과를 확인했다.
- Behavior model 첫 요청의 HTTP 503이 빈 성공이나 console-only failure로 숨지 않고 보이는 오류가
  되는지 확인했다.
- 오류의 재시도가 같은 schema/node URL로 성공하고 `판매 예측 모델`을 표시하는지 확인했다.
- 같은 target refresh의 두 번째 503에서 기존 모델을 보존하고 오류를 병기한 뒤, 재시도로 오류만
  해제하는지 확인했다.
- 네 번의 model request URL이 모두 동일한지 확인했다.
- `ontology-behavior-model-retry-1920x1080.png`에서 model 보존, 오류/retry, graph/detail panel
  geometry를 직접 확인했다.

## 완료 게이트

- Architecture contract: 425 TypeScript/Vue source files
- Type check: passed
- Full Ontology browser regression: passed
- Production build: 4,885 modules, passed
- Lazy boundary: `__federation_expose_Remote-app-Dp1bN9dL.js`, 2,753,769 bytes, passed
- `git diff --check`: passed; 기존 line-ending warning만 존재

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`,
`features/code-analysis/components/graph/*`, `tsconfig.panel-projection.json`은 수정하지 않았다.
