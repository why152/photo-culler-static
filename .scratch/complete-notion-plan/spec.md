# Complete frozen Notion plan and deploy
Status: In Progress
Source: https://app.notion.com/p/413d0befadbd8126b9a9cda079c62a01

User explicitly requires all plan work, tests and deployment, not just a running
Beta. Existing main de8ca04 is deployed; green CI is not full acceptance.

## Coverage and remaining work
- P1 acceptance snapshot, undo, persistence, invalidation: implementation under test.
- P1 compact burst default preserving saved choices: implementation under test.
- P1 filtered paging: pure logic fixed; real multi-page regression needed.
- Native UI shortcuts/help, 44px controls, <1100px survey fallback, reduced motion:
  audit and repair new UI; original v1 regressions remain.
- Distinguish exact/near edit/burst/unique/unknown; conservative special-sequence
  protection; cover resized/recompressed/cropped, missing subsecond and time vs mtime.
- Export full review CSV, plan invalidation during confirmation, interrupted resume,
  source/target overlap, permissions and space errors; preserve original bytes.
- Native external disk copy with disposable files (not originals), Windows Edge
  platform testing, actual human quality labels: separate from OPFS evidence.
- Models: explicitly deferred under section 0 gating, not silently marked complete.
- Final full CI, real HTTPS verification, authorized deployment and Notion sync.

## Comments
Earlier reports overstated engineering completion. Each criterion now needs a
linked test/result or an explicit unresolved gate. Human preference labels have
been requested; no metrics will be invented if labels are unavailable.
