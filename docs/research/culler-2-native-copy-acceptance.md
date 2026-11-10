# Native directory copy acceptance (2026-11-10 JST)

macOS Google Chrome 157.0.8103.38, actual system directory picker and native
filesystem handles; loopback Vite production build. This is stronger than the
prior OPFS-only copy evidence, but is not yet a production HTTPS run, Windows
native filesystem acceptance, removable-drive or power-loss simulation.

A new disposable source folder contained 30 real JPEG/RW2 pairs copied from the
user-authorized camera batch, plus three test-owned XMP sidecars: 30 groups,
63 files. All copied original bytes were verified before testing. The application
was granted read-only access to this disposable folder, never the original.
A separate temporary target was selected through the actual system dialog.

Observed and independently checked:

- Default compact/burst analysis completed: 16 include, 14 suppress, zero failures.
- Accepting the batch visibly switched to export and saved 16 groups / 35 files.
- Denying target write permission left copy disabled; selecting the same target
  again and allowing permission succeeded without losing acceptance.
- Cancelling the separate copy confirmation created no target files/directories.
- A second explicit confirmation copied 35 original-byte files, then showed
  completion. The on-disk manifest has `status: completed` and algorithm
  `rules-2.0-beta.2`.
- Independent streaming SHA checks matched every output to its source copy;
  JPEG/RW2/XMP companion membership is complete for all 16 output groups.
- All 63 source-copy files remained present. The 60 true originals and their
  disposable copies retained SHA, size and modification time. Three sidecars
  were generated only in the disposable source and never added to originals.
- The review CSV includes all 63 physical members, including suppressed groups.

No original file was opened writable, renamed, moved or deleted. Native external
moves remain disabled; copy acceptance must not be generalized to move/restore,
real disk-full/device removal, or arbitrary platforms. Photos, filenames and
per-file manifest remain local; only aggregate evidence is published here.

## Actual production HTTPS follow-up

After PR#3 deployed main1adee7d, the same native picker workflow was repeated on
https://why152.github.io/photo-culler-static/ in a new temporary incognito window.
The disposable source still contained30groups/63members; a fresh independent
native target was used. Cancelling created nothing. Confirmed copy produced
16groups/35files; all streaming hashes matched, companions were complete, and
review CSV contained63members. All60 corresponding true originals and source
copies retained SHA,size,mtime. Temporary incognito window and both native
source/output fixture trees were removed after verification.

A separate synthetic HTTPS smoke copied4OPFS files with matching hashes, tested
acceptance invalidation/cancellation and the legacy route; no page errors, failed
resources or non-site/non-GET requests were seen. Deployed JS SHA matched the
verified local build; legacy/auto/robots/sitemap returned200.

The regular Chrome loopback test origin127.0.0.1:4181 could not be automatically
cleared because the browser security policy blocked internal settings access.
The user was asked to clear or explicitly retain only that test-origin cache.
No workaround was used, production user sessions were not cleared, and the
loopback test server was stopped. Physical test photos were removed independently.
