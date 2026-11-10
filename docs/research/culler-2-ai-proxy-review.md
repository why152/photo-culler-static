# AI proxy visual review (2026-11-10 JST)

User explicitly asked the assistant to do most of the preference-label preparation
with AI vision. This is an assistant-authored proxy, not the user's actual taste
or independent human acceptance. The source was the previously authorized camera
batch: all 1,233 JPEG analysis sources; matching RW2 members were not decoded.

## Review method and draft

Every JPEG was visually examined in 42 numbered contact sheets, with oriented
thumbnails of approximately 312 × 244 pixels. No recommendation scores were used
to choose individual labels. Representatives were chosen for different scenes,
composition, subject positions and visible moment diversity. Night scenes,
intentional bokeh, exposure variants and personal-value ambiguity were treated
conservatively. This is insufficient for reliable full-resolution sharpness,
expression, identity or photographer-intent judgments.

| Draft label | Count |
|---|---:|
| Suggested must-keep | 228 |
| Optional near-duplicate or technical candidate | 913 |
| Uncertain; needs closer/personal review | 92 |
| Total visually reviewed | 1,233 |

Each local label includes the exact source SHA-256, relative path, coarse moment
identifier, reason and provenance. The local JSON is intentionally ignored by
Git, as are photographs, contact sheets and per-file evaluation results. Only
these aggregates and reusable code are published. Source files were opened for
reading only; no source directory handle was granted to the application.

## Acceptance boundary

The draft performs most of the labeling work; the remaining 92 ambiguous cases
are placed first in the local confirmation UI. None of the 1,233 labels is
recorded as human-confirmed until an individual actually confirms it. Optional
labels do not change review decisions or trigger file operations.

AI recall can reveal rule weaknesses and prepare a smaller confirmation workload.
It cannot establish real preference recall ≥95% or human effort savings ≥70%.
Confirming AI suggestions is recorded as AI-assisted confirmation, not independent
blind acceptance. Even a positive proxy result would retain Beta status.

## Frozen rule comparison

The production build analyzed fresh temporary OPFS copies of all 1,233 JPEGs
(14.13 GB). Every copied JPEG SHA matched its original; all 2,466 source JPEG/RW2
files were SHA/size/mtime/list checked before and after. All unchanged. Temporary
browser profile and copies were removed. No page errors, resource failures or
non-local / non-GET network requests were observed. Cold analysis: 226.36 seconds,
excluding fixture creation and integrity checks. Mode: burst, compact; algorithm
`rules-2.0-beta.1`. No thresholds were tuned after examining this result.

| AI-proxy comparison | Result |
|---|---:|
| Exact suggested-keep frames in machine shortlist | 83 / 228 (36.40%) |
| Suggested-keep frames still visible (including protected) | 143 / 228 (62.72%) |
| Suggested-keep frames folded | 85 |
| Coarse important moments in machine shortlist | 143 / 190 (75.26%) |
| Coarse important moments still visible, including protected | 185 / 190 (97.37%) |
| Machine shortlist | 373 / 1,233 |
| Candidate + protected review queue | 713 / 1,233 |
| Visible-count reduction | 42.17% |
| Human-confirmed labels / measured human effort saving | 0 / not measured |

The 97.37% visible-moment value includes manual-review protection and must not
be substituted for the 75.26% automatic-shortlist result. Alternative optional
frames with the same coarse proxy moment ID can represent a moment, so moment
recall is different from exact selected-frame recall. Neither proxy metric is
human ground truth. The target automatic recall is **not passed**, and observed
queue reduction does **not** prove 70% less human work. Keep loose/all review
available; do not describe this as autonomous reliable photographic judgment.

The application prioritizes the 92 uncertain items and then AI suggested-keep
frames that the rule engine folded. The local label/report pair is the reusable
handoff for correcting those decisions without relabeling everything from zero.

A repeat with frozen `rules-2.0-beta.2` took228.00s and produced the same recall,
queue and85folded-target counts. All2466 source files were again SHA/size/mtime/list
checked unchanged and the isolated profile removed. The later label-backup patch
does not change image grouping/ranking or these proxy results.
