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
