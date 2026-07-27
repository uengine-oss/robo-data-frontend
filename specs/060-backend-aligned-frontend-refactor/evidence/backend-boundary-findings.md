# Backend boundary findings (read-only reference)

This register records backend defects found while aligning the frontend. It does not authorize or contain backend
changes. Product separation remains valid unless a finding explicitly proves duplicated ownership.

## Text2SQL events (`25ab12a8b9129b99fa3e83519214e71e12962a9d`)

| Finding | Boundary judgment | Frontend treatment | Backend-owner follow-up |
|---|---|---|---|
| Event rules, notifications, scheduler tasks, and subscriber queues are process-memory state. | Still belongs to Text2SQL event/observability capability; not a reason to merge with Catalog. | Never claim durable registration; refresh and display actual server state. | Decide persistence, multi-worker consistency, restart semantics, and delivery guarantees. |
| `_evaluate_condition` evaluates a string expression with Python `eval` and falls back to `rows > 0` on parse failure. | Backend rule-execution defect, not frontend parsing responsibility. | Send the explicit threshold and display execution errors; do not reproduce the evaluator in the browser. | Replace with a bounded condition grammar and reject invalid expressions instead of changing their meaning. |
| Process execution returns success-like text when the MCP client is absent (`execution requested`). | The action still belongs to the Text2SQL event service, but completion semantics are ambiguous. | Registration copy says “requests process execution”; it does not promise completion. | Return structured executed/queued/unavailable/error status and expose retry/trace identity. |
| `/health`, `/events/rules`, `/events/cep/status`, and history were observed as HTTP 500 through the current Gateway environment. | Runtime availability issue; it does not invalidate service separation. | Failure is distinct from empty data and exposes retry. | Diagnose deployment/config/Neo4j/CEP dependencies with service logs; successful live flows remain unverified. |
| Event chat extracts configuration with deterministic regexes but the UI previously called it AI and generated placeholder SQL locally. | Backend chat and rule CRUD are related sub-capabilities, but chat does not own SQL generation. | UI now calls it the event service, maps the actual fields, and requires operator SQL. | Either add an explicit, validated SQL-generation contract or document chat as configuration extraction only. |
| Native alarm SSE requires a long-lived connection while Electron requests may require session/Neo4j headers. | Transport concern inside the Text2SQL event boundary. | Frontend uses fetch-based SSE so current session headers are sent. | Define authentication, replay cursor, reconnect/backoff, heartbeat, and multi-worker broadcast contracts. |
| `/meta/objecttypes` requires a MindsDB `datasource`, but the current query does not filter ObjectTypes by that value and only echoes it into each result. The Ontology workflow had been sending its UI-only `__ontology__` sentinel and then discarding the echoed value. | ObjectType metadata remains a Text2SQL capability consumed by the Ontology workflow; this is contract weakness and a frontend wiring defect, not a reason to merge the services. | Search datasource, manual source kind, and ObjectType execution datasource are separate states. The workflow sends an actual datasource, persists it in the confirmed node mapping, and never sends the sentinel. | Bind each ObjectType/materialized view to its real execution datasource and either filter by it or return the stored binding instead of echoing a request value. |

No evidence in this slice showed that Text2SQL should be merged with Catalog, Ontology, or the Gateway. The observed
issues are implementation and runtime-contract problems inside an otherwise distinct Text2SQL responsibility.

## Agent scheduler (`8196e5ced91befbc16de98531a1740070b9fed69`)

| Finding | Boundary judgment | Frontend treatment | Backend-owner follow-up |
|---|---|---|---|
| `/pipelines` creates `WatchAgent` and `AgentStep` nodes, while the scheduler, `/profiles/{id}/test`, and `/profiles/{id}/debug` query `WatchAgentProfile`. | Agent scheduling is still one valid backend responsibility, but its two persistence models are disconnected. This is not evidence that the service should be merged with Text2SQL, Ontology, or the Gateway. | The frontend no longer writes the disconnected graph-pipeline model. It uses the scheduler-owned `/profiles` contract for list/create/toggle/delete/test/debug and presents the actual fixed source→condition→ProcessGPT flow. | Consolidate on one aggregate/model and migrate existing `WatchAgent`/`AgentStep` data, or make the scheduler and debug endpoints execute the graph model. Remove or explicitly deprecate the unused API family. |
| `list_profiles` and `list_pipelines` catch all storage exceptions and return `[]`. | Backend error-semantics defect inside the scheduler boundary. | The UI distinguishes HTTP failures from an empty list where the transport exposes them, but cannot recover an error already converted to HTTP 200 `[]`. | Return a non-2xx structured error for Neo4j/query failures; reserve `[]` for a successful empty collection. |
| `ProfileCreate` accepts `condition_type`, `condition_description`, and `action_type`, but the create query and `ProfileResponse` do not persist/return them. Alarm is therefore not a round-trippable profile capability. | Contract drift within the scheduler service. | The frontend sends and displays only persisted profile fields and does not advertise an alarm action in Watch Agent. Event-service alerts remain separately available in Event Detection. | Either persist and execute these fields with response coverage or remove them from the request model and OpenAPI contract. |
| `ProfileUpdate` exists as a model but no update route is registered. | Missing capability, not a frontend state-management concern. | Existing profiles are read-only; the UI explicitly directs users to create a replacement and delete the old profile. | Add a validated update endpoint with scheduler resync semantics if in-place editing is required. |
| Profile test/debug condition evaluation supports `rows > 0` and otherwise uses Python `eval`; debug also only exercises SQL profiles. | Execution safety and capability-limit issue owned by the scheduler backend. | The frontend does not evaluate conditions locally, calls debug with `simulate_action: false`, and disables SQL debug controls for What-If profiles. | Replace `eval` with a bounded grammar and provide a What-If debug contract if that data source is a supported scheduler capability. |
| ProcessGPT process-list failures are returned as HTTP 200 `{success:false,error}`. | Application-status contract inside the scheduler integration. | The runtime client converts `success:false` to an error state instead of showing an empty selector. | Prefer non-2xx transport status or standardize an explicit result union across ProcessGPT routes. |

The public `uengine-oss` repository inventory contains dedicated `robo-data-agent-scheduler` and
`robo-node-local-agent-scheduler` services. That separation is coherent: central profile scheduling and node-local
execution are different deployment responsibilities. The defect found here is the central scheduler's internal model
split, not excessive repository decomposition.

## Unwired observability surfaces

The public organization inventory and the frontend's API/domain boundaries contain no dedicated, documented contract
for Data Quality, Incident Management, or generic Alert Configuration. The previous pages were local arrays and forms:
they displayed Snowflake sample records, local-only status changes, and save/delete controls without any transport.
This does not prove that no private or future backend exists; it proves that this frontend revision has no contract it
can safely call.

The frontend keeps the three navigation capabilities but replaces operational-looking samples with a consistent
“service connection required” state. It does not invent endpoints or silently persist data in browser memory. Event
rules and live alarm notifications remain under the separately verified Text2SQL event capability.

## Node-local agent scheduler (`8043aae7a6f0e4e3966df893f449398e217a5c17`)

| Finding | Boundary judgment | Frontend treatment | Backend-owner follow-up |
|---|---|---|---|
| The service owns ontology node-type Agents.md discovery, subprocess execution, state/control, feedback, and log streaming. | This is a coherent node-local execution responsibility and is correctly separate from the central watch-profile scheduler. | Kept as its own `domains/node-agent-scheduler` boundary; the ontology workflow consumes only its public client. | Keep the deployment contract explicit: central scheduling and node-local Agents.md execution should not share ambiguous route or model names. |
| Agent states, logs, callbacks, and feedback queues are process memory. Restart loses monitoring history and queued feedback. | Runtime durability issue inside the node-local service, not a reason to merge repositories. | The frontend displays only current server state and does not imply durable history. | Define persistence/restart guarantees and bounded log/feedback retention if operational history matters. |
| `list_agents` silently ignores Neo4j registry discovery failure and can return only in-memory states or `[]`. | Error-semantics defect inside the node-local boundary. | HTTP failures are now visible in the ontology header, but a discovery failure already converted to a successful response cannot be distinguished. | Return a degraded/error field or non-2xx response instead of silently omitting registry agents. |
| Log SSE is a long-lived connection with no replay cursor and the service uses an unbounded per-connection queue. | Transport and resource-governance concern owned by the node-local service. | The client now uses fetch SSE with session headers, an AbortSignal, strict log parsing, and malformed-event failure. | Define authentication, replay/offset, heartbeat, queue bounds/backpressure, and disconnect cleanup tests. |

The frontend previously hid all node-local scheduler failures and used native `EventSource`, which could not carry the
current Electron/session headers. It now validates state/log/feedback/action responses, sends current headers on every
route, exposes a compact “monitor disconnected” status, and retains the node highlighting behavior when service state
is available.

## Architect host and obsolete LangChain alias

Sources inspected read-only:

- `robo-architect` at `a99a85f84850a945d6b6a9fd4fccdf7fea7bf847`;
- `api-gateway` at `2352fed23f2a8c6a4a47e27397fabdb66c318811`;
- the frontend feature registry, Module Federation bootstrap, embedded navigation, and former LangChain domain.

| Finding | Boundary judgment | Frontend treatment | Backend-owner follow-up |
|---|---|---|---|
| The default Gateway maps both `/api/gateway/langchain/**` and `/langchain/**` to `ROBO_ARCHITECT_URL` on port 8001, but the current Architect FastAPI application registers neither `/api/react/run` nor `/api/react/stream`. The Docker Gateway profile does not define an Architect or LangChain route. | Architect is a valid host/application boundary. The LangChain route is an obsolete alias, not a separate working backend capability and not evidence that Architect should be merged with Text2SQL. | Removed the hidden, non-embeddable LangChain feature, its unreferenced client/store/UI, and its private result formatter. The real Text2SQL domain remains the sole natural-language-to-SQL frontend capability. | Remove or explicitly deprecate the stale Gateway aliases. If a ReAct service is restored, give it an independently deployed URL, OpenAPI/stream contract, health check, authentication contract, and product-visible ownership before reintroducing UI. |
| The removed stream client skipped malformed NDJSON and the store marked a naturally ended stream as completed without receiving `finish` or `complete`. | This was fake-success/error-hiding behavior in dead frontend code, not a backend separation concern. | Deleted rather than preserving or inventing a contract for an unreachable feature. | A future stream contract must define terminal events, malformed-frame behavior, cancellation, retry, and session headers. |
| Embedded mode filters the shared feature registry to four `embeddable` capabilities: upload/code analysis, data sources, code graph, and schema. It also injects project-root and Neo4j connection context while hiding the duplicate top toolbar. | This is a coherent Architect-hosted Analyzer/Data Fabric surface. The host boundary is intentionally narrower than standalone ROBO Data. | Preserved all four feature IDs, labels, lazy loading, navigation, project-root injection, Neo4j header injection, and isolated Pinia/router instances. | Keep host/remote version compatibility and the four-feature contract covered by standalone, web-host, and Electron evidence. |

The repository split is therefore not broadly excessive. Architect hosting, central profile scheduling, node-local
Agents.md execution, and Text2SQL have different deployment and data responsibilities. The concrete defect was a
stale LangChain route/UI lineage that falsely suggested an available service.
# Ontology node-filter backend availability note (2026-07-24)

- `ontologic`, `ontology-studio`, `robo-data-text2sql`의 현재 공개 원문과 uengine-oss 조직의 공개
  repository 목록을 대조했지만 `/ontology-nodes/{id}/data`,
  `/ontology-nodes/{id}/filter-values`, `filter_*`, `apply_business_day_filter`의 생산자 구현은
  확인되지 않았다.
- Gateway 원문은 `/api/gateway/ontology/**`를 별도 Domain Layer 서비스로 라우팅하며 로컬 개발 주소
  `127.0.0.1:8002`와 컨테이너 이름 `robo-domain-layer:8002`만 제공한다. 해당 서비스 원문은 현재 공개
  조직 저장소에 없다.
- 따라서 프론트가 이미 사용하는 검증 가능한 단일값 `filter_<field>=<value>`와 distinct endpoint
  shape는 현재 소비 계약으로 보존하되, date/range의 query key나 포함/배타 경계를 임의로 발명하지 않는다.
  그 두 control은 생산자 계약을 확보할 때까지 비활성 사유를 사용자에게 표시한다.
