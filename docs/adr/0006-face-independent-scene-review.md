# Face-independent review stacks and adjustable recommendations

Status: Accepted for implementation, 2026-11-11 JST.
User requests broader photographic groups, adjustable fewer/more candidates,
clear group/selected counts, keyboard auto-advance and Shift thumbnail ranges.

Extend the existing jsfeat sceneFeatures/Photo-Curator reciprocal ORB method to
420px cached thumbnails for all supported images, regardless of usable faces.
Version this scene evidence independently of FaceMesh, so verified beta.5/6 face
and pixel caches can be supplemented without model inference or original edits.
No library/model/backend/native helper is added. Model failure still permits scene
review when preview evidence is available; absent evidence falls back safely.

A broader review pair requires finite EXIF capture times within30s, compatible
aspect difference<=.08, global pHash distance<=24 and reciprocal ORB>=.30. For <=2.5s captures only,
review stacks may instead use pHash<=32 and ORB>=.18 to tolerate small subjects
and handheld reframing; automatic exclusion remains protected. Keep
complete-link/30-member cap and protected/manual split guards. This intentionally
groups nearby variations of a scene, not proven identical actions. Uncertain wide
scene alternatives remain protected; technical representatives use the existing
focus ordering. Keep bracket/panorama/edit-version protections and human override.
This extends ADR0005's narrower scene grouping by explicit user request.

Reuse existing compact/standard/loose and portraitKeep1–3 through one slider;
preserve human labels, invalidate accepted output when settings/algorithm change.
Keep the existing multiple-representative view, label every collapsed group card
with total/selected counts and expand action. No pagination or person/mode switch.

Keyboard1/2/X/3 persist then advance one item of the full viewer order; failed
writes remain on the current image and restore the decision. Ignore held repeats.
Shift range uses the current full filtered thumbnail order across render windows,
including endpoints, without silently selecting hidden stack members. Hash all
range sources first, commit once, and undo the range as one operation. No file
operation happens until the existing independent-target copy confirmation.
