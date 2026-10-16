# CPU scoring and long-edge decode sizing

Status: Complete
Blocked by: 03 metrics-and-cache-context

## Scope

Measure baseline phases, remove duplicate scoring work, calculate true long-edge decode dimensions without upscaling, and compare technical scores/review classifications.

## Validation

Meaningful unit regressions plus applicable Chrome integration tests; record evidence and any limits before marking complete.

## Comments

- 2026-10-13: Created under the user-authorized staged optimization plan.

- 2026-10-14: CPU agent completed true long-edge sizing, bounded metadata parsing including EXIF orientation, and fused sharpness scans. Supervisor verified decode/reopen Chrome regressions and archived baseline/optimized comparison in `docs/research/analysis-cpu-decode.json`, `cpu-scoring-baseline.json`, `cpu-scoring-optimized.json`, and `analysis-performance.md`.

- 2026-10-16: Final supervisor regression passed: 87 unit tests, 22 module syntax checks, and 61 Chrome tests; the single opt-in benchmark was intentionally skipped in the routine suite. Review usability, 2,000-group viewport/focus/resize bounds, storage migration, cancellation, recoverable movement and GPU boundary regressions passed. Native GPU evidence remains an isolated synthetic benchmark; CPU stays the production default. Generated-fixture screenshots were captured separately after completed image decoding/analysis and persistence.
