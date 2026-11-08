# Avoid unnecessary review rendering and indexing

Status: Complete
Blocked by: None

## Acceptance

- Photo viewer navigation does not rebuild unchanged background-grid details.
- The all-filter visible queue and position index survive review-decision updates; filters that depend on decisions still invalidate correctly.
- Reading action-selection count does not sort its IDs; actual movement planning preserves deterministic order.
- Decision, undo, filter, focus/scroll restoration, and progressive analysis behavior remain correct.

## Comments

- 2026-11-07: Existing UI changes resumed for independent review and regression verification. Operation-count assertions should demonstrate eliminated work rather than rely on noisy wall-time thresholds.
- 2026-11-07: Supervisor's 21-test targeted Chrome run passed, including zero background-grid DOM writes during Photo viewer navigation. Final combined regression pending.
- 2026-11-08: Final supervisor verification passed: 96 unit tests, syntax checks for 23 JavaScript files, and 64 Chrome tests; one opt-in benchmark skipped by design. Navigation, decisions, undo, filtered queues, focus restoration and progressive analysis regressions passed alongside eliminated-work assertions. Issue complete; no frame-rate claim or whole-app speedup inferred from zero background-grid writes.
