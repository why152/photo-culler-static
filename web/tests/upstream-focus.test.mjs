import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeGrayFocus,
  normalizedFocus,
  largestSharpCluster,
  classifyFocus,
  focusIntent,
} from "../modules/upstream-focus.js";
import { rank } from "../modules/cull-ranking.js";
import { rank as baseline } from "../../scripts/baselines/cull-ranking-beta2.mjs";
import { ALGORITHM_VERSION, outputDecision } from "../modules/cull-session.js";

test("default uses local focus, keeps uncertain neighbor and preserves human precedence", () => {
  const weak = group("weak", 70, 99),
    strong = group("strong", 70, 60);
  weak.analysis.focus = { isBlurry: true, normalizedSharpness: 99 };
  strong.analysis.focus = { isBlurry: false, normalizedSharpness: 60 };
  const rec = rank([weak, strong], { strength: "compact" }).recommendations;
  assert.equal(rec.weak.plan, "protected");
  assert.equal(rec.strong.plan, "include");
  assert.equal(rec.strong.algorithmVersion, ALGORITHM_VERSION);
  assert.notEqual(ALGORITHM_VERSION, "rules-2.0-beta.2");
  assert.equal(outputDecision({ decision: "exclude" }, rec.strong), "suppress");
  assert.equal(
    outputDecision({ favorite: true }, { plan: "suppress" }),
    "include",
  );
});

test("normalized focus compensates contrast and flat input remains finite", () => {
  assert.ok(
    Math.abs(normalizedFocus(12, 100) - normalizedFocus(48, 400)) < 1e-6,
  );
  assert.equal(normalizedFocus(0, 0), 0);
  const flat = analyzeGrayFocus(new Uint8Array(128 * 128).fill(100), 128, 128);
  assert.equal(flat.laplacianVariance, 0);
  assert.equal(flat.normalizedSharpness, 0);
  assert.equal(classifyFocus(flat).isBlurry, true);
  assert.equal(analyzeGrayFocus(new Uint8Array(4), 2, 2), null);
});
test("gray Laplacian matches direct population variance on a deterministic fixture", () => {
  const w = 128,
    h = 128,
    gray = Uint8Array.from(
      { length: w * h },
      (_, i) => (i * 31 + Math.floor(i / w) * 17) % 256,
    );
  const values = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      values.push(
        gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i],
      );
    }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const actual = analyzeGrayFocus(gray, w, h);
  assert.ok(Math.abs(actual.laplacianVariance - variance) < 1e-6);
  assert.equal(actual.sharpTileFraction, 1);
  assert.equal(actual.largestSharpCluster, 1);
});
test("sharp region uses four-neighbor connectivity; EXIF shake is advisory", () => {
  assert.equal(largestSharpCluster([1, 0, 1, 0, 1, 0, 1, 0, 1], 3, 3), 1);
  assert.equal(largestSharpCluster([1, 1, 0, 0, 1, 0, 0, 1, 1], 3, 3), 5);
  assert.deepEqual(
    focusIntent({ FNumber: 2, FocalLength: 85, ExposureTime: 1 / 30 }),
    { bokehLikely: true, shakeRisk: true },
  );
  const metrics = {
    maxTileVariance: 800,
    sharpTileFraction: 0,
    largestSharpCluster: 0,
    laplacianVariance: 50,
  };
  assert.equal(classifyFocus(metrics).isBlurry, true);
  assert.equal(
    classifyFocus(metrics, {
      FNumber: 2,
      FocalLength: 85,
      ExposureTime: 1 / 30,
    }).isBlurry,
    false,
  );
});
const group = (id, sharpness, score) => ({
  id,
  path: id,
  hash: "0000000000000000",
  metadata: { capturedAt: 1000 },
  analysis: { sharpness, technicalScore: score, exposureScore: 90 },
  source: { size: 100 },
  members: [],
});
test("legacy strategy retains baseline output; per-frame protection does not hide its weak neighbor", () => {
  const groups = [group("a", 10, 90), group("b", 70, 80), group("c", 65, 70)];
  const expected = baseline(groups, { strength: "compact" });
  const actual = rank(groups, { strength: "compact", strategy: "legacy" });
  for (const r of Object.values(expected.recommendations))
    r.algorithmVersion = actual.recommendations[groups[0].id].algorithmVersion;
  assert.deepEqual(actual, expected);
  const rec = rank(groups, {
    strength: "compact",
    strategy: "per-frame",
  }).recommendations;
  assert.equal(rec.a.plan, "protected");
  assert.equal(rec.b.plan, "include");
  assert.equal(rec.c.plan, "suppress");
});
test("experimental focus cannot override bracket or explicit source protections", () => {
  const groups = [group("a", 70, 90), group("b", 70, 80)];
  groups[0].metadata.ExposureTime = 1 / 1000;
  groups[1].metadata.ExposureTime = 1 / 100;
  for (const strategy of ["per-frame", "normalized", "local-focus"]) {
    assert.ok(
      Object.values(rank(groups, { strategy }).recommendations).every(
        (r) => r.plan === "protected",
      ),
    );
    const alone = group("raw", 70, 90);
    alone.protected = true;
    assert.equal(
      rank([alone], { strategy }).recommendations.raw.plan,
      "protected",
    );
  }
});
