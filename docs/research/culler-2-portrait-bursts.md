# Opt-in portrait burst selection (beta.5)

2026-11-11. Personal Mac Chrome scope, static vanilla app and read-only originals.
This is an optional enhancement, not human preference or Stable acceptance.

## Reuse and gates

Facet38752c35 supplies EAR geometry/pose uncertainty; Selects60e5e825 supplies
EAR scaling and bounded closed-eye preference. Photo-Curator1cb56a07 supplies
reciprocal ORB confirmation (Hamming<40,agreement>=.30); jsfeat0.0.8 extracts
bounded128 descriptors. Browser preprocessing differs from InsightFace/OpenCV;
no upstream accuracy or pixel parity claim. Licenses/pins: THIRD_PARTY_NOTICES.md.

Official Apache-2.0 TFJS-converted full-range face detector and FaceMesh v1 weights
are served from this site, with TFJS4.22 single-thread WASM. A build graph gate
rejects MediaPipe SDK modules. No SDK telemetry, remote inference, Apple native
helper, face-identity database, emotion or demographic model. Seven static assets
are pinned by SHA in models/portrait-v1/ASSETS.json (3,972,503 bytes including all
WASM variants); the optional JS inference chunk adds about1.1MB uncompressed.
Only the selected WASM variant loads. Ordinary rule review loads no model assets.

Explicit opt-in; input long edge<=1600px, max4 faces,15s initialization timeout,
128MiB tensor peak/storage stop. Errors preserve rule behavior. Do not confuse
tensor accounting with total Chrome/WASM/decoded-image peak memory. Full landmark
arrays and face crops are discarded; compact local analysis features remain in
the browser cache and can be sensitive. No photos/features go to the server.

## Selection behavior

Default rules retain their2.5s/6-bit/30-frame grouping. Optional portrait burst
mode uses complete-link12s/30-frame groups with compatible face locations/sizes,
aligned face appearance and ORB confirmation for wider image hashes. No chaining
through A~B~C, cross-identity certainty or semantic action recognition is claimed.
Small faces below48px are not used; small-area or turned/tilted faces have unknown
eye state. Significant focus differences prevail; a known blink is a bounded
near-quality preference, never an absolute deletion rule. Face scores use one
common batch scale so the sorting comparator stays transitive.

Keep the existing compact default: one automatic candidate per portrait group;
users can explicitly select2–3. Human keep/favorite and protected uncertainties
can exceed that automatic budget. Same-byte duplicates still collapse. Brackets,
panoramas, version uncertainty, missing formats and manual splits retain their
safety behavior. Some apparently identical actions still split conservatively.
“看这组全部” reveals the alternatives without changing the output plan; exporting
still covers the folder-wide recommendations. No original file is deleted/moved.

beta.5 invalidates older analysis/accepted plans and requires reacceptance. Local
human decisions/favorites survive. Model evidence has its own schema version;
ordinary cached analysis without matching portrait evidence is recomputed on opt-in.

## Read-only real-directory qualification

All1,655 JPEG analysis groups in the authorized mixed directory were processed.
The development inventory initially selected the lower-resolution companion in
five same-stem pairs. Those five were remeasured using the unchanged production
inventory's sorted-member source rule, then all results rebound to the production
physical groups before the final comparisons. This was a harness correction;
the production source-selection rule was not changed.

- 898 sources had detected faces;155 enhanced groups cover396 sources.
- At budget1:151 automatic candidates within those groups,14 protected frames
  remain separately reviewable. Folder-wide JPEG candidates1030→998.
- At explicit budget2:302 candidates in those groups; folder-wide total1149.
  Choosing more representatives can increase the overall shortlist; it is not a
  promise of fewer photos in every mode.
- Measured portrait computation63.86s across the final source set; full first-pass
  analysis355.33s before the five-source correction. These are single observations,
  not controlled speed claims. Persistent tensors remained384; tensor storage
  max5,043,492 bytes, observed per-inference peak98,530,632 bytes after production
  source correction. This is not total browser peak RAM.
- All2,213 source files retain identical SHA-256,size,mtime and paths. No original
  directory write handle, photo export, observed page error or external request.
  HEIC/video/PNG are outside this portrait JPEG measurement; their protection and
  generic analysis paths retain existing format regression coverage.

Three-source real portrait UI fixture: explicit budget2 yielded2 candidates,
whole-group inspection worked, acceptance survived reload, source bytes unchanged;
no photo export. It is a selected functional example, not an accuracy sample.
Small contact-sheet inspections check obvious grouping errors, not fine eye focus
or personal taste. Photos, paths, EXIF, raw features and labels remain ignored/local.

## Frozen500 proxy regression and limitations

Reuse the earlier frozen218keep/249optional/33protected AI labels, not new human
truth. No relabeling, and no claim that this development evaluation is independent.

| Same frozen labels | beta.4 compact | portrait1 (default) | portrait2 (explicit) |
| --- | ---: | ---: | ---: |
| Automatic moment recall |68/70 (97.14%)|68/70 (97.14%)|68/70 (97.14%)|
| Visible moment coverage |100%|100%|100%|
| Automatic candidates |317|306|344|
| Visible queue |339|332|370|
| Wanted individual frames folded |51|57|37|

Preserve the regression: budget1 folds six more proxy-wanted individual frames,
even with unchanged moment recall. Budget2 keeps more, at a larger review cost.
Neither budget proves the user's preferred expression/pose,95% human accuracy or
70% real effort savings. No automatic exclusion based on identity or expression.
Use whole-group review where the choice matters.

## Engineering verification

144 Node,66 Mac Chrome regression tests (1 existing optional skip),23 dist tests
passed locally. Dist includes opt-in/no-default-download, same-origin models/WASM,
missing-model fallback, budget/preference persistence, beta.2/.3/.4 plan migration
and existing copy/backup safety. Final remote CI/deployment receipts belong to the
PR and Notion update; local success alone is not production verification.
