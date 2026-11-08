# Directory and review performance follow-up

Status: Complete
Blocked by: None

## Goal

Reduce avoidable work remaining after stages 03–08: serial analysis-source metadata reads, repeated Photo viewer navigation rendering, and analysis-cache thrashing for directories larger than the cache capacity. Preserve the local static runtime, photo-group ordering, review decisions, and movement journal guarantees.

## Scope and acceptance

1. Bound concurrent metadata reads to four without changing sorted photo-group membership or filesystem error propagation. Stop dispatching new reads after an observed failure.
2. Preserve the visible queue/index when review decisions cannot change its membership; avoid rebuilding the background grid during Photo viewer navigation; count action selection without sorting it.
3. Protect cache entries that the current analysis run has not consumed, keeping cache capacity, visible priorities, cancellation and directory/version isolation intact.

Source and test changes are delegated to agents. The supervisor independently reviews, runs the combined suites, and records completed acceptance. Performance evidence must distinguish synthetic OPFS/operation-count measurements from real camera-directory performance.

## Comments

- 2026-10-16: Follow-up investigation identified serial getFile reads, unnecessary rendering/index rebuilding, and FIFO cache thrashing beyond the 2,000-entry limit. The session ended before implementation and final verification were complete.
- 2026-11-07: Resumed with the existing bounded-scan and UI changes. Cache protection implementation and independent validation are in progress. A same-session, interleaved frozen-reference benchmark is prepared for the directory scan.
- 2026-11-07: Supervisor's directory benchmark and 21-test UI Chrome acceptance passed. Full-OPFS metadata-scan medians fell from 38.0 to 15.0 ms (500 groups) and 157.4 to 73.5 ms (2,000 groups), with raw results and scope limits retained. Cache admission still needs its under-capacity case repaired and verified; the follow-up remains in progress.
- 2026-11-08: All three issues completed after independent supervisor verification: 96 unit tests, syntax checks for 23 JavaScript files, and 64 Chrome tests passed; one opt-in benchmark skipped by design (65 Chrome cases total). The separately executed directory benchmark and deterministic zero-background-grid-write acceptance remain documented in docs/research/directory-review-performance.md.
- 2026-11-08: Real OPFS/IndexedDB/Worker cache acceptance with capacity three and five analysis sources reproduced zero hits/five misses under the old admission policy versus three hits/two misses over three consecutive protected runs. Under-capacity early misses now enter available slots and hit on reopening; free slots account for other directories. Protection is run-local to one analyzer, not a cross-tab pin or a promise to cache every photo group. Independent cache review found no blocking issue. Changes remain local and uncommitted at this checkpoint.
