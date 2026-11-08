# Bound analysis-source metadata reads

Status: Complete
Blocked by: None

## Acceptance

- At most four analysis-source getFile calls are outstanding.
- Groups retain canonical ordering and members regardless of completion order.
- The original filesystem failure is propagated and no further reads start after it is observed; already-started reads settle without unhandled rejections.
- Empty and companion-only directories avoid unnecessary metadata reads.
- Compare frozen sequential and production bounded scan in the same Chrome session, with alternating order, five rounds, and setup excluded. Measure both in-memory enumeration and full OPFS enumeration.

## Comments

- 2026-11-07: Reviewed the existing four-reader implementation. All 18 review-workspace unit tests pass, including bounded concurrency, out-of-order completion, failure/no-more-dispatch, and empty/companion-only cases. No change to movement or journal sequencing. Prepared scripts/benchmark-directory-scan.mjs; supervisor benchmark and integrated acceptance pending.
- 2026-11-07: Supervisor ran the same-session Chrome 157 benchmark. Five-run full-OPFS scan medians improved from 38.0 to 15.0 ms for 500 groups and 157.4 to 73.5 ms for 2,000 groups. In-memory enumeration medians were 35.7 to 11.9 ms and 182.2 to 76.9 ms. Raw samples archived in docs/research/directory-scan-performance.json, with setup and decoding excluded; no claim of equivalent whole-app or real-camera-directory speedup. Final combined regression pending.
- 2026-11-08: Final supervisor verification passed: 96 unit tests, syntax checks for 23 JavaScript files, and 64 Chrome tests; one routine-suite opt-in benchmark skipped by design. Four-reader bounds, sorted results, failure propagation and no-more-dispatch behavior remain covered. Issue complete; uncommitted at this checkpoint.
