import { PORTRAIT_VERSION } from "./modules/portrait-evidence.js";
import { SCENE_VERSION } from "./modules/scene-evidence-version.js";
import { galleryRows } from "./modules/cull-gallery.js";
import { BrowserReviewStore } from "./modules/browser-store.js";
import { inventory, checkAbort } from "./modules/cull-inventory.js";
import {
  migrateLegacy,
  validHuman,
  selectionState,
  ALGORITHM_VERSION,
} from "./modules/cull-session.js";
import { exactCandidates, digest } from "./modules/cull-similarity.js";
import { rank } from "./modules/cull-ranking.js";
import { needsTechnicalReview } from "./modules/cull-review-priority.js";
import {
  exportPlan,
  publicManifest,
  reviewCSV,
  createOutput,
  resumePlan,
  copyPlan,
  assertIndependent,
} from "./modules/cull-export.js";
import {
  acceptPlan,
  acceptanceMatches,
  defaultStrength,
} from "./modules/cull-acceptance.js";
import { ReviewDecisionHistory } from "./modules/review-persistence.js";
import { installBenchmark } from "./modules/cull-benchmark-ui.js";
import { installReviewEffort } from "./modules/review-effort-ui.js";
import { ViewerZoom } from "./modules/viewer-zoom.js";
import { PreviewUrlPool } from "./modules/preview-url-pool.js";
import { GridRenderWindow } from "./modules/grid-render-window.js";
import { reviewLayout, unitForPhoto } from "./modules/cull-gallery-layout.js";
const $ = (id) => document.getElementById(id);
const store = new BrowserReviewStore();
let portraitScope = null;
const expandedBatches = new Set();
const pendingDecisions = new Set();
let rangeAnchor = null, rangePending = false, shortcutPending = false;
// Portrait evidence is automatic. The hidden control preserves existing module contracts.
$("portrait").checked = true;
$("filter").value = "all";
let moreTools = false;
try {
  moreTools = sessionStorage.getItem("photo-culler-more-tools") === "true";
} catch {}
function syncGalleryShell() {
  const compact = document.body.dataset.tools === "simple";
  const reviewing = !$("results-space").hidden || !$("export-space").hidden;
  if (compact && reviewing) $("gallery-actions").prepend($("choose"));
  else $("choose-home").after($("choose"));
  $("choose").textContent = reviewing ? "选择其他文件夹" : "选择照片文件夹";
  $("global").hidden = compact && !reviewing && $("cancel").hidden;
}
function renderTools() {
  document.body.dataset.tools = moreTools ? "advanced" : "simple";
  $("tools-toggle").textContent = moreTools ? "收起设置" : "设置";
  $("tools-toggle").setAttribute("aria-expanded", String(moreTools));
  syncGalleryShell();
  if ($("accept") && !$("accept").disabled)
    $("accept").textContent = moreTools ? "接受整批推荐" : "整理照片";
}
$("tools-toggle").onclick = () => {
  moreTools = !moreTools;
  try {
    sessionStorage.setItem("photo-culler-more-tools", String(moreTools));
  } catch {}
  renderTools();
  if (
    !moreTools &&
    ["technical-review", "favorite", "burst"].includes($("filter").value)
  )
    $("filter").value = "all";
  if (root) {
    render();
    renderPlan();
  }
};
renderTools();
let effortController = null;
let root = null,
  session = null,
  groups = [],
  human = {},
  recommendations = {},
  batches = [],
  scan = { errors: [], skipped: [] };
let controller = null,
  worker = null,
  busy = false,
  paused = false,
  saveQueue = Promise.resolve(),
  persistenceError = null;
let savePending = 0;
let resumeRequested = false;
let target = null,
  output = null,
  plan = null,
  accepted = null,
  view = "import";
const reviewWindow = new GridRenderWindow({ batchSize: 24, overscanRows: 3 });
let reviewFrame = null,
  resetReviewScroll = true,
  reviewSnapshot = null;
let renderedSignature = "",
  rowNodes = new Map();
let viewerFullscreen = false;
let decisionHistory = new ReviewDecisionHistory();
const chosen = new Set(),
  gridPreviews = new PreviewUrlPool(),
  comparisonUrls = new Set();
const message = (text) => {
  $("feedback").textContent = text;
};
function show(space) {
  view = space;
  for (const name of ["import", "results", "export"])
    $(name + "-space").hidden = name !== space;
  for (const button of document.querySelectorAll("[data-space]")) {
    if (button.dataset.space === space)
      button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  if (space === "results") render();
  if (space === "export") renderPlan();
  syncGalleryShell();
  effortController?.surfaceChanged();
}
function setBusy(value) {
  busy = value;
  $("choose").disabled = value;
  $("cancel").hidden = !value;
  $("pause").hidden = !value || view === "export";
  syncGalleryShell();
  $("accept").disabled = value;
  $("mode").disabled = value;
  $("strength").disabled = value;
  $("portrait").disabled = value;
  $("portrait-keep").disabled = value;
  $("recommendation-quantity").disabled = value;
  updateSelectionControls();
  $("output-layout").disabled = value;
  $("include-protected").disabled = value;
  $("target").disabled = value;
  $("copy").disabled = value || !target || !groups.length || !!persistenceError;
  document
    .querySelectorAll("#sessions button")
    .forEach((b) => (b.disabled = value));
}
function release() {
  gridPreviews.clear();
}
function releaseComparison() {
  for (const value of comparisonUrls) URL.revokeObjectURL(value);
  comparisonUrls.clear();
}
function url(blob) {
  const result = URL.createObjectURL(blob);
  comparisonUrls.add(result);
  return result;
}
function save() {
  const patch = structuredClone({
    human,
    preferences: {
      mode: $("mode").value,
      strength: $("strength").value,
      includeProtected: $("include-protected").checked,
      portrait: $("portrait").checked,
      portraitKeep: Number($("portrait-keep").value),
      outputLayout: $("output-layout").value,
    },
    algorithmVersion: ALGORITHM_VERSION,
    acceptedPlan: accepted,
    benchmark: session?.benchmark ?? null,
    acceptedAlgorithm: accepted ? ALGORITHM_VERSION : null,
    splits: session?.splits ?? [],
    lastReport: session?.lastReport ?? null,
    lastOutput: session?.lastOutput ?? null,
  });
  const promise = saveQueue
    .catch(() => {})
    .then(() => store.saveSession(root, patch));
  savePending++;
  void promise
    .finally(() => {
      savePending--;
    })
    .catch(() => {});
  saveQueue = promise;
  promise.then(
    () => {
      persistenceError = null;
    },
    (error) => {
      persistenceError = error;
      message("审核保存失败：" + error.message + "。请下载 manifest 并重试。");
    },
  );
  return promise;
}
async function sessions() {
  try {
    const list = await store.listSessions();
    $("sessions").replaceChildren();
    $("sessions-title").hidden = !list.length;
    $("sessions").hidden = !list.length;
    for (const item of list) {
      const b = document.createElement("button");
      b.textContent =
        item.name + " · " + new Date(item.updatedAt).toLocaleString();
      b.disabled = busy;
      b.onclick = () => {
        if (!busy) void open(item.directory);
      };
      $("sessions").append(b);
    }
    if (!list.length) $("sessions").textContent = "还没有工作会话。";
  } catch (e) {
    message("浏览器会话存储不可用：" + e.message);
  }
}
async function permission(directory) {
  if (
    directory.requestPermission &&
    (await directory.requestPermission({ mode: "read" })) !== "granted"
  )
    throw new Error("读取权限被拒绝；请重新选择源目录。");
}
function runWorker(group, signal, thumbnail = null) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      worker?.terminate();
      worker = null;
      reject(signal.reason ?? new DOMException("已取消", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    const clean = () => signal.removeEventListener("abort", abort);
    worker.onmessage = ({ data }) => {
      if (data.id !== group.id) return;
      clean();
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = (e) => {
      clean();
      reject(new Error(e.message || "Worker 无法运行"));
    };
    (thumbnail ? Promise.resolve(thumbnail) : group.source.handle.getFile())
      .then((file) => {
        checkAbort(signal);
        worker.postMessage({
          protocol: "cull-v2",
          id: group.id,
          file,
          portrait: $("portrait").checked,
          sceneOnly: Boolean(thumbnail),
        });
      })
      .catch((e) => {
        clean();
        reject(e);
      });
  });
}
async function waitPause(signal) {
  while (paused) {
    checkAbort(signal);
    await new Promise((r) => setTimeout(r, 100));
  }
  checkAbort(signal);
}
async function open(directory) {
  if (busy) return;
  setBusy(true);
  try {
    await effortController?.pauseForContextChange();
    await saveQueue;
    if (persistenceError) throw persistenceError;
    await permission(directory);
    controller = new AbortController();
    const { signal } = controller;
    $("global").textContent = directory.name + " · 正在读取子文件夹…";
    if (root) await save();
    root = directory;
    resetReviewScroll = true;
    target = null;
    output = null;
    chosen.clear();
    portraitScope = null;
    expandedBatches.clear();
    decisionHistory = new ReviewDecisionHistory();
    rangeAnchor = null;
    accepted = null;
    session = await store.session(root);
    human = { ...session.human };
    accepted = session.acceptedPlan ?? null;
    $("include-protected").checked = false;
    $("portrait").checked = true;
    $("output-layout").value = session.preferences?.outputLayout === "keepers" ? "keepers" : "binary";
    $("portrait-keep").value = String(session.preferences?.portraitKeep ?? 1);
    $("portrait-budget").hidden = true;
    $("mode").value = "burst";
    $("strength").value = defaultStrength(
      $("mode").value,
      session.preferences?.strength,
    );
    syncQuantity();
    release();
    groups = [];
    recommendations = {};
    plan = null;
    scan = await inventory(root, {
      signal,
      onProgress: (_, path) => {
        $("global").textContent = root.name + " · 正在读取 " + path;
      },
    });
    groups = scan.groups;
    for (const group of groups)
      group.manualSplit = session.splits?.includes(group.id) ?? false;
    human = migrateLegacy(session.review, groups, human);
    worker = new Worker(new URL("./modules/cull-worker.js", import.meta.url), {
      type: "module",
    });
    let cache = null,
      previousCaches = [];
    try {
      cache = await store.analysisScope(root, {
        algorithmVersion: ALGORITHM_VERSION,
      });
      // Reuse verified face/pixel evidence; add scene descriptors without models.
      for (const algorithmVersion of ["rules-2.0-beta.6", "rules-2.0-beta.5"])
        previousCaches.push(await store.analysisScope(root, { algorithmVersion }));
    } catch {
      message("分析缓存不可用，继续本地重新计算。");
    }
    let done = 0;
    show("results");
    for (const group of groups) {
      await waitPause(signal);
      human[group.id] = validHuman(human[group.id], group);
      // Saved human choices are content-verified when reopened, not trusted by name/mtime.
      if (human[group.id].sourceSHA && group.source) {
        const currentHash = await digest(
          await group.source.handle.getFile(),
          signal,
        );
        if (currentHash !== human[group.id].sourceSHA) {
          human[group.id] = {
            decision: "review_later",
            favorite: false,
            fingerprint: group.fingerprint,
          };
          group.protected = true;
        }
      }
      if (group.source) {
        try {
          const file = await group.source.handle.getFile();
          const key = new File([file], encodeURIComponent(group.source.path), {
            lastModified: file.lastModified,
            type: file.type,
          });
          let cached = null;
          try {
            cached = await cache?.loadAnalysis(key);
            for (const previousCache of previousCaches)
              if (!cached) cached = await previousCache.loadAnalysis(key);
          } catch {
            /* Cache never blocks analysis. */
          }
          const verified =
            cached?.fingerprint === group.fingerprint &&
            cached.sourceSHA === (await digest(file, signal)) &&
            (!$("portrait").checked ||
              (cached.analysis?.portrait?.status === "ready" &&
                cached.analysis?.portrait?.version === PORTRAIT_VERSION));
          if (verified) {
            Object.assign(group, cached);
            if (group.analysis?.thumbnail && group.analysis.scene?.version !== SCENE_VERSION) {
              const result = await runWorker(group, signal, group.analysis.thumbnail);
              group.analysis.scene = result.scene;
            }
            try { await cache?.saveAnalysis(key, {
              analysis: group.analysis, hash: group.hash, metadata: group.metadata,
              sourceSHA: group.sourceSHA, fingerprint: group.fingerprint,
            }); } catch { /* Advisory cache. */ }
          }
          else {
            const result = await runWorker(group, signal);
            Object.assign(group, result);
            try {
              await cache?.saveAnalysis(key, {
                analysis: result.analysis,
                hash: result.hash,
                metadata: result.metadata,
                sourceSHA: result.sourceSHA,
                fingerprint: group.fingerprint,
              });
            } catch {
              /* Advisory cache. */
            }
          }
          if (!group.hash) group.protected = true;
        } catch (e) {
          checkAbort(signal);
          group.protected = true;
          group.error = e.message;
        }
      }
      $("global").textContent =
        root.name +
        " · " +
        groups.length +
        " 组 · 正在推荐最佳 " +
        ++done +
        " / " +
        groups.length;
      if (done % 8 === 0 || done === groups.length) recompute(false);
    }
    $("global").textContent = root.name + " · 正在查重复…";
    await exactCandidates(groups, { signal });
    checkAbort(signal);
    recompute(false);
    await save();
    await store.rememberDirectory(root);
    $("global").textContent =
      root.name + " · " + groups.length + " 组 · 本地分析完成 · 原件受保护";
    const portraitFailures = groups.filter(
      (g) => g.analysis?.portrait?.status === "unavailable",
    ).length;
    message(
      portraitFailures
        ? `筛选完成 · ${portraitFailures} 组使用基础分析`
        : $("portrait").checked
          ? "筛选完成"
          : "自动选择已完成；未选原件仍在源目录。",
    );
  } catch (e) {
    recompute(false);
    message(
      e.name === "AbortError"
        ? "已取消。未完成组保持保护；原件未改变。"
        : e.message,
    );
  } finally {
    worker?.terminate();
    worker = null;
    paused = false;
    $("pause").textContent = "暂停";
    setBusy(false);
    effortController?.contextReady();
    renderPlan();
    void sessions();
  }
}
function recompute(persist = true) {
  portraitScope = null;
  const result = rank(groups, {
    strength: $("strength").value,
    mode: $("mode").value,
    portrait: $("portrait").checked,
    portraitKeep: Number($("portrait-keep").value),
  });
  recommendations = result.recommendations;
  batches = result.batches;
  render();
  if (root && persist) void save();
}
function syncQuantity() {
  const value = { compact: 1, standard: 2, loose: 3 }[$("strength").value] ?? 1;
  $("recommendation-quantity").value = String(value);
  $("quantity-label").textContent = ["", "精简", "适中", "宽松"][value];
}
$("recommendation-quantity").oninput = async () => {
  if (busy) return;
  await effortController?.pauseForContextChange();
  const value = Number($("recommendation-quantity").value);
  $("strength").value = ["", "compact", "standard", "loose"][value];
  $("portrait-keep").value = String(value);
  syncQuantity();
  recompute();
};
function state(group) {
  return selectionState(human[group.id], recommendations[group.id]);
}
async function decide(group, decision, favorite = false) {
  if (busy || rangePending || pendingDecisions.has(group)) return;
  pendingDecisions.add(group);
  updateSelectionControls();
  const decisionSession = session?.id;
  const decisionContext = groups;
  const previousDecision = human[group.id];
  let recordedChange = null, appliedDecision = null;
  try {
    const sourceSHA = group.source
      ? await digest(await group.source.handle.getFile())
      : null;
    if (session?.id !== decisionSession || groups !== decisionContext || busy)
      return message("目录已改变，请在当前目录重新作决定。");
    const nextDecision = {
      decision: favorite ? "keep" : decision,
      favorite,
      fingerprint: group.fingerprint,
      sourceSHA,
    };
    decisionHistory.record(human, group.id, nextDecision);
    recordedChange = decisionHistory.changes.at(-1);
    appliedDecision = nextDecision;
    await save();
    effortController?.decision(group.id);
    render();
    return true;
  } catch (e) {
    if (groups === decisionContext && appliedDecision && human[group.id] === appliedDecision) {
      if (previousDecision === undefined) delete human[group.id];
      else human[group.id] = previousDecision;
      const index = decisionHistory.changes.indexOf(recordedChange);
      if (index >= 0) decisionHistory.changes.splice(index, 1);
      render();
    }
    message("无法保存决定：" + e.message);
    return false;
  } finally {
    pendingDecisions.delete(group);
    updateSelectionControls();
  }
}
async function selectThumbnail(group, event) {
  if (busy || rangePending || pendingDecisions.size) return;
  const rows = reviewSnapshot?.rows ?? [];
  const start = rows.findIndex(row => row.group.id === rangeAnchor);
  const end = rows.findIndex(row => row.group === group);
  if (!event.shiftKey || start < 0 || end < 0) {
    rangeAnchor = group.id;
    await togglePhoto(group);
    return;
  }
  const selected = state(group) !== "include";
  const targets = rows.slice(Math.min(start, end), Math.max(start, end) + 1).map(row => row.group);
  const context = groups, sessionId = session?.id;
  rangePending = true;
  for (const g of targets) pendingDecisions.add(g);
  updateSelectionControls();
  let recorded = false;
  try {
    const entries = [];
    for (const g of targets) {
      const sourceSHA = g.source ? await digest(await g.source.handle.getFile()) : null;
      entries.push([g.id, { decision: selected ? "keep" : "exclude", favorite: selected && Boolean(human[g.id]?.favorite), fingerprint: g.fingerprint, sourceSHA }]);
    }
    if (groups !== context || session?.id !== sessionId || busy) return;
    decisionHistory.recordBatch(human, entries);
    recorded = true;
    await save();
    for (const g of targets) effortController?.decision(g.id);
    render();
    message(`${selected ? "已选" : "已取消选择"} ${targets.length} 张 · U 撤销`);
  } catch (e) {
    if (recorded && groups === context) {
      decisionHistory.undo(human);
      render();
    }
    message("无法保存连续选择：" + e.message);
  } finally {
    for (const g of targets) pendingDecisions.delete(g);
    rangePending = false;
    updateSelectionControls();
  }
}
function button(text, action, selected = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.onclick = action;
  if (selected) b.className = "selected";
  return b;
}
function selectionIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", "M6 12.5 10 16.5 18 7.5");
  svg.append(path);
  return svg;
}
function setSelectionControl(control, group) {
  const selected = state(group) === "include";
  control.dataset.photoSelect = group.id;
  control.setAttribute("aria-pressed", String(selected));
  control.setAttribute(
    "aria-label",
    `${selected ? "取消选择" : "选择"} ${group.path}`,
  );
  control.title = `${selected ? "取消选择" : "选择"} · Shift 连选`;
  control.disabled = busy || pendingDecisions.has(group);
  control.setAttribute("aria-busy", String(pendingDecisions.has(group)));
  const label = control.querySelector(".selection-label");
  if (label) label.textContent = selected ? "已选" : "选择";
}
function updateSelectionControls() {
  for (const control of document.querySelectorAll("[data-photo-select]")) {
    const group = groups.find((g) => g.id === control.dataset.photoSelect);
    if (group) setSelectionControl(control, group);
  }
}
async function togglePhoto(group, restoreFocus = true) {
  if (busy || pendingDecisions.has(group)) return;
  const context = groups;
  const focusOrigin = document.activeElement;
  const batchKey = [...document.querySelectorAll("#grid .card")].find(
    (card) => card.dataset.groupId === group.id,
  )?.dataset.batchKey;
  await decide(group, state(group) === "include" ? "exclude" : "keep", false);
  const focusFree = [document.body, $("compare"), focusOrigin].includes(
    document.activeElement,
  );
  if (
    !restoreFocus &&
    context === groups &&
    $("compare").open &&
    compared[0] === group &&
    focusOrigin === $("viewer-select") &&
    focusFree
  )
    $("viewer-select").focus({ preventScroll: true });
  if (restoreFocus && context === groups && !$("compare").open && focusFree) {
    const replacement = [
      ...document.querySelectorAll("#grid [data-photo-select]"),
    ].find((b) => b.dataset.photoSelect === group.id);
    const peer =
      batchKey &&
      [...document.querySelectorAll("#grid .card")]
        .find((card) => card.dataset.batchKey === batchKey)
        ?.querySelector("[data-photo-select]");
    (replacement ?? peer ?? $("gallery-summary")).focus({
      preventScroll: true,
    });
  }
}
function toggleBatch(row) {
  const photo = row.group.id;
  const top = [...document.querySelectorAll("#grid .card")]
    .find((c) => c.dataset.groupId === photo)
    ?.getBoundingClientRect().top;
  if (expandedBatches.has(row.key)) expandedBatches.delete(row.key);
  else expandedBatches.add(row.key);
  render({ anchor: { id: photo, top: top ?? 120 } });
  const focused = [...document.querySelectorAll(".batch-toggle")].find(
    (b) => b.dataset.batchKey === row.key,
  );
  focused?.focus({ preventScroll: true });
  if (focused && !moreTools) {
    const toolbarBottom = $("review-toolbar").getBoundingClientRect().bottom;
    const top = focused.getBoundingClientRect().top;
    if (top < toolbarBottom + 8)
      window.scrollBy({ top: top - toolbarBottom - 8 });
  }
}
function makeBatchHeader(row) {
  const bar = document.createElement("div");
  bar.className = "batch-bar";
  const label = document.createElement("span");
  label.textContent = `${row.batch.length} 张 · 已选 ${row.batch.filter((x) => state(x) === "include").length}`;
  const toggle = button("收起", () => toggleBatch(row));
  toggle.className = "batch-toggle";
  toggle.dataset.batchKey = row.key;
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", "收起这组");
  bar.append(label, toggle);
  return bar;
}
function reviewGeometry() {
  const grid = $("grid"),
    width = Math.max(1, grid.clientWidth);
  const gap = moreTools ? 14 : innerWidth <= 700 ? 12 : 18;
  const columns =
    !moreTools && innerWidth <= 700
      ? 2
      : Math.max(
          1,
          Math.floor((width + gap) / ((moreTools ? 240 : 190) + gap)),
        );
  return {
    width,
    gap,
    columns,
    rowGap: moreTools ? 14 : 26,
    advanced: moreTools,
  };
}
function render(options = {}) {
  const scrollOnly = options.scrollOnly === true;

  const stats = { include: 0, suppress: 0 };
  for (const g of groups) {
    stats[state(g)]++;
  }
  $("stats").replaceChildren();
  for (const [key, label] of [
    ["include", "已选"],
    ["suppress", "未选"],
  ]) {
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = stats[key];
    div.append(strong, label);
    $("stats").append(div);
  }
  $("simple-result-guide").textContent =
    `已选 ${stats.include} 组，未选 ${stats.suppress} 组。所有原件始终保留。`;
  $("gallery-summary").textContent =
    `${groups.length} 项 · 已选 ${stats.include} · 未选 ${stats.suppress}`;
  const filter = $("filter").value;
  for (const b of document.querySelectorAll("[data-gallery-filter]"))
    b.setAttribute("aria-pressed", String(b.dataset.galleryFilter === filter));
  const visible = groups.filter((g) =>
    portraitScope
      ? portraitScope.has(g.id)
      : filter === "all" ||
        (filter === "shortlist" && state(g) === "include") ||
        (filter === "technical-review" &&
          needsTechnicalReview(g, recommendations[g.id], human[g.id])) ||
        (filter === "suppress" && state(g) === "suppress") ||
        (filter === "favorite" && human[g.id]?.favorite) ||
        (filter === "burst" &&
          batches.some((b) => b.length > 1 && b.some((x) => x.id === g.id))),
  );
  $("portrait-scope").hidden = !portraitScope;
  $("portrait-scope-text").textContent = portraitScope
    ? `正在查看这组全部 ${visible.length} 张；导出仍采用整个文件夹的推荐。点“保留 / 暂不导出”可改选。`
    : "";
  const rows =
    !moreTools && !portraitScope
      ? galleryRows(visible, batches, recommendations, state, expandedBatches)
      : visible.map((group) => ({ group }));
  const geometry = reviewGeometry();
  const layout = reviewLayout(rows, geometry);
  const gridTop = $("grid").getBoundingClientRect().top + scrollY;
  const offsets = [0];
  for (const unit of layout.units) offsets.push(offsets.at(-1) + unit.height);
  if (resetReviewScroll && !$("results-space").hidden) {
    resetReviewScroll = false;
    if (scrollY > gridTop) window.scrollTo({ top: Math.max(0, gridTop - 110) });
  }
  let desiredScroll = null;
  if (options.anchor) {
    const i = unitForPhoto(layout.units, options.anchor.id);
    if (i >= 0)
      desiredScroll = Math.max(0, gridTop + offsets[i] - options.anchor.top);
  }
  reviewWindow.batchSize = Math.max(1, Math.floor(120 / geometry.columns));
  const range = reviewWindow.updateVariable(layout.units, {
    scrollTop: Math.max(0, (desiredScroll ?? scrollY) - gridTop),
    viewportHeight: innerHeight,
  });
  const signature = [
    geometry.width,
    geometry.columns,
    moreTools,
    range.start,
    range.end,
    ...range.groups.map((u) => u.key),
  ].join(";");
  reviewSnapshot = { rows, layout, range, geometry, gridTop };
  if (scrollOnly && signature === renderedSignature) return;
  renderedSignature = signature;
  const pageRows = range.groups.flatMap((unit) => unit.cards ?? []);
  gridPreviews.retain(pageRows.map((row) => row.group.id));
  effortController?.resetGrid();
  const focused = document.activeElement;
  const focusCard = $("grid").contains(focused)
    ? focused.closest(".card")
    : null;
  const focusId = focusCard?.dataset.groupId;
  const focusSelector = focused?.matches("[data-photo-select]")
    ? "[data-photo-select]"
    : "img";
  const fragment = document.createDocumentFragment();
  const spacer = (height) => {
    const n = document.createElement("div");
    n.className = "review-spacer";
    n.setAttribute("aria-hidden", "true");
    n.style.height = height + "px";
    return n;
  };
  if (range.topOffset) fragment.append(spacer(range.topOffset));
  const nextNodes = new Map();
  const unitNodes = new Map();
  for (const unit of range.groups) {
    let node = scrollOnly ? rowNodes.get(unit.key) : null;
    if (!node) {
      node = document.createElement("div");
      node.className = "review-row review-" + unit.kind;
      if (unit.kind === "header") node.append(makeBatchHeader(unit.row));
      if (unit.kind === "end") {
        const end = document.createElement("div");
        end.className = "batch-end";
        node.append(end);
      }
    }
    node.style.height = unit.height + "px";
    node.style.setProperty("--review-columns", geometry.columns);
    node.style.setProperty("--review-column-gap", geometry.gap + "px");
    node.style.setProperty("--review-row-gap", geometry.rowGap + "px");
    if (!scrollOnly || !rowNodes.has(unit.key))
      node.dataset.needsCards = "true";
    nextNodes.set(unit.key, node);
    unitNodes.set(unit, node);
    fragment.append(node);
  }
  for (const unit of range.groups) {
    const parent = unitNodes.get(unit);
    if (unit.kind !== "cards" || parent.dataset.needsCards !== "true") continue;
    delete parent.dataset.needsCards;
    for (const row of unit.cards) {
      const g = row.group;
      const card = document.createElement("article");
      card.className = "card";
      card.dataset.groupId = g.id;
      card.setAttribute("aria-posinset", String(rows.indexOf(row) + 1));
      card.setAttribute("aria-setsize", String(rows.length));
      card.dataset.decision = state(g);
      const box = document.createElement("input");
      box.className = "advanced-control";
      box.type = "checkbox";
      box.checked = chosen.has(g.id);
      box.setAttribute("aria-label", "比较 " + g.path);
      box.onchange = () => {
        if (box.checked && chosen.size >= 4) {
          box.checked = false;
          message("最多比较 4 组");
          return;
        }
        if (box.checked) chosen.add(g.id);
        else chosen.delete(g.id);
      };
      card.append(box);
      const media = document.createElement("div");
      media.className = "photo-media";
      card.append(media);
      if (row.batch) {
        card.dataset.batchKey = row.key;
        card.dataset.batchExpanded = String(row.expanded);
      }
      if (row.batch && !row.expanded) card.classList.add("photo-stack");
      if (g.analysis?.thumbnail) {
        const img = document.createElement("img");
        img.src = gridPreviews.urlFor(g.id, g.analysis.thumbnail);
        img.alt = g.path;
        const openPhoto = () =>
          row.batch && !row.expanded ? toggleBatch(row) : void compare([g]);
        img.onclick = openPhoto;
        img.setAttribute("role", "button");
        img.setAttribute(
          "aria-label",
          row.batch && !row.expanded
            ? `查看这组 ${row.batch.length} 张`
            : `查看 ${g.path}`,
        );
        img.tabIndex = 0;
        img.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPhoto();
          }
        };
        media.append(img);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "media-placeholder";
        placeholder.textContent = g.members.some((m) =>
          /\.(mov|mp4|m4v|avi)$/i.test(m.path),
        )
          ? "视频"
          : g.members.some((m) =>
                /\.(rw2|raw|cr2|cr3|nef|arw|dng|orf|raf)$/i.test(m.path),
              )
            ? "RAW"
            : "无法预览";
        media.append(placeholder);
      }
      const selection = button("", event => void selectThumbnail(g, event));
      selection.className = "photo-select simple-control";
      selection.append(selectionIcon());
      setSelectionControl(selection, g);
      media.append(selection);
      const name = document.createElement("p");
      name.className = "photo-name";
      name.textContent = g.path;
      name.title = g.path;
      const memberCount = document.createElement("small");
      memberCount.className = "advanced-control";
      memberCount.textContent = " · " + g.members.length + " 个原始文件";
      name.append(memberCount);
      card.append(name);
      const detail = document.createElement("p");
      const m = recommendations[g.id];
      detail.className = "recommendation-detail advanced-control";
      const status = document.createElement("p");
      status.className = "simple-card-status";
      const manual =
        human[g.id]?.favorite ||
        ["keep", "exclude", "review_later"].includes(human[g.id]?.decision);
      card.dataset.origin = manual ? "manual" : "auto";
      status.textContent =
        manual ? "手动" : "自动";
      status.title = `${manual ? "手动" : "自动"}${state(g) === "include" ? "已选" : "未选"}`;
      status.setAttribute("aria-label", status.title);
      const portrait = g.analysis?.portrait;
      if (portrait?.faces?.length) {
        const faceStatus = document.createElement("p");
        faceStatus.className = "advanced-control";
        const portraitBatch = m?.portraitBatch
          ? batches.find((b) => b.some((x) => x.id === g.id))
          : null;
        faceStatus.textContent = portraitBatch
          ? `人物连拍 · 同组 ${portraitBatch.length} 张 · 自动推荐 ${portraitBatch.filter((x) => recommendations[x.id]?.plan === "include").length} 张`
          : "检测到人脸 · 未确定为同一连拍";
        card.append(faceStatus);
      }
      card.append(status);
      detail.textContent =
        {
          include: "建议保留",
          suppress: "暂不导出",
        }[state(g)] +
        " · " +
        (m?.reasons?.join("；") ?? g.error ?? "未分析") +
        (m
          ? " · " +
            ({
              exact: "同字节重复",
              "same-image-version": "疑似同图版本",
              burst: "连拍",
              unique: "独立照片",
              unknown: "关系未知",
            }[m.similarityKind] ?? "关系未知") +
            " · 同组 #" +
            m.rank
          : "");
      card.append(detail);
      const h = human[g.id] ?? {};
      card.append(
        button("拆出连拍", () => {
          if (busy) return;
          g.manualSplit = true;
          session.splits = [...new Set([...(session.splits ?? []), g.id])];
          recompute();
        }),
        button(
          h.favorite ? "★ 精选" : "☆ 精选",
          () => void decide(g, "keep", !h.favorite),
          h.favorite,
        ),
        button(
          "保留",
          () => void decide(g, "keep", h.favorite),
          h.decision === "keep",
        ),
        button(
          moreTools ? "暂不导出" : "不选",
          () => void decide(g, "exclude", false),
          h.decision === "exclude",
        ),
        button("恢复机器建议", () => void decide(g, "unreviewed")),
      );
      const actions = [...card.querySelectorAll("button")];
      // The overlay toggle is separate from advanced review/compare controls.
      for (const action of actions)
        if (action !== selection) action.classList.add("advanced-control");
      if (row.toggle || (row.batch && !row.expanded)) {
        const toggle = button(
          row.expanded ? "收起" : `共 ${row.batch.length} 张 · 已选 ${row.batch.filter(x => state(x) === "include").length}`,
          () => toggleBatch(row),
        );
        toggle.className = "batch-toggle";
        toggle.dataset.batchKey = row.key;
        toggle.setAttribute("aria-expanded", String(row.expanded));
        toggle.setAttribute(
          "aria-label",
          row.expanded ? "收起这组" : `展开 ${row.batch.length} 张`,
        );
        if (!row.expanded) {
          toggle.title = `${row.batch.length} 张 · 已选 ${row.batch.filter((x) => state(x) === "include").length}`;
          media.append(toggle);
        }
      }
      if (m?.portraitBatch && moreTools)
        card.append(
          button("看这组全部", () => {
            const batch = batches.find((b) => b.some((x) => x.id === g.id));
            portraitScope = new Set(batch.map((x) => x.id));
            chosen.clear();
            resetReviewScroll = true;
            render();
            $("portrait-scope").scrollIntoView({ block: "start" });
            $("portrait-scope-close").focus({ preventScroll: true });
          }),
        );
      parent.append(card);
    }
  }
  if (range.bottomOffset) fragment.append(spacer(range.bottomOffset));
  $("grid").classList.add("continuous-review");
  $("grid").dataset.virtual = String(range.virtual);
  $("grid").replaceChildren(fragment);
  if (desiredScroll !== null) window.scrollTo({ top: desiredScroll });
  rowNodes = nextNodes;
  for (const card of $("grid").querySelectorAll(".card"))
    effortController?.observeGrid(card, card.dataset.groupId);
  if (focusId)
    [...$("grid").querySelectorAll(".card")]
      .find((c) => c.dataset.groupId === focusId)
      ?.querySelector(focusSelector)
      ?.focus({ preventScroll: true });
  if (!scrollOnly) {
    renderPlan();
    updateViewerActions();
  }
}
function ensureReviewPhoto(id, selection = false) {
  if (!reviewSnapshot || $("results-space").hidden) return null;
  const existing = [...$("grid").querySelectorAll(".card")].find(
    (c) => c.dataset.groupId === id,
  );
  if (existing) {
    existing.scrollIntoView({ block: "nearest" });
    return existing.querySelector(
      selection ? "[data-photo-select]" : "img,[data-photo-select]",
    );
  }
  const { layout, range, gridTop } = reviewSnapshot;
  const unit = unitForPhoto(layout.units, id);
  if (unit < 0) return null;
  const top = gridTop + range.offsets[unit],
    bottom = gridTop + range.offsets[unit + 1];
  if (top < scrollY || bottom > scrollY + innerHeight)
    window.scrollTo({ top: Math.max(0, top - 90) });
  render({ scrollOnly: true });
  const card = [...$("grid").querySelectorAll(".card")].find(
    (c) => c.dataset.groupId === id,
  );
  return card?.querySelector(
    selection ? "[data-photo-select]" : "img,[data-photo-select]",
  );
}
const scheduleReview = () => {
  if (reviewFrame !== null || $("results-space").hidden) return;
  reviewFrame = requestAnimationFrame(() => {
    reviewFrame = null;
    render({ scrollOnly: true });
  });
};
window.addEventListener("scroll", scheduleReview, { passive: true });
window.addEventListener("resize", () => {
  if (reviewSnapshot && !$("results-space").hidden) {
    const { range, layout, gridTop } = reviewSnapshot;
    const i = range.offsets.findIndex(
      (offset, j) =>
        offset <= scrollY - gridTop && range.offsets[j + 1] > scrollY - gridTop,
    );
    const id = layout.units[Math.max(0, i)]?.cards?.[0]?.group.id;
    if (id && range.virtual) {
      render({
        anchor: {
          id,
          top: gridTop + (range.offsets[Math.max(0, i)] ?? 0) - scrollY,
        },
      });
      return;
    }
  }
  scheduleReview();
});
new ResizeObserver(scheduleReview).observe($("grid"));
$("grid").addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || !reviewSnapshot) return;
  const card = event.target.closest(".card");
  if (!card) return;
  const { rows, geometry } = reviewSnapshot;
  const index = rows.findIndex((r) => r.group.id === card.dataset.groupId);
  let next;
  if (event.key === "ArrowRight") next = index + 1;
  else if (event.key === "ArrowLeft") next = index - 1;
  else if (event.key === "ArrowDown") next = index + geometry.columns;
  else if (event.key === "ArrowUp") next = index - geometry.columns;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = rows.length - 1;
  else if (event.key === "Tab") {
    const focusables = [
      ...$("grid").querySelectorAll("img[tabindex],button"),
    ].filter((n) => !n.disabled && n.getClientRects().length);
    if (!event.shiftKey && event.target === focusables.at(-1)) next = index + 1;
    if (event.shiftKey && event.target === focusables[0]) next = index - 1;
  }
  if (next == null || next < 0 || next >= rows.length) return;
  event.preventDefault();
  ensureReviewPhoto(
    rows[next].group.id,
    event.target.matches("[data-photo-select]"),
  )?.focus({ preventScroll: true });
});
const acceptanceStatuses = [];
for (const space of ["results", "export"]) {
  const status = document.createElement("p");
  status.id = "acceptance-status-" + space;
  status.setAttribute("role", "status");
  status.tabIndex = -1;
  $(space + "-space")
    .querySelector("h1")
    .after(status);
  acceptanceStatuses.push(status);
}
const exportAccept = document.createElement("button");
exportAccept.textContent = "接受当前输出计划";

exportAccept.onclick = acceptCurrentPlan;
const exportUndo = document.createElement("button");
exportUndo.className = "advanced-control";
exportUndo.textContent = "取消本批采纳";
exportUndo.onclick = undoAcceptance;
$("copy").before(exportAccept, exportUndo);
const resumeButton = document.createElement("button");
resumeButton.textContent = "继续上次中断导出";
resumeButton.hidden = true;
$("copy").after(resumeButton);
resumeButton.onclick = () => {
  if (busy) return;
  try {
    plan = resumePlan(session.lastReport, groups);
    resumeRequested = true;
    $("confirm-text").textContent =
      "继续复制并校验上次输出 " +
      session.lastOutput.name +
      "，已成功内容复核后跳过；不同内容冲突将停止，不覆盖。";
    $("confirm").showModal();
  } catch (error) {
    message(error.message);
  }
};
function renderPlan() {
  resumeButton.hidden =
    !session?.lastOutput ||
    !["copying", "interrupted"].includes(session?.lastReport?.status);
  resumeButton.disabled = busy;
  const preview = currentPlan();
  const organized = preview.layout === "binary";
  $("include-protected-label").hidden = true;
  $("organization-note").textContent = organized
    ? "复制到新文件夹，原件保留。"
    : "仅复制已选照片，原件保留。";
  $("copy").textContent = organized ? "整理到此文件夹" : "复制已选照片";
  $("copy").hidden = !moreTools && !target;
  if (!busy && accepted && !acceptanceMatches(accepted, preview, groups)) {
    accepted = null;
    if (root) void save();
    message(
      "照片、人工决定或筛选设置已变化，旧采纳已失效；请重新接受当前计划。",
    );
  }
  if (!busy || !plan)
    plan = accepted && !busy ? resumePlan(accepted.plan, groups) : preview;
  const confirmed = !!accepted && !busy;
  for (const status of acceptanceStatuses)
    status.textContent = busy
      ? "正在处理，暂不能采纳"
      : confirmed
        ? "已采纳：" +
          accepted.plan.groupCount +
          " 组 / " +
          accepted.plan.fileCount +
          " 个文件。已保存本次输出计划；文件复制需独立确认。"
        : "尚未采纳：以下为推荐预览。接受后生成已确认输出计划；修改决定或设置后需重新采纳。";
  $("accept").disabled = busy || !groups.length || (confirmed && moreTools);
  $("accept").textContent = confirmed
    ? moreTools
      ? "已接受整批推荐"
      : "继续整理"
    : moreTools
      ? "接受整批推荐"
      : "整理照片";
  $("undo-accept").disabled = busy || !accepted;
  exportAccept.disabled = busy || !groups.length || confirmed;
  exportAccept.hidden = !moreTools && confirmed;
  exportAccept.textContent = moreTools ? "接受当前输出计划" : "确认当前选择";
  exportUndo.disabled = busy || !accepted;
  if (!plan) return;
  $("plan").hidden = !moreTools && organized;
  $("organization-preview").hidden = !organized;
  $("organization-total").hidden = !organized;
  $("organization-preview").replaceChildren();
  if (organized) {
    for (const [decision, label] of [
      ["include", "已选"],
      ["suppress", "未选"],
    ]) {
      const item = document.createElement("div");
      item.setAttribute("role", "listitem");
      const count = document.createElement("strong");
      count.textContent = plan.groups.filter(
        (g) => g.decision === decision,
      ).length;
      const name = document.createElement("span");
      name.textContent = label;
      item.append(count, name);
      $("organization-preview").append(item);
    }
    $("organization-total").textContent =
      `${plan.fileCount} 个文件 · ${(plan.bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  $("plan").textContent = moreTools
    ? plan.groupCount +
      " 照片组 / " +
      plan.fileCount +
      " 个原始文件 / " +
      (plan.bytes / 1024 / 1024).toFixed(1) +
      (organized
        ? " MB。目标按已选、未选分组。未选 "
        : " MB。目标内保留 Keepers/<源相对路径>。未选 ") +
      plan.groups.filter(g => g.decision === "suppress").length +
      " 组。"
    : organized
      ? [
          ["include", "已选"],
          ["suppress", "未选"],
        ]
          .map(
            ([decision, label]) =>
              `${label} ${plan.groups.filter((g) => g.decision === decision).length}`,
          )
          .join(" · ") + `（${(plan.bytes / 1024 / 1024).toFixed(1)} MB）`
      : `将复制 ${plan.groupCount} 组照片，共 ${plan.fileCount} 个文件（${(plan.bytes / 1024 / 1024).toFixed(1)} MB）。${plan.includeProtected ? "" : "未选照片不复制。"}`;
  $("unprocessed").textContent = JSON.stringify(
    {
      protected: plan.unprocessed,
      errors: scan.errors,
      skipped: scan.skipped,
      paths: plan.records.map((r) => r.source + " → " + r.destination),
    },
    null,
    2,
  );
  $("copy").disabled =
    busy || !target || !accepted || !plan.records.length || !!persistenceError;
}
function download(value, name, type = "application/json") {
  const a = document.createElement("a");
  const link = URL.createObjectURL(new Blob([value], { type }));
  a.href = link;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(link), 1000);
}
const zooms = [];
let compared = [],
  compareGeneration = 0;
let viewerOrder = [];
function applyZoom() {
  for (const { zoom, img } of zooms) {
    img.style.transformOrigin = "0 0";
    img.style.transform = `translate(${zoom.offsetX + zoom.contentX * (1 - zoom.zoomFactor)}px,${zoom.offsetY + zoom.contentY * (1 - zoom.zoomFactor)}px) scale(${zoom.zoomFactor})`;
  }
}
async function compare(list) {
  $("viewer-feedback").textContent = "";
  releaseComparison();
  $("zoom-one").disabled = true;
  const generation = ++compareGeneration;
  const comparisonSession = session?.id;
  compared = list;
  if (!$("compare").open) {
    viewerOrder = (
      reviewSnapshot?.rows.map((row) => row.group) ?? groups
    ).filter((g) => g.source && g.analysis?.thumbnail);
  }
  $("viewer-actions").hidden = list.length !== 1;
  updateViewerActions();
  zooms.length = 0;
  $("compare-images").replaceChildren();
  $("compare-images").className = list.length === 1 ? "single" : "";
  if (!$("compare").open) {
    $("compare").showModal();
  }
  for (const g of list) {
    if (!g.source) continue;
    const frame = document.createElement("div");
    frame.className = "compare-frame";
    const img = document.createElement("img");
    img.alt = g.path;
    img.draggable = false;
    let observed = false;
    img.onload = () => {
      if (
        !observed &&
        session?.id === comparisonSession &&
        generation === compareGeneration &&
        $("compare").open
      ) {
        observed = true;
        effortController?.viewerOpened(g.id);
      }
    };
    // At most four bounded preview bitmaps. Original 1:1 uses source dimensions but
    // oversized image decode is limited to the existing 1600px preview contract.
    frame.append(img);
    const caption = document.createElement("p");
    caption.textContent = g.path;
    frame.append(caption);
    $("compare-images").append(frame);
    const blob = g.analysis?.thumbnail;
    if (blob) img.src = url(blob);
    const file = await g.source.handle.getFile();
    const { decodeBitmap } = await import("./modules/photo-analysis-worker.js");
    let bitmap,
      width = 1600,
      height = 1000;
    try {
      bitmap = await decodeBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      if (generation !== compareGeneration || !$("compare").open) break;
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const preview = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (generation !== compareGeneration) break;
      img.src = url(preview);
    } catch (e) {
      message("比较预览降级：" + e.message);
    } finally {
      bitmap?.close();
    }
    const zoom = new ViewerZoom({ minZoom: 0.01, maxZoom: 64 });
    const rect = frame.getBoundingClientRect();
    zoom.setImage(rect.width, rect.height, width, height);
    zooms.push({ zoom, img, frame, file, original: false });
    $("zoom-one").disabled = false;
    frame.onwheel = (e) => {
      e.preventDefault();
      for (const item of $("sync").checked ? zooms : [{ zoom }])
        item.zoom.zoomAt(
          item.zoom.frameWidth / 2,
          item.zoom.frameHeight / 2,
          e.deltaY < 0 ? 1.15 : 1 / 1.15,
        );
      applyZoom();
    };
    let last = null;
    frame.onpointerdown = (e) => {
      last = { x: e.clientX, y: e.clientY };
      frame.setPointerCapture(e.pointerId);
    };
    frame.onpointermove = (e) => {
      if (!last) return;
      const dx = e.clientX - last.x,
        dy = e.clientY - last.y;
      for (const item of $("sync").checked ? zooms : [{ zoom }])
        item.zoom.panBy(dx, dy);
      last = { x: e.clientX, y: e.clientY };
      applyZoom();
    };
    frame.onpointerup = () => {
      last = null;
    };
    frame.onpointercancel = () => {
      last = null;
    };
  }
}
function updateViewerActions() {
  const g = compared[0];
  if (!g || compared.length !== 1) return;
  const index = viewerOrder.indexOf(g);
  $("viewer-prev").disabled = busy || index <= 0;
  $("viewer-next").disabled = busy || index >= viewerOrder.length - 1;
  $("viewer-keep").disabled = busy || pendingDecisions.has(g);
  $("viewer-exclude").disabled = busy || pendingDecisions.has(g);
  setSelectionControl($("viewer-select"), g);
  $("viewer-exclude").textContent = moreTools ? "暂不导出" : "不选";
  const manual =
    human[g.id]?.favorite ||
    ["keep", "exclude", "review_later"].includes(human[g.id]?.decision);
  $("viewer-decision").textContent = moreTools
    ? {
        include: "已选入导出",
        suppress: "暂不导出，原件保留",
      }[state(g)]
    : manual ? "手动" : "自动";
}
function browseViewer(delta) {
  const g = viewerOrder[viewerOrder.indexOf(compared[0]) + delta];
  if (!busy && g) void compare([g]);
}
$("viewer-select").append(selectionIcon());
const viewerSelectionLabel = document.createElement("span");
viewerSelectionLabel.className = "selection-label";
$("viewer-select").append(viewerSelectionLabel);
$("viewer-select").onclick = () => {
  if (compared[0]) void togglePhoto(compared[0], false);
};
$("viewer-prev").onclick = () => browseViewer(-1);
$("viewer-next").onclick = () => browseViewer(1);
$("viewer-keep").onclick = () => {
  if (compared[0])
    void decide(compared[0], "keep", human[compared[0].id]?.favorite ?? false);
};
$("viewer-exclude").onclick = () => {
  if (compared[0]) void decide(compared[0], "exclude", false);
};
$("gallery-back").onclick = () => show("results");
for (const b of document.querySelectorAll("[data-gallery-filter]"))
  b.onclick = () => {
    $("filter").value = b.dataset.galleryFilter;
    $("filter").dispatchEvent(new Event("change"));
  };
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) viewerFullscreen = false;
});
$("compare").addEventListener("close", () => {
  if (viewerFullscreen && document.fullscreenElement)
    void document.exitFullscreen();
  ++compareGeneration;
  zooms.length = 0;
  const returning = compared[0]?.id;
  compared = [];
  releaseComparison();
  render();
  if (returning) ensureReviewPhoto(returning)?.focus({ preventScroll: true });
});
$("zoom-reset").onclick = () => {
  for (const { zoom } of zooms) zoom.reset();
  applyZoom();
};
$("zoom-one").onclick = async () => {
  const generation = compareGeneration;
  let budget = 128 * 1024 * 1024;
  for (const item of zooms) {
    try {
      const { imageDimensions, orientedDimensions } =
        await import("./modules/image-dimensions.js");
      const metadata = await imageDimensions(item.file);
      const dimensions = metadata ? orientedDimensions(metadata) : null;
      if (!dimensions || dimensions.width * dimensions.height * 4 > budget) {
        message("内存保护：此组使用 1600px 预览的 1:1；原图像素放大未加载。");
      } else {
        budget -= dimensions.width * dimensions.height * 4;
        const link = url(item.file);
        item.img.src = link;
        await item.img.decode();
        if (generation !== compareGeneration) return;
        const rect = item.frame.getBoundingClientRect();
        item.zoom.setImage(
          rect.width,
          rect.height,
          dimensions.width,
          dimensions.height,
        );
        item.original = true;
      }
      const z = item.zoom;
      z.zoomAt(
        z.frameWidth / 2,
        z.frameHeight / 2,
        z.naturalWidth / z.contentWidth / z.zoomFactor,
      );
    } catch (e) {
      message("原图放大失败，保留预览：" + e.message);
    }
  }
  applyZoom();
};
const help = document.querySelector("main > details");
if (help) {
  help.id = "shortcut-help";
  const keys = document.createElement("p");
  keys.textContent =
    "快捷键：? 帮助；单图中 J/K 或方向键浏览，1 精选，2 保留，X 不选；保存后自动下一张。U 撤销，F 全屏，Esc 关闭。缩略图 Shift 点击勾选连续范围。输入框中不触发快捷键。";
  help.append(keys);
  const comparisonHelp = document.createElement("p");
  comparisonHelp.id = "compare-shortcuts";
  comparisonHelp.hidden = true;
  comparisonHelp.textContent = keys.textContent;
  $("compare").append(comparisonHelp);
}
document.addEventListener("keydown", (e) => {
  if (
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.target.closest("input,select,textarea,[contenteditable=true]")
  )
    return;
  if (document.getElementById("benchmark")?.open) return;
  if (e.key === "?") {
    e.preventDefault();
    if ($("compare").open)
      $("compare-shortcuts").hidden = !$("compare-shortcuts").hidden;
    else {
      help.open = !help.open;
      help.querySelector("summary").focus();
    }
    return;
  }
  if (e.key.toLowerCase() === "u") {
    e.preventDefault();
    if (busy || pendingDecisions.size) return;
    if (decisionHistory.undo(human)) { void save(); render(); }
    return;
  }
  if (!$("compare").open || busy) return;
  const key = e.key.toLowerCase(),
    g = compared[0];
  if (key === "f") {
    e.preventDefault();
    if (viewerFullscreen && document.fullscreenElement)
      void document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      void document.documentElement.requestFullscreen().then(
        () => {
          viewerFullscreen = true;
        },
        () => message("浏览器未允许全屏，仍可继续比较与缩放。"),
      );
    return;
  }
  if (compared.length === 1 && g && ["1", "2", "x"].includes(key)) {
    e.preventDefault();
    if (e.repeat || shortcutPending || pendingDecisions.size) return;
    const context = groups;
    const next = viewerOrder[viewerOrder.indexOf(g) + 1];
    shortcutPending = true;
    void (async () => {
      try {
        const saved = await decide(g, key === "x" ? "exclude" : "keep", key === "1");
        if (!saved || groups !== context || !$("compare").open || compared[0] !== g) return;
        if (next) await compare([next]);
        $("viewer-feedback").textContent = `${key === "x" ? "已不选" : key === "1" ? "已精选" : "已保留"}${next ? " · 下一张" : " · 已到最后一张"}`;
      } finally { shortcutPending = false; }
    })();
    return;
  }
  if (
    compared.length === 1 &&
    ["j", "k", "ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    const index = viewerOrder.indexOf(g),
      next = viewerOrder[index + (["j", "ArrowLeft"].includes(e.key) ? -1 : 1)];
    if (next) void compare([next]);
  }
});
window.addEventListener("resize", () => {
  if (!$("compare").open) return;
  if (compared.length > 2 && innerWidth < 1100) {
    void compare(compared.slice(0, 2));
    message("窗口较窄，已降级为双图比较。");
  } else {
    for (const { zoom, frame } of zooms) {
      const rect = frame.getBoundingClientRect();
      zoom.resize(rect.width, rect.height);
    }
    applyZoom();
  }
});
for (const b of document.querySelectorAll("[data-space]"))
  b.onclick = () => show(b.dataset.space);
$("choose").onclick = () => {
  if (busy) return;
  window
    .showDirectoryPicker({ id: "photo-culler-source", mode: "read" })
    .then(open, (e) => {
      if (e.name !== "AbortError") message(e.message);
    });
};
$("strength").onchange = async () => {
  syncQuantity();
  $("portrait-keep").value = $("recommendation-quantity").value;
  await effortController?.pauseForContextChange();
  if (!busy) recompute();
};
$("mode").onchange = async () => {
  await effortController?.pauseForContextChange();
  if (!busy) recompute();
};
$("portrait-scope-close").onclick = () => {
  portraitScope = null;
  chosen.clear();
  resetReviewScroll = true;
  render();
};
$("filter").onchange = () => {
  portraitScope = null;
  resetReviewScroll = true;
  render();
};
function currentPlan() {
  return {
    ...exportPlan(
      groups,
      human,
      recommendations,
      false,
      { organize: $("output-layout").value === "binary", binary: true },
    ),
    preferences: {
      mode: $("mode").value,
      strength: $("strength").value,
      portrait: $("portrait").checked,
      portraitKeep: Number($("portrait-keep").value),
      outputLayout: $("output-layout").value,
    },
  };
}
async function acceptCurrentPlan() {
  if (busy || !root || !groups.length) return;
  const previous = accepted;
  const candidate = currentPlan();
  accepted = acceptPlan(candidate, groups);
  try {
    await save();
    render();
    show("export");
    $("export-space").scrollIntoView({ block: "start" });
    $("acceptance-status-export").focus({ preventScroll: true });
    message(
      !moreTools
        ? "选择保存位置，确认后开始复制。"
        : "已采纳 " +
            candidate.groupCount +
            " 组 / " +
            candidate.fileCount +
            " 个文件。输出计划已保存；选择目标并确认后才会复制，原件未改变。",
    );
  } catch (error) {
    accepted = previous;
    renderPlan();
    message("采纳保存失败：" + error.message + "。请重试。");
  }
}
async function undoAcceptance() {
  if (busy || !accepted) return;
  const previous = accepted;
  accepted = null;
  try {
    await save();
    render();
    message(
      "已取消采纳，输出恢复为未确认预览；人工保留和精选未改变，未执行任何文件操作。",
    );
  } catch (error) {
    accepted = previous;
    renderPlan();
    message("取消采纳保存失败：" + error.message);
  }
}
$("accept").onclick = () => {
  if (accepted && !moreTools && !busy) {
    show("export");
    return;
  }
  return acceptCurrentPlan();
};
$("undo-accept").onclick = undoAcceptance;
$("compare-two").onclick = () => {
  const selected = groups.filter((g) => chosen.has(g.id) && g.source);
  if (selected.length !== 2) return message("请勾选 2 张可分析图片。");
  void compare(selected);
};
$("compare-four").onclick = () => {
  const selected = groups.filter((g) => chosen.has(g.id) && g.source);
  if (selected.length < 2) return message("请勾选 2–4 张图片。");
  void compare(
    selected.slice(
      0,
      window.innerWidth < 1100 ||
        (navigator.deviceMemory && navigator.deviceMemory < 4)
        ? 2
        : 4,
    ),
  );
};
$("output-layout").onchange = () => {
  renderPlan();
  if (root) void save();
};
$("include-protected").onchange = () => {
  renderPlan();
  if (root) void save();
};
$("download").onclick = () => {
  renderPlan();
  download(
    JSON.stringify(publicManifest(plan), null, 2),
    "photo-culler-manifest.json",
  );
};
$("download-csv").onclick = () => {
  renderPlan();
  download(reviewCSV(plan), "photo-culler-review.csv", "text/csv");
};
$("target").onclick = async () => {
  try {
    if (!root) throw new Error("请先导入源目录");
    const picked = await window.showDirectoryPicker({
      id: "photo-culler-output",
      mode: "readwrite",
    });
    await assertIndependent(root, picked);
    target = picked;
    output = null;
    $("target-name").textContent = target.name + " / 新建整理文件夹";
    renderPlan();
    if (!moreTools && accepted && plan.layout === "binary")
      $("copy").click();
  } catch (e) {
    message(
      ["AbortError", "NotAllowedError", "SecurityError"].includes(e.name)
        ? "未取得目标写权限或已取消选择；本次未导出照片，可继续筛选或重试。"
        : e.message,
    );
  }
};
$("copy").onclick = () => {
  resumeRequested = false;
  renderPlan();
  if (!accepted || busy || !target) return;
  $("confirm-text").textContent =
    (plan.layout === "binary" ? "按已选、未选分组复制 " : "复制 ") +
    plan.fileCount +
    " 个文件（" +
    (plan.bytes / 1024 / 1024).toFixed(1) +
    " MB）到 " +
    target.name +
    "，原件只读。输出冲突将中止，不覆盖。";
  $("confirm").showModal();
};
$("confirm-cancel").onclick = () => $("confirm").close();
$("confirm-copy").onclick = async () => {
  $("confirm").close();
  if (!resumeRequested) renderPlan();
  if (busy || (!target && !resumeRequested) || (!resumeRequested && !accepted))
    return;
  const execution = plan;
  setBusy(true);
  controller = new AbortController();
  try {
    await saveQueue;
    if (resumeRequested) {
      output = session.lastOutput;
      await assertIndependent(root, output.directory);
      if (
        output.directory.requestPermission &&
        (await output.directory.requestPermission({ mode: "readwrite" })) !==
          "granted"
      )
        throw new Error("输出目录权限被拒绝，保留原样。");
    } else output = await createOutput(root, target);
    session.lastOutput = output;
    session.lastReport = publicManifest({ ...execution, status: "copying" });
    await save();
    message("正在复制到 " + output.name);
    await copyPlan(execution, output.directory, {
      signal: controller.signal,
      onProgress: (n, total) => message("正在复制与校验 " + n + " / " + total),
    });
    plan = execution;
    session.lastReport = publicManifest(execution);
    await save();
    message(
      "已复制并校验 " +
        execution.fileCount +
        " 个原始文件 → " +
        output.name +
        "。源目录未改变。",
    );
  } catch (e) {
    plan = execution;
    session.lastReport = publicManifest(execution);
    try {
      await save();
    } catch {}
    message(
      "导出未完成：" +
        e.message +
        "。已成功文件保留，原件未改变。可下载记录；重新确认会生成独立输出目录。",
    );
  } finally {
    resumeRequested = false;
    setBusy(false);
    renderPlan();
  }
};
$("cancel").onclick = () =>
  controller?.abort(new DOMException("用户取消", "AbortError"));
$("pause").onclick = () => {
  paused = !paused;
  $("pause").textContent = paused ? "继续" : "暂停";
};
if (!window.isSecureContext || !window.showDirectoryPicker) {
  $("choose").disabled = true;
  message(
    "需要 HTTPS 与支持目录读取的 Chrome / Edge；当前浏览器无法读取目录。",
  );
}
window.addEventListener("beforeunload", (event) => {
  if (savePending || persistenceError) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  message("操作失败：" + (event.reason?.message ?? event.reason));
});
window.addEventListener("pagehide", () => {
  controller?.abort();
  worker?.terminate();
  releaseComparison();
  release();
});
void sessions();

installBenchmark({
  getState: () => ({
    groups,
    recommendations,
    session,
    busy,
    preferences: {
      mode: $("mode").value,
      strength: $("strength").value,
      portrait: $("portrait").checked,
      portraitKeep: Number($("portrait-keep").value),
    },
  }),
  save,
  message,
  download,
});

function persistEffort(data, sessionId) {
  if (!root || session?.id !== sessionId)
    return Promise.reject(new Error("目录会话已变化"));
  const directory = root;
  const promise = saveQueue
    .catch(() => {})
    .then(() =>
      store.saveSession(directory, { effort: structuredClone(data) }),
    );
  saveQueue = promise.catch(() => {});
  return promise;
}
effortController = installReviewEffort({
  getState: () => ({
    groups,
    human,
    session,
    busy,
    view,
    preferences: {
      mode: $("mode").value,
      strength: $("strength").value,
      portrait: $("portrait").checked,
      portraitKeep: Number($("portrait-keep").value),
    },
  }),
  persist: persistEffort,
  message,
  download,
  onStart: (role) => {
    $("filter").value = role === "baseline" ? "all" : "technical-review";
    resetReviewScroll = true;
    show("results");
  },
});
