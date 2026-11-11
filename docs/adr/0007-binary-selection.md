# Two selection states, retained uncertainty evidence

Status: Accepted for implementation,2026-11-11 JST, explicit user request.

The product presents only selected/unselected. Internal algorithm uncertainty is
not a third user task: it remains diagnostic evidence and defaults to unchecked.
Manual keep/favorites prevail; old review_later labels remain readable, unchecked,
and can be manually selected. Remove the later action/key3 and uncertainty toggle;
selected/unselected filters, counts, gallery/viewer labels use the same projection.
Do not change the ranking model, similarity thresholds, cache version or original
source safety. This overrides the three-state presentation in earlier ADRs.

Current plans use a binary projection for every group/record. Organized output
uses layout=binary and only已选/未选 folders; unsupported/uncertain companions are
copied to未选 unless explicitly selected. Selected-only output copies selected
items only. New plans cannot inherit old includeProtected preferences. Changed
layout/plan signatures require reacceptance; old organized preferences normalize
to binary. No completed outputs or source files are moved/renamed/deleted.

Keep old layout=organized journals and their three-folder paths independently
resumable. A distinct new layout identifier avoids interpreting old destinations
under new semantics. Strict source membership/fingerprint/path validation, verified
SHA readback, no overwrite and independent target confirmation remain. Binary
journals reject third-state group records; old journals retain their old meanings.
