# Preserve unconsumed analysis-cache entries

Status: Complete
Blocked by: None

## Acceptance

- A directory larger than cache capacity reuses retained results instead of evicting each upcoming hit while processing earlier misses.
- Snapshot only matching directory/version/file-signature keys, not all thumbnail values.
- Protect unconsumed hits during the current run without raising cache capacity or reordering visible priorities.
- Cancellation and subsequent runs do not allow old writes to invalidate the snapshot; snapshot/read failures degrade safely.
- Verify with real IndexedDB and focused analyzer tests, including isolation and legacy cache-interface compatibility.

## Comments

- 2026-11-07: Implementation delegated to the cache agent. A small-capacity regression should reproduce the same FIFO-thrashing mechanism as the production 2,000-entry limit without timing-based assertions. Supervisor verification pending.
- 2026-11-08: Implemented a matching-key snapshot with store-wide available capacity. Early misses reserve free slots immediately; when full, miss writes are skipped until protected hits are consumed. Skipped thumbnail writes are not queued, and a larger-than-capacity directory is not fully cached. The analyzer waits abortably for its own preceding run's in-flight writes before the snapshot; protection does not extend to independent analyzers or tabs.
- 2026-11-08: Real Chrome OPFS/IndexedDB/Worker acceptance at capacity three with five analysis sources: old policy zero hits/five misses; protected policy three hits/two misses in three consecutive runs. Under-capacity new-source admission and a subsequent all-hit run passed, as did accounting for slots occupied by another directory. Isolation, cancellation, snapshot failure, and compatible cache adapters remain covered. Independent cache review found no blocking issue.
- 2026-11-08: Final combined supervisor verification passed: 96 unit tests, syntax checks for 23 JavaScript files, and 64 Chrome tests; one opt-in benchmark skipped by design (65 total). Issue complete; changes remain local and uncommitted at this checkpoint.
