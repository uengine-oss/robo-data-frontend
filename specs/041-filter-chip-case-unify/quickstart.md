# Quickstart / Validation: 필터 칩 케이스 통일

## 전제

- neo4j 에 framework 분석 그래프 적재됨(stereotype 라벨: Command/Query/Service 등 보유). bolt://127.0.0.1:7687, neo4j/an1021402, DB=neo4j.
- 풀스택 또는 vite dev(3000) + Playwright(`.unittest/`). graph.json = catalog(5503)/api gateway 에서 받아 `scratchpad/graph.json` 으로 주입.

## 타입 게이트

```
vue-tsc --noEmit   # 변경파일(graphCanvas.ts, nodeLabels.ts) 새 에러 0 (전역 기존 에러는 무관)
```

## 시각·DOM 검증 (Playwright, neo4j 실데이터 주입)

`page.route('**/robo/graph/**', fulfill(scratchpad/graph.json))` 후 analyzer store `loadExistingGraphData()` 로 그래프 적재. store 접근 = `#app.__vue_app__.config.globalProperties.$pinia._s.get('canvas'|'analyzer')`.

### 시나리오 (spec 수용 기준 매핑)

1. **US1-1 역할 칩 켜짐**: 오버뷰 역할 칩(Command) 클릭 → 그 칩 DOM 에 `.stat-badge.active` 클래스 부여 확인 + `canvas.loadedLabels` 에 `'Command'`(원본 케이스) 포함 + `canvas.canvasNodeIds` 에 [*,Command] 노드 포함. 스샷.
2. **US1-2 재클릭 꺼짐**: 같은 칩 재클릭 → `.active` 제거 + loadedLabels 에서 'Command' 제거 + 캔버스에서 빠짐.
3. **US1-3 종류 칩 회귀 없음**: 종류 칩(FUNCTION) 클릭 → `.active` ON + 캔버스 FUNCTION 노드 로드(종전과 동일).
4. **US2-1 역할 렌즈 색**: Command isolate 상태에서 캔버스 [*,Command] 노드 색 = 역할(Command) 색(`getNodeColor(['Command'])`)과 일치. 노드 디테일 배지도 동일 색.
5. **US2-2 기본 종류색**: 아무 칩도 active 아닐 때 노드 색 = 종류(labels[0]) 색.

### 통과 기준

- 1~5 전부 통과 + 스샷으로 칩 강조·캔버스 isolate·역할색 육안 확인.
- 회귀 0: 종류 칩·관계 칩·우클릭 isolate·보기모드 동작 변화 없음.
