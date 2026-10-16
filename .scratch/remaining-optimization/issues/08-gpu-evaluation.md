# Optional WebGPU evaluation

Status: Complete
Blocked by: 03 metrics-and-cache-context and 04 cpu-and-decode

## Scope

Build an optional scoring prototype with CPU fallback and isolated backend/version cache. Validate score/classification equivalence and measure end-to-end speed before choosing default behavior.

## Validation

Meaningful unit regressions plus applicable Chrome integration tests; record evidence and any limits before marking complete.

## Comments

- 2026-10-13: Created under the user-authorized staged optimization plan.

- 2026-10-14: Optional isolated WebGPU experiment and CPU fallback validated by the GPU agent and supervisor in native Apple Metal 3 Chrome. Scoring improved 11.2→5 ms, but full pipeline changed only 4.4% faster for JPEG, 4.3% slower for PNG, and 1.5% faster for WEBP. CPU remains the production default. Evidence: `docs/research/local-gpu-evaluation.md` and `local-gpu-measurements.json`; expanded boundary cases join final regression verification.

- 2026-10-16: Final supervisor regression passed: 87 unit tests, 22 module syntax checks, and 61 Chrome tests; the single opt-in benchmark was intentionally skipped in the routine suite. Review usability, 2,000-group viewport/focus/resize bounds, storage migration, cancellation, recoverable movement and GPU boundary regressions passed. Native GPU evidence remains an isolated synthetic benchmark; CPU stays the production default. Generated-fixture screenshots were captured separately after completed image decoding/analysis and persistence.
