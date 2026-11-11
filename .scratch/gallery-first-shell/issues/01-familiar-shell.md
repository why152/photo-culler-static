# Photo-first controls and viewer actions
Status: Done
Blocked by: None for implementation; PR10 merge approval remains pending

## Acceptance
Basic view shows folder picker or photos rather than wizard/dashboard. Folder
switching and return from export are obvious. Viewer keep/exclude/navigation work
by mouse and keyboard. Advanced controls remain reachable. No model, ranking,
source permission, acceptance or copy safety change. Synthetic visual QA and
existing advanced/default-flow tests pass.

## Comments
2026-11-11: User explicitly says1.0 was good and rejects confusing feature-heavy UI.

2026-11-11: Implemented photo-first toolbar, hidden wizard/statistics, basic filter buttons, visible viewer navigation/decisions and return from export. Built subpath browser suite: 23 passed. Production remains unchanged pending merge authorization.
