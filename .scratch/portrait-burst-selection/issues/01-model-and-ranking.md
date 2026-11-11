# Local portrait evidence and burst recommendations
Status: Implemented — PR verification and deployment pending
Blocked by: PR checks; explicit approval for dependency PR #10 before deployment

## Acceptance
Pinned upstream methods/licenses; no MediaPipe SDK/telemetry in runtime. Opt-in,
local model assets only, cancel/failure safe fallback, no identities/landmarks
persisted. Eye/face sharpness only compare within coherent groups; keep 1–3 with
protected unknowns. Session preferences, cache and acceptance versioned. Existing
and new tests, real-photo evidence, reviewed PR and tested deployment.

## Comments
2026-11-11: Inspect Facet38752c35 /Selects60e5e825. TFJS-converted official
models downloaded for private/local gate evaluation; InsightFace not used.

2026-11-11: Apache model/self-hosted/privacy/resource gates pass.144 Node,66
Chrome,23 dist pass; full1655JPEG qualification corrected5 companion source choices,
all2213 originals unchanged. Frozen proxy68/70 unchanged; default1 folds57 wanted
frames vs51 baseline, explicit2 folds37. See research report for full limitations.
Automatic merge review rejected dependency PR10 pending explicit user approval;
no bypass or production change.
