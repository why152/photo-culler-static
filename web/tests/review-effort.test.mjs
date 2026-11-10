import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEffortRun,
  EffortClock,
  comparePersonalEffort,
  restoreEffortBackup,
} from "../modules/review-effort.js";
const run = (role = "baseline", operator = "human") =>
  createEffortRun({
    id: role,
    role,
    operator,
    identity: "dataset",
    algorithmVersion: "rules",
    preferences: { mode: "burst", strength: "compact" },
    scopeIds: ["a", "b"],
    sourceGroups: 3,
  });
test("foreground observation excludes pause, hidden/background and reload time; sleep gaps are explicit", () => {
  const c = new EffortClock({ ...run(), status: "paused" }, 0);
  c.resume(0);
  c.attention(true, 0);
  c.tick(1200);
  assert.equal(c.run.foregroundMs, 1200);
  c.attention(false, 1500);
  c.tick(15000);
  assert.equal(c.run.foregroundMs, 1500);
  c.attention(true, 15000);
  c.pause(17000);
  c.tick(200000);
  assert.equal(c.run.foregroundMs, 3500);
  const resumed = new EffortClock({ ...c.run, status: "running" }, 1000000);
  assert.equal(resumed.run.status, "paused");
  resumed.tick(2000000);
  assert.equal(resumed.run.foregroundMs, 3500);
  resumed.resume(2000000);
  resumed.attention(true, 2000000);
  resumed.tick(2060000);
  assert.equal(resumed.run.clockGaps, 1);
  assert.equal(resumed.run.foregroundMs, 13500);
});
test("actual viewer opens are distinct from thumbnail exposures and don't count unknown or paused IDs", () => {
  const c = new EffortClock({ ...run(), status: "paused" }, 0);
  c.resume(0);
  c.attention(true, 0);
  c.observe("thumbnail", "a", 10);
  c.observe("viewer", "b", 20);
  c.observe("viewer", "b", 30);
  c.observe("viewer", "outside", 40);
  c.observe("decision", "b", 50);
  assert.deepEqual(c.run.thumbnailExposureIds, ["a"]);
  assert.deepEqual(c.run.viewerIds, ["b"]);
  assert.deepEqual(c.run.decisionIds, ["b"]);
  c.pause(60);
  c.observe("viewer", "a", 70);
  assert.deepEqual(c.run.viewerIds, ["b"]);
});
test("synthetic and AI runs cannot become measured human savings; incomplete baseline fails closed", () => {
  const base = {
    ...run(),
    status: "completed",
    foregroundMs: 10000,
    viewerIds: ["a", "b"],
  };
  const assisted = {
    ...run("assisted"),
    status: "completed",
    foregroundMs: 3000,
    viewerIds: ["a"],
  };
  assert.equal(
    comparePersonalEffort(base, { ...assisted, operator: "synthetic" }).status,
    "nonhuman-observation",
  );
  assert.equal(
    comparePersonalEffort({ ...base, operator: "ai" }, assisted)
      .viewerReduction,
    null,
  );
  assert.equal(
    comparePersonalEffort({ ...base, viewerIds: ["a"] }, assisted).status,
    "baseline-not-fully-opened",
  );
  assert.equal(
    comparePersonalEffort({ ...base, viewerIds: ["a", "a"] }, assisted).status,
    "incomplete-records",
  );
});
test("paired human observations remain descriptive and expose practice/difficulty/clock uncertainty", () => {
  const base = {
    ...run(),
    status: "completed",
    foregroundMs: 10000,
    viewerIds: ["a", "b"],
  };
  const assisted = {
    ...run("assisted"),
    status: "completed",
    foregroundMs: 3000,
    viewerIds: ["a"],
  };
  const result = comparePersonalEffort(base, assisted);
  assert.equal(result.viewerReduction, 0.5);
  assert.equal(result.foregroundTimeReduction, 0.7);
  assert.equal(result.possiblePracticeEffect, true);
  assert.equal(result.independentQualityVerified, false);
  assert.equal(result.acceptance, "not-independent-acceptance");
  assert.equal(
    comparePersonalEffort(base, { ...assisted, clockGaps: 1 })
      .foregroundTimeReduction,
    null,
  );
  assert.equal(
    comparePersonalEffort(base, {
      ...assisted,
      thumbnailExposureIds: ["a", "b"],
    }).visualExposureReduction,
    0,
  );
});
test("effort backup restore validates IDs, pauses interrupted runs and preserves automated provenance", () => {
  const r = { ...run(), operator: "human", environment: { automation: true } };
  const backup = {
    version: 1,
    type: "local-review-effort",
    data: { version: 1, runs: [r] },
  };
  const restored = restoreEffortBackup(backup);
  assert.equal(restored.runs[0].operator, "synthetic");
  assert.equal(restored.runs[0].status, "paused");
  assert.equal(restored.runs[0].restoredFromBackup, true);
  assert.equal(backup.data.runs[0].operator, "human");
  assert.throws(
    () =>
      restoreEffortBackup({
        ...backup,
        data: { version: 1, runs: [{ ...r, viewerIds: ["unknown"] }] },
      }),
    /队列无效/,
  );
  assert.throws(
    () =>
      restoreEffortBackup({ ...backup, data: { version: 1, runs: [r, r] } }),
    /字段无效/,
  );
});
