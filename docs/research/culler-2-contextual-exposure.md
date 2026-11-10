# Low-key representatives: beta.4

2026-11-10. Baseline beta.3 is frozen in `scripts/baselines/cull-ranking-beta3.mjs`.
The user asked to continue toward recall and review-effort goals. Architecture,
complete-link/2.5s/30-frame limits, copy safety and model gates remain unchanged.

## Diagnosis and fixed change

On frozen multi-agent labels,21 of139 important moments lacked an automatic
candidate:18 remained visible/protected, all with low absolute exposure scores;
3 were folded. Loosening Top-K recovered only1 moment and expanded the visible
queue704→898. Bypassing exposure checks for focus-pass images reached136/139,
but increased hidden wanted frames114→157. That counterfactual was rejected.

Beta.4 reuses the existing bounded1024px grayscale and pinned upstream coherent
focus method. A small histogram adds clipping fractions, midtones and luminance
percentiles; legacy sharpness/exposure scores are unchanged. Eligibility was fixed
before real analysis: black clipping35–96%, white clipping<=10%, >=2% midtones,
95th-to5th percentile span>=24, strong focus with >=4% sharp tiles and >=2.5%
connected sharp region (the existing upstream bokeh minima). These indicate
visible structure, not scene intent or artistic value.

Only a batch with no existing automatic candidate can nominate one eligible
low-key representative, using existing within-burst quality order. Other protected
frames stay protected; a prior candidate is never displaced. Brackets, versions,
panoramas, unsupported inputs, failed/missing metrics, blackout/whiteout, blur
and sparse hot pixels retain protection. New nominations have low confidence
and an explicit low-exposure explanation. Every previously visible frame remains
visible, independent of proxy labels. No broader suppression is introduced.

Algorithm beta.4 invalidates machine caches and old accepted plans; human choices
remain independent. The built-page test covers beta.2 and beta.3 plan upgrades.
Old studies remain downloadable; raw AI drafts can be imported by source SHA.

## Frozen comparison

Fresh local Worker analysis of all1233 JPEGs; matching RW2 files were not decoded.
All2466 original paths, SHA-256,size andmtime were unchanged before/after. No
source write handles, export, moves, deletion, page errors or external requests.
Cold analysis213.25s, of which focus+histogram10.55s; observational timing only.
Private per-file evidence remains in ignored `output/contextual-exposure-camera.json`.

The multi-agent draft hash remains
`e50d0e222d321343eaef0306a738a860211726a511c1c05d8229bcd79a6b79b3`;
the old single-agent draft remains unchanged. All1233 baseline beta.3
recommendations exactly match the prior analysis despite the new pixel evidence.

| Frozen label set | beta.3 automatic moments | beta.4 automatic moments | Visible moments, both | Hidden wanted frames, both |
|---|---:|---:|---:|---:|
| Multi-agent merged | 118/139 (84.89%) | 136/139 (97.84%) | 136/139 | 114 |
| Any-positive stress | 122/140 (87.14%) | 140/140 (100%) | 140/140 | 175 |
| Historical single-agent | 150/190 (78.95%) | 181/190 (95.26%) | 187/190 | 85 |

Exact merged wanted-frame selection120→144/301, stress171→213/457, historical
86→109/228. All previous automatic selections persist. There are124 additional
low-key representatives: automatic384→508, protected320→196, folded529 unchanged.
The visible queue stays704,42.90% fewer than1233; this is not70% human savings.

These are retrospective AI proxy results on the same previously used camera
batch, not independent unseen/human validation. Labels, moment definitions and
thresholds were not changed to improve the measured result. Passing95% on these
proxies does not sign off Stable or prove expression/intent understanding.

## Review navigation and remaining effort target

An optional "技术疑难与低曝光代表" filter locates protected inputs plus new
low-key warnings. Explicit keep/exclude/favorite choices leave this subset;
"review later" stays. All other views, decisions and export plans remain available.
On the untouched camera session this subset has320 groups (25.95% of1233),
including the124 new low-key candidates; the default visible queue still has704.
This is a navigation aid, not proof that the remaining candidates need no review.
Neither this subset nor42.90% queue reduction is substituted for measured human
viewing/time savings. Actual70% effort acceptance and independent batches remain
open, as do conditional native-platform gates.

Local checks:131 Node,66 Chrome and16 built-dist tests pass;1 existing optional
benchmark skipped. Coverage includes clipping/flat/hot-pixel/missing-data cases,
protected peers, prior candidates, brackets/version/panorama and manual priority;
the built UI tests real Worker nominations and review filtering. CI/release
receipts are tracked in the PR. No runtime dependency or model was added.

Reproduce after build:
`node scripts/compare-upstream-focus.mjs SOURCE LABELS_JSON REPORT_JSON exposure`.
The reusable comparison asserts no new suppression and identical hidden-wanted
sets/visible queue, rather than checking recall alone.
