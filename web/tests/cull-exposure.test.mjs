import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeGrayFocus, classifyFocus } from "../modules/upstream-focus.js";
import { lowKeyEvidence } from "../modules/cull-exposure.js";
import { rank } from "../modules/cull-ranking.js";
import { rank as beta3 } from "../../scripts/baselines/cull-ranking-beta3.mjs";
import { outputDecision } from "../modules/cull-session.js";
import { needsTechnicalReview } from "../modules/cull-review-priority.js";
function nightGray() {
  const gray = new Uint8Array(128 * 128);
  for (let y = 32; y < 96; y++)
    for (let x = 32; x < 96; x++) gray[y * 128 + x] = (x + y) % 2 ? 32 : 96;
  return gray;
}
const group = (id) => ({
  id,
  path: id,
  hash: "0000000000000000",
  metadata: { capturedAt: 1000 },
  source: { size: 100 },
  members: [],
  analysis: {
    technicalScore: 60,
    sharpness: 60,
    exposureScore: 50,
    focus: classifyFocus(analyzeGrayFocus(nightGray(), 128, 128)),
  },
});
test("low-key histogram preserves clipped background and coherent subject evidence", () => {
  const g = group("a"),
    e = g.analysis.focus.exposure;
  assert.equal(e.darkFraction, 0.75);
  assert.equal(e.brightFraction, 0);
  assert.equal(e.midtoneFraction, 0.25);
  assert.equal(e.p05, 0);
  assert.equal(e.p95, 96);
  assert.equal(lowKeyEvidence(g), true);
});
test("blackout, whiteout, flat light, isolated hot pixels and missing metrics fail closed", () => {
  for (const gray of [
    new Uint8Array(16384),
    new Uint8Array(16384).fill(255),
    new Uint8Array(16384).fill(64),
    Uint8Array.from({ length: 16384 }, (_, i) => (i === 8000 ? 255 : 0)),
  ]) {
    const g = group("a");
    g.analysis.focus = classifyFocus(analyzeGrayFocus(gray, 128, 128));
    assert.equal(lowKeyEvidence(g), false);
  }
  for (const change of [
    (g) => delete g.analysis.focus.exposure,
    (g) => (g.protected = true),
    (g) => (g.hash = null),
    (g) => (g.analysis.focus.isBlurry = true),
    (g) => (g.analysis.focus.exposure.p95 = NaN),
    (g) => (g.analysis.focus.exposure.brightFraction = -1),
    (g) => (g.analysis.focus.version = "old"),
  ]) {
    const g = group("a");
    change(g);
    assert.equal(lowKeyEvidence(g), false);
  }
});
test("nomination adds one candidate without folding a protected peer or altering legacy ranking", () => {
  const groups = [group("a"), group("b"), group("c")];
  const old = beta3(groups);
  const preserved = rank(groups, { exposurePolicy: "preserve" });
  for (const r of Object.values(old.recommendations))
    r.algorithmVersion =
      preserved.recommendations[groups[0].id].algorithmVersion;
  assert.deepEqual(preserved, old);
  const rec = rank(groups, {
    exposurePolicy: "contextual",
    strength: "compact",
  }).recommendations;
  assert.equal(rec.a.plan, "include");
  assert.equal(rec.a.confidence, "low");
  assert.deepEqual([rec.b.plan, rec.c.plan], ["protected", "protected"]);
  assert.equal(outputDecision({ decision: "exclude" }, rec.a), "suppress");
  assert.equal(
    outputDecision({ favorite: true }, { plan: "suppress" }),
    "include",
  );
});
test("a prior bright candidate, bracket, version and panorama protections cannot be displaced", () => {
  const bright = group("bright");
  bright.analysis.exposureScore = 90;
  const night = group("night");
  const mixed = rank([night, bright], {
    strength: "compact",
    exposurePolicy: "contextual",
  }).recommendations;
  assert.equal(mixed.bright.plan, "include");
  assert.equal(mixed.night.plan, "protected");
  const a = group("a"),
    b = group("b");
  a.metadata.ExposureTime = 0.01;
  b.metadata.ExposureTime = 0.1;
  assert.ok(
    Object.values(
      rank([a, b], { exposurePolicy: "contextual" }).recommendations,
    ).every((r) => r.plan === "protected"),
  );
  const pano = group("pano");
  pano.analysis.sourceDimensions = { width: 4000, height: 1000 };
  assert.equal(
    rank([pano], { exposurePolicy: "contextual" }).recommendations.pano.plan,
    "protected",
  );
  const original = group("original"),
    edited = group("edited");
  original.analysis.sourceDimensions = { width: 1200, height: 800 };
  edited.analysis.sourceDimensions = { width: 600, height: 400 };
  assert.ok(
    Object.values(
      rank([original, edited], { exposurePolicy: "contextual" })
        .recommendations,
    ).every((r) => r.plan === "protected"),
  );
});
test("technical-review navigation keeps low-key warnings, honors manual decisions and leaves other plans intact", () => {
  const g = group("night"),
    m = rank([g]).recommendations.night;
  assert.equal(needsTechnicalReview(g, m), true);
  assert.equal(needsTechnicalReview(g, m, { decision: "keep" }), false);
  assert.equal(needsTechnicalReview(g, m, { decision: "exclude" }), false);
  assert.equal(needsTechnicalReview(g, m, { decision: "review_later" }), true);
  assert.equal(needsTechnicalReview(g, { plan: "include" }), false);
  assert.equal(m.plan, "include");
});
