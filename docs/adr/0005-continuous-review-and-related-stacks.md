# Continuous review and related photo stacks

Status: Accepted for implementation, 2026-11-11 JST, user requested removal of
pagination and whole-folder improvement for near-identical burst grouping.

Reuse the existing1.0 GridRenderWindow and PreviewUrlPool. Extend the window with
variable-height row offsets for expanded group headers; keep the full filtered
queue in memory, bound DOM/URLs to viewport neighbors, and preserve keyboard,
resize/group anchors and viewer return. No new UI framework or inference stack.
Viewport membership never limits the folder-wide copy plan.

Grouping and automatic exclusion are separate: related edit versions may be
collapsed for review while all stay protected. A short, complete-link batch of
distinct capture times with matching face/scene and reciprocal ORB evidence may
be an actual burst despite resized files. Equal/missing times remain protected.
Strong very-close full-scene matches can tolerate bounded face-hash jitter;
fluctuating face counts may form a scene stack with a technical representative,
but uncertain alternatives stay protected. No facial identity claim.

Retain complete-link,30-member cap,12s outer portrait window, strict scene-only
2.5s/global pHash<=12/ORB>=.5 gates, manual split, panorama/bracket and unsupported
protection. beta.6 invalidates accepted plans while retaining human choices.
Pixel/model pipeline is unchanged: verified same-directory beta.5 cache entries
may be reused only with matching fingerprint, source SHA and portrait version.
Originals remain read-only and output remains explicitly confirmed verified copy.
