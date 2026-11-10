import { ALGORITHM_VERSION } from "./cull-session.js";
export function benchmarkIdentity(groups) {
  return JSON.stringify(
    groups.map((g) => [g.id, g.fingerprint, g.sourceSHA ?? null]),
  );
}
export function createBenchmark(
  groups,
  recommendations,
  { split = "held-out", size = 500, preferences = null } = {},
) {
  const deck = groups.map((g) => g.id);
  for (let i = deck.length - 1; i > 0; i--) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const j = random[0] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  deck.splice(Math.max(1, Math.min(size, deck.length)));
  return {
    version: 1,
    algorithmVersion: ALGORITHM_VERSION,
    identity: benchmarkIdentity(groups),
    split,
    importedProxy: false,
    preferences: structuredClone(preferences),
    startedAt: new Date().toISOString(),
    deck,
    index: 0,
    labels: {},
    recommendations: structuredClone(recommendations),
  };
}
export function evaluateBenchmark(study) {
  const ids = study.deck,
    required = ids.filter((id) => study.labels[id]?.mustKeep === true),
    classified = ids.filter(
      (id) => typeof study.labels[id]?.mustKeep === "boolean",
    );
  const include = (id) => study.recommendations[id]?.plan === "include";
  const visible = (id) => study.recommendations[id]?.plan !== "suppress";
  const recalled = required.filter(include),
    safeRecall = required.filter(visible),
    hidden = required.filter((id) => !visible(id));
  const moments = new Map();
  let momentsComplete = required.length > 0;
  for (const id of required) {
    const key = study.labels[id].momentId?.trim();
    if (!key) {
      momentsComplete = false;
      continue;
    }
    const list = moments.get(key) ?? [];
    list.push(id);
    moments.set(key, list);
  }
  const momentVisibleRecall = momentsComplete
    ? [...moments.keys()].filter((moment) =>
        ids.some(
          (id) =>
            study.labels[id]?.momentId?.trim() === moment &&
            typeof study.labels[id]?.mustKeep === "boolean" &&
            study.labels[id]?.usable !== false &&
            visible(id),
        ),
      ).length / moments.size
    : null;
  const momentRecall = momentsComplete
    ? [...moments.keys()].filter((moment) =>
        ids.some(
          (id) =>
            study.labels[id]?.momentId?.trim() === moment &&
            typeof study.labels[id]?.mustKeep === "boolean" &&
            study.labels[id]?.usable !== false &&
            include(id),
        ),
      ).length / moments.size
    : null;
  const complete = classified.length === ids.length;
  const humanConfirmed = classified.filter(
    (id) => study.labels[id].source === "human",
  ).length;
  return {
    algorithmVersion: study.algorithmVersion,
    split: study.split,
    frozenPreferences: study.preferences ?? null,
    total: ids.length,
    labeled: classified.length,
    uncertain: ids.length - classified.length,
    required: required.length,
    shortlistPhotoRecall: required.length
      ? recalled.length / required.length
      : null,
    visiblePhotoRecall: required.length
      ? safeRecall.length / required.length
      : null,
    importantMomentRecall: momentRecall,
    importantVisibleMomentRecall: momentVisibleRecall,
    hiddenWantedPhotoIds: hidden,
    shortlistCount: ids.filter(include).length,
    visibleCount: ids.filter(visible).length,
    visibleCountReduction: ids.length
      ? 1 - ids.filter(visible).length / ids.length
      : null,
    humanConfirmed,
    metricsProvenance:
      humanConfirmed === classified.length ? "human" : "ai-proxy",
    measuredHumanTimeReduction: null,
    measuredHumanReviewReduction: null,
    acceptance: !complete
      ? "incomplete-labels"
      : humanConfirmed < classified.length
        ? "ai-proxy-only"
        : study.importedProxy
          ? "human-confirmed-ai-draft-not-independent-blind"
          : study.blindingAttested !== true
            ? "blinding-not-attested"
            : study.split !== "held-out"
              ? "calibration-only"
              : ids.length < 500 || ids.length > 1000
                ? "outside-heldout-size"
                : !study.preferences
                  ? "frozen-settings-unrecorded"
                  : momentRecall === null
                    ? "missing-important-moment-labels"
                    : momentRecall < 0.95
                      ? "recall-below-target"
                      : "recall-passed-human-effort-unmeasured",
  };
}
export function importProxyLabels(draft, groups) {
  if (
    draft?.version !== 1 ||
    draft.provenance !== "ai-proxy" ||
    !Array.isArray(draft.labels)
  )
    throw new Error("需要 version 1 的 AI 代理标签文件");
  const labels = {},
    unmatched = [];
  for (const item of draft.labels) {
    if (
      ![true, false, null].includes(item.mustKeep) ||
      typeof item.sourceSHA256 !== "string"
    )
      throw new Error("标签字段无效");
    const group = groups.find(
      (g) =>
        g.source?.path === item.relativePath &&
        g.sourceSHA === item.sourceSHA256,
    );
    if (!group) {
      unmatched.push(item.relativePath);
      continue;
    }
    labels[group.id] = {
      mustKeep: item.mustKeep,
      momentId: String(item.momentId ?? ""),
      reason: String(item.reason ?? ""),
      confidence: item.confidence ?? "uncertain",
      source: "ai-proxy",
    };
  }
  return { labels, unmatched };
}

export function restoreBenchmark(backup, groups) {
  const study = backup?.study;
  if (
    study?.version !== 1 ||
    study.algorithmVersion !== ALGORITHM_VERSION ||
    study.identity !== benchmarkIdentity(groups)
  )
    throw new Error("备份来源或算法与当前会话不一致，未恢复");
  const ids = new Set(groups.map((g) => g.id));
  if (
    !Array.isArray(study.deck) ||
    !study.deck.length ||
    new Set(study.deck).size !== study.deck.length ||
    study.deck.some((id) => !ids.has(id)) ||
    !["held-out", "calibration"].includes(study.split) ||
    !Number.isInteger(study.index) ||
    study.index < 0 ||
    study.index > study.deck.length
  )
    throw new Error("标注备份的队列或进度无效");
  const deck = new Set(study.deck);
  if (
    !study.labels ||
    typeof study.labels !== "object" ||
    Array.isArray(study.labels) ||
    Object.entries(study.labels).some(
      ([id, label]) =>
        !deck.has(id) ||
        !label ||
        ![true, false, null].includes(label.mustKeep) ||
        !["human", "ai-proxy"].includes(label.source) ||
        typeof label.momentId !== "string",
    )
  )
    throw new Error("标注备份字段无效");
  if (
    !study.recommendations ||
    study.deck.some(
      (id) =>
        !["include", "suppress", "protected", "unknown"].includes(
          study.recommendations[id]?.plan,
        ) || study.recommendations[id]?.algorithmVersion !== ALGORITHM_VERSION,
    )
  )
    throw new Error("备份的冻结推荐无效");
  if (
    study.preferences &&
    (!["burst", "album"].includes(study.preferences.mode) ||
      !["compact", "standard", "loose"].includes(study.preferences.strength))
  )
    throw new Error("备份筛选设置无效");
  const restored = structuredClone(study);
  // Old backups without explicit provenance cannot acquire independent-blind status.
  restored.importedProxy =
    study.importedProxy !== false ||
    Object.values(study.labels).some((label) => label.source === "ai-proxy");
  return restored;
}
