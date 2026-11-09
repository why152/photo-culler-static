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
