# Automatic personal workflow verification

2026-11-11, personal Mac + Chrome only; implementation in PR11, not deployed.
User clarification replaces optional portrait activation and shortlist-first UI.
Existing TFJS FaceMesh, jsfeat ORB, conservative batches and verified copy journal
are reused. No competitor re-research or new runtime stack.

## Behavior

Choose folder → automatic analysis → all-photo gallery. Already recognized exact
and burst batches collapse to selected representatives. Expand to see every member,
change decisions and collapse again. Automatic selections are marked; human choices
survive reload. No portrait switch, tutorial panels or model terminology on the
primary surface. Unsupported/model-failed sources remain reachable with safe rules.

Organize → independent destination picker → final confirmation. Default output
copies all inventoried members into 已选/待复核/未选 with relative paths and companions.
Cancel before confirmation writes nothing. Layout/selection changes invalidate prior
acceptance. Legacy Keepers-only exports and interrupted reports remain compatible.
A known analyzed source SHA now also rejects changes preserving size and timestamp.

Chrome's [official File System Access documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
says external moves require a flag. OPFS move support is insufficient external proof.
No external native move is claimed/enabled. The UI explicitly says copy and originals
remain; no source removal, native helper, experimental flags or copy/delete fallback.

## Evidence

- 148 Node tests; 66 retained Mac Chrome regressions pass (1 existing optional skip); syntax check for55 JavaScript files. Built-subpath suite26 tests
  covers fresh automatic defaults, no pre-folder model load, old portrait=false / album
  session migration, missing-model fallback, collapsed/expanded/manual choices,
  all-member partition, cancel-before-write, reload, source integrity and old exports.
- Real authorized folder:33 file sample /31 photo groups,29 image analyses,4 protected
  video-containing groups. Whole-folder SHA,size,mtime,path check covers all2213
  originals (18,630,417,981 bytes), not just the sample. Sample uses original bytes
  only through File inputs; all writable handles belong to a fresh temporary OPFS
  profile. All33 output files re-read and hashed against original baseline; correct
  partition paths and companion completeness verified. All2213 originals unchanged,
  zero observed page errors or external requests; temporary source/output copies
  removed. No original photos or screenshots committed.
- Observed first analysis7.13s, warm reopen0.84s on this selected sample; these are
  functional measurements, not a full-folder performance guarantee. No new personal
  accuracy/effort claim. Full1655-source portrait ranking evidence and the six extra
  folded AI-proxy-wanted frames at budget1 remain in the prior portrait report.
- Receipt stays local under ignored output/automatic-workflow/real-receipt.json.
  Publication/remote CI evidence belongs to the PR; local success is not deployment.
