export const ALGORITHM_VERSION = "rules-2.0-beta.4";
export function migrateDecision(value) {
  return {
    decision:
      { pick: "keep", keep: "keep", reject: "exclude" }[value] ?? "unreviewed",
    favorite: value === "pick",
  };
}
export function outputDecision(human = {}, machine = {}) {
  if (human.favorite || human.decision === "keep") return "include";
  if (human.decision === "exclude") return "suppress";
  if (human.decision === "review_later") return "protected";
  return machine.plan ?? "protected";
}
export function setHuman(
  previous = {},
  decision,
  favorite = previous.favorite ?? false,
) {
  return { decision: favorite ? "keep" : decision, favorite };
}
// Migration is additive: the v1 record remains unchanged and independently usable.
export function migrateLegacy(review, groups, existing = {}) {
  const result = { ...existing };
  for (const group of groups) {
    const legacy = review?.decisions?.[group.legacyId];
    if (!result[group.id] && legacy)
      result[group.id] = {
        ...migrateDecision(legacy),
        fingerprint: group.fingerprint,
      };
  }
  return result;
}
export function validHuman(record, group) {
  return record?.fingerprint === group.fingerprint
    ? record
    : { decision: "unreviewed", favorite: false };
}
