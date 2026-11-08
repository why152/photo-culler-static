# Real directory acceptance

Status: Complete
Blocked by: None

## Acceptance

- Use original JPEG bytes from every authorized analysis source in an isolated acceptance environment.
- Verify cold/warm analysis, Photo viewer and review continuity, error/network boundaries, and source integrity.
- Document exactly which companion members and recoverable file actions are exercised.
- Keep private source details and image artifacts out of tracked files.

## Comments

- 2026-11-08: Test implementation delegated to the real-photo acceptance agent. Results and coverage limits await supervisor verification.
- 2026-11-08: Isolated OPFS quota limits copied coverage to every original-byte JPEG (764) and one actual matching RW2 (765 files total). All 764 photo groups receive cold/warm analysis; recoverable movement/restoration exercises the copied JPEG/RW2 group. The other 763 RAW members are excluded from copying and movement, with source size/mtime checks retained. This does not validate native directory-picker permissions or full-source filesystem throughput. Acceptance is running; no pass or release is recorded yet.
- 2026-11-08: Supervisor verified the completed real-directory run: cold first grid 115.6 ms, first preview 304.0 ms, completion 107.06 s; warm completion 321.8 ms with 764 hits and zero misses. No unreadable sources, renderer/cache errors, or nonlocal requests. Navigation, decision/undo, viewer restoration, tail virtualization, and the copied real paired-group move/restore passed. Source size/mtime checks covered all 1,528 files; three sampled source and restored-copy hashes matched. Isolated copies were removed. Anonymous evidence and scope limits are in docs/research/real-directory-acceptance.md. Deployment remains pending under issue 02.
- 2026-11-08: Separate exact-pair OPFS acceptance passed: matching JPEG/RW2 stem, confirmation of one photo group/two files, review batch with two members plus movement journal, and both member hashes matching after movement and restoration. Both source hashes remained unchanged. Anonymous details are included in the report; no private stem is recorded.
