# Publish verified static application

Status: Complete
Blocked by: 01-real-directory-acceptance

## Acceptance

- Publish only after real-directory acceptance passes and required regressions remain green.
- Commit the verified source and push to the existing repository; observe the Pages workflow result for that revision.
- Verify the HTTPS entry page and changed JavaScript modules correspond to the published revision.
- Record the deployed revision and workflow evidence without private photo details.

## Comments

- 2026-11-08: User authorized deployment conditional on successful real-directory verification. Supervisor owns Git changes and publication; deployment has not yet occurred.
- 2026-11-08: Supervisor published application revision `04f9b6d743df512f077a8a4e85aba7c7b82072f7`. [Pages workflow 42475688418](https://github.com/why152/photo-culler-static/actions/runs/42475688418) succeeded and the [HTTPS site](https://why152.github.io/photo-culler-static/) served all 12 checked core HTML/JavaScript/CSS resources with HTTP 200 and SHA-256 values identical to the local revision. A live-site Chrome smoke test using three generated JPEG photo groups passed analysis, full-resolution Photo viewer and review decision/undo with zero renderer errors. Local evidence is in ignored `output/pages-verification.json` and `output/pages-smoke.json`; private source photos were not used for the live-site smoke test.
