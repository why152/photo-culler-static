# Photo Culler 2.0 real-camera copy acceptance

Date: 2026-11-09 JST. Code tested: aba1bd948c641f483638e66df823bc17898a28ee.
User explicitly authorized read-only testing of their camera directory. No source
directory handle was given to the app: the local file input only read originals,
and every application write used a fresh temporary Chrome OPFS profile.

## Evidence

| Check | Observed result |
|---|---|
| Complete source inventory | 2,466 files: 1,233 JPEG + 1,233 RW2; 43,287,426,048 bytes |
| Isolated fixture | All 2,466 copied byte-for-byte and SHA-256 checked against originals |
| Decode | 1,233 / 1,233 JPEG; zero unreadable groups |
| EXIF | Original capture timestamps and subsecond tags present in all 1,233 analysis records |
| Machine plan (standard/burst defaults) | 531 include, 340 protected/review, 362 suppress |
| Logical clustering | 520 clusters, 312 multi-frame clusters; largest 20 frames |
| Visible DOM | 60 cards maximum at the inspected result page |
| First grid shell | 0.432 seconds (not a measurement of first decoded thumbnail) |
| Cold complete analysis | 220.213 seconds, excluding fixture copy/hash verification |
| Cached reopen | 43.190 seconds, including content revalidation and session reload |
| Viewing | Real JPEG displayed; on-demand native-resolution image loaded above preview size |
| Cancel before write | Target still empty after canceling confirmation |
| Copy export | 531 complete groups, 1,062 files, 19,010,745,856 bytes |
| Export integrity | All 1,062 output hashes equal the baseline original hashes; JPEG/RW2 companions complete |
| Session | Reload/reopen completed; successful export report persisted |
| Privacy/resources | Zero page errors, failed resource requests or nonlocal/non-GET requests observed |
| Original protection | All 2,466 hashes, sizes, mtimes and file inventory identical before/after |
| Cleanup | Entire temporary Chrome profile, fixture copies and exported copies removed |

Environment: macOS host, Headless Chrome 157.0.0.0, Node 22.22.0; built `dist/`
served at its actual `/photo-culler-static/` base on a loopback test origin.
The complete local report is `output/culler-2-real-acceptance.json` (ignored by
Git). No real photos, individual file paths, EXIF or original-byte copies are
committed or uploaded. Only aggregate results are shared here.

## Test-harness correction

The first two attempts stopped before copying because the harness treated
`navigator.storage.estimate()` as a hard quota. Chrome reported approximately
10 GiB there, while DevTools `Storage.getUsageAndQuota` reported an actual
296,630,877,388-byte quota. The completed run needed **no quota override**.
The harness now checks actual test quota with CDP. Original integrity was also
verified after the aborted attempts. See [Chromium policy documentation](https://chromium.googlesource.com/chromium/src/components/policy/+/b8e7e44318f442747ca9b3d38edde021a254ac1e/resources/templates/policy_definitions/Miscellaneous/StaticStorageQuotaEnabled.yaml)
for the static estimate behavior and [CDP storage API](https://chromedevtools.github.io/devtools-protocol/tot/Storage/).

## Reproduce safely

```sh
npm run build
node scripts/test-real-culler-2.mjs /path/to/authorized-camera-directory output/culler-2-real-acceptance.json
```

The script refuses a report destination inside the source, rejects symbolic or
special entries, hashes originals before/after, writes only test-owned OPFS and
an external report path, blocks nonlocal page requests and cleans its own profile.
Allow enough free disk for the full source fixture plus selected export. The
manual integration test is intentionally excluded from CI: it requires explicit
user authorization and locally available camera files.

## Remaining acceptance boundaries

This is real-image **functional and integrity** evidence, not a blinded preference
quality benchmark. There are no human preference labels, so important-moment
recall, false suppression and time saved are unknown. The default result contains
871 candidate/review groups (531+340), 70.64% of the input; that is only a visible
count proxy, not measured human effort, and does not demonstrate the 70% reduction
target. Standard recommendations remain conservative and need human assessment.

The original source directory was read only, and all copying used OPFS fixtures.
Native external directory picker permissions, external disk copy/move/restore,
Windows Edge, physical power loss and device removal were not exercised. No
production deployment, automatic source modification or Stable claim follows.
