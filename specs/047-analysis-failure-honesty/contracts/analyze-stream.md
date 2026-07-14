# `/robo/analyze` NDJSON terminal contract

- 정상: `phase_event{event:"complete",run_id}` 후 `stream_end`.
- 실패: `error{fatal:true,message,component,operation,run_id}` 후 `stream_end`.
- 비치명 진단: `warning` 또는 `error`에서 `fatal`이 없거나 false. 파서는 계속 소비한다.
- HTTP 200은 스트림 연결 성공일 뿐 분석 성공이 아니다.
- frontend 성공 조건은 terminal `complete` 수신이다.
