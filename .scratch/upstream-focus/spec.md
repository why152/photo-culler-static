# Reuse upstream focus analysis without changing product architecture
Status: Done (implementation and local comparison; independent product acceptance remains open)
Source: Notion413d0befadbd8126b9a9cda079c62a01 sections0/3/4; user asks to advance by reusing excellent projects

Adapt licensed, commit-pinned Photo Curator contrast-normalized focus and
OpenPhotoCull coherent sharp-tile/EXIF intent analysis into the existing CPU Worker.
No Python/Rust service, native runtime, cloud inference, model or telemetry added.
Keep existing pHash/EXIF/SHA libraries and copy-only safety. Baseline code frozen.

Compare fixed candidate strategies on the authorized AI-proxy camera dataset.
Use first300 for strategy selection, remaining data for retrospective checking
(exclude 22 frames with selection-partition moments; 911 check frames);
no human or unseen-data claim. Do not tune upstream constants to these labels.
Preserve special-sequence/file protections and human precedence. Reject a default
change if moment coverage regresses or the review queue grows without benefit.

Implementation and local acceptance completed in PR #6:
https://github.com/why152/photo-culler-static/pull/6
Cross-platform CI and deployment receipts are maintained on that PR.
