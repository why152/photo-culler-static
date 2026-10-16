# Remaining local photo review optimizations

Status: Complete
Blocked by: None

## Goal

Complete the remaining agreed optimization plan in stages while preserving the static browser runtime, local processing, conservative review decisions, and recoverable file actions. The supervisor delegates all source/document changes to agents and independently reviews and verifies each stage.

## Completed prerequisites

1. Reliable review undo, ordered optimistic persistence, file-operation isolation, and precise filesystem errors.
2. Indexed photo groups, cached visible gallery queues, and extracted thumbnail rendering with managed Blob URLs.

## Stages and acceptance

- **03 — Timing and cache context:** inspect decode/scoring/thumbnail/cache durations; namespace analysis by persisted directory handle identity and algorithm version. Invalidate legacy unscoped scores without losing review decisions. Verify collisions, reopening, migration, and bounded eviction.
- **04 — CPU scoring and decode sizing:** compute true long-edge decode dimensions without upscaling and eliminate duplicate pixel work. Compare score/results with the original implementation using representative synthetic and real-size fixtures.
- **05 — Progressive scheduling:** prioritize visible photo groups and return thumbnails promptly; use bounded work and cancellation without increasing unbounded memory or cross-directory writes.
- **06 — Virtualized grid, filmstrip, and viewer:** keep large-directory DOM/resources bounded while making the whole visible queue reachable. Preserve small-directory behavior, selection ranges, density, keyboard navigation, focus/scroll restoration, and progressive analysis. Improve large-preview placeholder and neighboring preview behavior with bounded resources.
- **07 — Review usability:** clarify user-facing terminology and explicit move destinations/counts; restore review position and expose accurate progress. Preserve review/action-selection distinctions and accessible controls.
- **08 — GPU evaluation:** create a scoped, optional WebGPU scoring experiment with automatic CPU fallback and separate cache semantics. Compare end-to-end timing and scoring equivalence against the optimized CPU path; retain GPU only when evidence supports its benefit.

## Verification

Use deterministic operation-count and state tests for indexes, invalidation, concurrency, and cancellation. Use Chrome with real OPFS/IndexedDB for storage migration, handle identity, bounded rendering, review continuity, and recoverable movement. Performance claims must distinguish measurement from inference and include fixture/phase context. Changes remain reviewable in the repository; no release/publication is implied.

## Comments

- 2026-10-13: User authorized completing the remaining plan step by step using subagents, with the parent acting as supervisor. Opened stages 03–08 after the first two rounds passed their full regression suites.

- 2026-10-16: Stages 03–08 completed and independently verified by the supervisor. Final regression: 87 unit tests passed, 22 module syntax checks passed, 61 Chrome tests passed, and one opt-in benchmark skipped by design. Separate acceptance covers accurate review/undo/filter progress, open/closed viewer and grid-only scroll restoration, exact planned movement destination and all group members, large-queue virtualization through resize, and preview cancellation/resource limits.
- 2026-10-16: CPU/decode/scheduling checkpoints and isolated native Apple Metal GPU measurements are retained under `docs/research/`. Production remains CPU Worker because synthetic GPU pipeline gains did not meet adoption criteria. Generated image timings and OPFS acceptance do not establish real-camera-directory speed, native picker behavior, battery use or peak memory; representative user-photo cold/warm batch measurement remains a prerequisite for future GPU adoption, not an incomplete implementation stage.
- 2026-10-16: Desktop viewer and narrow grid screenshots generated in ignored `output/` after image readiness, complete 48-group analysis and saved review position; final source changes remain local, with no publication implied.
