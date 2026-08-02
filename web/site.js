import { BrowserPhotoAnalyzer } from "./modules/photo-analysis.js";
import { BrowserReviewStore } from "./modules/browser-store.js";
import {
  browserCapabilities,
  ReviewWorkspace,
} from "./modules/review-workspace.js";

const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(
  [
    "choose-folder",
    "resume-folder",
    "moved-groups-button",
    "moved-count",
    "capability-status",
    "workspace-status",
    "empty-state",
    "workbench",
    "photo-grid",
    "inspector-empty",
    "inspector-content",
    "preview-image",
    "inspector-kicker",
    "inspector-name",
    "inspector-reasons",
    "metric-focus",
    "metric-exposure",
    "metric-technical",
    "pick-button",
    "keep-button",
    "reject-button",
    "clear-decision-button",
    "mark-button",
    "previous-button",
    "next-button",
    "move-button",
    "marked-count",
    "review-count",
    "moved-panel",
    "close-moved-button",
    "moved-batch-list",
  ].map((id) => [id, byId(id)]),
);
const filters = [...document.querySelectorAll("[data-filter]")];
const densities = [...document.querySelectorAll("[data-density]")];
const reviewStore = new BrowserReviewStore();
const analyzer = new BrowserPhotoAnalyzer({ cache: reviewStore });
const workspace = new ReviewWorkspace({
  reviewStore,
  analyzer: (groups, options) => analyzer.analyze(groups, options),
});
let state = null;
let previewUrls = [];
let decisionHistory = [];
function setStatus(message) {
  elements["workspace-status"].textContent = message;
}
function clearUrls() {
  previewUrls.splice(0).forEach(URL.revokeObjectURL);
}
function currentGroup() {
  return (
    state?.photoGroups.find((group) => group.id === state.selected) ?? null
  );
}
function decisionFor(group) {
  return state?.review.decisions[group.id] ?? null;
}
function visibleGroups() {
  if (!state) return [];
  return state.photoGroups.filter((group) => {
    const decision = decisionFor(group);
    return (
      state.filter === "all" ||
      (state.filter === "unreviewed" ? !decision : decision === state.filter)
    );
  });
}
function neighbor(direction) {
  const visible = visibleGroups();
  const index = visible.findIndex((group) => group.id === state?.selected);
  return index < 0 ? null : (visible[index + direction] ?? null);
}
function nextUnreviewed() {
  if (!state) return null;
  const index = state.photoGroups.findIndex(
    (group) => group.id === state.selected,
  );
  return (
    state.photoGroups
      .slice(Math.max(0, index + 1))
      .find((group) => !decisionFor(group)) ?? null
  );
}
function reviewPayload() {
  return {
    decisions: state.review.decisions,
    selectedId: state.selected,
    candidates: state.review.candidates,
    marked: [...state.marked],
    filter: state.filter,
    density: state.density,
  };
}
async function persistReview() {
  state.review = await workspace.saveReview(reviewPayload());
  state.marked = new Set(state.review.marked);
}
function buttonSelected(button, selected) {
  button.classList.toggle("active", selected);
}
function renderGrid() {
  clearUrls();
  const visible = visibleGroups();
  elements["photo-grid"].className = `photo-grid density-${state.density}`;
  elements["photo-grid"].replaceChildren(
    ...visible.map((group) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `photo-card${group.id === state.selected ? " selected" : ""}${state.marked.has(group.id) ? " marked" : ""}`;
      const image = document.createElement("img");
      const url = URL.createObjectURL(
        group.analysis.thumbnail ?? group.analysisFile,
      );
      previewUrls.push(url);
      image.src = url;
      image.alt = group.analysisFile.name;
      const detail = document.createElement("div");
      const filename = document.createElement("strong");
      filename.textContent = group.analysisFile.name;
      const meta = document.createElement("small");
      meta.className = `analysis-${group.analysis.status}`;
      meta.textContent = `${group.analysis.status.toUpperCase()} · F ${Math.round(group.analysis.sharpness)}${state.marked.has(group.id) ? " · 待移动" : ""}`;
      detail.append(filename, meta);
      card.append(image, detail);
      card.addEventListener("click", () => {
        state.selected = group.id;
        render();
        persistReview().catch(showError);
      });
      return card;
    }),
  );
}
function renderInspector() {
  const group = currentGroup();
  elements["inspector-empty"].hidden = !!group;
  elements["inspector-content"].hidden = !group;
  if (!group) return;
  const previewUrl = URL.createObjectURL(group.analysisFile);
  previewUrls.push(previewUrl);
  elements["preview-image"].src = previewUrl;
  elements["preview-image"].alt = `${group.analysisFile.name} 全分辨率预览`;
  elements["inspector-kicker"].textContent =
    `${group.analysis.status.toUpperCase()} · ${group.members.length} 个成员${group.hasRaw ? " · RAW" : ""}`;
  elements["inspector-name"].textContent = group.analysisFile.name;
  elements["inspector-reasons"].textContent = group.analysis.reasons.join("；");
  elements["metric-focus"].textContent = group.analysis.sharpness.toFixed(1);
  elements["metric-exposure"].textContent =
    group.analysis.exposureScore.toFixed(1);
  elements["metric-technical"].textContent =
    group.analysis.technicalScore.toFixed(1);
  for (const [button, decision] of [
    [elements["pick-button"], "pick"],
    [elements["keep-button"], "keep"],
    [elements["reject-button"], "reject"],
  ])
    buttonSelected(button, decisionFor(group) === decision);
  elements["mark-button"].textContent = state.marked.has(group.id)
    ? "取消待移动标记 C"
    : "标记为待移动 C";
}
function renderMovedBatches() {
  const batches = state?.movedBatches ?? [];
  elements["moved-batch-list"].replaceChildren(
    ...batches.map((batch) => {
      const section = document.createElement("section");
      section.className = "moved-batch";
      const header = document.createElement("div");
      header.className = "moved-batch-header";
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = batch.id;
      const count = document.createElement("p");
      count.textContent = `${batch.photoGroups.length} 个可恢复 photo group`;
      copy.append(title, count);
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "secondary-action";
      restore.textContent = "恢复整批";
      restore.addEventListener("click", () => restoreBatch(batch.id));
      header.append(copy, restore);
      section.append(header);
      const photos = document.createElement("div");
      photos.className = "moved-photo-list";
      batch.photoGroups.forEach((group) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "moved-photo";
        const image = document.createElement("img");
        const previewUrl = URL.createObjectURL(group.analysisFile);
        previewUrls.push(previewUrl);
        image.src = previewUrl;
        image.alt = `${group.analysisFile.name} 预览`;
        const label = document.createElement("span");
        label.textContent = `恢复 ${group.analysisFile.name}`;
        button.append(image, label);
        button.addEventListener("click", () =>
          restoreGroup(batch.id, group.id),
        );
        photos.append(button);
      });
      section.append(photos);
      return section;
    }),
  );
}
function renderControls() {
  const selected = currentGroup();
  filters.forEach((button) =>
    buttonSelected(button, button.dataset.filter === state.filter),
  );
  densities.forEach((button) =>
    buttonSelected(button, button.dataset.density === state.density),
  );
  elements["moved-count"].textContent = state.movedBatches.length;
  elements["moved-groups-button"].disabled = !state.movedBatches.length;
  elements["marked-count"].textContent = state.marked.size;
  elements["move-button"].disabled = !state.marked.size;
  elements["previous-button"].disabled = !neighbor(-1);
  elements["next-button"].disabled = !neighbor(1);
  elements["review-count"].textContent =
    `${state.photoGroups.length} 个当前 photo group · ${visibleGroups().length} 个可见 · ${state.marked.size} 个待移动`;
  for (const name of [
    "pick-button",
    "keep-button",
    "reject-button",
    "clear-decision-button",
    "mark-button",
  ])
    elements[name].disabled = !selected;
}
function render() {
  if (!state) return;
  renderGrid();
  renderInspector();
  renderControls();
  renderMovedBatches();
}
function showError(error) {
  setStatus(error instanceof Error ? error.message : "操作失败。");
}
function applyScan(scan) {
  state = {
    ...scan,
    selected: scan.review.selectedId ?? scan.photoGroups[0]?.id ?? null,
    filter: scan.review.filter,
    density: scan.review.density,
    marked: new Set(scan.review.marked),
    review: scan.review,
  };
  elements["empty-state"].hidden = true;
  elements.workbench.hidden = false;
  elements["resume-folder"].hidden = false;
  render();
}
async function openWorkspace(action) {
  elements["choose-folder"].disabled = true;
  elements["resume-folder"].disabled = true;
  setStatus("正在分析 JPEG…");
  try {
    const scan = await action({
      onProgress: (done, total) =>
        setStatus(`正在分析 JPEG：${done} / ${total}`),
      onAnalysis: ({ current, done, total, complete, error }) => {
        if (!state || state.directory !== current.directory) return;
        state.photoGroups = current.photoGroups;
        state.review = current.review;
        render();
        if (error) showError(error);
        else if (complete) setStatus(`JPEG 分析完成：${done} / ${total}`);
        else setStatus(`正在分析 JPEG：${done} / ${total}`);
      },
    });
    applyScan(scan);
    setStatus(
      `已发现 ${scan.photoGroups.length} 个 photo group；可先审核，JPEG 会继续在本机分析。`,
    );
  } catch (error) {
    if (error?.name === "AbortError") setStatus("未选择目录。");
    else showError(error);
  } finally {
    elements["choose-folder"].disabled = false;
    elements["resume-folder"].disabled = false;
  }
}
async function decide(decision) {
  const group = currentGroup();
  if (!group) return;
  const next = neighbor(1);
  decisionHistory.push({ ...reviewPayload() });
  if (decision) state.review.decisions[group.id] = decision;
  else delete state.review.decisions[group.id];
  state.selected = next?.id ?? group.id;
  await persistReview();
  render();
}
async function undoDecision() {
  const previous = decisionHistory.pop();
  if (!previous) return;
  state.review = await workspace.saveReview(previous);
  state.selected = state.review.selectedId;
  state.filter = state.review.filter;
  state.density = state.review.density;
  state.marked = new Set(state.review.marked);
  render();
}
async function toggleMarked() {
  const group = currentGroup();
  if (!group) return;
  decisionHistory.push({ ...reviewPayload() });
  if (state.marked.has(group.id)) state.marked.delete(group.id);
  else state.marked.add(group.id);
  await persistReview();
  render();
}
async function moveMarked() {
  if (!state?.marked.size) return;
  const markedGroups = state.photoGroups.filter((group) =>
    state.marked.has(group.id),
  );
  const groupCount = markedGroups.length;
  const fileCount = markedGroups.reduce(
    (count, group) => count + group.members.length,
    0,
  );
  if (
    !window.confirm(
      `确认移动 ${groupCount} 个完整 photo group、共 ${fileCount} 个文件成员到新的可恢复 review batch？`,
    )
  ) {
    setStatus("已取消移动；照片未改动。");
    return;
  }
  elements["move-button"].disabled = true;
  setStatus(
    `正在移动 ${groupCount} 个完整 photo group、共 ${fileCount} 个文件成员…`,
  );
  try {
    await workspace.movePhotoGroups([...state.marked], {
      onProgress: ({
        filesDone,
        fileCount: totalFiles,
        groupsDone,
        groupCount: totalGroups,
      }) =>
        setStatus(
          `正在移动 photo group：${groupsDone} / ${totalGroups}；文件：${filesDone} / ${totalFiles}`,
        ),
    });
    applyScan(workspace.current);
    setStatus("已移动到可恢复 review batch。");
  } catch (error) {
    showError(error);
  } finally {
    renderControls();
  }
}
async function restoreBatch(batchId) {
  setStatus("正在恢复 review batch…");
  try {
    await workspace.restoreMovedBatch(batchId, {
      onProgress: ({ filesDone, fileCount, groupsDone, groupCount }) =>
        setStatus(
          `正在恢复 photo group：${groupsDone} / ${groupCount}；文件：${filesDone} / ${fileCount}`,
        ),
    });
    applyScan(workspace.current);
    setStatus("已恢复整批 photo group。");
  } catch (error) {
    showError(error);
  }
}
async function restoreGroup(batchId, groupId) {
  setStatus("正在恢复完整 photo group…");
  try {
    await workspace.restoreMovedPhotoGroup(batchId, groupId, {
      onProgress: ({ filesDone, fileCount }) =>
        setStatus(`正在恢复文件：${filesDone} / ${fileCount}`),
    });
    applyScan(workspace.current);
    setStatus("已恢复完整 photo group。");
  } catch (error) {
    showError(error);
  }
}
const capabilities = browserCapabilities();
if (
  !capabilities.secureContext ||
  !capabilities.directoryPicker ||
  !capabilities.directoryEnumeration ||
  !capabilities.fileWritable ||
  !capabilities.fileMove
) {
  elements["choose-folder"].disabled = true;
  elements["capability-status"].textContent =
    "此浏览器缺少安全的本地目录移动能力。请使用 HTTPS 下的最新版 macOS Chrome 或 Edge。";
} else
  elements["capability-status"].textContent =
    "浏览器可请求本地目录权限。选择后，照片不会上传到服务器。";
elements["choose-folder"].addEventListener("click", () =>
  openWorkspace((options) => workspace.chooseDirectory(options)),
);
elements["resume-folder"].addEventListener("click", () =>
  openWorkspace((options) => workspace.resumeLastDirectory(options)),
);
elements["moved-groups-button"].addEventListener("click", () => {
  elements["moved-panel"].hidden = !elements["moved-panel"].hidden;
});
elements["close-moved-button"].addEventListener("click", () => {
  elements["moved-panel"].hidden = true;
});
elements["previous-button"].addEventListener("click", () => {
  const group = neighbor(-1);
  if (group) {
    state.selected = group.id;
    render();
    persistReview().catch(showError);
  }
});
elements["next-button"].addEventListener("click", () => {
  const group = neighbor(1);
  if (group) {
    state.selected = group.id;
    render();
    persistReview().catch(showError);
  }
});
elements["move-button"].addEventListener("click", moveMarked);
elements["pick-button"].addEventListener("click", () => decide("pick"));
elements["keep-button"].addEventListener("click", () => decide("keep"));
elements["reject-button"].addEventListener("click", () => decide("reject"));
elements["clear-decision-button"].addEventListener("click", () => decide(null));
elements["mark-button"].addEventListener("click", toggleMarked);
filters.forEach((button) =>
  button.addEventListener("click", async () => {
    state.filter = button.dataset.filter;
    await persistReview();
    render();
  }),
);
densities.forEach((button) =>
  button.addEventListener("click", async () => {
    state.density = button.dataset.density;
    await persistReview();
    render();
  }),
);
reviewStore
  .loadLastDirectory()
  .then((directory) => {
    elements["resume-folder"].hidden = !directory;
  })
  .catch(() => {});
document.addEventListener("keydown", (event) => {
  if (!state || event.target.closest("button,input,textarea,select")) return;
  const key = event.key.toLowerCase();
  if (event.key === "ArrowRight") {
    event.preventDefault();
    const group = neighbor(1);
    if (group) {
      state.selected = group.id;
      render();
      persistReview().catch(showError);
    }
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    const group = neighbor(-1);
    if (group) {
      state.selected = group.id;
      render();
      persistReview().catch(showError);
    }
  } else if (event.code === "Space" || key === "j") {
    event.preventDefault();
    const group = nextUnreviewed();
    if (group) {
      state.selected = group.id;
      render();
      persistReview().catch(showError);
    }
  } else if (event.key === "1") decide("pick");
  else if (event.key === "2") decide("keep");
  else if (key === "x") decide("reject");
  else if (event.key === "0") decide(null);
  else if (key === "u") undoDecision();
  else if (key === "c") toggleMarked();
});
window.addEventListener("beforeunload", () => {
  clearUrls();
  analyzer.close();
});
