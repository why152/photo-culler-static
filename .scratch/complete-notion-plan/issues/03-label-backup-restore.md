# Restore local label backups safely
Status: Done
Blocked by: None

## Acceptance
Downloaded study JSON can restore progress after browser state loss, only against
the same source identity and algorithm. Preserve AI-assisted provenance and frozen
settings; invalid imports and declined replacements leave current work unchanged.
Human decisions/favorites and accepted export plans remain independent.

## Comments
Final audit found exported studies were not accepted by the existing AI-only
import field. This would strand human confirmations after clearing browser data.
Add exact-identity restore, overwrite confirmation, frozen-setting provenance and
roundtrip/source-change tests without introducing runtime dependencies or uploads.

Local acceptance proven:116Node+65Chrome+12dist pass,1optional skipped. Browser
roundtrip verifies backup after study loss, invalid/declined import preservation,
AI provenance/settings, human/acceptance isolation, quota-failure rollback/retry.
Code behavior complete; parent goal retains CI/deployment and human/platform gates.

Release evidence: PR#4 merged as d447712; Pages42725568665 and both Linux/Windows
CI runs42725087947/42725056008 succeeded. Actual HTTPS downloaded-study reimport
preserved AI provenance, burst/compact settings and acceptance status. The prior
parent note about pending deployment is superseded by this verified record.
