# Photo Culler 2.0 mixed photo/video acceptance

Date: 2026-11-09 JST. Product code: 9292451 (same application as aba1bd9).
The user authorized another read-only real-directory test. Only temporary OPFS
copies were passed to the app; no original directory write handle was granted.

## Observed results

| Check | Result |
|---|---|
| Full source | 2,213 files, 18,630,417,981 bytes |
| Formats | 1,641 JPG, 19 JPEG, 5 PNG, 279 HEIC, 260 MP4, 9 MOV |
| Inventory | 1,950 groups, including 1,939 image analysis sources and 11 video-only groups |
| First-class decode | All 1,655 JPEG and 5 PNG analysis sources decoded; 5 extra JPEG files are same-stem companions |
| HEIC decode | 226 / 279 decoded; 53 unable to decode in this Chrome, protected rather than suppressed |
| Video safety | All 269 video-containing groups protected; includes 258 same-stem HEIC/MP4 pairs |
| Default recommendation | 1,353 include, 282 protected/review, 315 suppress |
| Unable-to-analyze groups | 64: 53 failed HEIC sources + 11 video-only groups |
| Default export plan | 1,353 groups / 1,357 physical files |
| Explicit protected inclusion | 1,635 groups / 1,897 files, 15,389,748,517 bytes |
| Export verification | All 1,897 hashes matched original baselines; no split same-stem companions; all 282 protected groups included |
| Cancel before writing | Target remained empty |
| Grid shell / cold completion | 0.361 seconds / 305.218 seconds (excluding fixture setup) |
| Cached reload | 57.373 seconds, successful output report retained |
| Viewer | Real image displayed and rendered native-pixel scale checked |
| UI bounds | 60 result cards at inspection |
| Page/resources/network | Zero page errors, failed resource requests or nonlocal/non-GET requests observed |
| Original integrity | All 2,213 original hashes, sizes, mtimes and file inventory unchanged |
| Cleanup | Entire temporary Chrome profile, fixture and exported copies removed |

Environment: macOS, Headless Chrome 157.0.0.0, Node 22.22.0, built dist at the
real `/photo-culler-static/` base on a loopback test origin. No quota override
was needed. Each fixture member was also hash-verified before application use.

## Safety and interpretation

This test deliberately checked **explicit** inclusion of protected files. The
default plan omits protected groups and lists them for the user; it does not
claim to have exported their photos. HEIC support varies by actual file: the
53 failures above are observed decode failures, not a claim that all HEIC is
unsupported or that those originals are corrupt. Their original bytes remain
available and were successfully copied when explicitly included.

The test harness now derives expected mixed-format groups, records decode
counts per format and verifies every companion instead of assuming JPEG/RW2.
Run with `node scripts/test-real-culler-2.mjs /path/to/authorized-directory output/mixed-acceptance.json`
after `npm run build`. The full local report is
`output/culler-2-photos-1-001-acceptance.json`, ignored by Git. No photos,
individual source paths or EXIF are uploaded in this aggregate report.

Default visible candidate/review count is 1,635 / 1,950 (83.85%); that is not a
measurement of actual manual work saved, and does not establish the 70% target.
No human preference labels, blinded recall test, external-disk native picker or
write test, Windows Edge acceptance or production release is implied. See also
the [earlier complete JPEG/RW2 test](culler-2-real-directory-acceptance.md).
