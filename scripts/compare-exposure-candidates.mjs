import assert from "node:assert/strict";
import { rank as beta3 } from "./baselines/cull-ranking-beta3.mjs";
import { rank } from "../web/modules/cull-ranking.js";
import {
  createBenchmark,
  evaluateBenchmark,
  importProxyLabels,
} from "../web/modules/cull-benchmark.js";
export function compareExposureGroups(groups, draft) {
  const old = beta3(groups, { strength: "compact" }).recommendations;
  const next = rank(groups, {
    strength: "compact",
    exposurePolicy: "contextual",
  }).recommendations;
  const additions = groups.filter(
    (g) => old[g.id].plan !== "include" && next[g.id].plan === "include",
  );
  for (const g of groups) {
    assert.ok(
      !(old[g.id].plan !== "suppress" && next[g.id].plan === "suppress"),
      "New suppression forbidden",
    );
    if (old[g.id].plan === "include") assert.equal(next[g.id].plan, "include");
  }
  const strategies = {};
  for (const [set, labels] of Object.entries({
    merged: draft.labels,
    ...(draft.unionStressLabels
      ? { unionStress: draft.unionStressLabels }
      : {}),
  })) {
    const mapped = importProxyLabels({ ...draft, labels }, groups);
    assert.deepEqual(mapped.unmatched, []);
    strategies[set] = {};
    for (const [version, recommendations] of Object.entries({
      beta3: old,
      contextual: next,
    })) {
      const s = createBenchmark(groups, recommendations, {
        size: groups.length,
        split: "retrospective-exposure-ai-proxy",
        preferences: { strength: "compact", mode: "burst" },
      });
      s.labels = mapped.labels;
      s.importedProxy = true;
      s.algorithmVersion = Object.values(recommendations)[0].algorithmVersion;
      strategies[set][version] = evaluateBenchmark(s);
    }
    assert.equal(
      strategies[set].contextual.visibleCount,
      strategies[set].beta3.visibleCount,
    );
    assert.deepEqual(
      [...strategies[set].contextual.hiddenWantedPhotoIds].sort(),
      [...strategies[set].beta3.hiddenWantedPhotoIds].sort(),
    );
  }
  return {
    strategies,
    newlyNominatedIds: additions.map((g) => g.id),
    noNewSuppression: true,
  };
}
