# Continuous review and near-identical burst grouping
Status: Done

User reports many visually near-identical frames remain separate and rejects
manual pagination. Fix whole-dataset behavior, not filename-specific exceptions.
Read-only diagnosis on the existing1655-feature production JPEG evidence shows
the supplied four frames already share a7-frame internal batch, classified
same-image-version because one capture was resized. That classification protects
all members and the gallery refuses to collapse versions.

Show related version batches as expandable review stacks without silently losing
versions. Only promote a version-containing batch to an automatic burst when
existing same-scene/face evidence plus reciprocal ORB agrees, capture timestamps
are distinct, and the complete batch is within the short burst time window.
Preserve equal/missing capture times, brackets, panoramas, unknowns, manual splits
and human decisions. Reuse current models/ORB, not new inference libraries.

Remove next-page interaction. Reuse/extend the1.0 GridRenderWindow for continuous,
bounded viewport rendering with variable-height expanded group headers. Preserve
full filtered order, group expansion, viewer navigation, keyboard focus and source
permission/copy safety. Originals read only; writes only to disposable test copies.

2026-11-11: Completed154 Node /29 built-subpath tests and focused sticky/resize visual checks. Continuous2000-group review verified bounded DOM, scrolling, keyboard, viewer return, cached beta.5 evidence and2002-file complete plan. Real44-file sample verified requested four in7-frame group/one candidate; all2213 originals unchanged, disposable profile removed. Whole1655-feature and frozen500 AI-proxy before/after evidence recorded; no Stable claim. Production unchanged pending PR review.
