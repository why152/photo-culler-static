import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisTiming } from "../modules/analysis-timing.js";

test("opt-in timing records successful and failed stages without recording payloads", async () => {
  let now = 0;
  const timing = new AnalysisTiming(true, () => now);
  timing.measure("score", () => { now += 3; return { privatePixels: [1, 2] }; });
  await assert.rejects(timing.measureAsync("cacheWrite", async () => { now += 5; throw new Error("failure"); }));
  assert.deepEqual(timing.finish(), { score: 3, cacheWrite: 5, total: 8 });
});

test("disabled timing never samples the clock", async () => {
  const timing = new AnalysisTiming(false, () => { throw new Error("unexpected clock read"); });
  assert.equal(timing.measure("score", () => 7), 7);
  assert.equal(await timing.measureAsync("decode", async () => 8), 8);
  assert.equal(timing.finish(), null);
});
