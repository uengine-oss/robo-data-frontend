# Shared HTTP boundary

## Finding

- The shared HTTP transport selected service-specific outage guidance by searching the response URL for `/antlr/`,
  `/robo/`, `/text2sql/`, or `/whatif/`.
- This made shared code know backend ownership and could not distinguish Analyzer from Catalog because both use the
  Gateway `/robo` prefix.

## Refactor

- Shared HTTP now owns only fetch mechanics, response-body error parsing, JSON/FormData helpers, and SSE/NDJSON
  streaming.
- Analyzer, Catalog, Parser, Text2SQL, and What-If each create a domain HTTP client with their own service context.
- Request URLs, methods, headers, payloads, stream parsing, status handling, and existing user-facing guidance remain
  unchanged.
- The architecture contract now rejects backend-specific guidance in shared HTTP and rejects raw `fetch` in every
  Vue component. Workflow-level raw `fetch` remains prohibited as before.

## Verification

- `npm.cmd run type-check -- --pretty false`: passed with zero errors.
- `node contracts/check-architecture.mjs`: passed across 334 TypeScript/Vue source files.
- One approval-free browser run passed Analyzer, Schema/Catalog, Text2SQL, and What-If failure and retry contracts at
  1920x1080. The Schema source-panel test also confirmed the preserved `ROBO 백엔드 서비스가 동작하지 않습니다`
  guidance.
