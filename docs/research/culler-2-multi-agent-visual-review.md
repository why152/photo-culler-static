# Multi-agent visual proxy review

Protocol started 2026-11-10 at the user's request. This is an assistant-assisted
development evaluation, not a browser runtime vision feature or human preference signoff.
The deployed beta.3 algorithm and previous AI proxy labels remain frozen.

## Independent observation and arbitration

Two agents in separate fresh contexts see numbered photographs, not algorithm
scores, recommendations, former labels or each other's ballots. Both are from
the same inherited model family; their errors may be correlated. Each photo gets
a keep/optional/uncertain label, visual reason, confidence and coherent scene ID.
No artificial keep quota or fixed one-frame-per-scene rule is imposed.

First120 frames establish packet usability. Both reviewers actually inspected
all120 contact-sheet images. ReviewerA:33keep/59optional/28uncertain; reviewerB:
31keep/6optional/83uncertain. Ninety-six cases need third-agent review:67 differing
labels,84 involving uncertainty,2 scene-boundary disagreements (overlap allowed).
This exposed limited detail at approximately310px landscape per frame. Both
reviewers receive larger approximately628px previews for subsequent difficult
cases; originals may be read individually for additional detail. No pilot ballot
is rewritten after looking at disagreement or machine outcomes.

A third agent visually inspects the disputed photographs with neighboring context
and both reasons. It can resolve scene boundaries and give its own preference;
it never sees algorithm output. Unresolved keeper-versus-exclusion disagreement
stays uncertain. A 2:1 exclusion vote cannot silently erase a keeper objection.
Meaningful scene-boundary uncertainty splits the moment conservatively.

## Frozen evidence and honest measurement

Raw ballots, adjudication and merged labels remain separate, with source SHA,
per-frame reasons and AI provenance. Importable output uses the existing version1
`ai-proxy` format; it does not alter human favorites, decisions or export plans.
All ballots are checked for completeness, duplicate/unknown IDs and invalid
values. Every requested disagreement must have an adjudication before finalizing.

The merged study is frozen before comparing machine recommendations. Report
each reviewer separately, the merged result, and a union stress result retaining
every positive vote. The latter prevents discarded/uncertain disagreements from
artificially increasing recall by shrinking its denominator. Exact-frame recall,
moment recall, protected visibility and review-queue size remain separate.

The camera batch was previously used for algorithm comparison: this is not unseen
data, independent human blind testing, or proof of95%/70% product targets. A change
in labels must never be presented as an improvement in the frozen algorithm.
No agents are counted as human confirmation, and no human time savings are inferred.

## Privacy and source safety

The user authorized AI visual inspection in this conversation. Numbered contact
sheets, source paths, hashes, ballots and per-photo reports remain in ignored
local `output/`; none are published to GitHub/Notion. This evaluation does not add
photo uploading or a vision service to the production application. Source photos
are opened read-only; no writable source directory handles, copying exports,
moving or deletion are involved. Full source inventory hashes/sizes/mtimes/paths
are checked before and after; temporary browser contexts and derived review
images are removed after the review. User-needed labels/evidence remain local.

Offline integration: `scripts/multi-agent-labels.mjs` exports validation, dispute
generation and conservative merging. No additional runtime package is installed.

## Completed result

Both reviewers inspected all42 contact sheets and submitted1233 unique sequential
records. ReviewerA additionally inspected3 detail pages and1 original preview;
reviewerB inspected5 detail pages. Labels are about visible preference/redundancy,
not reliable full-resolution technical quality. Optional-label interpretation was
clarified after the pilot; pilot ballots remain immutable, so raw pilot versus
later uncertainty rates should not be treated as a homogeneous confidence study.

| Ballot | Suggested keep | Optional | Uncertain |
|---|---:|---:|---:|
| ReviewerA | 322 | 883 | 28 |
| ReviewerB | 331 | 819 | 83 |
| **Conservative merged** | **301** | **763** | **169** |
| Any-positive stress labels | 457 | 763 | 13 |

All326 requested disagreements were actually viewed and adjudicated, including
14 scene-boundary disagreements; no missing/duplicate/extra IDs. The adjudicator
cast99 keep,203 optional,24 uncertain votes. The conservative merge still protects
169 frames:156 carry a keeper objection,13 remain uncertain without a positive
vote. This is an intentional retention of disagreement rather than a failed or
omitted review. One usage-limit interruption resumed from200 saved cases; their
prefix hash and both sealed independent ballots remained unchanged.

Classified agreement is920/1149=80.07%; both-positive overlap is206/447=46.09%.
Agreement on exact representatives is limited even where the scene is shared.
Separate contexts of the same model do not provide statistically independent
evidence or replace the photographer's preferences.

The frozen label file SHA-256 is
`e50d0e222d321343eaef0306a738a860211726a511c1c05d8229bcd79a6b79b3`.
Machine predictions were inspected only after writing this file and its freeze
receipt. Local deliverables: importable `multi-agent-labels-101_PANA.json`, three
raw ballots, frozen evaluations, `visual-advisory-plan.json`, and a CSV containing
all2466 JPEG/RW2 members. The advisory type is not an accepted export plan; no
photo copying or other file operation occurred. Keep301+protect169=470 groups
are61.88% fewer than all1233, an advisory queue count, not measured human savings.

### Fixed algorithm comparison on the new labels

| Label set / algorithm | Automatic wanted frames | Automatic moments | Visible moments | Wanted frames folded |
|---|---:|---:|---:|---:|
| Merged / beta.2 | 114/301 | 112/139 (80.58%) | 136/139 (97.84%) | 110 |
| Merged / beta.3 | 120/301 | 118/139 (84.89%) | 136/139 (97.84%) | 114 |
| Any-positive / beta.2 | 163/457 | 118/140 (84.29%) | 140/140 | 168 |
| Any-positive / beta.3 | 171/457 | 122/140 (87.14%) | 140/140 | 175 |

The existing machine queue remains713(beta.2) versus704(beta.3); this task changes
no production ranking code. Beta.3 increases automatic moment recall but folds
4 more merged wanted frames (7 more on the stress labels). Visibility/protection
is not automatic selection. All evaluations retain AI provenance,humanConfirmed0
and incomplete-label status;95% automatic recall and70% human effort targets are
not met or established by this study.

For transparency, beta.3 on the individual A/B labels recalls113/130 and118/142
moments automatically, while folding121/322 and125/331 wanted frames respectively.
The new139 required moments differ from the old single-agent190; do not present
old78.95% versus new84.89% as a code improvement. The old proxy remains frozen.
Of its85 beta.3-folded keep suggestions, the new process calls29 keep,14 uncertain,
42 optional. Across all228 former keep suggestions:102 keep,30 uncertain,96
optional. This disagreement is evidence of proxy subjectivity, not proof either
annotation is wrong.

### Safety and validation

The final full-source check verified SHA-256,size,mtime and paths unchanged for
all2466 original files. No source write handles, exports, moves or deletion.
Temporary browser contexts were closed. Derived photographs/contact sheets are
removed after review; local user-needed ballots,labels,advisory CSV and receipts
remain ignored. User-authorized image viewing occurred in assistant contexts;
the production website gained no model, photo-upload integration or telemetry.

126 Node tests and syntax checks passed, including missing/duplicate IDs,
conservative keeper conflicts, scene boundaries, frozen AI provenance and the
existing SHA-bound local importer. A build verified all6 production artifact
SHA values identical to the deployed beta.3 build. CI evidence is tracked in the
PR; production behavior is unchanged.
