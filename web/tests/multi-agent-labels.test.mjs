import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateBallot,
  reviewDisputes,
  mergeVisualBallots,
} from "../../scripts/multi-agent-labels.mjs";
import {
  importProxyLabels,
  createBenchmark,
  evaluateBenchmark,
} from "../modules/cull-benchmark.js";
const frames = [1, 2, 3].map((n) => ({
  id: "p" + n,
  sheet: 1,
  slot: n,
  relativePath: n + ".jpg",
  sha256: "a".repeat(64),
}));
const vote = (id, mustKeep, moment = "p1") => ({
  id,
  mustKeep,
  moment,
  reason: "可见构图",
  confidence: "medium",
});
test("independent ballots reject omissions, duplicates and invalid photo identities", () => {
  assert.throws(() => validateBallot(frames, [vote("p1", true)]), /Incomplete/);
  assert.throws(
    () => validateBallot(frames, [vote("p1", true), vote("p1", false)]),
    /Duplicate/,
  );
  assert.throws(
    () => validateBallot(frames, [vote("unknown", true)]),
    /Unknown/,
  );
});
test("a keeper/exclude tie remains protected after two exclusion votes; stress recall retains the keeper", () => {
  const a = [vote("p1", true), vote("p2", false), vote("p3", null)];
  const b = [vote("p1", false), vote("p2", false), vote("p3", false)];
  const c = [
    { ...vote("p1", false), momentBreakBefore: null },
    { ...vote("p3", false), momentBreakBefore: null },
  ];
  const r = mergeVisualBallots(frames, a, b, c);
  assert.deepEqual(
    r.labels.map((l) => l.mustKeep),
    [null, false, false],
  );
  assert.equal(r.unionStressLabels[0].mustKeep, true);
  assert.match(r.labels[0].reason, /保留意见分歧/);
  assert.equal(r.humanConfirmed, 0);
  assert.equal(r.provenance, "ai-proxy");
  assert.throws(
    () => mergeVisualBallots(frames, a, b, []),
    /Unreviewed dispute/,
  );
});
test("scene-boundary disagreement is explicit and cannot silently merge different moments", () => {
  const a = frames.map((f) => vote(f.id, true));
  const b = [vote("p1", true), vote("p2", true, "p2"), vote("p3", true, "p2")];
  assert.equal(reviewDisputes(frames, a, b)[0].boundaryDisagreement, true);
  const uncertain = mergeVisualBallots(frames, a, b, [
    { ...vote("p2", true), momentBreakBefore: null },
  ]);
  assert.notEqual(uncertain.labels[0].momentId, uncertain.labels[1].momentId);
  const same = mergeVisualBallots(frames, a, b, [
    { ...vote("p2", true), momentBreakBefore: false },
  ]);
  assert.equal(same.labels[0].momentId, same.labels[1].momentId);
});
test("merged draft works with existing SHA-bound local importer and never acquires human provenance", () => {
  const votes = [vote("p1", true), vote("p2", false), vote("p3", false)];
  const draft = mergeVisualBallots(frames, votes, votes, []);
  const groups = frames.map((f) => ({
    id: f.id,
    fingerprint: f.id,
    source: { path: f.relativePath },
    sourceSHA: f.sha256,
  }));
  const mapped = importProxyLabels(draft, groups);
  assert.deepEqual(mapped.unmatched, []);
  assert.ok(Object.values(mapped.labels).every((l) => l.source === "ai-proxy"));
  const study = createBenchmark(
    groups,
    { p1: { plan: "include" } },
    { size: 3 },
  );
  study.labels = mapped.labels;
  study.importedProxy = true;
  const result = evaluateBenchmark(study);
  assert.equal(result.humanConfirmed, 0);
  assert.equal(result.acceptance, "ai-proxy-only");
});
