// A navigation aid, not a claim that all other candidates are error-free.
export function needsTechnicalReview(group, machine = {}, human = {}) {
  if (human.decision === "review_later") return true;
  if (human.favorite || ["keep", "exclude"].includes(human.decision))
    return false;
  return (
    group.protected ||
    !group.hash ||
    machine.plan === "protected" ||
    machine.qualityFlags?.includes("low-key-candidate") === true
  );
}
