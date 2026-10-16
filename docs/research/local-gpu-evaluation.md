# Local WebGPU scoring experiment

The production path remains the CPU Worker. `web/modules/photo-analysis-gpu.js` is an isolated experimental scorer; `site.js` and the production Worker do not import it. It does not add a model, remote service, automatic file action, or new analysis-cache entries.

## Scope and design

The experiment accelerates integer grayscale, exposure counts, and global plus nine-region Laplacian statistics. Each 256-pixel workgroup accumulates integer partials. A second dispatch reduces those partials on the GPU; only 168 bytes of statistics are copied back. JavaScript computes variances in binary64 and calls the same `scoreStatistics` helper as the CPU. Squares use low/high uint32 words to avoid overflow at the analysis limit of 1600 × 1600. This keeps GPU-side statistics exact; equivalent variance formulas can still differ at a floating-point rounding boundary, so final score and decision comparison remains required.

Grayscale preserves the existing JavaScript weights and rounding. An 8 KiB bitset corrects exact decimal-half RGB combinations that the original binary64 expression rounds down. It is generated once during explicit GPU initialization, outside the production first-thumbnail path. The browser regression includes `[250, 252, 209]`, whose weighted value is nominally 246.5 but rounds to 246 in JavaScript; rounding it to 247 would incorrectly count a bright pixel.

`scorePixels` includes the cost of uploading RGBA bytes. `scoreSource` copies an already resized sRGB Canvas into a GPU texture without a whole-image `getImageData` readback. Canvas is the comparison source because its alpha, color conversion and resize semantics match the CPU analysis path. An opaque `ImageBitmap` can be supplied for further experiments; transparent or wide-gamut bitmap paths need their own parity checks.

Initialization records adapter metadata and classifies it as hardware, software, unknown, or unavailable. Software/fallback adapters and unknown classifications are retained in reports but cannot support a native-GPU acceleration claim. Unsupported WebGPU, no adapter, device loss, or scoring failures can use `scorePixelsOrCpu`; malformed RGBA input is rejected before fallback. Source-image upload errors reject rather than yielding a fabricated score. Each job is serialized, error scopes are drained, and per-image GPU allocations are destroyed after readback. The production Worker cancellation lifecycle remains separate.

## Reproduce

Run these sequentially with no other browser benchmark running:

```sh
npx playwright test browser-tests/gpu-analysis.spec.mjs
node scripts/gpu-benchmark.mjs docs/research/local-gpu-measurements.json
```

The harness starts or reuses the local static test server and opens stock headless installed Chrome. It does not enable GPU developer flags, force an adapter, or substitute software rendering. It reports cold initialization separately from warm scoring. Four analysis sizes use nine interleaved CPU/GPU trials, including byte upload and external Canvas copy. Generated 24-megapixel JPEG, PNG and WEBP files use five interleaved trials of both paths, sharing the optimized decoder, resize sizing, score semantics, and thumbnail encoding. Both scores and review conclusions must match.

The pipeline experiment includes decode, resize, scoring and thumbnail encoding. It excludes directory enumeration, source-file reads, analysis-cache operations, grid rendering and interaction. It is therefore a pipeline comparison, not a measurement of the entire review application. Generated images exercise resolution, orientation and codecs but do not represent camera-photo content or storage latency. Browser/OS/GPU, thermal state, JIT warmup, battery mode, and Canvas backing can all affect results. Compare medians and retain every sample; do not cherry-pick a shader-only timing.

## Acceptance and decision

Keep CPU as the default until a native-hardware run on representative user photos shows meaningful end-to-end benefit, first-thumbnail latency does not regress, and score/review parity passes. A suggested adoption target is at least 20% lower whole-batch elapsed time compared with the optimized CPU path, with initialization included for a cold run. This is an engineering target, not an observed speedup. A warm scoring improvement alone is insufficient when decode or WEBP processing dominates.

If adoption is justified, use an opt-in backend with automatic CPU fallback and a separate algorithm/backend cache version. Do not turn the current standalone scorer into the default merely because `navigator.gpu` exists.

## Local measurements: 2026-10-14

The clean stock-Chrome run reported a **hardware Apple adapter, Metal 3**, with 17.5 ms cold initialization. The complete samples, user agent, adapter metadata, consistency flags and stage medians are archived in [local-gpu-measurements.json](local-gpu-measurements.json). No tests or other benchmarks ran concurrently with the final measurement. The harness imported the optimized CPU decoder and scorer at startup; subsequent scheduling/cache work is outside this uncached, isolated pipeline measurement.

Warm shared-Canvas scoring at 1600 × 1067 took **11.2 ms on CPU and 5.0 ms with WebGPU**, including GPU copy, dispatch and completed readback. That is a scoring-stage improvement, not an application speedup. All sampled final scores and review conclusions matched.

| Generated 6000 × 4000 source | CPU pipeline median | GPU pipeline median | GPU elapsed-time change |
| --- | ---: | ---: | ---: |
| JPEG | 183.8 ms | 175.8 ms | 4.4% lower |
| PNG | 232.9 ms | 243.0 ms | 4.3% higher |
| WEBP | 947.7 ms | 933.5 ms | 1.5% lower |

These warm pipeline medians exclude the 17.5 ms initialization, source reads, cache and UI. Individual stage medians do not necessarily add to the median total. The earlier draft harness wrapped the decoder's existing timing a second time; its stage output was discarded and the table uses the corrected clean run. Generated high-resolution random pixels are a reproducible codec stress fixture, not a representative real-photo corpus. The measured GPU improvement falls far below the suggested 20% pipeline/batch adoption target, and PNG is slower.

**Decision: retain CPU Worker as the default and keep this backend as a standalone opt-in experiment for developers.** Do not expose a user-facing GPU setting or integrate it into the production analysis cache yet. The experiment confirms native GPU scoring can be faster, while decode and image-transfer costs dominate these complete pipelines. Future adoption requires a separate cold/warm whole-batch experiment on representative camera photos, including first visible thumbnail, UI responsiveness, storage latency and peak memory.

## Primary references

Chrome's [GPU Compute guide](https://developer.chrome.com/docs/capabilities/web-apis/gpu-compute) describes adapter/device requests, compute dispatch, and asynchronous buffer mapping. The scorer includes initialization, upload, dispatch and readback costs rather than timing shader code alone.

The [WebGPU specification](https://www.w3.org/TR/webgpu/) defines external-image copy color-space and alpha metadata, numeric texture formats, mapping, and resource usage. The experiment uses `rgba8unorm` with explicit sRGB and unpremultiplied-alpha destination metadata. It avoids `-srgb` texture sampling because linearization would change the existing integer grayscale algorithm.

Chrome's [WebGPU troubleshooting guide](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips) explains secure-context and adapter availability constraints. The scorer treats unavailability as a runtime outcome. Chrome's [timestamp-query documentation](https://developer.chrome.com/blog/new-in-webgpu-121) describes optional GPU timestamp measurement; this harness instead reports wall time through completed readback, including browser scheduling and transfer costs.
