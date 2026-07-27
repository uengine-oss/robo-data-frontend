# Security frontend evidence

Date: 2026-07-22

## Boundary

The Gateway declares a dedicated Data Secure Guard route at `/api/gateway/security/**` targeting port 8006. No
matching public backend repository or authoritative OpenAPI contract was found in the inspected public organization
inventory, so the frontend does not invent additional policy endpoints. The policy tab explicitly discloses that
policy CRUD is unavailable while retaining the verified users, roles, permissions, table access, and audit-log paths.

## Frontend result

- Split runtime response contracts from the Security transport client.
- Added strict parsers for users, roles, permissions, audit logs, tables, access rules, and effective access.
- Added current session/LLM/Neo4j headers to every Security request.
- Encoded user and role path identifiers and bounded audit-log limits.
- Preserved error versus successful-empty UI states and real CRUD flows.

## Verification

- Full type-check passed.
- Domain contract parsers cover valid and malformed Security records.
- Architecture contract passed.
- Governance browser verification passed at 1920x1080.
- The current live Gateway environment returned HTTP 500 for Security users and tables; the UI displayed service
  failure rather than empty data and exposed retry behavior.
- Browser requests carried `Accept-Language` and the current LLM API-key header.

Successful live Security mutations remain completion-phase evidence because the current upstream is unavailable.
## Security CRUD lifetime addendum

- User and role list loading no longer reports failures only through console output. Editor save errors stay inside the
  named editor dialog; delete errors stay inside a target-specific shared alertdialog.
- User create/update and role create commit only after the Security API succeeds. User and custom-role deletion preserves
  the list through failure, retries the same UID/name, and refreshes only after success.
- The Security backend exposes no role-update route. The previous edit control only displayed a native “not implemented”
  alert and then behaved like success; it is now explicitly disabled with the backend limitation in its accessible name
  and title.
- User/role editors and audit-log details now have dialog semantics, connected labels, initial focus, Escape, focus trap,
  and trigger-focus restoration. Delete confirmation has pending/error identity and blocks close while pending.
- The mocked 390×844 browser flow verified user-editor cancel, user-delete cancel with zero mutation, user and role
  DELETE 503→exact retry, pre-success list invariance, post-success removal, unsupported role-edit disabled state, and
  document overflow 0. `evidence/security-user-delete-390x844.png` was visually inspected without clipping or overlap.
- `npm.cmd run type-check`, the 372-source architecture contract, and
  `run-browser-suite.mjs verify-governance-ui.mjs` passed. Actual Security user/table endpoints still returned HTTP 500,
  correctly remaining distinct from successful empty data.
- The production build passed with 4,833 transformed modules. The lazy-boundary verifier passed with
  `__federation_expose_Remote-app-D24Q5SDl.js` at 2,674,692 bytes and kept Upload, Graph, and the Cytoscape runtime
  outside the remote entry. The scoped Security/app-notification/spec diff check also passed.
