# Broader scene stacks and faster personal review

User screenshots exposed two separate issues: badges counted all members without
showing selected count, and many nearby photographs really were separate batches.
The production source-feature audit showed distant/small subjects often had no
usable faces and therefore no face-gated scene descriptors. Existing screenshot
batches generally nominated one frame, not multiple frames from one larger batch.
No filename-specific grouping rule is introduced.

## Reuse and behavior

Reuse jsfeat sceneFeatures and Photo-Curator's reciprocal ORB method on existing
420px previews for every image, independent of face detection. Independent
preview-orb-1 scene evidence permits verified beta.5/6 cache supplementation without
rerunning face inference. The model/library/stack is unchanged. Worker processing
and temporary bitmap disposal remain bounded. Failures provide no broad match.

A broad review pair needs finite capture times <=30s, same-orientation aspect
change<=.08, global pHash<=24 and reciprocal ORB>=.30; within2.5s, review-only matches may
instead use pHash<=32/ORB>=.18 for small subjects and handheld reframing. These
lower thresholds are a bounded personal-workflow adaptation, not upstream parity. Complete-link and30-frame
cap prevent A~B~C chains. Existing protective, split, panorama, bracket, ambiguous
version and manual-label behavior stays. Wider scene matches nominate a technical
representative and protect uncertain alternatives, rather than claiming same
identity/action or discarding them. Existing face preference remains for reliable
portrait batches. These are photographic similarity heuristics, not pose semantics.

A visible fewer/more slider reuses compact/standard/loose plus portraitKeep1–3.
It changes machine candidates, not human choices. Technical failures/uncertainty
remain protected regardless of budget. Each collapsed representative shows total
members and selected count; multiple selected representatives remain visible and
all carry the same expansion affordance. Expanding reveals every member.

The viewer always shows1精选 /2保留 /X不选 and auto-advance behavior.1 retains the
existing favorite meaning.1/2/X/3 save first, advance to the next full-order item,
ignore held repeats, and stay at the end. Failed saves restore the choice and do
not advance. Mouse toggles stay put. Inputs do not trigger shortcuts. U still
undoes decisions; ranges undo as one action.

Shift-click on thumbnail selection controls applies the endpoint's new selected
state to both endpoints and all intervening items in the full current filtered
thumbnail order. Collapsed hidden members are not silently selected. A2000-group browser regression covers first-to-last range selection and undo
across virtual render windows. Sources are hashed before changing any range;
context checks prevent cross-folder writes. One queued session write persists the
range; a failure rolls it back. Root changes clear the range anchor.

## Verification and limits

158 Node and31 built-subpath Chrome tests passed, including range selection in
both directions, one-step undo, reload persistence, slider preserving manual state,
keyboard save/advance and storage failure staying on the current image.2000-group
continuous scrolling/cache regression includes an old entry missing scene evidence
with model requests blocked.56 previous syntax checks expand to58. Synthetic narrow
layout and group labels reviewed. Original-copy and migration regressions retained.

Whole-folder source-feature comparison, frozen AI-proxy comparison and real
original-byte copy receipts are recorded below. No human labels,
new human accuracy, measured work reduction, or Stable acceptance are claimed.

Private source features, photographs/paths and receipts remain under ignored
output/faster-review/. Nothing from the real source directory is written/renamed/
deleted by the app or tests. Copy remains independent and explicitly confirmed.

## Completed read-only and frozen-label comparison

The same1655 production JPEG source records, with source SHA verified while
supplementing bounded scene evidence, yield1017→750 batches. At fewer/medium/more,
automatic candidates are730/1096/1248, versus996 in the preceding default.
Protected frames are703/444/318, versus201; suppressed222/115/89 versus458.
These are rule states, not rendered-card counts or measured human effort.

Frozen500 AI-proxy labels, no relabeling/human confirmations: moment recall remains
68/70 and visible moment coverage70/70 at all three settings, using the existing
benchmark definition (a usable labeled alternative can cover the same moment).
Fewer candidates306→232; must-keep frames selected148→118 is a30-frame regression.
Must-keep frames suppressed44→22 is a22-frame improvement in protection. Medium
selects337 candidates/166 must-keep frames and suppresses5 must-keeps; more selects
385/181 and suppresses2. Non-suppressed frames at fewer354→435 are protected/selected
rule states, not proof of effort reduction. Do not present improved grouping as
universally improved best-frame selection, personal accuracy or Stable acceptance.

117 original-byte sample files (115 photo groups/113 image sources), including
all three supplied screenshot sequences and prior format/companion samples, passed
isolated Chrome OPFS import/review/confirmed grouped-copy/SHA re-read and warm
reopen. The previously missed adjacent small-subject pair shares one2-frame stack
with one default representative. Every117 output matches its source-byte baseline;
all2213 originals preserve SHA,size,mtime and paths. No observed page errors or
external requests. Disposable copies/profile removed. The first sample run exposed
a real short-cadence match miss; evidence-informed short-range review-only matching
was added and the complete copy test rerun successfully, not weakened.

Final local checks:158 Node,66 Mac Chrome browser,31 built-subpath tests passed
(1 existing optional local skip; Linux platform skips documented separately).
HTTPS release verification and CI are recorded with the PR/release, not inferred
from local tests. Private receipts: comparison-final.json, real-receipt-final.json,
source scene evidence and temporary test logs; no real source files committed.
