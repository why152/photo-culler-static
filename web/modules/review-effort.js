// Opt-in local observations, never inferred human quality/effort acceptance.
export function createEffortRun({
  id,
  role,
  operator,
  identity,
  algorithmVersion,
  preferences,
  scopeIds,
  sourceGroups,
  environment = null,
  preexistingDecisions = 0,
  startedAt = new Date().toISOString(),
}) {
  if (
    !["baseline", "assisted"].includes(role) ||
    !["human", "ai", "synthetic"].includes(operator)
  )
    throw Error("记录类型无效");
  return {
    version: 1,
    id,
    role,
    operator,
    identity,
    algorithmVersion,
    preferences: structuredClone(preferences),
    environment: structuredClone(environment),
    scopeIds: [...new Set(scopeIds)],
    sourceGroups,
    preexistingDecisions,
    startedAt,
    finishedAt: null,
    status: "running",
    foregroundMs: 0,
    clockGaps: 0,
    viewerIds: [],
    thumbnailExposureIds: [],
    decisionIds: [],
    resumedAfterReload: false,
  };
}
export class EffortClock {
  constructor(run, now = 0) {
    this.run = structuredClone(run);
    this.last = now;
    this.attending = false;
    if (this.run.status === "running") {
      this.run.status = "paused";
      this.run.resumedAfterReload = true;
    }
  }
  tick(now) {
    const delta = Math.max(0, now - this.last);
    if (this.run.status === "running" && this.attending) {
      this.run.foregroundMs += Math.min(delta, 10000);
      if (delta > 10000) this.run.clockGaps++;
    }
    this.last = now;
  }
  attention(value, now) {
    this.tick(now);
    this.attending = value;
  }
  resume(now) {
    if (this.run.status === "completed") throw Error("记录已结束");
    this.last = now;
    this.run.status = "running";
  }
  pause(now) {
    this.tick(now);
    if (this.run.status !== "completed") this.run.status = "paused";
  }
  finish(now, finishedAt = new Date().toISOString()) {
    this.tick(now);
    this.run.status = "completed";
    this.run.finishedAt = finishedAt;
  }
  observe(kind, id, now) {
    this.tick(now);
    if (
      this.run.status !== "running" ||
      !this.attending ||
      !this.run.scopeIds.includes(id)
    )
      return;
    const key = {
      viewer: "viewerIds",
      thumbnail: "thumbnailExposureIds",
      decision: "decisionIds",
    }[kind];
    if (!key) throw Error("观察类型无效");
    if (!this.run[key].includes(id)) this.run[key].push(id);
  }
}
export function comparePersonalEffort(baseline, assisted) {
  const valid = (r) =>
    r?.version === 1 &&
    r.status === "completed" &&
    Number.isFinite(r.foregroundMs) &&
    r.foregroundMs > 0 &&
    r.scopeIds?.length > 0 &&
    new Set(r.scopeIds).size === r.scopeIds.length &&
    Array.isArray(r.viewerIds) &&
    new Set(r.viewerIds).size === r.viewerIds.length &&
    r.viewerIds.every((id) => r.scopeIds.includes(id));
  if (
    !valid(baseline) ||
    !valid(assisted) ||
    baseline.role !== "baseline" ||
    assisted.role !== "assisted"
  )
    return {
      status: "incomplete-records",
      viewerReduction: null,
      foregroundTimeReduction: null,
    };
  if (baseline.operator !== "human" || assisted.operator !== "human")
    return {
      status: "nonhuman-observation",
      viewerReduction: null,
      foregroundTimeReduction: null,
    };
  if (baseline.viewerIds.length !== baseline.scopeIds.length)
    return {
      status: "baseline-not-fully-opened",
      viewerReduction: null,
      foregroundTimeReduction: null,
    };
  const sameDataset = baseline.identity === assisted.identity;
  const exposed = (r) =>
    new Set([...(r.thumbnailExposureIds ?? []), ...r.viewerIds]).size;
  return {
    status: "descriptive-personal-observation",
    viewerReduction:
      1 -
      assisted.viewerIds.length /
        assisted.scopeIds.length /
        (baseline.viewerIds.length / baseline.scopeIds.length),
    visualExposureReduction:
      1 -
      exposed(assisted) /
        assisted.scopeIds.length /
        (exposed(baseline) / baseline.scopeIds.length),
    foregroundTimeReduction:
      baseline.clockGaps || assisted.clockGaps
        ? null
        : 1 -
          assisted.foregroundMs /
            assisted.scopeIds.length /
            (baseline.foregroundMs / baseline.scopeIds.length),
    sameDataset,
    possiblePracticeEffect: sameDataset,
    baselinePreexistingDecisions: baseline.preexistingDecisions,
    assistedPreexistingDecisions: assisted.preexistingDecisions,
    comparableDifficultyVerified: false,
    independentQualityVerified: false,
    acceptance: "not-independent-acceptance",
  };
}
export function restoreEffortBackup(backup) {
  if (
    backup?.version !== 1 ||
    backup.type !== "local-review-effort" ||
    backup.data?.version !== 1 ||
    !Array.isArray(backup.data.runs)
  )
    throw Error("不支持的复核记录文件");
  const result = structuredClone(backup.data),
    seen = new Set();
  for (const r of result.runs) {
    if (
      r?.version !== 1 ||
      typeof r.id !== "string" ||
      !r.id ||
      seen.has(r.id) ||
      !["baseline", "assisted"].includes(r.role) ||
      !["human", "ai", "synthetic"].includes(r.operator) ||
      !["running", "paused", "completed"].includes(r.status) ||
      typeof r.identity !== "string" ||
      typeof r.algorithmVersion !== "string" ||
      !Number.isFinite(r.foregroundMs) ||
      r.foregroundMs < 0 ||
      !Number.isInteger(r.clockGaps) ||
      r.clockGaps < 0 ||
      !Array.isArray(r.scopeIds) ||
      !r.scopeIds.every((id) => typeof id === "string") ||
      new Set(r.scopeIds).size !== r.scopeIds.length
    )
      throw Error("复核记录字段无效");
    for (const key of ["viewerIds", "thumbnailExposureIds", "decisionIds"])
      if (
        !Array.isArray(r[key]) ||
        new Set(r[key]).size !== r[key].length ||
        r[key].some((id) => !r.scopeIds.includes(id))
      )
        throw Error("复核记录照片队列无效");
    seen.add(r.id);
    if (r.environment?.automation === true && r.operator === "human")
      r.operator = "synthetic";
    if (r.status === "running") {
      r.status = "paused";
      r.resumedAfterReload = true;
    }
    r.restoredFromBackup = true;
  }
  return result;
}
