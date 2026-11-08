# Real camera directory acceptance and Pages release

Status: In progress
Blocked by: None

## Goal

Validate the current performance follow-up against a user-authorized real camera directory, then publish the verified application to the existing GitHub Pages site. Keep source photo groups unchanged and retain only anonymous acceptance statistics in versioned documentation.

## Acceptance

- Exercise all 764 JPEG analysis sources without resizing or re-encoding the input bytes. The source directory contains 764 matching RW2 members; JPEG sources total 8,769,927,680 bytes and RW2 members total 17,905,504,256 bytes.
- Distinguish isolated-copy/OPFS acceptance from native directory-picker and real-source filesystem performance. Record copied member coverage explicitly.
- Verify cold analysis, warm cache reopening, Photo viewer navigation, review decision undo, and review-position restoration without renderer errors or outbound photo requests.
- Perform any movement/restoration acceptance only on isolated copied photo groups; do not move or modify the source directory.
- Record source-integrity checks and measurement scope. Exclude private directory paths, file names, photo pixels, and photo-derived screenshots from versioned records.
- After acceptance passes, commit and publish the static application through the existing Pages workflow, then verify the published revision and HTTPS resources.

## Comments

- 2026-11-08: User authorized testing a specific real directory and deploying if no problems are found. Supervisor delegates test implementation and documentation; supervisor owns final review and publication. The previous synthetic follow-up passed 96 unit tests and 64 Chrome tests, with one opt-in benchmark intentionally skipped.
- 2026-11-08: Chrome's isolated OPFS acceptance environment has a 10 GiB quota; the attempted test quota override did not increase it. Acceptance therefore copies all 764 JPEG analysis sources with their original bytes (8,769,927,680 bytes), plus one actual matching RW2 member (approximately 23 MB), for 765 copied files. Cold/warm analysis covers all 764 photo groups; movement/restoration covers the one copied real JPEG/RW2 photo group. The other 763 source RW2 members are checked for unchanged size and modification time but are not copied or moved. The source directory remains unchanged. Results are pending.
- 2026-11-08: Real-directory acceptance completed and independently verified: all 764 JPEG analysis sources readable, cold completion 107.06 s, warm completion 321.8 ms with 764/764 cache hits, no renderer/cache errors or nonlocal requests. Navigation, decision/undo, viewer restoration, tail virtualization and isolated paired-group move/restore passed. All 1,528 source file sizes/mtimes and three sampled source hashes were unchanged. See docs/research/real-directory-acceptance.md for anonymous evidence and OPFS coverage limits. Issue 01 is complete; overall release remains in progress until actual Pages publication and HTTPS revision verification succeed.
