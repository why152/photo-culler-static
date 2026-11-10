// Candidate evidence only. Existing photo scoring and protected peers are retained.
import { FOCUS_ANALYSIS_VERSION } from "./upstream-focus.js";
export function lowKeyEvidence(group) {
  const a = group.analysis,
    f = a?.focus,
    e = f?.exposure;
  if (
    group.protected ||
    !group.hash ||
    !(a?.exposureScore < 65) ||
    !e ||
    e.version !== "luminance-1" ||
    f.version !== FOCUS_ANALYSIS_VERSION ||
    f.hasStrongSharp !== true ||
    f.isBlurry !== false
  )
    return false;
  const numbers = [
    e.darkFraction,
    e.brightFraction,
    e.midtoneFraction,
    e.p05,
    e.p95,
    f.sharpTileFraction,
    f.largestSharpCluster,
  ];
  if (!numbers.every(Number.isFinite)) return false;
  if (
    [
      e.darkFraction,
      e.brightFraction,
      e.midtoneFraction,
      f.sharpTileFraction,
      f.largestSharpCluster,
    ].some((v) => v < 0 || v > 1) ||
    e.p05 < 0 ||
    e.p95 > 255
  )
    return false;
  return (
    e.darkFraction >= 0.35 &&
    e.darkFraction <= 0.96 &&
    e.brightFraction <= 0.1 &&
    e.midtoneFraction >= 0.02 &&
    e.p95 - e.p05 >= 24 &&
    f.sharpTileFraction >= 0.04 &&
    f.largestSharpCluster >= 0.025
  );
}
