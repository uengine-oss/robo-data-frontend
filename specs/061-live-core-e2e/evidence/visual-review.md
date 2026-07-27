# 1920×1080 visual review

## Analyzer

- `12-analyzer-business-unit-view-1920x1080.png`: 기존 실제 업무 단위 보기의 force·드래그·배율을
  유지한다. 정상 배치에서는 외형을 바꾸지 않고, 심한 군집 겹침이 측정된 경우에만 한 번 평행 이동한다.
- `07`~`15` 체크포인트 화면에서 Navigator 추가, FILE 더블클릭 확장, 함수 상세, Overview,
  READS 토글, 모듈/업무 단위 보기, 위험 노드, 의미 검색 결과가 기존 구조를 유지한다.

## Data source

- `16-data-fabric-live-1920x1080.png`: `shopmall` 연결이 healthy이고 22개 테이블이 표시된다.
- `17-data-fabric-table-recovered-1920x1080.png`: 테이블 요청 503 뒤 같은 대상 재시도로 복구된다.

## Data schema

- `18-schema-orders-table-references-1920x1080.png`: `orders`와 FK 관련 테이블 5개, DDL FK 5개,
  테이블 READS/WRITES 출처 팝업이 동시에 확인된다.
- `19-schema-source-evidence-1920x1080.png`: `review_point.c`의 `check_purchased`, Line 117이
  실제 원문과 함께 강조된다.
- `20-schema-member-id-column-references-1920x1080.png`: `member_id`의 근거 있는 READS 4개만
  표시된다. 이전처럼 테이블 전체 18개를 모든 컬럼에 복제하지 않는다.

패널 전환 애니메이션이 끝난 뒤 촬영했으며, 잘림·잔상·지속적인 겹침은 없다. 논리/물리명 전환,
노드 상세, 열 펼치기, FK 표시 토글, 행 조회와 기존 Vue Flow 상호작용을 유지한다.
