# Contextual low-key candidate nomination
Status: Done (implementation and proxy comparison; independent acceptance remains open)
Source: User asked to continue toward95% recall/70% effort targets after diagnosis

Keep the frozen architecture and source/copy safety. Reuse the existing bounded
gray image and pinned upstream coherent-focus method. Add luminance histogram
evidence without changing legacy technical scores. Do not bypass exposure gates
globally: nominate at most one qualifying low-key candidate in a batch with no
existing automatic candidate. Keep every other protected frame protected.
Keep unsupported, blur, almost-black/white, missing-evidence, version, panoramic
and bracket protections. No new model/runtime dependencies or source writes.

Frozen beta.3 baseline and unchanged single-/multi-agent proxy labels. Fixed
eligibility before real analysis: strong coherent focus (existing upstream bokeh
minimum4% sharp tiles and2.5% connected region), black clipping35–96%, white
clipping<=10%, >=2% midtones and95th-to5th percentile span>=24. This demonstrates
visible structure, not artistic intent. Existing in-burst quality sorting picks
the representative; confidence remains low. Missing metrics fail closed.

Acceptance: no prior visible frame may become suppressed; source SHA/size/mtime/
inventory unchanged; automatic proxy moment recall improves on merged/union and
historical labels; no semantic/human95% or70% work-saving claim. Report queue
counts honestly even if unchanged. Version caches/accepted plans on adoption.
Reject broader suppression until independent evidence justifies it.

Implemented optional technical-review navigation (protected+low-key warnings,
explicit human decisions respected). Camera subset320 is not measured human effort.
Results: merged118→136/139; stress122→140/140; historical150→181/190, hidden
wanted sets unchanged. All2466 originals unchanged. 131Node/66Chrome/16dist
passed,1existing optional skip. CI/release evidence is maintained in the PR.
