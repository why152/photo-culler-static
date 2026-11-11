# Automatic personal workflow and organized copy

Status: Accepted implementation, 2026-11-11 JST; user clarification supersedes
optional portrait activation and shortlist-first presentation in ADR0002.

For this personal Mac Chrome tool, directory selection starts local analysis,
including the already gated TFJS/WASM portrait evidence, with no mode switch.
Existing safe models, resource limits, conservative grouping, unknown protection,
sessions and human-decision precedence remain. No backend, native helper or new
inference stack. Every photo group is reachable in the default gallery. Only
existing exact/burst batches collapse, with expandable members and visible selected
representatives; presentation never changes a decision.

Default output partitions every inventoried member by effective decision into
已选, 待复核 and 未选, preserving same-stem companions and relative paths. Keepers-only
export and version2 journals remain compatible. Layout participates in acceptance;
path validation, independent targets, unique attempt directories, source freshness,
SHA verification, explicit final confirmation and interruption recovery still apply.

The user wants automatic local moves. Chrome's documented external-file move API
still requires a flag; the existing OPFS capability does not prove external moves.
Use explicit copy fallback, never copy/delete emulation or write access to original
source handles. Do not introduce a native helper or request experimental flags.
See [Chrome File System Access documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).
Development tests grant write access only to temporary copies and outputs; all
originals are read-only and checked before/after.
