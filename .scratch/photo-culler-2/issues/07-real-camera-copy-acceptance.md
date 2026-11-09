# Real camera sample acceptance on isolated copies
Status: Done (functional/integrity acceptance; preference quality unmeasured)
Blocked by: None

## Scope
User authorized read-only testing with their camera directory on 2026-11-09 JST.
2,466 files: 1,233 JPEG and 1,233 matching RW2. Never grant a source directory
write handle. All application actions execute on fresh temporary Chrome OPFS
copies, with all original files SHA-256/size/mtime verified before and after.

## Acceptance
All copies match original hashes; full cold/warm analysis; bounded visible grid;
real JPEG viewer/native-pixel zoom; shortlist accept; cancellation before write;
original-byte export with companions and SHA verification; no external requests.
Preference recall is not measurable without human labels. No external picker or
external-disk writes/moves are exercised by OPFS testing.

## Comments
Test script: scripts/test-real-culler-2.mjs. Detailed local report is ignored under
output/; only aggregate results should be included in repository documentation.

Passed: all 2,466 original hashes/sizes/mtimes unchanged; 1,233 decoded; 531 include / 340 protected / 362 suppress; 1,062 output files verified with companions intact; cold 220.213s, warm 43.190s; no page/network errors. All isolated copies removed.
Report: docs/research/culler-2-real-directory-acceptance.md.
