# Automatic analysis, expandable gallery and grouped output
Status: Done
Blocked by: Native external moves unsupported; copy fallback is authorized

## Acceptance
No portrait switch required or visible. No model fetch before selecting directory.
Legacy portrait=false session still receives automatic analysis without losing human
choices. Default gallery includes suppressed photos through expandable groups.
Manual choices survive expansion/reload and change grouped destination correctly.
Partitioned copy covers every inventoried member exactly once, keeps companions,
checks SHA, resumes safely, rejects destination/path tampering and does not write source.

## Comments
2026-11-11: User requests automated personal tool and authorizes read-only originals
for tests, never original moves/deletions during development.

2026-11-11: User further confirms individual shots and bursts must share one automatic flow. Mode selector hidden and automatic batch/unique handling replaces saved album mode. Implemented and verified:148 Node,66 Mac browser (1 existing optional skip),26 built-subpath tests;33 real sample members copied/verified in disposable OPFS, all2213 original hashes/sizes/mtimes unchanged, test profile removed. Native external move and production merge remain separate limitations.
