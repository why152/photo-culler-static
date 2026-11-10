// Development-time proxy-study tooling. Never imported by the production website.
import assert from "node:assert/strict";
export function validateBallot(
  frames,
  rows,
  { partial = false, adjudicator = false } = {},
) {
  const ids = new Set(frames.map((f) => f.id)),
    result = new Map();
  assert.equal(ids.size, frames.length, "Duplicate manifest ID");
  const positions = new Map(frames.map((f, index) => [f.id, index]));
  for (const row of rows) {
    assert.ok(ids.has(row.id), "Unknown photo ID");
    assert.ok(!result.has(row.id), "Duplicate photo ID");
    assert.ok([true, false, null].includes(row.mustKeep), "Invalid label");
    assert.ok(
      typeof row.reason === "string" && row.reason.trim(),
      "Missing visual reason",
    );
    assert.ok(
      ["high", "medium", "low"].includes(row.confidence),
      "Invalid confidence",
    );
    if (!adjudicator) {
      assert.ok(ids.has(row.moment), "Invalid moment identity");
      assert.ok(
        positions.get(row.moment) <= positions.get(row.id),
        "Moment cannot start after photo",
      );
    }
    if (adjudicator)
      assert.ok(
        [true, false, null].includes(row.momentBreakBefore),
        "Invalid boundary decision",
      );
    result.set(row.id, structuredClone(row));
  }
  if (!partial)
    assert.equal(result.size, frames.length, "Incomplete independent ballot");
  return result;
}
export function reviewDisputes(frames, aRows, bRows) {
  const a = validateBallot(frames, aRows),
    b = validateBallot(frames, bRows);
  return frames.flatMap((f, index) => {
    const first = index === 0,
      prev = frames[index - 1];
    const av = a.get(f.id),
      bv = b.get(f.id);
    const boundaryA = first || av.moment !== a.get(prev.id).moment;
    const boundaryB = first || bv.moment !== b.get(prev.id).moment;
    const labelDisagreement = av.mustKeep !== bv.mustKeep;
    const uncertain = av.mustKeep === null || bv.mustKeep === null;
    const boundaryDisagreement = boundaryA !== boundaryB;
    return labelDisagreement || uncertain || boundaryDisagreement
      ? [
          {
            id: f.id,
            sheet: f.sheet,
            slot: f.slot,
            contextIds: frames
              .slice(Math.max(0, index - 2), index + 3)
              .map((g) => g.id),
            a: av,
            b: bv,
            boundaryA,
            boundaryB,
            labelDisagreement,
            uncertain,
            boundaryDisagreement,
          },
        ]
      : [];
  });
}
export function mergeVisualBallots(
  frames,
  aRows,
  bRows,
  cRows,
  { requireComplete = true } = {},
) {
  const a = validateBallot(frames, aRows),
    b = validateBallot(frames, bRows);
  const disputes = reviewDisputes(frames, aRows, bRows),
    disputed = new Set(disputes.map((d) => d.id));
  const c = validateBallot(frames, cRows, { partial: true, adjudicator: true });
  for (const id of c.keys())
    assert.ok(disputed.has(id), "Unexpected adjudication");
  if (requireComplete)
    for (const id of disputed)
      assert.ok(c.has(id), "Unreviewed dispute: " + id);
  const labels = [],
    unionLabels = [];
  let momentId = null;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i],
      av = a.get(f.id),
      bv = b.get(f.id),
      cv = c.get(f.id);
    assert.match(f.sha256, /^[a-f0-9]{64}$/, "Invalid source SHA");
    const prev = frames[i - 1],
      boundaryA = !prev || av.moment !== a.get(prev.id).moment,
      boundaryB = !prev || bv.moment !== b.get(prev.id).moment;
    // A remaining boundary dispute splits the scene conservatively. This may
    // increase the denominator; it is never hidden by choosing convenient IDs.
    const boundary =
      !prev ||
      (boundaryA === boundaryB ? boundaryA : cv?.momentBreakBefore !== false);
    if (boundary) momentId = "multi-" + f.id;
    let mustKeep = av.mustKeep === bv.mustKeep ? av.mustKeep : null;
    if (disputed.has(f.id)) {
      if (cv?.mustKeep === true) mustKeep = true;
      else if (
        cv?.mustKeep === false &&
        av.mustKeep !== true &&
        bv.mustKeep !== true
      )
        mustKeep = false;
      else mustKeep = null; // A keeper vote cannot become optional by 2:1 exclusion.
    }
    const baseReason = cv?.reason ?? av.reason;
    const reason =
      mustKeep === null && (av.mustKeep === true || bv.mustKeep === true)
        ? "存在保留意见分歧，保护待复核；" + baseReason
        : baseReason;
    const item = {
      relativePath: f.relativePath,
      sourceSHA256: f.sha256,
      mustKeep,
      momentId,
      reason,
      confidence: disputed.has(f.id)
        ? "low"
        : ["low", "medium", "high"][
            Math.min(
              ["low", "medium", "high"].indexOf(av.confidence),
              ["low", "medium", "high"].indexOf(bv.confidence),
            )
          ],
      evidence: {
        a: av,
        b: bv,
        adjudicator: cv ?? null,
        disputed: disputed.has(f.id),
      },
    };
    labels.push(item);
    // Stress metrics retain every positive ballot, including unresolved cases.
    // Otherwise setting a disputed keeper to null could inflate measured recall.
    unionLabels.push({
      ...item,
      mustKeep:
        av.mustKeep === true || bv.mustKeep === true || cv?.mustKeep === true
          ? true
          : mustKeep,
    });
  }
  const counts = (rows) => ({
    keep: rows.filter((r) => r.mustKeep === true).length,
    optional: rows.filter((r) => r.mustKeep === false).length,
    uncertain: rows.filter((r) => r.mustKeep === null).length,
  });
  return {
    version: 1,
    provenance: "ai-proxy",
    protocol: "independent-context-two-reviewers-plus-adjudicator-v1",
    humanConfirmed: 0,
    independence:
      "Separate contexts of the same model family; correlated errors remain possible. Retrospective camera batch, not human or unseen-data acceptance.",
    labels,
    unionStressLabels: unionLabels,
    summary: {
      total: frames.length,
      disputes: disputes.length,
      adjudicated: c.size,
      unresolved: disputes.filter(
        (d) =>
          labels.find(
            (l) =>
              l.relativePath === frames.find((f) => f.id === d.id).relativePath,
          ).mustKeep === null,
      ).length,
      a: counts(aRows),
      b: counts(bRows),
      merged: counts(labels),
      unionStress: counts(unionLabels),
    },
  };
}
