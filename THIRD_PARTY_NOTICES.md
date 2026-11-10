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
reused. The additional focus adapter ports these MIT numerical functions:

| Source | Pinned commit and functions | Full notice |
|---|---|---|
| [Photo-Curator](https://github.com/kotyzap/Photo-Curator/blob/1cb56a07a9ed3bff7e3d3f93a9305c31d1cd6e52/photo_ranking_v3.py) | `1cb56a07a9ed3bff7e3d3f93a9305c31d1cd6e52`, `_sharpness` normalization | [MIT](docs/licenses/photo-curator.txt) |
| [OpenPhotoCull](https://github.com/zwoodard/OpenPhotoCull/blob/8824c83b8b2dce461e1d33f0ac77e0d7168d5053/src-tauri/src/commands/scan.rs) | `8824c83b8b2dce461e1d33f0ac77e0d7168d5053`, `compute_blur`, `largest_cluster_size`, `exif_intent` | [MIT](docs/licenses/openphotocull.txt) |

Browser decoding, luminance conversion and border handling differ from the native
pipelines; this is a port of the numerical methods, not a pixel-identical native
application. No upstream native/Apple Vision model, deletion or duplicate-chain
implementation is used. Full MIT notices ship in `web/public/UPSTREAM_NOTICES.txt`
and the built site's `UPSTREAM_NOTICES.txt`.

No implementation or assets copied from Pixo (GPL-3.0) or compare-image.
No repository-wide license has been invented: this repository
had no root LICENSE at the baseline. The third-party licenses above remain in
force independently of the owner's choice of license for project code.
