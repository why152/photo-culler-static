import { BrowserPhotoAnalyzer } from "./modules/photo-analysis.js";
import { BrowserReviewStore } from "./modules/browser-store.js";
import { GalleryInteraction } from "./modules/gallery-interaction.js";
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
    "move-button",
    "review-count",
    "action-selection-bar",
    "action-selection-count",
    "clear-action-selection",
    "moved-panel",
    "close-moved-button",
    "moved-batch-list",
    "photo-viewer",
    "viewer-close",
    "viewer-position",
    "viewer-kicker",
    "viewer-name",
    "viewer-image",
    "viewer-reasons",
    "viewer-previous",
    "viewer-next",
    "viewer-pick",
    "viewer-keep",
    "viewer-reject",
    "viewer-clear-decision",
    "viewer-filmstrip",
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
let gallery = null;
let previewUrls = [];
let decisionHistory = [];
const decisionLabels = {
  pick: "精选",
  keep: "保留",
  reject: "建议移出",
};
const filterLabels = {
  all: "全部",
  unreviewed: "未筛",
  ...decisionLabels,
};
function setStatus(message) {
  elements["workspace-status"].textContent = message;
}
function clearUrls() {
  previewUrls.splice(0).forEach(URL.revokeObjectURL);
}
function currentGroup() {
  const viewer = gallery?.viewerState();
  return (
    state?.photoGroups.find((group) => group.id === viewer?.photoGroupId) ??
    null
  );
}
function decisionFor(group) {
  return state?.review.decisions[group.id] ?? null;
}
function visibleGroups() {
  return gallery?.visiblePhotoGroups() ?? [];
}
function neighbor(direction) {
  const visible = visibleGroups();
  const index = visible.findIndex(
    (group) => group.id === gallery?.viewerState()?.photoGroupId,
  );
  return index < 0 ? null : (visible[index + direction] ?? null);
}
function nextUnreviewed() {
  if (!state) return null;
  const group = currentGroup();
  if (!group) return null;
  const index = state.photoGroups.findIndex(
    (photoGroup) => photoGroup.id === group.id,
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
    selectedId: null,
    candidates: state.review.candidates,
    marked: [],
    filter: state.filter,
    density: state.density,
  };
}
async function persistReview() {
  state.review = await workspace.saveReview(reviewPayload());
}
function buttonSelected(button, selected) {
  button.classList.toggle("active", selected);
}
function activeFilterButton() {
  return filters.find((button) => button.dataset.filter === state?.filter) ?? null;
}
function restoreViewerReturn(returnTarget, fallback = activeFilterButton()) {
  if (!returnTarget) return;
  requestAnimationFrame(() => {
    window.scrollTo({ top: returnTarget.scrollY ?? window.scrollY });
    const returnElement = document.getElementById(returnTarget.focusId);
    (returnElement ?? fallback)?.focus({ preventScroll: true });
  });
}
function renderGrid() {
  clearUrls();
  const visible = visibleGroups();
  elements["photo-grid"].className = `photo-grid density-${state.density}`;
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "grid-empty";
    empty.setAttribute("role", "status");
    empty.textContent = `没有符合“${filterLabels[state.filter]}”筛选条件的 photo group。`;
    elements["photo-grid"].replaceChildren(empty);
    return;
  }
  elements["photo-grid"].replaceChildren(
    ...visible.map((group) => {
      const item = document.createElement("article");
      const selected = gallery.actionSelection.has(group.id);
      item.className = `photo-group-card${selected ? " action-selected" : ""}`;
      const card = document.createElement("button");
      card.type = "button";
      card.id = `photo-card:${group.id}`;
      card.className = "photo-card";
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
      meta.textContent = `${group.analysis.status.toUpperCase()} · F ${Math.round(group.analysis.sharpness)}`;
      const decision = decisionFor(group);
      if (decision) {
        const reviewDecision = document.createElement("small");
        reviewDecision.className = `review-decision review-decision-${decision}`;
        reviewDecision.textContent = decisionLabels[decision];
        detail.append(filename, meta, reviewDecision);
      } else detail.append(filename, meta);
      card.append(image, detail);
      card.addEventListener("click", () => {
        gallery.open(group.id, {
          focusId: card.id,
          scrollY: window.scrollY,
        });
        render();
        requestAnimationFrame(() => elements["viewer-close"].focus());
      });
      const selection = document.createElement("button");
      selection.type = "button";
      selection.className = "selection-toggle";
      selection.setAttribute(
        "aria-label",
        `${selected ? "取消选择" : "选择"} ${group.analysisFile.name}`,
      );
      selection.setAttribute("aria-pressed", String(selected));
      selection.textContent = selected ? "✓" : "○";
      selection.addEventListener("click", (event) => {
        gallery.toggleSelection(group.id, { range: event.shiftKey });
        render();
      });
      item.append(card, selection);
      return item;
    }),
  );
}
function renderViewer() {
  const viewer = gallery?.viewerState();
  const group = currentGroup();
  elements["photo-viewer"].hidden = !viewer || !group;
  if (!viewer || !group) return;
  const previewUrl = URL.createObjectURL(group.analysisFile);
  previewUrls.push(previewUrl);
  elements["viewer-image"].src = previewUrl;
  elements["viewer-image"].alt = `${group.analysisFile.name} 全分辨率预览`;
  elements["viewer-position"].textContent = `${viewer.index + 1} / ${viewer.total}`;
  elements["viewer-kicker"].textContent =
    `${group.analysis.status.toUpperCase()} · ${group.members.length} 个成员${group.hasRaw ? " · RAW" : ""}`;
  elements["viewer-name"].textContent = group.analysisFile.name;
  elements["viewer-reasons"].textContent = group.analysis.reasons.join("；");
  elements["viewer-previous"].disabled = !viewer.canGoPrevious;
  elements["viewer-next"].disabled = !viewer.canGoNext;
  for (const [button, decision] of [
    [elements["viewer-pick"], "pick"],
    [elements["viewer-keep"], "keep"],
    [elements["viewer-reject"], "reject"],
  ])
    buttonSelected(button, decisionFor(group) === decision);
  elements["viewer-clear-decision"].disabled = !decisionFor(group);
  elements["viewer-filmstrip"].replaceChildren(
    ...gallery.visiblePhotoGroups().map((photoGroup) => {
      const thumbnail = document.createElement("button");
      thumbnail.type = "button";
      thumbnail.className = `viewer-thumbnail${photoGroup.id === group.id ? " selected" : ""}`;
      thumbnail.setAttribute("aria-label", `查看 ${photoGroup.analysisFile.name}`);
      thumbnail.setAttribute(
        "aria-current",
        photoGroup.id === group.id ? "true" : "false",
      );
      const image = document.createElement("img");
      const thumbnailUrl = URL.createObjectURL(
        photoGroup.analysis.thumbnail ?? photoGroup.analysisFile,
      );
      previewUrls.push(thumbnailUrl);
      image.src = thumbnailUrl;
      image.alt = "";
      thumbnail.append(image);
      thumbnail.addEventListener("click", () => {
        gallery.goTo(photoGroup.id);
        render();
      });
      return thumbnail;
    }),
  );
  elements["viewer-filmstrip"]
    .querySelector('[aria-current="true"]')
    ?.scrollIntoView({ block: "nearest", inline: "center" });
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
  filters.forEach((button) =>
    buttonSelected(button, button.dataset.filter === state.filter),
  );
  densities.forEach((button) =>
    buttonSelected(button, button.dataset.density === state.density),
  );
  elements["moved-count"].textContent = state.movedBatches.length;
  elements["moved-groups-button"].disabled = !state.movedBatches.length;
  const selectedCount = gallery.selectedPhotoGroupIds().length;
  elements["action-selection-bar"].hidden = !selectedCount;
  elements["action-selection-count"].textContent =
    `已选 ${selectedCount} 个 photo group`;
  elements["move-button"].disabled = !selectedCount;
  elements["review-count"].textContent =
    `${state.photoGroups.length} 个当前 photo group · ${visibleGroups().length} 个可见`;
}
function render({ viewerCloseFallback } = {}) {
  if (!state) return;
  const viewerReturnTarget = gallery.update({
    photoGroups: state.photoGroups,
    filter: state.filter,
    decisions: state.review.decisions,
  });
  renderGrid();
  renderViewer();
  renderControls();
  renderMovedBatches();
  restoreViewerReturn(viewerReturnTarget, viewerCloseFallback);
  return viewerReturnTarget;
}
function moveViewer(direction) {
  const before = gallery?.viewerState();
  const after = gallery?.move(direction);
  if (!after) return;
  if (after.photoGroupId === before?.photoGroupId)
    setStatus(
      direction > 0
        ? "已经是当前筛选结果中的最后一张照片。"
        : "已经是当前筛选结果中的第一张照片。",
    );
  render();
}
function closeViewer() {
  const returnTarget = gallery?.close();
  render();
  if (!returnTarget) return;
  requestAnimationFrame(() => {
    window.scrollTo({ top: returnTarget.scrollY ?? window.scrollY });
    document.getElementById(returnTarget.focusId)?.focus({ preventScroll: true });
  });
}
function showError(error) {
  setStatus(error instanceof Error ? error.message : "操作失败。");
}
function applyScan(scan) {
  state = {
    ...scan,
    filter: scan.review.filter,
    density: scan.review.density,
    review: scan.review,
  };
  gallery = new GalleryInteraction({
    photoGroups: state.photoGroups,
    filter: state.filter,
    decisions: state.review.decisions,
  });
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
  await persistReview();
  if (next) gallery.goTo(next.id);
  const viewerReturnTarget = render();
  if (viewerReturnTarget)
    setStatus("当前大图不在新的筛选结果中，已关闭。");
}
async function undoDecision() {
  const previous = decisionHistory.pop();
  if (!previous) return;
  state.review = await workspace.saveReview(previous);
  state.filter = state.review.filter;
  state.density = state.review.density;
  render();
}
async function changeFilter(button) {
  state.filter = button.dataset.filter;
  await persistReview();
  const returnTarget = render({ viewerCloseFallback: button });
  if (!returnTarget) return;
  setStatus("当前大图不在新的筛选结果中，已关闭。");
}
function clearActionSelection() {
  gallery?.clearActionSelection();
  render();
}
async function moveActionSelection() {
  const selectedIds = gallery?.selectedPhotoGroupIds() ?? [];
  if (!selectedIds.length) return;
  const selectedGroups = state.photoGroups.filter((group) =>
    selectedIds.includes(group.id),
  );
  const groupCount = selectedGroups.length;
  const fileCount = selectedGroups.reduce(
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
    await workspace.movePhotoGroups(selectedIds, {
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
elements["viewer-close"].addEventListener("click", closeViewer);
elements["viewer-previous"].addEventListener("click", () => moveViewer(-1));
elements["viewer-next"].addEventListener("click", () => moveViewer(1));
elements["viewer-pick"].addEventListener("click", () => decide("pick"));
elements["viewer-keep"].addEventListener("click", () => decide("keep"));
elements["viewer-reject"].addEventListener("click", () => decide("reject"));
elements["viewer-clear-decision"].addEventListener("click", () => decide(null));
elements["clear-action-selection"].addEventListener(
  "click",
  clearActionSelection,
);
elements["move-button"].addEventListener("click", moveActionSelection);
filters.forEach((button) =>
  button.addEventListener("click", () => changeFilter(button)),
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
  if (!state || event.target.closest("input,textarea,select")) return;
  const key = event.key.toLowerCase();
  if (event.key === "Escape" && gallery?.viewer) {
    event.preventDefault();
    closeViewer();
  } else if (event.key === "ArrowRight" && gallery?.viewer) {
    event.preventDefault();
    moveViewer(1);
  } else if (event.key === "ArrowLeft" && gallery?.viewer) {
    event.preventDefault();
    moveViewer(-1);
  } else if ((event.code === "Space" || key === "j") && gallery?.viewer) {
    if (
      event.code === "Space" &&
      event.target.closest("button, [role=button], a[href], input, select, textarea")
    )
      return;
    event.preventDefault();
    const next = nextUnreviewed();
    if (!next) setStatus("没有下一个未筛的 photo group。");
    else if (gallery.visiblePhotoGroups().some((group) => group.id === next.id))
      gallery.goTo(next.id);
    else
      setStatus("下一个未筛项不在当前筛选结果中；请先切换到“未筛”继续。");
    render();
  } else if (event.key === "1" && gallery?.viewer) decide("pick");
  else if (event.key === "2" && gallery?.viewer) decide("keep");
  else if (key === "x" && gallery?.viewer) decide("reject");
  else if (event.key === "0" && gallery?.viewer) decide(null);
  else if (key === "u" && gallery?.viewer) undoDecision();
  else if (event.key === "Escape" && gallery?.actionSelection.size) {
    event.preventDefault();
    clearActionSelection();
  }
});
window.addEventListener("beforeunload", () => {
  clearUrls();
  analyzer.close();
});
