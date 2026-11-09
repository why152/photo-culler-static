import { cluster, similarityKind } from "./cull-similarity.js";
import { distance } from "./cull-similarity.js";
import { ALGORITHM_VERSION } from "./cull-session.js";
function panoramic(group) {
  const d = group.analysis?.sourceDimensions;
  return (
    d?.width > 0 &&
    d?.height > 0 &&
    Math.max(d.width / d.height, d.height / d.width) >= 2.4
  );
}
export function rank(groups, { strength = "standard", mode = "burst" } = {}) {
  const batches = cluster(groups),
    recommendations = {};
  for (const batch of batches) {
    const ordered = [...batch].sort(
      (a, b) =>
        (b.analysis?.technicalScore ?? 0) - (a.analysis?.technicalScore ?? 0) ||
        (b.analysis?.sourceDimensions?.width ?? 0) *
          (b.analysis?.sourceDimensions?.height ?? 0) -
          (a.analysis?.sourceDimensions?.width ?? 0) *
            (a.analysis?.sourceDimensions?.height ?? 0) ||
        a.path.localeCompare(b.path),
    );
    const kind = similarityKind(batch);
    const uncertain =
      kind === "same-image-version" ||
      kind === "unknown" ||
      ordered.some(
        (g) =>
          g.protected ||
          !g.hash ||
          g.analysis?.exposureScore < 65 ||
          g.analysis?.sharpness < 22 ||
          panoramic(g),
      ) ||
      new Set(
        ordered
          .map((g) => g.metadata?.ExposureBiasValue)
          .filter((v) => v != null),
      ).size > 1 ||
      (() => {
        const exposures = ordered
          .map((g) => g.metadata?.ExposureTime)
          .filter((v) => v > 0);
        return (
          exposures.length > 1 &&
          Math.max(...exposures) / Math.min(...exposures) > 2
        );
      })();
    const selected = [];
    for (const g of ordered) {
      // Album mode only folds exact duplicates. Missing times never infer bursts.
      const distinct = selected.every((s) => distance(s.hash, g.hash) > 3);
      const k = strength === "loose" ? 3 : strength === "compact" ? 1 : 2;
      const include =
        !selected.length ||
        (selected.length < k && distinct) ||
        (mode === "album" &&
          !selected.some((s) => g.exact && s.exact === g.exact));
      if (include) selected.push(g);
      recommendations[g.id] = {
        groupId: batch[0].id,
        similarityKind: kind,
        rank: ordered.indexOf(g) + 1,
        plan:
          g.protected || !g.hash
            ? "protected"
            : uncertain
              ? "protected"
              : include
                ? "include"
                : "suppress",
        confidence: uncertain ? "low" : batch.length > 1 ? "medium" : "low",
        reasons: [
          kind === "same-image-version"
            ? "疑似缩放、重压缩或编辑版本，保留全部供复核"
            : uncertain
              ? "题材、特殊序列或读取存在不确定性，请复核"
              : batch.length > 1
                ? "同组清晰度、曝光与视觉差异排序"
                : "独立瞬间，保留候选",
        ],
        algorithmVersion: ALGORITHM_VERSION,
      };
    }
  }
  return { batches, recommendations };
}
