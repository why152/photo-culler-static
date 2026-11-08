# Directory and review performance follow-up

This follow-up targets avoidable scheduling and rendering work. It does not change image-scoring formulas or enable the experimental GPU path.

## Directory metadata

The preceding scanner awaited every analysis source's getFile call before requesting the next one. The revised scanner dispatches at most four calls, assigns each result to its already-sorted photo group, and stops dispatching after observing a failure. Outstanding read-only calls can finish after the scan rejects; no further calls are started and no file operation is performed.

An earlier Chrome 155 OPFS checkpoint measured five rounds with 32-byte JPEG-named files and in-memory directory enumeration. Median scan times were 36.7 ms for 500 groups and 141.6 ms for 2,000 groups. This is historical evidence of the serial path, not a valid cross-session speedup comparison. The same checkpoint measured separate per-file warm IndexedDB reads at 37.2 ms and 186.6 ms; this follow-up does not claim those transaction costs have been removed. [Historical raw measurements](directory-storage-baseline.json).

The reproducible comparison uses the sequential scanner from commit `0bcb619` and the working-tree scanner in one Chrome session. It alternates execution order over five rounds after warm-up. It measures both metadata with in-memory enumeration and complete OPFS directory enumeration. File creation, image decoding, analysis, cache access, UI rendering and native directory-picker interaction are excluded.

```sh
node scripts/benchmark-directory-scan.mjs output/directory-scan-performance.json
```

The script requires the baseline commit in the local Git history and installed Playwright Chrome dependencies. The supervisor executed it on 2026-11-07 in Chrome 157. Each value below is the median of five measured runs, with one excluded warm-up for each implementation. [Raw measurements](directory-scan-performance.json).

| Photo groups | Enumeration | Sequential, ms | Four concurrent reads, ms | Median time reduction |
| --- | --- | ---: | ---: | ---: |
| 500 | In-memory handles | 35.7 | 11.9 | 66.7% |
| 500 | Full OPFS directory | 38.0 | 15.0 | 60.5% |
| 2,000 | In-memory handles | 182.2 | 76.9 | 57.8% |
| 2,000 | Full OPFS directory | 157.4 | 73.5 | 53.3% |

Both implementations returned identical sorted analysis-source names and group counts on every run. The 2,000-group in-memory sequential sample included a 498.8 ms outlier; all samples remain in the raw data and the reported medians are not trimmed. The modes ran in separate blocks, so their differences do not estimate enumeration overhead.

These results support the bounded metadata-read change on this local synthetic fixture. They do not measure complete directory opening, first screen paint, image decoding or analysis, and cannot establish throughput on a real camera directory, SD card, external disk, or network filesystem. The historical Chrome 155 checkpoint above is context only and is not used to compute the reductions.

## Review rendering and cache admission

The UI work removes background-grid reconstruction during Photo viewer navigation, preserves the all-filter queue/index when only review decisions change, and uses action-selection size without sorting IDs. The supervisor's 21-test targeted Chrome run passed, including the assertion that navigation performs zero background-grid DOM writes. This is an eliminated-work result rather than a wall-time or frame-rate claim. Existing navigation/undo/focus regressions also passed in the final combined verification.

The cache work addresses FIFO thrashing: with a full cache and a larger directory, writing an early miss can evict a later hit before it is read. The implemented admission snapshot reads the bounded store's keys, matches directory/version/file signatures, and records free capacity across the entire store, including other directories and algorithm versions. It reads no thumbnail values. Misses can enter genuinely free slots immediately, reserving each slot before its asynchronous write. When no slots remain and matching hits are still unconsumed, the analyzer skips that miss's cache write. Normal admission resumes once those hits have been consumed; skipped writes are not accumulated in a deferred thumbnail queue.

This protection applies to the current run of one analyzer. Before taking its snapshot, the analyzer waits abortably for its own previous run's bounded in-flight writes. It does not pin records against independent analyzers or tabs; those writers can invalidate a snapshot and cause ordinary cache misses. Snapshot failure falls back to the existing read/analyze/write behavior. Visible priorities and the fixed 2,000-entry production capacity remain unchanged. A larger directory still contains uncached analysis sources, which may need analysis on reopening; this change preserves useful resident hits rather than caching every photo group.

On 2026-11-08, a real Chrome OPFS/IndexedDB/Worker regression used five generated analysis sources with cache capacity three. Disabling only the admission-snapshot interface reproduced the old policy with the same ordering, worker and capacity: **zero hits and five misses**. With protection enabled, **three hits and two misses** were retained in each of three consecutive runs. These are deterministic hit counts demonstrating the eviction mechanism, not a wall-time estimate or a measurement of a 2,000-source directory. The same suite verified immediate admission of an early new source when capacity is available, all hits on the next run, and correct free-slot accounting when another directory occupies the store. See [cache-admission regression](../../browser-tests/analysis-cache-admission.spec.mjs).

## Final acceptance

The supervisor's 2026-11-08 combined run passed 96 unit tests, syntax checks for 23 JavaScript files, and 64 Chrome tests. One opt-in analysis benchmark was skipped by design in the routine Chrome suite (65 total cases); the directory benchmark above was executed separately. Independent cache review found no blocking issue. The implementation and evidence are complete for this follow-up; changes remain local and uncommitted at this checkpoint.
