import { ALGORITHM_VERSION } from "./cull-session.js";
import { publicManifest } from "./cull-export.js";
export function planSignature(plan, groups) {
  return JSON.stringify({
    algorithmVersion: ALGORITHM_VERSION,
    includeProtected: plan.includeProtected,
    layout: plan.layout ?? "keepers",
    preferences: plan.preferences,
    groups: plan.groups,
    inventory: groups.map((g) => [g.id, g.fingerprint, g.sourceSHA ?? null]),
  });
}
export function acceptPlan(plan, groups) {
  return {
    version: 1,
    signature: planSignature(plan, groups),
    plan: structuredClone(publicManifest(plan)),
  };
}
export function acceptanceMatches(accepted, plan, groups) {
  return (
    accepted?.version === 1 &&
    accepted.signature === planSignature(plan, groups)
  );
}
export function defaultStrength(mode, saved) {
  return saved ?? (mode === "album" ? "standard" : "compact");
}
export function nextPageOffset(offset, total, limit = 60) {
  return offset + limit >= total ? 0 : offset + limit;
}
