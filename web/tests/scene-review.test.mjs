import { test } from "node:test";
import assert from "node:assert/strict";
import { cluster, reviewScenePair } from "../modules/cull-similarity.js";
import { rank } from "../modules/cull-ranking.js";
import { ReviewDecisionHistory } from "../modules/review-persistence.js";
function frame(id, time, hash = "0000000000000000") {
  const descriptors = Uint8Array.from({ length: 16 * 32 }, (_, i) => (Math.floor(i / 32) * 37 + i * 13) % 256);
  return { id, path: id, source: { path: id + ".jpg" }, hash, metadata: { capturedAt: time }, members: [],
    analysis: { exposureScore: 90, sharpness: 70, technicalScore: 80,
      focus: { isBlurry: false, normalizedSharpness: 70 },
      sourceDimensions: { width: 4000, height: 6000 },
      scene: { version: "preview-orb-1", status: "ready", orb: { count: 16, descriptors } },
      portrait: { status: "ready", faces: [], orb: null } } };
}
test("distant subjects form complete-link scene stacks without faces and protect uncertain alternatives", () => {
  const a = frame("a", 0), b = frame("b", 5000, "000000000000ffff"), c = frame("c", 31000);
  assert.equal(reviewScenePair(a, b), true);
  assert.equal(reviewScenePair(a, c), false);
  const r = rank([a, b, c], { portrait: true, strength: "compact" });
  assert.deepEqual(r.batches.map(b => b.map(g => g.id)), [["a", "b"], ["c"]]);
  assert.equal(r.recommendations.a.plan, "include");
  assert.equal(r.recommendations.b.plan, "protected");
  assert.equal(rank([a, b], { portrait: true, strength: "standard" }).recommendations.b.plan, "include");
  assert.equal(cluster([a, b], { portrait: false }).length, 2);
});
test("scene evidence rejects missing times, aspect jumps, weak descriptors and manual splits", () => {
  const a = frame("a", 0), b = frame("b", 5000, "000000000000ffff");
  for (const mutate of [g => delete g.metadata.capturedAt, g => g.analysis.scene.status = "unavailable", g => g.analysis.scene.orb = null, g => g.analysis.sourceDimensions.width = 6000, g => g.protected = true, g => g.manualSplit = true, g => g.hash = "ffffffffffffffff"]) {
    const other = structuredClone(b); mutate(other);
    assert.equal(reviewScenePair(a, other), false);
    assert.equal(cluster([a, other], { portrait: true }).length, 2);
  }
});
test("range selection restores every previous decision with one undo", () => {
  const history = new ReviewDecisionHistory();
  const decisions = { a: { decision: "keep", favorite: true } };
  history.recordBatch(decisions, [["a", { decision: "exclude" }], ["b", { decision: "exclude" }]]);
  assert.equal(decisions.b.decision, "exclude");
  history.undo(decisions);
  assert.deepEqual(decisions, { a: { decision: "keep", favorite: true } });
});
test("lower ORB agreement is permitted only for very close review frames", () => {
  const a = frame("a", 0), b = frame("b", 2000, "00000000ffffffff");
  b.analysis.scene.orb.descriptors.fill(255);
  b.analysis.scene.orb.descriptors.set(a.analysis.scene.orb.descriptors.slice(0, 4 * 32));
  assert.equal(reviewScenePair(a, b), true);
  b.metadata.capturedAt = 3000;
  assert.equal(reviewScenePair(a, b), false);
  b.metadata.capturedAt = 2000;
  b.analysis.scene.orb = { count: 16, descriptors: new Uint8Array(16 * 32).fill(255) };
  b.analysis.scene.orb.descriptors.set(a.analysis.scene.orb.descriptors.slice(0, 2 * 32));
  assert.equal(reviewScenePair(a, b), false);
});
