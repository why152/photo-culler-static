# Photo Culler 2.0: independent sessions and copy-first output

Status: Accepted for Beta implementation, 2026-11-09 JST.
Source: https://app.notion.com/p/413d0befadbd8126b9a9cda079c62a01 (section 0).

Keep the vanilla static browser runtime. Vite 8.3.6 bundles `web/` into `dist/`
with `/photo-culler-static/` as base. No server, account, native helper or remote
inference. The new default page links to `legacy.html` for the original viewer
and v1 recovery journals. Existing regressions navigate to that retained page;
assertions remain, except the two explicitly changed contracts: read-only
permission and preserving the previous directory's review after switching.

IndexedDB v4 adds `cull-sessions`. Directory `isSameEntry` identities isolate
sessions; the last-directory record is a resume pointer, not the only review.
Migration is additive and repeatable. v3 analysis is not cleared on v4 upgrade.
Legacy decisions map pick→keep/favorite, keep→keep, reject→exclude. Human labels,
favorite, machine rank and export plan are separate. Metadata fingerprints and
content SHA revalidate human decisions/cache reuse; algorithm versions scope
cached results. Identity eviction must retain saved session namespaces.

One source root is recursively read. Pair only same-stem members in the same
relative directory. Unsupported image/video groups stay protected and visible.
No inference from downloaded mtime. Complete-link groups have a maximum 2.5s
span, pHash distance ≤6, and at most 30 items; exact equality uses same-size SHA.
These conservative thresholds are Beta defaults, not measured preference recall.

New output is copy only, to a separately selected non-overlapping target. A fresh
randomly suffixed output folder isolates each attempt. Native external moves are
disabled until platform proof; legacy OPFS recovery is retained. Never emulate
move by copy/delete or removeEntry. Source handles are never made writable.
MediaPipe and embedding remain absent until their privacy/model gates pass.
