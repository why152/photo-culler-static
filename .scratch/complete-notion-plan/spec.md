# Complete frozen Notion plan and deploy
Status: In Progress — independent acceptance pending
Source: https://app.notion.com/p/413d0befadbd8126b9a9cda079c62a01

User explicitly requires all plan work, tests and deployment, not just a running
Beta. Functional release d447712 is deployed; green CI is not full acceptance.

## Coverage and remaining work
- P1 snapshots/undo/persistence/invalidation: implemented; dist acceptance and changed-source cases pass.
- P1 compact burst defaults preserve saved choices: implemented and tested.
- P1 filtered paging: 90-of-120 favorite fixture wraps60→30→60, passed.
- UI shortcuts/help/fullscreen/44px/focus/<1100 survey/reduced motion: implemented;
  current dist interaction tests pass. Fullscreen uses document root, not dialog.
- Similarity types/version candidates/resolution/special-sequence protection:
  implemented conservative rules, actual resize/recompression/crop fixtures pass.
  Semantic identity/artistic intent without reliable evidence remains unknown.
- Full review CSV, confirmation/cancellation, resume, overlap/permissions/conflicts:
  tested; 35 native Mac output files SHA-verified on disposable copies.
- Linux Chrome and Windows Edge final PR/push CI passed116Node+63browser+12dist
  per platform,3existing optional/platform skips. Native Windows disk proof is absent.
- AI proxy labeling complete1141/1233,92 uncertain; 75.26% automatic moment recall
  does not pass95%; human preference/effort acceptance remains open.
- Models explicitly deferred under section0 gating, not marked as implemented.
- PR#3 P1 repair and PR#4 label-backup recovery are merged and deployed.
  Functional release d447712 / Pages run42725568665 succeeded. Actual HTTPS
  backup roundtrip, source/copy SHA, legacy entry and network checks passed;
  Notion sections12–13 updated. No engineering deployment remains pending.
- Remaining independent human/conditional platform/cache evidence is tracked in
  issues/04-independent-acceptance.md; it is not substituted with AI proxy labels.

## Comments
Earlier reports overstated engineering completion. Each criterion now needs a
linked test/result or an explicit unresolved gate. Human preference labels have
been requested; no metrics will be invented if labels are unavailable.

2026-11-10: Explicit user authorization used AI vision for most label preparation.
Both proxy runs verified all2466 original files unchanged. Local label JSON and
per-file reports are ignored; only aggregate evidence committed. Real native Mac
picker copy verified60 originals unchanged and35 complete output members. Do not
narrow full acceptance to tests green; independent human and missing native
Windows/removable-device gates remain open after engineering deployment.

## Verified runtime evidence (2026-11-10)

- Functional commit: `d447712aa45c8b9e86839f9c9b47341dfd459db6` (PR#4).
- Deploy: https://github.com/why152/photo-culler-static/actions/runs/42725568665
- PR CI: https://github.com/why152/photo-culler-static/actions/runs/42725087947
- Push CI: https://github.com/why152/photo-culler-static/actions/runs/42725056008
- HTTPS JS SHA256: `13ee94fc5a281ab25ede51648ad98d7f351a03eb91fe554a266b1615efbc78de`.
- Local116Node/65Chrome/12dist passed;1existing optional benchmark skipped.

Documentation-only reconciliation does not change this runtime artifact. Newest
workflow/deployment state is authoritative in GitHub; these immutable references
prove the functional release without treating later documentation commits as new
photographic-quality evidence.

## Current personal scope, 2026-11-10

The historical evidence above is superseded for platform scope by ADR 0003: user
Mac Chrome only; Windows/Edge are no longer delivery blockers. Current deployed
baseline is 5e7ea56 (PR 8), Pages 42776651496. Independent frozen beta.4 study
now passes 68/70 merged and 72/73 union AI-proxy moment recall on 500 SHA-disjoint
JPEGs; all 2213 sources unchanged. This is not human quality/effort acceptance.
Opt-in local effort observation is implemented and tested on the current branch;
actual user observations remain open. See mac-chrome-personal-validation tracker
and docs/research/culler-2-mac-independent-study.md.
