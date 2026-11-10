# Reused focus methods and retrospective comparison

2026-11-10 JST. Baseline: main `60447d7`, algorithm `rules-2.0-beta.2`.
Candidate: `rules-2.0-beta.3`, existing static CPU Worker and review workflow.

## What is actually reused

`web/modules/upstream-focus.js` adapts Photo-Curator's contrast-normalized
Laplacian sharpness and OpenPhotoCull's 64px sharp-tile variance, four-neighbor
coherent-region and EXIF bokeh/shake-intent calculations. Source commits,
function paths and complete MIT licenses are in [third-party notices](../../THIRD_PARTY_NOTICES.md).
No native/Python/Rust service, Apple Vision, neural weights, cloud or telemetry
was added. Upstream duplicate chaining and deletion code are not used.

The existing browser decoder produces a bounded 1600px image; the adapter scales
that to at most 1024px. Luminance conversion, decoding and border handling differ
from native implementations; no whole-pipeline pixel parity is claimed. Numerical
fixtures verify population variance, contrast normalization, connectivity and
upstream EXIF thresholds. Shake risk is advisory and cannot exclude a photograph.
Failed optional focus analysis falls back to the existing conservative scores.

One weak frame no longer prevents clear neighbors from becoming candidates.
The weak frame stays protected. Exposure brackets, panorama/version uncertainty,
RAW-only/video/failed inputs and human decision precedence remain protected.
The old algorithm is frozen under `scripts/baselines/` for comparison only.
Versioned caches and accepted plans cannot silently reuse beta.2 recommendations;
human decisions remain independent. Users must accept the new output plan again.

## Dataset and selection

All 1,233 JPEGs and the existing assistant-authored labels were reused: 228
suggested keep, 913 optional, 92 uncertain; zero human-confirmed labels. Matching
RW2 files were not decoded. See [label provenance](culler-2-ai-proxy-review.md).

Four fixed strategies were compared: frozen beta.2; individual-frame protection
with original sorting; contrast normalization; and normalization plus coherent
sharp-region protection (`local-focus`). No upstream constants were tuned.
Selection used the first 300 frames, prioritizing important-moment coverage and
fewer hidden wanted frames. Local-focus preserved 39/39 labeled moments visibly
(baseline 38/39), kept automatic recall 31/39, reduced hidden wanted frames from
18 to 15, and increased its visible queue from 158 to 163. That extra review was
accepted for improved coverage, not counted as an efficiency gain.

The remaining data was checked retrospectively. Twenty-two frames belonging to
moments crossing the selection boundary were excluded from this check, leaving
911 frames and 151 labeled moments. Automatic recall improved from 112/151 to
119/151, visible coverage from 147/151 to 148/151, and the queue fell from 533 to
519. Exact wanted frames hidden increased from 67 to 70 in this partition.
This is the same already-reviewed camera batch, not an unseen or human holdout.

Full-data comparison (all 1,233 frames, 190 labeled moments):

| Strategy | Automatic moment recall | Visible moment coverage | Visible queue | Wanted frames hidden |
|---|---:|---:|---:|---:|
| Frozen beta.2 | 143/190 (75.26%) | 185/190 (97.37%) | 713 | 85 |
| Individual protection, original sorting | 151/190 (79.47%) | 185/190 (97.37%) | 696 | 87 |
| Contrast-normalized sorting | 150/190 (78.95%) | 185/190 (97.37%) | 696 | 88 |
| **Local-focus, selected** | **150/190 (78.95%)** | **187/190 (98.42%)** | **704** | **85** |

Local-focus has 384 automatic candidates and 320 protected frames. Exact wanted
frame selection improves from 83/228 to 86/228; visible wanted-frame recall stays
143/228 (62.72%). The hidden frames are not necessarily the same frames. Visible
queue reduction is 42.90%, versus 42.17% before. This is a modest coverage gain,
not evidence of 95% automatic recall or 70% human review/time savings.

## Read-only reproduction and limits

Build first, then run `node scripts/compare-upstream-focus.mjs SOURCE LABELS_JSON`.
Use the local SHA-bound proxy label JSON. The script only supplies original File
objects to a local Worker: no source directory write handle, copies or exports.
It checks full inventory SHA-256, size, modification time and paths before/after.
All 2,466 source files were unchanged. No blocked network attempts or page errors.
The fresh browser context was closed; private per-file results remain ignored in
`output/upstream-focus-comparison.json` and are not published.

Observed analysis time was 216.83s, of which 10.55s was additional focus work
(about 8.55ms/frame). A separate browser regression overlapped briefly, so these
are observations, not a controlled speed comparison. No model memory claim.

The benchmark helper verifies legacy ranking parity against the frozen baseline
on the entire batch, excluding only the version identifier. All metrics explicitly
retain AI provenance and retrospective split names. Beta remains necessary:
expression, story value, artistic intent and the user's personal preferences are
not inferred by these numerical methods. Full review remains available.

Local regression: 122 Node, 66 Chrome and 14 built-dist tests pass; one existing
optional benchmark skipped. This includes legacy score parity, v2 accepted-plan
invalidation with favorite preservation, protected inputs, copies and MIT notices.
Cross-platform CI and live release evidence are recorded in the PR separately.
