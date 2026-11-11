# Photo-first interaction polish
Status: Done

User approves the proposed Apple-inspired direction: photos dominate, one clear
selection toggle rather than paired keep/exclude buttons, understated automatic
versus human provenance, recognizable expandable photo stacks, one clear copy
organization exit. Reuse existing vanilla DOM/CSS, galleryRows, decision history,
source SHA/session persistence, grouping and confirmed copy. Do not change model,
ranking, automatic defaults, source permissions or copy semantics. Advanced controls
and original viewer remain compatible. Respect keyboard focus and reduce motion.

Presentation also reuses the existing PreviewUrlPool, retaining only the current
60-photo page, so toggling does not reload unchanged image URLs. Group separators
keep expanded members visually distinct from surrounding individual shots.

2026-11-11: Implemented and verified148 Node /27 built-subpath browser tests, with visual QA for collapsed/expanded/organize/narrow layouts. Real33-file sample copied and verified in disposable OPFS; all2213 original hashes/sizes/mtimes/paths unchanged, profile removed. Production remains on the previously approved release pending review of this separate polish.
