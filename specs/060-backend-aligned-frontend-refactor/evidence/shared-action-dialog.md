# Shared Action Dialog Evidence

## Scope

Security, OLAP, Watch Agent, and Event Detection each had the same destructive-action dialog lifecycle implemented
under a domain or workflow directory. The duplicated code owned focus capture/restoration, Escape and Tab handling,
pending/error presentation, retry labeling, and mobile action layout even though none of those policies requires
backend or domain knowledge.

The lifecycle is now implemented once in `src/shared/components/ActionDialog.vue`. Each consumer still owns the
target identity, message, optional checkbox meaning, exact mutation, local commit, refresh policy, and returned
backend error. This keeps shared code domain-independent and does not create a cross-domain mutation service.

Deleted implementations:

- `src/domains/security/ui/SecurityActionDialog.vue`
- `src/domains/olap/ui/OlapActionDialog.vue`
- `src/workflows/observability/ui/ObservabilityActionDialog.vue`

The architecture contract rejects those old component names and requires the shared primitive to remain free of
service URLs, domain imports, HTTP calls, and mutation policy.

## Verified behavior

- `role="alertdialog"`, accessible title/description, and busy state remain explicit.
- Opening focuses Cancel; Tab and Shift+Tab stay inside the dialog.
- Escape and backdrop click cancel only while no mutation is pending.
- Closing restores focus to the connected trigger.
- A backend failure remains in the same dialog and changes the same action to an exact retry.
- Pending state disables cancellation and duplicate confirmation.
- OLAP's optional “delete all DW tables” choice remains part of the explicit delete request.
- At 390×844 the two actions stack without horizontal page overflow.

## Verification

- Full type-check: passed.
- Architecture contract: passed across 377 TypeScript/Vue sources.
- Security user-delete browser contract: passed, including 390×844 focus, failure, retry, and geometry.
- OLAP lifecycle browser contract: passed, including single/all delete and optional checkbox behavior.
- Watch Agent browser contract: passed, including target-specific failure and retry.
- Event Detection browser contract: passed, including target-specific failure and retry.
- Production build: passed across 4,838 transformed modules.
- Lazy remote boundary: passed; remote entry remained 2,674,692 bytes and Analyzer graph chunks stayed excluded.
- `git diff --check`: passed; only existing line-ending warnings were reported.

This evidence does not claim a live backend mutation. Live success remains part of T052; these browser checks use
deterministic contract responses and are recorded as frontend lifecycle verification only.
