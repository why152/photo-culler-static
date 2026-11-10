import assert from "node:assert/strict";
import { rank as baseline } from "./baselines/cull-ranking-beta2.mjs";
import { rank } from "../web/modules/cull-ranking.js";
import {
  createBenchmark,
  evaluateBenchmark,
} from "../web/modules/cull-benchmark.js";

// All data was already AI-reviewed. These are retrospective partitions, never
// an independent blind holdout. Exclude moments crossing the 300-frame boundary.
export function compareFocusGroups(groups, draft) {
  const labels = Object.fromEntries(
    draft.labels.map((label) => [
      "group:" + label.relativePath.replace(/\.[^/.]+$/, ""),
      {
        mustKeep: label.mustKeep,
        momentId: label.momentId,
        source: "ai-proxy",
      },
    ]),
  );
  const calibration = groups.slice(0, 300);
  const calibrationMoments = new Set(
    calibration.map((g) => labels[g.id]?.momentId).filter(Boolean),
  );
  const remaining = groups
    .slice(300)
    .filter((g) => !calibrationMoments.has(labels[g.id]?.momentId));
  const legacy = rank(groups, { strength: "compact", strategy: "legacy" }),
    frozen = baseline(groups, { strength: "compact" });
  for (const r of Object.values(frozen.recommendations))
    r.algorithmVersion = legacy.recommendations[groups[0].id].algorithmVersion;
  assert.deepEqual(legacy, frozen);
  function evaluate(subset, recommendations, split) {
    const study = createBenchmark(subset, recommendations, {
      split,
      size: subset.length,
      preferences: { mode: "burst", strength: "compact" },
    });
    study.labels = labels;
    study.importedProxy = true;
    study.algorithmVersion =
      Object.values(recommendations)[0]?.algorithmVersion ??
      study.algorithmVersion;
    return evaluateBenchmark(study);
  }
  const strategies = {};
  for (const strategy of [
    "baseline",
    "per-frame",
    "normalized",
    "local-focus",
  ]) {
    const fn = (subset) =>
      strategy === "baseline"
        ? baseline(subset, { strength: "compact" })
        : rank(subset, { strength: "compact", strategy });
    strategies[strategy] = {
      calibration: evaluate(
        calibration,
        fn(calibration).recommendations,
        "retrospective-ai-calibration",
      ),
      retrospectiveCheck: evaluate(
        remaining,
        fn(remaining).recommendations,
        "retrospective-ai-moment-disjoint-check",
      ),
      all: evaluate(groups, fn(groups).recommendations, "retrospective-ai-all"),
    };
  }
  return {
    strategies,
    partition: {
      calibration: calibration.length,
      retrospectiveCheck: remaining.length,
      excludedBoundaryMomentFrames:
        groups.length - calibration.length - remaining.length,
    },
  };
}
