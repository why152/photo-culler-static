# Local analysis performance checkpoints

These measurements use generated repeating-noise images, not user photos. They are checkpoints from one machine and Chrome build, with one cold/warm run per fixture; they do not establish a uniform speedup across camera photos. Reports retain stage timings and the browser user agent.

## Before scheduling changes

The baseline uses the original two Laplacian scans and width-only native resize. The second checkpoint combines global and nine-cell statistics in one scan and requests an orientation-aware long-edge fit. Both retain the same scoring formulas, Welford traversal order, gray conversion, thresholds and conservative review classification. Differential tests cover tiny dimensions, cell boundaries, noise, local detail and threshold transitions.

| Generated fixture | Baseline cold total, ms | CPU/decode cold total, ms | Scoring, ms |
| --- | ---: | ---: | ---: |
| 24MP-landscape-jpeg | 200.9 | 209.5 | 18.6 → 17.1 |
| 24MP-portrait-jpeg | 218.2 | 193.0 | 16.6 → 10.4 |
| 24MP-landscape-png | 85.9 | 126.3 | 16.4 → 14.2 |
| 24MP-portrait-webp | 909.1 | 882.9 | 18.6 → 10.0 |

JPEG landscape total time varied upward despite lower scoring cost. Portrait JPEG improved in this sample; PNG showed additional metadata overhead, and WebP remained dominated by decoding. Native decode timings include browser internal resize work. The PNG metadata reader was subsequently changed to use a bounded second 128 KiB read window, reducing repeated tiny file reads; this later change belongs to the scheduling checkpoint, not the numbers above.

The independent Node benchmark scores the same 1600 × 1067 RGBA array seven times after a warm-up, reporting medians. The archived optimized run measured 20.26 ms for the combined scan versus 26.57 ms for the frozen reference. This is a scoring-only result, not an end-to-end claim.

The sizing fix can change decoder interpolation for portrait or previously enlarged images. Mathematical equivalence is verified for identical RGBA input, not for differently resized raster bytes. The analysis-cache version changes with this decoding algorithm; existing human review decisions remain independent of technical scores.

## Scheduling checkpoint

The worker now encodes and publishes a thumbnail before reading pixels and scoring. Analysis dispatch polls visible priorities between photo groups, keeping returned results in directory order. Final results publish before cache writes; at most two writes are active across runs, and abortable waits avoid retaining an unbounded queue of thumbnail Blobs. Each write keeps the directory/version scope captured when its analysis began.

The benchmark records first preview, first scored result, per-stage work and total completion. Batch completion waits for active cache writes, while the UI already has its previews and scores. Cache scope/read/write failures degrade to uncached computation; diagnostic callbacks are opt-in, contain no filenames, paths or pixels, and cannot interrupt review.


The final scheduling checkpoint was recorded on 2026-10-14 with the same four generated 24 MP fixtures. Each number is a single cold run, not a median or a prediction for user directories.

| Generated fixture | First preview, ms | First scored result, ms | Completion including cache write, ms |
| --- | ---: | ---: | ---: |
| 24MP-landscape-jpeg | 172.3 | 187.8 | 188.4 |
| 24MP-portrait-jpeg | 164.4 | 175.4 | 175.7 |
| 24MP-landscape-png | 59.1 | 77.7 | 78.0 |
| 24MP-portrait-webp | 826.8 | 838.5 | 838.8 |

The preview arrived 11.0–18.6 ms before the scored result in these samples. This demonstrates the earlier delivery boundary; it does not measure screen paint, directory scan speed or large-directory interaction. Decoding remained dominant for JPEG and especially WebP. PNG metadata time fell from 15.7 ms in the preceding checkpoint to 1.2 ms after bounded read-window reuse, though single-run timing noise prevents attributing every total-time difference to one change. Cache writes were 0.3–0.6 ms here, so this fixture does not quantify the benefit under slow storage; bounded-write and cancellation tests cover that behavior separately.

Warm-cache hits took 0.1–0.3 ms end to end in this small generated-fixture run. Actual storage/cache latency can differ. All three checkpoints yielded the same reported technical scores for these noise fixtures; those saturated scores are not evidence that every real photo's decoded pixels stay identical.

Raw scheduling checkpoint: [analysis-scheduling.json](analysis-scheduling.json).

## Reproduce

```sh
node scripts/benchmark-analysis-cpu.mjs
PHOTO_CULLER_BENCHMARK=1 PHOTO_CULLER_BENCHMARK_OUTPUT=/tmp/analysis.json npx playwright test browser-tests/analysis-benchmark.spec.mjs --workers=1
```

Raw checkpoints: [browser baseline](analysis-baseline.json), [CPU/decode](analysis-cpu-decode.json), [Node baseline](cpu-scoring-baseline.json), [Node optimized](cpu-scoring-optimized.json). Synthetic fixture encoding is excluded from analysis timings; worker startup, transfers and cache operations are included in end-to-end completion. Browser storage-cache hits are reported separately from worker computation.
