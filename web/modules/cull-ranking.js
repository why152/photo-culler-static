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
export function rank(
  groups,
  { strength = "standard", mode = "burst", strategy = "local-focus" } = {},
) {
  const batches = cluster(groups),
    recommendations = {};
  for (const batch of batches) {
    const ordered = [...batch].sort(
      (a, b) =>
        (strategy === "local-focus"
          ? Number(a.analysis?.focus?.isBlurry ?? false) -
            Number(b.analysis?.focus?.isBlurry ?? false)
          : 0) ||
        (strategy === "normalized" || strategy === "local-focus"
          ? (b.analysis?.focus?.normalizedSharpness ??
              b.analysis?.technicalScore ??
              0) -
            (a.analysis?.focus?.normalizedSharpness ??
              a.analysis?.technicalScore ??
              0)
          : 0) ||
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
      (strategy === "legacy" &&
        ordered.some(
          (g) =>
            g.protected ||
            !g.hash ||
            g.analysis?.exposureScore < 65 ||
            g.analysis?.sharpness < 22 ||
            panoramic(g),
        )) ||
      ordered.some(panoramic) ||
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
    const frameProtected = (g) =>
      g.protected ||
      !g.hash ||
      g.analysis?.exposureScore < 65 ||
      (strategy === "local-focus" && g.analysis?.focus
        ? g.analysis.focus.isBlurry
        : g.analysis?.sharpness < 22);
    for (const g of ordered) {
      // Album mode only folds exact duplicates. Missing times never infer bursts.
      const distinct = selected.every((s) => distance(s.hash, g.hash) > 3);
      const k = strength === "loose" ? 3 : strength === "compact" ? 1 : 2;
      const include =
        !selected.length ||
        (selected.length < k && distinct) ||
        (mode === "album" &&
          !selected.some((s) => g.exact && s.exact === g.exact));
      if (include && !frameProtected(g)) selected.push(g);
      recommendations[g.id] = {
        groupId: batch[0].id,
        similarityKind: kind,
        rank: ordered.indexOf(g) + 1,
        plan: frameProtected(g)
          ? "protected"
          : uncertain
            ? "protected"
            : include
              ? "include"
              : "suppress",
        confidence:
          uncertain || frameProtected(g)
            ? "low"
            : batch.length > 1
              ? "medium"
              : "low",
        reasons: [
          strategy !== "legacy" && frameProtected(g)
            ? "读取、曝光或局部清晰度不确定，保留供复核"
            : kind === "same-image-version"
              ? "疑似缩放、重压缩或编辑版本，保留全部供复核"
              : uncertain
                ? "题材、特殊序列或读取存在不确定性，请复核"
                : batch.length > 1
                  ? strategy === "local-focus"
                    ? "同组局部清晰区域与对比度归一化排序；不判断艺术价值"
                    : "同组清晰度、曝光与视觉差异排序"
                  : "独立瞬间，保留候选",
        ],
        algorithmVersion: ALGORITHM_VERSION,
      };
    }
  }
  return { batches, recommendations };
}
