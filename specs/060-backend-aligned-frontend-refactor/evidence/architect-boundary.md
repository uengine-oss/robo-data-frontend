# Architect boundary evidence

Date: 2026-07-22

## Decision

Keep Architect, the ROBO Data frontend, Text2SQL, the central agent scheduler, and the node-local agent scheduler as
separate deployment responsibilities. Remove the frontend's hidden LangChain ReAct surface because its current route
does not exist in the backend to which the Gateway sends it.

## Contract trace

1. The frontend called `${API_GATEWAY_URL}/langchain/api/react/run` and `/react/stream`.
2. The default Gateway rewrites `/api/gateway/langchain/**` to the root of `ROBO_ARCHITECT_URL` (port 8001).
3. A complete search of the current Architect FastAPI router registrations found no `/api/react/run`,
   `/api/react/stream`, `react/run`, or `react/stream` endpoint.
4. The only matching implementation inside the Architect checkout was the frontend submodule's own legacy client.
5. The Docker Gateway route list contains neither the Architect alias nor the LangChain alias.
6. The feature was hidden in standalone navigation and excluded from `EMBEDDED_FEATURES`; no other frontend module
   imported its client, Pinia store, UI, or formatter.

## Frontend result

- Removed the hidden `langchain` registry entry.
- Removed the unreferenced LangChain API, state, UI, and result-formatting code.
- Preserved the actual Text2SQL feature and its independent backend contract.
- Preserved Architect embedded mode's four capabilities: code upload/analysis, data sources, code graph, and schema.
- Preserved isolated mount/unmount, injected project root, injected Neo4j connection, and embedded toolbar behavior.

## Verification

- Full type-check passed.
- Architecture contract passed across 301 TypeScript/Vue sources.
- Domain runtime-contract parser tests passed.
- Production build passed with 4,739 transformed modules.

Standalone, Architect web-host, and Electron browser evidence remains a completion-phase responsibility under T053;
this document closes the source-contract and ownership decision only.
