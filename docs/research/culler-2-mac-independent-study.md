# Mac Chrome: independent 500-JPEG proxy study

2026-11-10. Ranking remained frozen at rules-2.0-beta.4 throughout this study.
Personal platform: macOS 27.2 / Chrome 157.0.8103.50. See ADR 0003.

Before viewing or ranking, select five equally spaced 100-frame filename-order
spans from 1,655 eligible static JPEG groups in the second authorized directory.
Exclude video companions; SHA overlap with the 1,233-image camera study is zero.
The directory previously had functional tests, but no current tuning labels.
This tests JPEG ranking, not HEIC, video, the entire library or a new photographer.

Two fresh-context agents independently viewed all 500 derived previews without
machine recommendations, old labels or peer ballots. A: 214 keep / 282 optional /
4 uncertain; B: 208 / 291 / 1. A third agent adjudicated all 83 disputes (48 keep,
30 optional, 5 unresolved). Conservative merging preserves keeper objections:
218 keep / 249 optional / 33 protected. Union stress: 250 / 249 / 1.
All agents share a model family; these are AI proxies, not human preferences or
statistically independent observers. Previews cannot establish pixel-level focus.

Freeze labels before machine comparison: SHA-256
`240a361a5360a48bd8543eea8841cd669d75b94edeabdcfb4a931c8c0fec367b`.
Frozen at 2026-11-10T11:38:25.407Z. No thresholds changed after comparison.

| Metric | beta.3 comparison | frozen beta.4 |
| --- | ---: | ---: |
| Merged automatic moment recall | 67/70 (95.71%) | 68/70 (97.14%) |
| Union stress automatic moment recall | 71/73 (97.26%) | 72/73 (98.63%) |
| Visible moment coverage | 100% | 100% |
| Automatic candidates | 309 | 317 |
| Visible queue | 339 | 339 |
| Protected groups | 30 | 22 |
| Merged wanted frames automatically selected | 152/218 | 157/218 |
| Merged wanted frames folded | 51 | 51 |

Moment recall does not mean all wanted frames survive. Union stress has 62 wanted
frames folded. The 32.2% queue reduction and optional 30-group technical subset
are navigation statistics, not measured human effort savings or 70% acceptance.
Human confirmations: zero. Independent human quality and effort remain unproved.

The production Worker processed the selected sources read-only, with no observed
page errors or blocked requests. After all visual work and evaluation, all 2,213
source files matched initial SHA-256, size, mtime and path (11:43:19.587Z).
No source writes or photo exports occurred. Private labels, raw ballots, frozen
predictions and integrity receipts remain ignored under output/mac-chrome-study/;
photos, paths and EXIF are not published. Derived review sheets are disposable.
