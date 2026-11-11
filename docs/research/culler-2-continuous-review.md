# Continuous review and whole-folder burst audit

2026-11-11, personal Mac Chrome. User reports visually near-identical photos remain
separate and rejects pagination. Reuses existing grid window, URL pool, TFJS/ORB,
source checking, sessions and copy pipeline; no new runtime stack.

## Diagnosis and behavior

The reported four already belong to a7-frame internal batch. One resized distinct
capture made the whole batch same-image-version/protected; the gallery refused to
collapse that kind. Other cases have unstable detector counts/ordering and jitter
in aligned face pHash. This is broader than a filename exception.

- Related versions now form expandable review stacks. Edit/uncertain protection
  stays: only distinct EXIF capture times, a<=12s complete-link span and existing
  face/scene plus reciprocal ORB evidence can promote resized captures to bursts.
- A<=2.5s,global pHash<=12,ORB>=.5 match tolerates bounded face hash jitter with
  tighter geometry. Scene matches with uncertain face correspondence may select
  a technical representative, while alternatives remain protected, not suppressed.
  All-pairs matching,30-member cap,bracket/panorama/manual-split safeguards remain.
- No next-page button; the review/organize toolbar stays reachable while scrolling. GridRenderWindow gains variable-height rows for expanded
  headers, with viewport neighbors and retained preview URLs. Whole filtered
  order is reachable through scrolling and keyboard; viewer navigation crosses
  the DOM window and returns to its photo. Resizing preserves an anchor.
- beta.6 requires reacceptance, keeps human labels/favorites, and reuses verified
  beta.5 pixel evidence because model/features are unchanged. No model requests
  are needed for matching cached entries; SHA/fingerprint/version must match.

## Evidence and limits

154 Node tests,29 built-subpath tests. The synthetic2000-group test covers bounded
DOM, end/middle/back scrolling, Home/End,390px resize, distant manual decisions,
viewer return and a complete2000-group/2002-file output plan independent of the
rendered window. It also reuses beta.5 cache with model requests forbidden.

Read-only real sample:44 source-byte files/42 groups in disposable OPFS. The user’s
four are confirmed in one7-member group, with one automatic representative; all
44 outputs re-read against original SHA, companions intact. All2213 original files
retain SHA,size,mtime,path. Temporary copies/profile removed; no observed page errors
or external requests. No original photos, paths or private features committed.

Existing1655-source production JPEG features, same frozen inputs:1021→1017 batches;
automatic candidates998→996, suppressed579→458, protected78→201. Eight resulting
batches contain21 frames from previously separate batches; this is not a guarantee
that every visually similar action is recognized. Related version batches also
become review stacks, without relaxing uncertain-version exclusion protection.

Frozen500 AI-proxy regression (no relabeling, zero human confirmations): moment
recall remains68/70 (97.14%), visible moment coverage100%. Automatic wanted-frame
count150→148 (a2-frame regression); wanted frames automatically suppressed57→44,
as uncertain alternatives return to protection. Candidate count306→306; non-
suppressed count332→354 is a rule-state metric, not the number of collapsed cards
or measured human work. Do not turn these proxy figures into personal accuracy,
95% human recall,70% effort savings or Stable acceptance claims.

Private receipts live under ignored output/continuous-bursts/. Source/model failure,
large semantic pose changes and equal/missing capture times remain conservative.
Implementation evidence does not imply production deployment; CI belongs to the PR.
