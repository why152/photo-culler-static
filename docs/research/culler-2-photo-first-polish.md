# Photo-first interaction polish

2026-11-11. User-approved direction: reduce visual and interaction burden after
shipping the automatic personal workflow. Personal Mac Chrome scope remains.
This is an interaction/presentation change, not a new ranking or model release.

- One44px selection toggle on the photo replaces the paired keep/exclude buttons
  in the basic gallery. It reflects effective selection; explicit user toggles
  reuse source SHA validation, decision history and per-folder persistence.
- Low-key automatic/manual markers and a distinct review state accompany the
  toggle. Filenames become secondary, photos retain their complete composition.
- A stacked cover opens the group in place without selecting anything. Expanded
  members open the viewer, with a separate collapse control and group boundary.
  Paging and focus remain anchored to the group.
- The viewer uses the same toggle. Pending decisions are serialized; keyboard
  focus is restored after disabled controls/DOM refresh without stealing a newly
  chosen focus target. Advanced review/compare controls remain available.
- Reuses existing PreviewUrlPool, keeping only the current bounded60-photo page.
  Unchanged previews keep their URLs across choices, reducing image reloads.
- Organization shows the three destinations and total file size, then existing
  independent-target selection/final copy confirmation. No model/ranking/session
  format, original permission, partition, SHA or copy safety change.

Validation:148 Node tests and27 built-subpath browser tests, including a focused
keyboard/pending-choice/focus/preview-URL/narrow-layout regression. Synthetic visual
QA covers collapsed/expanded gallery, organization and390px layout with reduced
motion. Advanced controls and existing copy/migration/resume regressions retained.
Remote CI results belong to the PR rather than this local snapshot.

Read-only real-folder sample:33 files/31 groups in a fresh temporary OPFS profile,
29 images analyzed and33 output bytesets re-read against original SHA. Every2213
original file SHA,size,mtime,path unchanged; no observed page error/external request.
Temporary source/output profile removed. No original write handle or real-photo
screenshot/filename committed. No new personal accuracy or speed claim.

Implementation is reviewable before publication; this record does not imply a
new production deployment or Stable/human-preference acceptance.
