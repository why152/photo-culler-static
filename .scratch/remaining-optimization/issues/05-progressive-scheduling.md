# Progressive analysis scheduling

Status: Complete
Blocked by: 04 cpu-and-decode

## Scope

Prioritize visible photo groups, publish thumbnails before slower scoring/cache work where supported, bound concurrency and memory, and verify abort/restart semantics.

## Validation

Meaningful unit regressions plus applicable Chrome integration tests; record evidence and any limits before marking complete.

## Comments

- 2026-10-13: Created under the user-authorized staged optimization plan.

- 2026-10-14: Analyzer/worker early-thumbnail delivery, dynamic priority polling, and bounded asynchronous cache persistence implemented and unit-tested. Supervisor verified standalone progressive timing; workspace and viewport-priority UI wiring remains in progress.

- 2026-10-16: Viewport/current-view priorities wired through workspace; early-preview and bounded-write/cancellation behavior await final integrated Chrome acceptance.

- 2026-10-16: Final supervisor regression passed: 87 unit tests, 22 module syntax checks, and 61 Chrome tests; the single opt-in benchmark was intentionally skipped in the routine suite. Review usability, 2,000-group viewport/focus/resize bounds, storage migration, cancellation, recoverable movement and GPU boundary regressions passed. Native GPU evidence remains an isolated synthetic benchmark; CPU stays the production default. Generated-fixture screenshots were captured separately after completed image decoding/analysis and persistence.
