# Real camera directory acceptance

The supervisor verified the current application on 2026-11-08 using original-byte copies from a user-authorized camera directory. This is one cold/warm acceptance run in Chrome 157 on one machine, not a before/after performance comparison or a prediction for other cameras and storage devices. Private source paths, file names and photo pixels are excluded from this record.

## Coverage and isolation

The source contains 764 JPEG analysis sources (8,769,927,680 bytes) and 764 matching RW2 members (17,905,504,256 bytes), for 1,528 files and 26,675,431,936 bytes. Chrome's isolated OPFS environment had a 10 GiB quota. All 764 JPEG files were copied without resizing or re-encoding, together with one actual matching RW2 member. The copied fixture therefore contained 765 files totaling 8,797,240,320 bytes. The remaining 763 RW2 members were not copied or moved; their source size and modification time were checked for changes.

Copy setup took 10.76 seconds and is excluded from the timings below. The application analyzed the isolated OPFS copies; this does not exercise the native external-directory picker, native-source file permissions, or native-file movement behavior. It does not measure importing the full source directory or throughput on an SD card or external disk.

## Observed results

| Checkpoint | Observed value |
| --- | ---: |
| Cold first grid | 115.6 ms |
| Cold first preview | 304.0 ms |
| Cold completion, 764 analysis sources | 107.06 s |
| Warm completion | 321.8 ms |
| Warm analysis-cache hits / misses | 764 / 0 |
| Unreadable analysis sources | 0 |
| Renderer errors / cache errors / nonlocal requests | 0 / 0 / 0 |

Cold analysis produced 428 `keep` results and 336 `review` results. A `review` result requests conservative human inspection; it is not a read failure or an independently validated defect in the photo. The warm run returned the same status totals. Timing values come from one run per cache state and are not medians.

Photo viewer navigation, review decision and undo, viewer-position restoration, and access to the virtualized queue tail passed. Recoverable movement/restoration exercised the one real copied JPEG/RW2 photo group. After restoration, the isolated fixture again contained 765 files and all three sampled hashes matched. All 1,528 source files retained their original sizes and modification times, and three sampled source SHA-256 checks matched. These sampled hashes do not constitute a full-content hash of every source file. Isolated copies were removed after acceptance.

A separate exact-pair acceptance confirmed that the copied JPEG and RW2 share a stem, the confirmation names one photo group and two files, and the resulting review batch contains those two members plus its movement journal. Both moved members and both restored members matched their SHA-256 hashes; both corresponding source-file hashes remained unchanged. This tests complete paired membership in OPFS, not native-file moves.

Local raw results are retained in ignored `output/real-acceptance.json` and `output/real-pair-acceptance.json`; they are not uploaded as photo artifacts. Deployment is tracked separately under `.scratch/real-directory-release/`.

## Release verification

On 2026-11-08, application revision `04f9b6d743df512f077a8a4e85aba7c7b82072f7` was published successfully by [GitHub Pages workflow 42475688418](https://github.com/why152/photo-culler-static/actions/runs/42475688418) to [the HTTPS site](https://why152.github.io/photo-culler-static/). All 12 checked core HTML, JavaScript and CSS resources returned HTTP 200 and had SHA-256 values identical to the verified local application revision.

A separate Chrome smoke test against that live site used three generated JPEG photo groups, rather than private source photos. Analysis, the full-resolution Photo viewer, and review decision/undo passed with no renderer errors. The resource checks and live-site smoke result are retained in ignored `output/pages-verification.json` and `output/pages-smoke.json`. This confirms the deployed application and basic live-site flow; it does not extend the isolated real-directory test to native-picker or native-file-movement coverage.
