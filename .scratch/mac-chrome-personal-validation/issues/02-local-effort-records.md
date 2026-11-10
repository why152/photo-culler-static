# Opt-in local review-effort observation
Status: Implemented — release verification in progress
Blocked by: None for engineering; real values depend on actual user operation

## Acceptance
Explicit run controls, visibility-aware active time, unique viewer-open counts,
unchanged photo decisions/acceptance/copy state, save-failure rollback, download
and reopening stopped rather than timing offline. Synthetic/AI runs cannot be
promoted to human evidence, and no inferred70% result from queue counts.

## Comments
2026-11-10: Existing evaluator always returns null effort metrics; add actual
observation tooling instead of manufacturing values from technical-review counts.

2026-11-10: Frozen 500-image proxy study complete (68/70, union72/73); all2213
originals unchanged. Local effort controls, backups, quota rollback and session
isolation covered by 19 passing dist tests. Actual human observations remain open.
