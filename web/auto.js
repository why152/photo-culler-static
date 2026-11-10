import { BrowserReviewStore } from "./modules/browser-store.js";
import { inventory, checkAbort } from "./modules/cull-inventory.js";
import {
  migrateLegacy,
  validHuman,
  outputDecision,
  ALGORITHM_VERSION,
} from "./modules/cull-session.js";
import { exactCandidates, digest } from "./modules/cull-similarity.js";
import { rank } from "./modules/cull-ranking.js";
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
  nextPageOffset,
} from "./modules/cull-acceptance.js";
import { ReviewDecisionHistory } from "./modules/review-persistence.js";
import { installBenchmark } from "./modules/cull-benchmark-ui.js";
import { ViewerZoom } from "./modules/viewer-zoom.js";
const $ = (id) => document.getElementById(id);
const store = new BrowserReviewStore();
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
  limit = 60,
  offset = 0,
  saveQueue = Promise.resolve(),
  persistenceError = null;
let savePending = 0;
let resumeRequested = false;
let target = null,
  output = null,
  plan = null,
  accepted = null,
  view = "import";
let visibleCount = 0;
let viewerFullscreen = false;
let decisionHistory = new ReviewDecisionHistory();
const chosen = new Set(),
  urls = new Set(),
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
}
function setBusy(value) {
  busy = value;
  $("choose").disabled = value;
  $("cancel").hidden = !value;
  $("pause").hidden = !value || view === "export";
  $("accept").disabled = value;
  $("mode").disabled = value;
  $("strength").disabled = value;
  $("include-protected").disabled = value;
  $("target").disabled = value;
  $("copy").disabled = value || !target || !groups.length || !!persistenceError;
  document
    .querySelectorAll("#sessions button")
    .forEach((b) => (b.disabled = value));
}
function release() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
}
function releaseComparison() {
  for (const value of comparisonUrls) URL.revokeObjectURL(value);
  comparisonUrls.clear();
}
function url(blob, comparison = false) {
  const result = URL.createObjectURL(blob);
  (comparison ? comparisonUrls : urls).add(result);
  return result;
}
function save() {
  const patch = structuredClone({
    human,
    preferences: {
      mode: $("mode").value,
      strength: $("strength").value,
      includeProtected: $("include-protected").checked,
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
function runWorker(group, signal) {
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
    group.source.handle
      .getFile()
      .then((file) => {
        checkAbort(signal);
        worker.postMessage({ protocol: "cull-v2", id: group.id, file });
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
    await saveQueue;
    if (persistenceError) throw persistenceError;
    await permission(directory);
    controller = new AbortController();
    const { signal } = controller;
    $("global").textContent = directory.name + " · 正在读取子文件夹…";
    if (root) await save();
    root = directory;
    offset = 0;
    target = null;
    output = null;
    chosen.clear();
    decisionHistory = new ReviewDecisionHistory();
    accepted = null;
    session = await store.session(root);
    human = { ...session.human };
    accepted = session.acceptedPlan ?? null;
    $("include-protected").checked =
      session.preferences?.includeProtected ??
      accepted?.plan?.includeProtected ??
      false;
    $("mode").value = session.preferences?.mode ?? "burst";
    $("strength").value = defaultStrength(
      $("mode").value,
      session.preferences?.strength,
    );
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
    let cache = null;
    try {
      cache = await store.analysisScope(root, {
        algorithmVersion: ALGORITHM_VERSION,
      });
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
          } catch {
            /* Cache never blocks analysis. */
          }
          const verified =
            cached?.fingerprint === group.fingerprint &&
            cached.sourceSHA === (await digest(file, signal));
          if (verified) Object.assign(group, cached);
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
    message("规则短名单已生成。建议与待复核默认可见；未选中原件仍在源目录。");
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
    renderPlan();
    void sessions();
  }
}
function recompute(persist = true) {
  const result = rank(groups, {
    strength: $("strength").value,
    mode: $("mode").value,
  });
  recommendations = result.recommendations;
  batches = result.batches;
  render();
  if (root && persist) void save();
}
function state(group) {
  return outputDecision(human[group.id], recommendations[group.id]);
}
async function decide(group, decision, favorite = false) {
  if (busy) return;
  try {
    const sourceSHA = group.source
      ? await digest(await group.source.handle.getFile())
      : null;
    const nextDecision = {
      decision: favorite ? "keep" : decision,
      favorite,
      fingerprint: group.fingerprint,
      sourceSHA,
    };
    decisionHistory.record(human, group.id, nextDecision);
    await save();
    render();
  } catch (e) {
    message("无法保存决定：" + e.message);
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
function render() {
  const stats = { include: 0, protected: 0, suppress: 0, unprocessed: 0 };
  for (const g of groups) {
    stats[state(g)]++;
    if (!g.hash) stats.unprocessed++;
  }
  $("stats").replaceChildren();
  for (const [key, label] of [
    ["include", "建议保留"],
    ["protected", "待复核"],
    ["suppress", "暂不导出"],
    ["unprocessed", "未能分析"],
  ]) {
    const div = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = stats[key];
    div.append(strong, label);
    $("stats").append(div);
  }
  const filter = $("filter").value;
  const visible = groups.filter(
    (g) =>
      filter === "all" ||
      (filter === "shortlist" && state(g) !== "suppress") ||
      (filter === "suppress" && state(g) === "suppress") ||
      (filter === "favorite" && human[g.id]?.favorite) ||
      (filter === "burst" &&
        batches.some((b) => b.length > 1 && b.some((x) => x.id === g.id))),
  );
  visibleCount = visible.length;
  if (offset >= visibleCount) offset = 0;
  // Bound DOM and active URLs. Revoke old previews before rebuilding a page.
  release();
  $("grid").replaceChildren();
  for (const g of visible.slice(offset, offset + limit)) {
    const card = document.createElement("article");
    card.className = "card";
    const box = document.createElement("input");
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
    if (g.analysis?.thumbnail) {
      const img = document.createElement("img");
      img.src = url(g.analysis.thumbnail);
      img.alt = g.path;
      img.onclick = () => void compare([g]);
      img.tabIndex = 0;
      img.onkeydown = (e) => {
        if (e.key === "Enter") void compare([g]);
      };
      card.append(img);
    }
    const name = document.createElement("p");
    name.textContent = g.path + " · " + g.members.length + " 个原始文件";
    card.append(name);
    const detail = document.createElement("p");
    const m = recommendations[g.id];
    detail.textContent =
      { include: "建议保留", protected: "待复核 / 保护", suppress: "暂不导出" }[
        state(g)
      ] +
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
        "暂不导出",
        () => void decide(g, "exclude", false),
        h.decision === "exclude",
      ),
      button(
        "稍后复核",
        () => void decide(g, "review_later"),
        h.decision === "review_later",
      ),
      button("恢复机器建议", () => void decide(g, "unreviewed")),
    );
    $("grid").append(card);
  }
  $("more").hidden = visible.length <= limit;
  $("more").textContent =
    offset + limit < visible.length ? "下一页 60 组" : "回到第一页";
  renderPlan();
}
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
  $("accept").disabled = busy || !groups.length || confirmed;
  $("accept").textContent = confirmed ? "已接受整批推荐" : "接受整批推荐";
  $("undo-accept").disabled = busy || !accepted;
  exportAccept.disabled = busy || !groups.length || confirmed;
  exportUndo.disabled = busy || !accepted;
  if (!plan) return;
  $("plan").textContent =
    plan.groupCount +
    " 照片组 / " +
    plan.fileCount +
    " 个原始文件 / " +
    (plan.bytes / 1024 / 1024).toFixed(1) +
    " MB。目标内保留 Keepers/<源相对路径>。未分析及待复核 " +
    plan.unprocessed.length +
    " 组。";
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
function applyZoom() {
  for (const { zoom, img } of zooms) {
    img.style.transformOrigin = "0 0";
    img.style.transform = `translate(${zoom.offsetX + zoom.contentX * (1 - zoom.zoomFactor)}px,${zoom.offsetY + zoom.contentY * (1 - zoom.zoomFactor)}px) scale(${zoom.zoomFactor})`;
  }
}
async function compare(list) {
  releaseComparison();
  $("zoom-one").disabled = true;
  const generation = ++compareGeneration;
  compared = list;
  zooms.length = 0;
  $("compare-images").replaceChildren();
  $("compare-images").className = list.length === 1 ? "single" : "";
  if (!$("compare").open) $("compare").showModal();
  for (const g of list) {
    if (!g.source) continue;
    const frame = document.createElement("div");
    frame.className = "compare-frame";
    const img = document.createElement("img");
    img.alt = g.path;
    img.draggable = false;
    // At most four bounded preview bitmaps. Original 1:1 uses source dimensions but
    // oversized image decode is limited to the existing 1600px preview contract.
    frame.append(img);
    const caption = document.createElement("p");
    caption.textContent = g.path + " · 1 精选 · J/K 浏览";
    frame.append(caption);
    $("compare-images").append(frame);
    const blob = g.analysis?.thumbnail;
    if (blob) img.src = url(blob, true);
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
      img.src = url(preview, true);
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
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) viewerFullscreen = false;
});
$("compare").addEventListener("close", () => {
  if (viewerFullscreen && document.fullscreenElement)
    void document.exitFullscreen();
  ++compareGeneration;
  zooms.length = 0;
  compared = [];
  releaseComparison();
  release();
  render();
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
      const { imageDimensions, orientedDimensions } = await import(
        "./modules/image-dimensions.js"
      );
      const metadata = await imageDimensions(item.file);
      const dimensions = metadata ? orientedDimensions(metadata) : null;
      if (!dimensions || dimensions.width * dimensions.height * 4 > budget) {
        message("内存保护：此组使用 1600px 预览的 1:1；原图像素放大未加载。");
      } else {
        budget -= dimensions.width * dimensions.height * 4;
        const link = url(item.file, true);
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
    "快捷键：? 帮助；单图中 J/K 或方向键浏览，1 精选，2 保留，X 暂不导出，3 稍后复核，U 撤销，F 全屏，Esc 关闭。输入框中不触发快捷键。";
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
  if (!$("compare").open || busy) return;
  const key = e.key.toLowerCase(),
    g = compared[0];
  if (key === "u") {
    e.preventDefault();
    if (decisionHistory.undo(human)) {
      void save();
      render();
    }
    return;
  }
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
  if (compared.length === 1 && g && ["1", "2", "x", "3"].includes(key)) {
    e.preventDefault();
    void decide(
      g,
      key === "x" ? "exclude" : key === "3" ? "review_later" : "keep",
      key === "1",
    );
    return;
  }
  if (
    compared.length === 1 &&
    ["j", "k", "ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    const index = groups.indexOf(g),
      next = groups[index + (["j", "ArrowLeft"].includes(e.key) ? -1 : 1)];
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
$("strength").onchange = () => {
  if (!busy) recompute();
};
$("mode").onchange = () => {
  if (!busy) recompute();
};
$("filter").onchange = () => {
  limit = 60;
  offset = 0;
  render();
};
$("more").onclick = () => {
  offset = nextPageOffset(offset, visibleCount, limit);
  render();
};
function currentPlan() {
  return {
    ...exportPlan(
      groups,
      human,
      recommendations,
      $("include-protected").checked,
    ),
    preferences: { mode: $("mode").value, strength: $("strength").value },
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
      "已采纳 " +
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
$("accept").onclick = acceptCurrentPlan;
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
    $("target-name").textContent =
      "目标：" +
      target.name +
      " / 新建 PhotoCull_Output_<时间与随机标识>；确认后才写入。";
    renderPlan();
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
    "复制 " +
    plan.fileCount +
    " 个文件（" +
    (plan.bytes / 1024 / 1024).toFixed(1) +
    " MB）到 " +
    target.name +
    "，原件只读。含保护文件：" +
    (plan.includeProtected ? "是" : "否") +
    "。输出冲突将中止，不覆盖。";
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
    preferences: { mode: $("mode").value, strength: $("strength").value },
  }),
  save,
  message,
  download,
});
