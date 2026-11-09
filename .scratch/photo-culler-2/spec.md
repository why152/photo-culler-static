# Photo Culler 2.0
Status: Beta candidate — PR #2, acceptance limitations documented
Source: https://app.notion.com/p/413d0befadbd8126b9a9cda079c62a01

Section 0 overrides historical details: one read-only recursive root per session;
human preferences precede machine plans; copy only after separate approval;
external native moves disabled without actual platform proof. No cloud/telemetry.
Preserve v1 viewer, decisions, batches and journals. Core pinned dependencies:
Vite 8.3.6, hash-wasm 4.13.0, exifr 7.1.3, phash 1.0.0.

## Baseline
main b46899ec9dcfc73b08e2b642ea5b71ad9eb8965b; initially clean.
Node 22.22.0. npm ci and check passed; 96 Node tests passed.
Sandbox Chrome launch SIGABRT; rerunning browser tests outside sandbox.

## Acceptance
Session migration/reopen, recursive pairing/protected formats, bounded grouping,
Top-K and human overrides, comparison, cancellation, copy integrity/conflicts,
subpath workers and no uploads, existing regressions, documentation and PR.
Real S9 preference recall/time savings and external Mac/Windows moves are NOT
validated by synthetic tests; no Stable claim or production deployment.

## Delivery
https://github.com/why152/photo-culler-static/pull/2
107 Node + 65 Chrome regression + 3 dist tests passed locally; 1 benchmark skipped.
See docs/photo-culler-2-validation.md for unvalidated real sample/platform/semantic quality gates. Models deferred; no Stable claim, merge or production deployment.
