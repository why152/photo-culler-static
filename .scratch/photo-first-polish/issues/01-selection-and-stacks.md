# Selection toggle, photo stacks and quieter copy confirmation
Status: Done
Blocked by: None for implementation

## Acceptance
Single selection control accurately reflects effective decision; explicit human
choice survives expansion/reload and continues to invalidate prior acceptance.
Photo stack click expands in place without selecting; expanded members open viewer.
Visible group collapse and count; focus remains useful after redraw and pagination.
Viewer uses same toggle, while legacy advanced controls stay reachable. Busy and
pending decisions cannot apply duplicate toggles. No file write before final copy
confirmation. Verify basic/advanced, keyboard, small viewport and grouped copy.

## Comments
2026-11-11: User approved reducing interaction and visual load, no feature expansion.

2026-11-11: Implemented and verified148 Node /27 built-subpath browser tests, with visual QA for collapsed/expanded/organize/narrow layouts. Real33-file sample copied and verified in disposable OPFS; all2213 original hashes/sizes/mtimes/paths unchanged, profile removed. Production remains on the previously approved release pending review of this separate polish.
