import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptPlan,
  acceptanceMatches,
  defaultStrength,
  nextPageOffset,
} from "../modules/cull-acceptance.js";
import { exportPlan, reviewCSV } from "../modules/cull-export.js";
test("accepted snapshot is immutable and detects every output-affecting context change", () => {
  const groups = [
    {
      id: "a",
      path: "a",
      fingerprint: "f",
      sourceSHA: "sha",
      hash: "123",
      members: [{ path: "a.jpg", size: 3, lastModified: 1, handle: {} }],
    },
  ];
  const human = { a: { decision: "keep", favorite: true } },
    machine = { a: { plan: "suppress", algorithmVersion: "rules" } };
  const plan = exportPlan(groups, human, machine);
  plan.preferences = { mode: "burst", strength: "compact" };
  const accepted = acceptPlan(plan, groups);
  assert.ok(acceptanceMatches(accepted, plan, groups));
  assert.equal(accepted.plan.records[0].handle, undefined);
  // Pure model cannot mutate a human favorite or keep decision.
  assert.equal(plan.groups[0].decision, "include");
  for (const altered of [
    { ...plan, includeProtected: true },
    { ...plan, preferences: { mode: "burst", strength: "loose" } },
    {
      ...plan,
      groups: [{ ...plan.groups[0], human: { decision: "exclude" } }],
    },
  ])
    assert.ok(!acceptanceMatches(accepted, altered, groups));
  assert.ok(
    !acceptanceMatches(accepted, plan, [
      { ...groups[0], sourceSHA: "new-content" },
    ]),
  );
  // Persisted snapshots must own their data, independent of subsequent review mutation.
  human.a.decision = "exclude";
  assert.equal(accepted.plan.groups[0].human.decision, "keep");
});
test("new burst sessions default compact but saved choices survive; filtered page cycles by visible total", () => {
  assert.equal(defaultStrength("burst"), "compact");
  assert.equal(defaultStrength("album"), "standard");
  assert.equal(defaultStrength("burst", "loose"), "loose");
  assert.equal(nextPageOffset(0, 90), 60);
  assert.equal(nextPageOffset(60, 90), 0);
  assert.equal(nextPageOffset(0, 0), 0);
});
import {
  createBenchmark,
  evaluateBenchmark,
  importProxyLabels,
} from "../modules/cull-benchmark.js";
test("AI proxy labels require matching bytes and cannot pass the human-quality gate", () => {
  const groups = [
      {
        id: "a",
        fingerprint: "f",
        sourceSHA: "sha",
        source: { path: "a.jpg" },
      },
    ],
    recommendations = { a: { plan: "suppress" } };
  const study = createBenchmark(groups, recommendations);
  const mapped = importProxyLabels(
    {
      version: 1,
      provenance: "ai-proxy",
      labels: [
        {
          relativePath: "a.jpg",
          sourceSHA256: "sha",
          mustKeep: true,
          momentId: "moment",
        },
        { relativePath: "b.jpg", sourceSHA256: "other", mustKeep: false },
      ],
    },
    groups,
  );
  assert.equal(mapped.unmatched.length, 1);
  study.labels = mapped.labels;
  const result = evaluateBenchmark(study);
  assert.equal(result.acceptance, "ai-proxy-only");
  assert.equal(result.shortlistPhotoRecall, 0);
  assert.deepEqual(result.hiddenWantedPhotoIds, ["a"]);
  assert.equal(result.measuredHumanTimeReduction, null);
  study.labels.a.source = "human";
  study.blindingAttested = true;
  assert.equal(evaluateBenchmark(study).acceptance, "outside-heldout-size");
});

test("proxy studies support an entire 1233-photo draft without silently sampling 500", () => {
  const groups = Array.from({ length: 1233 }, (_, i) => ({
    id: String(i),
    fingerprint: String(i),
  }));
  const study = createBenchmark(groups, {}, { size: groups.length });
  assert.equal(study.deck.length, 1233);
  assert.equal(new Set(study.deck).size, 1233);
  study.labels = Object.fromEntries(
    groups.map((g) => [g.id, { mustKeep: false, source: "ai-proxy" }]),
  );
  assert.equal(evaluateBenchmark(study).acceptance, "ai-proxy-only");
  study.labels["0"] = {
    mustKeep: true,
    source: "ai-proxy",
    momentId: "same-moment",
  };
  study.labels["1"].momentId = "same-moment";
  study.recommendations["1"] = { plan: "include" };
  assert.equal(evaluateBenchmark(study).shortlistPhotoRecall, 0);
  assert.equal(evaluateBenchmark(study).importantMomentRecall, 1);
  study.labels["1"].usable = false;
  assert.equal(evaluateBenchmark(study).importantMomentRecall, 0);
});

test("review CSV covers excluded and protected members, independent human state, and spreadsheet-safe names", () => {
  const groups = ["=formula", "protected", "kept"].map((id) => ({
    id,
    path: id,
    hash: "h",
    fingerprint: id,
    members: [{ path: id + ".jpg", size: 3 }],
  }));
  const plan = exportPlan(
    groups,
    { kept: { decision: "keep", favorite: true } },
    {
      "=formula": { plan: "suppress" },
      protected: { plan: "protected" },
      kept: { plan: "suppress" },
    },
  );
  const csv = reviewCSV(plan);
  assert.equal(csv.split("\r\n").length, 4);
  assert.ok(csv.includes('"\'=formula.jpg"'));
  assert.ok(csv.includes("not-exported"));
  assert.ok(csv.includes('"true"'));
  assert.equal(plan.records.length, 1);
});
