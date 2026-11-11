# Opt-in local portrait burst evidence

Status: Accepted for Beta implementation, 2026-11-11.
Source: user explicitly requested reuse, development, testing and deployment of
portrait-burst best-frame selection, retaining the static Mac Chrome scope.

Keep vanilla JavaScript, local Workers and independent original-byte copies.
Use official TFJS-converted face detection/FaceMesh v1 weights (Apache-2.0) with
TensorFlow.js4.22 WASM. The MediaPipe SDK is excluded by a build graph gate;
there is no tasks-vision, remote inference, helper process or React rewrite.
Upstream Facet/Selects supply the EAR, pose gates and bounded preference method;
Photo-Curator supplies ORB reciprocal-match confirmation, implemented by jsfeat.
Do not use the upstream InsightFace weights with different licensing constraints.

Explicit opt-in loads same-origin versioned model assets; normal review does not
load inference resources. 1600px bounded inputs with full-range face detection, max4 faces, single WASM thread,15s loading
timeout and128MiB tensor-storage stop. Missing resources/runtime failure preserve
ordinary rule recommendations. No face identity, emotion or demographic model.
Do not persist full landmarks or face crops; compact feature evidence stays in
the user's browser analysis cache, never uploaded. It can still be sensitive data.

The old2.5s/6-bit/30-frame grouping stays the default. Only opt-in burst mode may
use complete-link12s/30-frame same-scene groups, requiring usable faces, compatible
positions/sizes, aligned face appearance and, for wider hashes, upstream ORB
confirmation (mutual Hamming<40,agreement>=.30). This is a photographic similarity
heuristic, not proof of identity or semantic action recognition. Manual splits,
unsupported groups, bracket/panorama/version protection and human choices prevail.
The requested1–3 budget covers automatic candidates, not protected unknowns.

Upgrade to rules-2.0-beta.5, isolate/revalidate caches and invalidate old output
acceptance. Preserve human labels/favorites and legacy journals. Real proxy
results do not establish human95% recall,70% effort savings or Stable acceptance.
