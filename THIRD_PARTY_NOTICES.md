# Third-party notices

Pinned runtime dependencies (no external CDN; optional self-hosted models below):

| Package | Version | License | Local notice |
|---|---|---|---|
| hash-wasm | 4.13.0 | MIT | [license](docs/licenses/hash-wasm.txt) |
| exifr | 7.1.3 | MIT | [license](docs/licenses/exifr.txt) |
| @stabilityprotocol.com/phash | 1.0.0 | MIT | [license](docs/licenses/phash.txt) |
| Vite (build only) | 8.3.6 | MIT and bundled notices | [license](docs/licenses/vite.txt) |

hash-wasm embeds its WASM binary into bundled JavaScript; there is no separately
fetched `.wasm` URL. exifr and pHash run in a local dedicated Worker. No inference models load by default. The opt-in TFJS portrait path below uses
first-party pinned assets; MediaPipe SDK telemetry remains excluded, and semantic
embedding stays deferred without a verified small model and measured benefit. browser-fs-access is not installed because
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

## Optional portrait enhancement (beta.5)

The optional portrait Worker loads only first-party static assets. It uses
`@tensorflow-models/face-landmarks-detection`1.0.6, `face-detection`1.0.3 and
TensorFlow.js core/converter/WASM4.22.0 (Apache-2.0). Converted official model v1
weights are Apache-2.0, separately verified in the Kaggle model catalog. Sources,
byte sizes and SHA-256 are pinned in `web/public/models/portrait-v1/ASSETS.json`.
Full Apache notice: [TensorFlow](docs/licenses/tensorflow.txt). Peer SDK packages
may exist in the build installation; a Vite graph gate forbids MediaPipe SDK code
in either main or Worker runtime. No MediaPipe tasks-vision or remote telemetry.

- Facet38752c35f0d1403a7c4f041ad9682027faf5da2a:
  `analyzers/face.py:calculate_ear` and pose-based blink uncertainty;
  [MIT](docs/licenses/facet.txt).
- Selects60e5e825d431d0a09e923851e47183960bf9b0cf:
  `selects/ml/face_attributes.py`, EAR mapping, significant-face area and bounded
  eyes-open burst preference; [MIT](docs/licenses/selects.txt).
- Photo-Curator1cb56a07, `photo_dedup_batch.py:_orb_similarity`: reciprocal
  Hamming<40 matching and .30 confirmation. Existing Photo-Curator MIT notice.
- jsfeat0.0.8 supplies bounded corner/ORB extraction; [MIT](docs/licenses/jsfeat.txt).

468-point geometry and browser/WASM decoding differ from the upstream106-point
InsightFace/OpenCV implementations; no pixel parity or accuracy equivalence is
claimed. No InsightFace weights, Apple Vision, face recognition, emotion,
age/gender models or original-file actions are imported. Full notices ship in
`UPSTREAM_NOTICES.txt`. Older statements about models being deferred describe the
baseline; this opt-in TFJS path satisfies a separate gate (ADR0004).
