# Photo Culler 2.0 Beta candidate validation

Latest follow-up: beta.3 ports licensed upstream focus methods. See the
[retrospective comparison and source-integrity evidence](research/culler-2-upstream-focus.md).
The beta.2 measurements below remain historical; neither result is human acceptance.

Date: 2026-11-09 JST. Baseline main: b46899ec9dcfc73b08e2b642ea5b71ad9eb8965b.
Implementation branch: codex/photo-culler-2. Source: execution book section 0.
Initial synthetic validation accessed no user camera originals. A later explicitly authorized read-only real-camera test is recorded below; no originals were modified, moved or deleted. No production
site was deployed. The screenshot is the real built first-run page, not a mockup.

## Reproduce

Node 22.22.0, npm 10.9.4, installed macOS Google Chrome, local static origins.
Run `npm ci`, `npm run check`, `npm test`, `npm run test:dist`.
Chrome initially SIGABRT under the restricted sandbox; the same tests run outside
that sandbox pass. All created file fixtures are test-owned OPFS or memory blobs.

Baseline: 96 Node tests, 64 Chrome tests passed, 1 opt-in benchmark skipped.
Final local validation: 107 Node tests, 65 Chrome regression tests passed,
1 existing opt-in benchmark skipped; 3 built-dist Chrome tests passed.
`npm run check` passed (32 JavaScript files), build and `git diff --check` passed.
Built cull Worker: 103.19 kB; main v2 JS: 117.58 kB (43.47 kB gzip),
CSS: 2.97 kB; separate legacy bundle retained. No model weights or separate WASM
fetch. These are artifact sizes, not measured runtime peak memory.
CI status is recorded separately in the PR; local success does not imply CI success.

| Area | Evidence | Boundary |
|---|---|---|
| Legacy upgrade | v3 IndexedDB fixture upgrades to v4; sessions A/B and favorite persist; migration is additive/idempotent | No actual user's browser database accessed |
| Inventory | Recursive same names, RAW/XMP, MOV, RAW-only, failed HEIC, historical output exclusion | Same-stem matching only; uncertain Live Photos not inferred across stems |
| Similarity | same-byte renamed files, complete-link distance/time limits, 30-frame synthetic burst, independent scene and manual split | No measured edited/cropped-image recall or panorama classification |
| Ranking | at least one candidate, diversity, exposure-bias/bracket protection, low-quality/failed item protection, human precedence | Technical scores do not identify expression, intent or story value |
| Review UI | shortlist/all filter, favorite through threshold changes, modal single/A-B, keyboard close and state reopen | Four-up renderer exercised; low-memory devices limited to two; no formal accessibility audit |
| Copy output | OPFS byte copies, companions and relative directories, SHA source=destination, separate confirmation and cancellation before writes | Not external Mac/Windows disk acceptance |
| Failure safety | fake permission denial, source changed, cancellation, repeated copy, different-byte collision preserved | Physical power loss, real disk-full/device removal not reproduced |
| Network/build | built Pages subpath, workers and embedded WASM loads; no failed resource requests, only same-origin GET/local Blob reads | No live production URL validation for this branch |
| v1 regression | all original viewer, virtual gallery, worker/cache and movement/recovery checks retained at legacy route | Native external moves are intentionally disabled; OPFS proof is not external proof |

## Explicitly incomplete acceptance

- No independent labeled 500–1000 S9 photos, therefore no Top-K preference recall,
  important-moment recall, time saving, or false-suppression accuracy claim.
  95% and 70% remain targets, not measured results. Use loose/all review.
- MediaPipe not installed: no verified telemetry-disable path or informed opt-in.
  Embedding not installed: no frozen small-model/license/resource/benefit evidence.
- No Windows Edge or real macOS external-directory move/restore proof. Read-only
  import and copy are the baseline; external move remains disabled, old journals
  are retained and discoverable, unsupported restore reports a limitation.
- Near edits/crops, HDR without metadata, panorama and artistic special sequences
  have no semantic recognition. Explicit low-quality/bias/time evidence is
  conservative, but uncertain high-quality similar frames can still be folded.
  Review all originals when a sequence matters. No destructive consequence.
- Copy journal supports verified idempotence and a saved output handle allows
  confirmed resume after reload. A synthetic disk-full-before-first-file test
  covers that path. Different or incomplete existing bytes stop without overwrite;
  use a new output when conflicts cannot be safely resumed.
- Current 2.0 gallery uses bounded pages of 60; the original virtual gallery remains
  accessible in v1. It is not a new virtual scrolling implementation.
- Project had no root LICENSE. Dependency notices are preserved; choosing an
  overall project license requires the repository owner's decision.

Engineering tests passing means a reviewable Beta candidate, not the complete
human-quality/platform acceptance matrix and not Stable. CI success is reported
separately from local tests; no CI status is assumed before GitHub runs it.

## CI follow-up

The first Linux CI run exposed a legacy filmstrip resize/scroll race: a queued
resize restored the old offset after the user explicitly scrolled to zero.
Preserve the explicit start boundary during reflow. The original 2000-item
assertion remains unchanged. Final CI result is available on PR #2.

## Authorized real-camera follow-up

[Full aggregate report](research/culler-2-real-directory-acceptance.md): 1,233 JPEG/RW2 pairs, all original hashes and metadata unchanged; complete decode, 1,062 verified output files on isolated copies, cold/warm session completion. This supersedes the earlier absence of real-image functional evidence, but does not supply human preference labels or external-disk/platform acceptance.

## Mixed photo/video follow-up

[Mixed-format report](research/culler-2-mixed-directory-acceptance.md): all 2,213 source files unchanged; HEIC 226 decoded / 53 safely protected; all 269 video groups protected; explicit inclusion copied and hash-verified 1,897 files without splitting companions. Real external-disk and human preference acceptance remain outstanding.

## Acceptance repair and local labeling follow-up (2026-11-10 JST)

Branch `codex/fix-shortlist-acceptance` repairs the three PM P1 findings:
new burst sessions use compact while saved preferences survive; filtered paging
wraps on the filtered count; acceptance persists an independent manifest snapshot,
uses that exact snapshot for copy, and invalidates on candidate/setting/source
changes. Undo disables copy without clearing human decisions or favorites.
Reload, interrupted-output resume and separate copy confirmation remain covered.

The local labeling workflow stores independent provenance, SHA-bound proxy imports,
random human study samples and frozen recommendations. During fresh human labeling,
intermediate recommendation metrics are hidden. Imported AI drafts remain explicitly
AI-assisted even after individual human confirmation. No photo/label upload API or
model dependency is added. See [workflow](photo-culler-2-labeling.md) and
[AI proxy scope](research/culler-2-ai-proxy-review.md).

Review CSV now includes every member's review state, including suppressed and
protected members; non-exported rows have no destination. Formula-leading cells
are escaped for spreadsheet opening; manifest and physical paths are unchanged.
New controls have 44px targets, focus visibility and reduced-motion handling.
New single-photo shortcuts support favorite/keep/exclude/review/undo/fullscreen;
inputs retain their keystrokes. Four-up reduces to two below 1100px.

Local results: 112 Node tests, 65 Chrome regressions and 8 built-dist tests pass;
1 pre-existing optional benchmark remains skipped. Syntax checks cover 36 files.
Windows Edge is added to PR CI; its actual result must be checked before claiming
platform evidence. Native external-disk writes, power loss and genuine independent
human quality/effort acceptance remain unverified. Edited/cropped/panoramic/semantic
quality limits in the earlier matrix remain open; this patch does not claim them
solved by AI proxy labeling.

### Frozen-rule coverage and native follow-up

`rules-2.0-beta.2` now exposes exact / same-image-version / burst / unique /
unknown classifications. Near hashes with explicit size/format/editor evidence
are version candidates and stay protected; this is not semantic proof of identity.
Original oriented dimensions are reused from the existing bounded metadata read,
not reparsed with a new library. Resolution breaks comparable-quality ties.
Wide/tall panoramic aspect ratios and exposure-sequence evidence trigger review.
Actual resized PNG, recompressed JPEG, cropped JPEG and wide-image browser
fixtures verify safety and source-dimension retention. Unknown artistic/semantic
sequences still cannot be reliably classified and should be reviewed in full.

Latest local validation: **114 Node, 65 Chrome, 10 built-dist tests passed**;
1 existing optional benchmark skipped. A Windows CI repeat exposed a legacy
first-run progress assertion racing the transition to completed analysis; the
fixture now explicitly holds scan iteration until that same progress assertion
passes, then releases it. The assertion is preserved, not weakened.

[Native Mac directory test](research/culler-2-native-copy-acceptance.md) adds actual
picker/permission/cancellation and 35 native-file SHA/companion checks. Loopback
acceptance is distinguished from production HTTPS and removable-disk coverage.
The [AI proxy comparison](research/culler-2-ai-proxy-review.md) was repeated with
frozen beta.2: identical 75.26% automatic moment recall, 97.37% visible moment
coverage including protected, 85 wanted frames folded. All 2466 original hashes,
sizes, mtimes and file list unchanged; isolated profile removed. Quality target
is not passed and Beta is retained.

An additional Windows Edge repeat exposed the moved-preview test assuming the
close action would finish inside a120ms artificial decode delay. The first decode
is now held until after close, then released; the unchanged assertion verifies
that no queued second decode starts. The focused11-test suite passes locally.
This fixes the observation schedule rather than weakening cancellation behavior.
Modal shortcut testing also caught unsupported dialog fullscreen: document-root
fullscreen now enters/exits successfully; modal help remains visible in the modal.

## Label-backup recovery closure

Final workflow audit found study downloads could not be reimported through the
AI-only import field. The field now restores downloaded study JSON against exact
source fingerprint/SHA identity and algorithm, retains frozen settings and AI
provenance, and confirms before replacing existing labels. Invalid/declined
imports leave current work intact. Failed persistence restores prior in-memory
labels/position and permits retry. Human favorites and accepted output snapshots
are independent and unchanged in the browser roundtrip test. Missing historical
settings/provenance cannot silently gain independent-blind acceptance.

Local116Node+65Chrome+12dist pass,1existing optional benchmark skipped. This patch
adds no image analysis or file-copy changes; prior native/HTTPS safety and AI
proxy quality results remain scoped to the verified rule version. PR#3 deployed
1adee7d successfully; its final Linux/Windows CI passed114Node+63browser+10dist per
platform with3optional/platform skips. Backup closure release evidence is tracked
in its follow-up PR, not inferred from these previous runs.

## Final engineering release reconciliation

PR#4 merged as `d447712aa45c8b9e86839f9c9b47341dfd459db6`.
[Pages42725568665](https://github.com/why152/photo-culler-static/actions/runs/42725568665)
succeeded. [PR CI42725087947](https://github.com/why152/photo-culler-static/actions/runs/42725087947)
and [push CI42725056008](https://github.com/why152/photo-culler-static/actions/runs/42725056008)
passed116Node+63browser+12dist on each Linux Chrome/Windows Edge runner, with3
existing optional/platform skips. These counts were read from the actual CI logs.
Local Mac116Node+65Chrome+12dist passed,1optional benchmark skipped.

Actual production HTTPS backup roundtrip passed after deployment, retaining
AI-assisted provenance, frozen burst/compact settings and accepted output status.
Synthetic copy4files all SHA matched; legacy/auto/robots/sitemap returned200; no
page/resource/non-site or non-GET request failures. Runtime JS SHA256 matched the
verified build: `13ee94fc5a281ab25ede51648ad98d7f351a03eb91fe554a266b1615efbc78de`.
This supersedes earlier historical notes saying backup CI/deployment was pending.

Engineering publication is complete; whole-plan acceptance is not. Independent
human labels and observed human viewing/time measurements remain absent. AI proxy
moment recall75.26% is below95%;97.37% protected-queue coverage is not automatic
recall. Conditional native Windows/removable-device/move gates remain unproved,
so those capabilities stay limited as section0 allows. The loopback-origin cache
requires the user's clear/retain decision because browser security blocked
settings access; physical test images were already removed. The local tracker
records these remaining evidence needs explicitly instead of leaving engineering
issues ambiguously in progress or inventing acceptance results.
