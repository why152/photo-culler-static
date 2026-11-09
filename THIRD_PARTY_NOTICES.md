# Third-party notices

Pinned runtime dependencies (no remote CDN or model downloads):

| Package | Version | License | Local notice |
|---|---|---|---|
| hash-wasm | 4.13.0 | MIT | [license](docs/licenses/hash-wasm.txt) |
| exifr | 7.1.3 | MIT | [license](docs/licenses/exifr.txt) |
| @stabilityprotocol.com/phash | 1.0.0 | MIT | [license](docs/licenses/phash.txt) |
| Vite (build only) | 8.3.6 | MIT and bundled notices | [license](docs/licenses/vite.txt) |

hash-wasm embeds its WASM binary into bundled JavaScript; there is no separately
fetched `.wasm` URL. exifr and pHash run in a local dedicated Worker. No models
are installed or downloaded. MediaPipe is deferred because its telemetry gate
has not been passed; embedding is deferred without a verified licensed small
model and measured recall improvement. browser-fs-access is not installed because
native read-only import is sufficient for this desktop baseline.

Existing viewer, CPU quality analysis, caches and journal implementation are
reused. No implementation or assets copied from Pixo (GPL-3.0), competitor apps,
or compare-image. No repository-wide license has been invented: this repository
had no root LICENSE at the baseline. The third-party licenses above remain in
force independently of the owner's choice of license for project code.
