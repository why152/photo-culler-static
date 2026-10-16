# Timing and scoped analysis cache

Status: Complete
Blocked by: Completed first and second rounds

## Scope

Implement per-phase timing and directory/algorithm namespaced analysis cache. Discard unscoped legacy analysis only; retain workspace decisions and directory handles. Verify persistent isSameEntry identity, concurrent resolution, collisions, migration and eviction.

## Validation

Meaningful unit regressions plus applicable Chrome integration tests; record evidence and any limits before marking complete.

## Comments

- 2026-10-13: Created under the user-authorized staged optimization plan.

- 2026-10-13: Persisted handle namespaces and algorithm-scoped keys implemented; v1/v2 migration retains workspace decisions. Supervisor verified 10 Chrome cache/performance tests. Follow-up adds stale-handle cleanup and bounded orphan registry metadata; its new Chrome regression awaits supervisor verification.

- 2026-10-14: Supervisor verified all four scoped-cache Chrome regressions, including v1/v2 review-preserving migration, same-name/signature isolation, concurrent/reopened handle reuse, version invalidation, stale-handle cleanup, and orphan registry bounds. Timing baseline evidence is archived in `docs/research/analysis-baseline.json` and `docs/research/analysis-performance.md`.

- 2026-10-16: Final supervisor regression passed: 87 unit tests, 22 module syntax checks, and 61 Chrome tests; the single opt-in benchmark was intentionally skipped in the routine suite. Review usability, 2,000-group viewport/focus/resize bounds, storage migration, cancellation, recoverable movement and GPU boundary regressions passed. Native GPU evidence remains an isolated synthetic benchmark; CPU stays the production default. Generated-fixture screenshots were captured separately after completed image decoding/analysis and persistence.
