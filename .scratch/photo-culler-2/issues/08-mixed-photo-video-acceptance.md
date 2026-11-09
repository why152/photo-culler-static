# Mixed photo/video directory acceptance
Status: Done (mixed-format functional/integrity acceptance)
Blocked by: None

## Scope
User authorized another read-only real-data test on 2026-11-09 JST.
2,213 files: JPEG/PNG, HEIC, MP4 and MOV. All source files are hashed before and
after; the app receives only isolated OPFS copies. Originals remain read only.

## Acceptance
Complete inventory and exact-copy integrity; safe HEIC decode fallback; video
protection, including same-stem HEIC/MP4 members; explicit opt-in protected export;
original-byte hash checks; no split companions; no upload or source mutation;
reload/session/cache completion and temporary-copy cleanup.

## Comments
Generalized scripts/test-real-culler-2.mjs to verify expected mixed-format groups,
per-format decode counts, real pixel zoom, and all same-stem companions. The local
report output/culler-2-photos-1-001-acceptance.json remains ignored; only aggregate
results will be published. Human preference quality is not measured by this test.

Passed: all 2,213 original hashes/sizes/mtimes unchanged; 1,950 groups; HEIC 226 decoded/53 protected; 269 video groups protected. Explicit protected export: 1,897 files verified with companions intact. Cold 305.218s, warm 57.373s. No page/resource/network errors. All isolated copies removed.
Aggregate evidence: docs/research/culler-2-mixed-directory-acceptance.md.
