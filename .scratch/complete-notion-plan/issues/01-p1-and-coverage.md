# P1 repair and remaining requirement audit
Status: In Progress
Blocked by: None (human-quality acceptance separately requires labels)

## Acceptance
All three PM P1 items have behavior tests, full regression and deployment evidence.
Remaining frozen requirements have explicit code/test/acceptance mapping.

## Comments
Acceptance snapshots are independent of human decisions. A valid snapshot is
persisted and used for copy; context changes invalidate it; undo prohibits stale
copy; disabled/visible status makes effects inspectable without touching files.

2026-11-10: All three P1 behaviors pass built-dist tests, alongside local proxy
import/confirmation, shortcuts and narrow survey fallback. Full review CSV repaired.
Local 112 Node +65 Chrome +8 dist pass, 1 optional benchmark skipped. Windows Edge
CI added; PR/deployment evidence pending. Remaining special-image, external-disk
and genuine human-quality gates are documented rather than marked complete.
