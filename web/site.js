import { ViewerPreviewCache } from "./modules/viewer-preview-cache.js";
import { PreviewUrlPool } from "./modules/preview-url-pool.js";
import { BrowserPhotoAnalyzer } from "./modules/photo-analysis.js";
import { BrowserReviewStore } from "./modules/browser-store.js";
import { GalleryInteraction } from "./modules/gallery-interaction.js";
import { PhotoGridView, FilmstripView } from "./modules/thumbnail-views.js";
import { OperationFeedback } from "./modules/operation-feedback.js";
import { ViewerZoom } from "./modules/viewer-zoom.js";
import { ReviewDecisionHistory, ReviewSaveQueue } from "./modules/review-persistence.js";
import {
  browserCapabilities,
  ReviewWorkspace,
} from "./modules/review-workspace.js";

const byId = (id) => document.getElementById(id);
const elements = Object.fromEntries(
  [
    "choose-folder",
    "empty-choose-folder",
    "resume-folder",
    "moved-groups-button",
    "moved-count",
    "capability-status",
    "operation-feedback",
    "operation-indicator",
    "operation-title",
    "operation-progress",
    "operation-progress-value",
    "workspace-status",
    "interaction-status",
    "empty-state",
    "workbench",
    "review-rail",
    "photo-grid",
    "move-button",
    "review-count",
    "action-selection-bar",
    "action-selection-count",
    "select-suggested-removals",
    "action-operation-feedback",
    "action-operation-title",
    "action-operation-detail",
    "clear-action-selection",
    "moved-panel",
    "close-moved-button",
    "moved-batch-list",
    "photo-viewer",
    "viewer-close",
    "viewer-position",
    "viewer-kicker",
    "viewer-name",
    "viewer-image-frame",
    "viewer-image-status",
    "viewer-image",
    "viewer-zoom-out",
    "viewer-zoom-label",
    "viewer-zoom-in",
    "viewer-zoom-reset",
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
const operationFeedback = new OperationFeedback();
const workspace = new ReviewWorkspace({
  reviewStore,
  analyzer: (groups, options) => analyzer.analyze(groups, options),
});
let state = null;
let gallery = null;
const movedPreviewUrlCache = new Map();
const movedPreviewGroups = new Map();
const movedPreviewImages = new Map();
let movedPreviewQueue = Promise.resolve();
let movedPreviewGeneration = 0;
let viewerPreview = null;
const viewerPreviewCache = new ViewerPreviewCache();
const viewerThumbnailUrls = new PreviewUrlPool();
let positionTimer = null;
const viewerZoom = new ViewerZoom();
let decisionHistory = new ReviewDecisionHistory();
let reviewSaveQueue = null;
let workspaceTransition = false;
const reviewSaveStatus = document.createElement("div");
reviewSaveStatus.id = "review-save-status";
reviewSaveStatus.className = "interaction-status";
reviewSaveStatus.setAttribute("role", "status");
reviewSaveStatus.hidden = true;
elements["interaction-status"].after(reviewSaveStatus);
let operationCompletionTimer = null;
let interactionStatusTimer = null;
let lastMovedBatchesSignature = null;
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
function isFileOperation(operation = operationFeedback.state()) {
  return ["move", "restore"].includes(operation.kind) && operation.mode !== "idle";
}
function clearInteractionStatus() {
  clearTimeout(interactionStatusTimer);
  elements["interaction-status"].hidden = true;
}
function setInteractionStatus(message) {
  clearInteractionStatus();
  elements["interaction-status"].textContent = message;
  elements["interaction-status"].hidden = false;
  interactionStatusTimer = setTimeout(() => {
    elements["interaction-status"].hidden = true;
  }, 4500);
}
function renderActionOperationFeedback(operation) {
  const hasFileOperation = isFileOperation(operation);
  elements["action-operation-feedback"].hidden = !hasFileOperation;
  if (!hasFileOperation) return;
  elements["action-operation-title"].textContent = operation.title;
  elements["action-operation-detail"].textContent = operation.detail;
}
function renderOperationFeedback(operation = operationFeedback.state()) {
  const progress = elements["operation-progress"];
  elements["operation-feedback"].hidden = operation.mode === "idle";
  elements["operation-feedback"].dataset.mode = operation.mode;
  elements["operation-feedback"].setAttribute(
    "aria-busy",
    String(operation.isBusy),
  );
  elements["operation-title"].textContent = operation.title || "本机处理";
  elements["workspace-status"].textContent =
    operation.detail || "照片只会在你的电脑上读取和处理。";
  renderActionOperationFeedback(operation);
  progress.classList.toggle("is-determinate", operation.value !== null);
  elements["operation-progress-value"].style.width = `${operation.value ?? 0}%`;
  if (operation.value === null) {
    progress.removeAttribute("aria-valuenow");
    progress.removeAttribute("aria-valuemin");
    progress.removeAttribute("aria-valuemax");
    progress.setAttribute(
      "aria-valuetext",
      operation.isBusy ? "总数尚未确定" : operation.detail || operation.title,
    );
  } else {
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", String(operation.total));
    progress.setAttribute("aria-valuenow", String(operation.completed));
    progress.setAttribute(
      "aria-valuetext",
      `${operation.completed} / ${operation.total}`,
    );
  }
  if (state && gallery) renderControls();
}
function beginOperation(operation) {
  clearTimeout(operationCompletionTimer);
  clearInteractionStatus();
  renderOperationFeedback(operationFeedback.start(operation));
}
function progressOperation(operation) {
  clearTimeout(operationCompletionTimer);
  renderOperationFeedback(operationFeedback.progress(operation));
}
function completeOperation(operation) {
  renderOperationFeedback(operationFeedback.complete(operation));
  clearTimeout(operationCompletionTimer);
  operationCompletionTimer = setTimeout(() => {
    renderOperationFeedback(operationFeedback.clear());
  }, 4500);
}
function failOperation(operation) {
  clearTimeout(operationCompletionTimer);
  renderOperationFeedback(operationFeedback.fail(operation));
}
function stopMovedPreviews() {
  movedPreviewGeneration += 1;
}
function releaseViewerPreview({ preserveFullCache = false } = {}) {
  const viewerImage = elements["viewer-image"];
  viewerImage.onload = null;
  viewerImage.onerror = null;
  viewerImage.removeAttribute("src");
  viewerImage.alt = "";
  viewerThumbnailUrls.clear();
  if (!preserveFullCache) viewerPreviewCache.clear();
  delete viewerImage.dataset.previewStage;
  viewerPreview = null;
}
function releaseFilmstripPreviews() {
  filmstripView.clear();
}
function clearUrls() {
  gridView.clear();
  stopMovedPreviews();
  releaseFilmstripPreviews();
  movedPreviewUrlCache.forEach((url) => URL.revokeObjectURL(url));
  movedPreviewUrlCache.clear();
  movedPreviewGroups.clear();
  movedPreviewImages.clear();
  releaseViewerPreview();
  lastMovedBatchesSignature = null;
}
function currentGroup() {
  return gallery?.photoGroup(gallery.viewer?.photoGroupId) ?? null;
}
function decisionFor(group) {
  return state?.review.decisions[group.id] ?? null;
}
function visibleGroups() {
  return gallery?.visiblePhotoGroups() ?? [];
}
function neighbor(direction) {
  return gallery?.neighborPhotoGroup(direction) ?? null;
}
function nextUnreviewed() {
  return gallery?.nextUnreviewedPhotoGroup() ?? null;
}
function reviewPayload() {
  return {
    decisions: state.review.decisions,
    selectedId: state.review.selectedId,
    scrollY: state.review.scrollY,
    viewerOpen: state.review.viewerOpen,
    candidates: state.review.candidates,
    marked: [],
    filter: state.filter,
    density: state.density,
  };
}
function updateReviewPosition(position) {
  if (!state || workspaceTransition) return;
  const changed = Object.entries(position).some(([key, value]) => state.review[key] !== value);
  if (!changed) return;
  Object.assign(state.review, position);
  clearTimeout(positionTimer);
  const session = state;
  positionTimer = setTimeout(() => {
    positionTimer = null;
    if (state === session) persistReview();
  }, 250);
  renderReviewSaveStatus({ pending: reviewSaveQueue?.pending ?? 0, error: reviewSaveQueue?.error });
}
function flushPosition() {
  if (positionTimer === null) return;
  clearTimeout(positionTimer);
  positionTimer = null;
  if (state) persistReview();
}
function persistReview() {
  // Share optimistic preferences with analysis callbacks as well as the UI.
  state.review.filter = state.filter;
  state.review.density = state.density;
  void reviewSaveQueue.enqueue(reviewPayload());
}
function renderReviewSaveStatus({ pending, error }) {
  pending = pending || positionTimer !== null;
  reviewSaveStatus.replaceChildren();
  reviewSaveStatus.hidden = !pending && !error;
  if (error) {
    reviewSaveStatus.append("审核记录保存失败，当前决定仍保留在本页。请重试后再切换目录或操作文件。 ");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重试保存";
    retry.addEventListener("click", () => void reviewSaveQueue.retry());
    reviewSaveStatus.append(retry);
  } else if (pending) reviewSaveStatus.textContent = "正在保存审核记录…";
}
async function flushReview() {
  flushPosition();
  return !reviewSaveQueue || await reviewSaveQueue.flush();
}
function reconcileFileOperationError() {
  const current = workspace.current;
  if (current?.directory !== state?.directory) return;
  if (current.photoGroups !== state.photoGroups || current.movedBatches !== state.movedBatches) {
    applyScan(current);
    // The files may have moved successfully even when the final store write
    // failed. Show the on-disk result and retry that normalized review state.
    persistReview();
  }
}
function buttonSelected(button, selected) {
  button.classList.toggle("active", selected);
}
function activeFilterButton() {
  return filters.find((button) => button.dataset.filter === state?.filter) ?? null;
}
function restoreViewerReturn(returnTarget, fallback = activeFilterButton()) {
  if (!returnTarget) return;
  const sessionState = state;
  requestAnimationFrame(() => {
    if (state !== sessionState) return;
    window.scrollTo({ top: returnTarget.scrollY ?? window.scrollY });
    const photoGroupId = returnTarget.focusId?.startsWith("photo-card:")
      ? returnTarget.focusId.slice("photo-card:".length) : null;
    if (photoGroupId) gridView.ensureGroup(photoGroupId);
    const returnElement = document.getElementById(returnTarget.focusId);
    (returnElement ?? fallback)?.focus({ preventScroll: true });
  });
}
const gridView = new PhotoGridView({
  element: elements["photo-grid"],
  visibleGroups,
  context: () => ({
    filter: state.filter,
    density: state.density,
    decisions: state.review.decisions,
    actionSelection: gallery.actionSelection,
  }),
  filterLabels,
  decisionLabels,
  indexOf: (id) => gallery?.visibleIndexOf(id) ?? -1,
  onOpen: (photoGroupId, focusId) => {
    if (!gallery?.photoGroup(photoGroupId)) return;
    gallery.open(photoGroupId, { focusId, scrollY: window.scrollY });
    render();
    requestAnimationFrame(() => elements["viewer-close"].focus());
  },
  onSelection: (photoGroupId, range) => {
    gallery.toggleSelection(photoGroupId, { range });
    render();
  },
});
const filmstripView = new FilmstripView({
  element: elements["viewer-filmstrip"],
  onNavigate: (photoGroupId) => {
    gallery.goTo(photoGroupId);
    render();
  },
});
function renderGrid() {
  gridView.render();
}
function renderViewer() {
  const viewer = gallery?.viewerState();
  const group = currentGroup();
  elements["photo-viewer"].hidden = !viewer || !group;
  // Keep the single status and retry control inside the active dialog's
  // stacking context, then return it to the workbench when the viewer closes.
  if (viewer && group) elements["photo-viewer"].append(reviewSaveStatus);
  else elements["interaction-status"].after(reviewSaveStatus);
  if (!viewer || !group) {
    updateReviewPosition({ viewerOpen: false, scrollY: window.scrollY });
    releaseViewerPreview();
    releaseFilmstripPreviews();
    elements["viewer-image-frame"].setAttribute("aria-busy", "false");
    elements["viewer-image-status"].hidden = true;
    viewerZoom.reset();
    applyViewerZoom();
    return;
  }
  const viewerImage = elements["viewer-image"];
  updateReviewPosition({ selectedId: group.id, viewerOpen: true,
    scrollY: gallery.viewer.returnTarget.scrollY ?? window.scrollY });
  if (viewerPreview?.photoGroupId !== group.id) {
    releaseViewerPreview({ preserveFullCache: true });
    viewerZoom.reset();
    applyViewerZoom();
    const preview = { photoGroupId: group.id, full: false };
    viewerPreview = preview;
    viewerPreviewCache.retain([group, neighbor(-1), neighbor(1)]);
    elements["viewer-image-frame"].setAttribute("aria-busy", "true");
    elements["viewer-image-status"].hidden = false;
    elements["viewer-image-status"].textContent = `正在呈现 ${group.analysisFile.name}…`;
    updateViewerThumbnail(group);
    void viewerPreviewCache.load(group).then((loaded) => {
      if (viewerPreview !== preview || currentGroup()?.id !== group.id) return;
      preview.full = true;
      preview.loaded = loaded;
      viewerImage.onload = () => {
        if (viewerPreview !== preview || viewerImage.src !== loaded.url) return;
        elements["viewer-image-frame"].setAttribute("aria-busy", "false");
        elements["viewer-image-status"].hidden = true;
        viewerThumbnailUrls.clear();
        viewerZoom.setImage(elements["viewer-image-frame"].clientWidth,
          elements["viewer-image-frame"].clientHeight, loaded.width, loaded.height);
        applyViewerZoom();
      };
      viewerImage.onerror = () => {
        if (viewerPreview !== preview) return;
        elements["viewer-image-frame"].setAttribute("aria-busy", "false");
        elements["viewer-image-status"].textContent = "无法呈现清晰大图。";
        elements["viewer-image-status"].hidden = false;
      };
      viewerImage.dataset.previewStage = "full";
      viewerImage.src = loaded.url;
      viewerImage.alt = `${group.analysisFile.name} 全分辨率预览`;
      void viewerPreviewCache.warm(neighbor(-1));
      void viewerPreviewCache.warm(neighbor(1));
    }, (error) => {
      if (viewerPreview !== preview || error?.name === "AbortError") return;
      elements["viewer-image-frame"].setAttribute("aria-busy", "false");
      elements["viewer-image-status"].textContent = group.analysis.thumbnail
        ? "清晰大图无法加载，可继续审核缩略图。" : "无法呈现这张照片。";
      elements["viewer-image-status"].hidden = false;
    });
  }
  elements["viewer-position"].textContent = `${viewer.index + 1} / ${viewer.total}`;
  updateViewerCopy(group);
  elements["viewer-previous"].disabled = !viewer.canGoPrevious;
  elements["viewer-next"].disabled = !viewer.canGoNext;
  for (const [button, decision] of [
    [elements["viewer-pick"], "pick"],
    [elements["viewer-keep"], "keep"],
    [elements["viewer-reject"], "reject"],
  ])
    buttonSelected(button, decisionFor(group) === decision);
  elements["viewer-clear-decision"].disabled = !decisionFor(group);
  filmstripView.render(gallery.visiblePhotoGroups(), group.id);
}

function updateViewerThumbnail(group) {
  if (!group.analysis.thumbnail || viewerPreview?.photoGroupId !== group.id || viewerPreview.full) return;
  const image = elements["viewer-image"];
  image.src = viewerThumbnailUrls.urlFor(group.id, group.analysis.thumbnail);
  image.dataset.previewStage = "thumbnail";
  image.alt = `${group.analysisFile.name} 缩略图预览`;
  elements["viewer-image-status"].textContent = "缩略图已就绪，正在加载清晰大图…";
}
function viewerFramePoint(event) {
  const rect = elements["viewer-image-frame"].getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}
function applyViewerZoom() {
  const hasImage = viewerZoom.hasImage();
  elements["viewer-zoom-in"].disabled =
    !hasImage || viewerZoom.zoomFactor >= viewerZoom.maxZoom;
  elements["viewer-zoom-out"].disabled =
    !hasImage || viewerZoom.zoomFactor <= viewerZoom.minZoom;
  elements["viewer-zoom-reset"].disabled = !hasImage || !viewerZoom.isZoomed;
  elements["viewer-zoom-label"].textContent = hasImage
    ? `${Math.round(viewerZoom.zoomFactor * 100)}%`
    : "100%";
  elements["viewer-image-frame"].classList.toggle(
    "is-zoomed",
    hasImage && viewerZoom.isZoomed,
  );
  viewerZoom.applyTo(elements["viewer-image"].style);
}
function zoomAtFrameCenter(factor) {
  const frame = elements["viewer-image-frame"];
  viewerZoom.zoomAt(
    frame.clientWidth / 2,
    frame.clientHeight / 2,
    factor,
  );
  applyViewerZoom();
}
function updateViewerCopy(group) {
  elements["viewer-kicker"].textContent =
    `${({ keep: "技术检查通过", review: "需人工复核", pending: "正在分析技术指标" })[group.analysis.status] ?? "需人工复核"} · ${group.members.length} 个成员${group.hasRaw ? " · RAW" : ""}`;
  elements["viewer-name"].textContent = group.analysisFile.name;
  elements["viewer-reasons"].textContent = group.analysis.reasons.join("；");
}
function renderMovedBatches() {
  const batches = state?.movedBatches ?? [];
  const signature = batches
    .map((batch) => `${batch.id}:${batch.photoGroups.length}`)
    .join("|");
  if (signature === lastMovedBatchesSignature) return;
  lastMovedBatchesSignature = signature;
  stopMovedPreviews();
  movedPreviewUrlCache.forEach((url) => URL.revokeObjectURL(url));
  movedPreviewUrlCache.clear();
  movedPreviewGroups.clear();
  movedPreviewImages.clear();
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
      count.textContent = `${batch.photoGroups.length} 个可恢复照片组`;
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
        image.loading = "lazy";
        image.decoding = "async";
        const previewKey = `${batch.id}:${group.id}`;
        image.dataset.previewKey = previewKey;
        movedPreviewGroups.set(previewKey, group);
        movedPreviewImages.set(previewKey, image);
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
  startMovedPreviews();
}

async function decodeMovedPreview(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: 220,
      resizeQuality: "high",
    });
  } catch {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const maxEdge = 220;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
}

function startMovedPreviews() {
  if (elements["moved-panel"].hidden) return;
  const generation = ++movedPreviewGeneration;
  for (const [previewKey, image] of movedPreviewImages) {
    if (image.src || !image.isConnected) continue;
    const cached = movedPreviewUrlCache.get(previewKey);
    if (cached) {
      image.src = cached;
      continue;
    }
    const group = movedPreviewGroups.get(previewKey);
    if (!group) continue;
    movedPreviewQueue = movedPreviewQueue.then(async () => {
      if (
        generation !== movedPreviewGeneration ||
        elements["moved-panel"].hidden ||
        image.src ||
        !image.isConnected
      )
        return;
      try {
        const blob = await decodeMovedPreview(group.analysisFile);
        const url = URL.createObjectURL(blob);
        if (
          generation === movedPreviewGeneration &&
          !elements["moved-panel"].hidden &&
          image.isConnected &&
          !image.src
        ) {
          movedPreviewUrlCache.set(previewKey, url);
          image.src = url;
        } else {
          URL.revokeObjectURL(url);
        }
      } catch {
        // Keep the placeholder; recovery buttons stay usable.
      }
    });
  }
}
function renderControls() {
  filters.forEach((button) =>
    buttonSelected(button, button.dataset.filter === state.filter),
  );
  densities.forEach((button) =>
    buttonSelected(button, button.dataset.density === state.density),
  );
  elements["moved-count"].textContent = state.movedBatches.length;
  elements["moved-groups-button"].hidden = !state.movedBatches.length;
  elements["moved-groups-button"].disabled = !state.movedBatches.length;
  const selectedCount = gallery.selectedPhotoGroupIds().length;
  const fileOperation = operationFeedback.state();
  const suggestedRemovals =
    state.filter === "reject" ? visibleGroups() : [];
  const allSuggestedRemovalsSelected =
    suggestedRemovals.length > 0 &&
    suggestedRemovals.every(({ id }) => gallery.actionSelection.has(id));
  elements["action-selection-bar"].hidden =
    !selectedCount &&
    !suggestedRemovals.length &&
    !isFileOperation(fileOperation);
  elements["action-selection-count"].textContent =
    selectedCount
      ? `已选 ${selectedCount} 个照片组`
      : suggestedRemovals.length
        ? "选择候选项以创建可恢复批次"
        : "文件操作反馈";
  elements["select-suggested-removals"].hidden = !suggestedRemovals.length;
  elements["select-suggested-removals"].disabled = allSuggestedRemovalsSelected;
  elements["select-suggested-removals"].textContent = allSuggestedRemovalsSelected
    ? "已选择全部建议移出"
    : "选择全部建议移出";
  elements["clear-action-selection"].hidden = !selectedCount;
  elements["move-button"].hidden = !selectedCount;
  elements["move-button"].disabled = !selectedCount || fileOperation.isBusy;
  elements["review-count"].textContent =
    `已筛 ${state.reviewedCount} / ${state.photoGroups.length} · 当前筛选 ${visibleGroups().length} 个照片组`;
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
    setInteractionStatus(
      direction > 0
        ? "已经是当前筛选结果中的最后一张照片。"
        : "已经是当前筛选结果中的第一张照片。",
    );
  render();
}
function closeViewer() {
  const returnTarget = gallery?.close();
  render();
  restoreViewerReturn(returnTarget);
}
function showError(error) {
  const current = operationFeedback.state();
  failOperation({
    kind: current.kind ?? "error",
    title: "操作未完成",
    detail: error instanceof Error ? error.message : "操作失败。",
  });
}
function analysisFeedback(done, total, complete = false) {
  if (!total) {
    completeOperation({
      kind: "analysis",
      title: "没有发现可审核的照片",
      detail: "请选择包含 JPEG/PNG/WEBP 的普通照片文件夹。",
    });
    return;
  }
  if (complete) {
    completeOperation({
      kind: "analysis",
      title: "照片分析完成",
      detail: `已分析 ${done} / ${total} 个照片组。`,
    });
    return;
  }
  progressOperation({
    kind: "analysis",
    title: "正在分析照片",
    completed: done,
    total,
    detail: `已分析 ${done} / ${total} 个照片组。`,
  });
}
function setFolderActionsBusy(isBusy) {
  for (const id of ["choose-folder", "empty-choose-folder", "resume-folder"]) {
    elements[id].disabled = isBusy;
    elements[id].setAttribute("aria-busy", String(isBusy));
  }
}
function applyScan(scan) {
  clearTimeout(positionTimer);
  positionTimer = null;
  clearUrls();
  // Rendering updates the live review position; capture persisted values first.
  const savedPosition = { selectedId: scan.review.selectedId,
    viewerOpen: scan.review.viewerOpen, scrollY: scan.review.scrollY ?? 0 };
  state = {
    ...scan,
    filter: scan.review.filter,
    density: scan.review.density,
    review: scan.review,
    reviewedCount: Object.keys(scan.review.decisions).length,
  };
  decisionHistory = new ReviewDecisionHistory();
  const sessionState = state;
  reviewSaveQueue = new ReviewSaveQueue({
    save: (snapshot) => workspace.saveReview(snapshot, scan, { apply: false }),
    onStatus: (status) => {
      if (state === sessionState) renderReviewSaveStatus(status);
    },
  });
  renderReviewSaveStatus({ pending: 0, error: null });
  gallery = new GalleryInteraction({
    photoGroups: state.photoGroups,
    filter: state.filter,
    decisions: state.review.decisions,
  });
  elements["empty-state"].hidden = true;
  elements.workbench.hidden = false;
  elements["review-rail"].hidden = false;
  elements["resume-folder"].hidden = false;
  elements["choose-folder"].hidden = false;
  const savedId = savedPosition.selectedId;
  const savedVisible = savedId && gallery.visibleIndexOf(savedId) >= 0;
  if (savedVisible && savedPosition.viewerOpen) gallery.open(savedId, {
    focusId: `photo-card:${savedId}`, scrollY: savedPosition.scrollY,
  });
  render();
  requestAnimationFrame(() => {
    if (state !== sessionState) return;
    if (gallery.viewer) elements["viewer-close"].focus();
    else {
      window.scrollTo({ top: savedPosition.scrollY });
      if (savedVisible) gridView.ensureGroup(savedId)?.querySelector(".photo-card")?.focus({ preventScroll: true });
    }
  });
}
async function openWorkspace(action, pendingPicker = null) {
  if (workspaceTransition) return;
  workspaceTransition = true;
  setFolderActionsBusy(true);
  try {
    if (!await flushReview()) {
      // Keep the transition locked until an already-open native picker closes.
      if (pendingPicker) await pendingPicker;
      return;
    }
    beginOperation({
      kind: "scan",
      title: "正在读取照片文件夹",
      detail: "正在整理本地照片组…",
    });
    const scan = await action({
      getPriority: () => [gallery?.viewer?.photoGroupId, neighbor(-1)?.id, neighbor(1)?.id, ...gridView.priorityIds()].filter(Boolean),
      onProgress: (done, total) => analysisFeedback(done, total),
      onAnalysis: ({ current, done, total, complete, error, groupId, preview }) => {
        if (!state || state.directory !== current.directory) return;
        state.photoGroups = current.photoGroups;
        state.review = current.review;
        if (complete || error) {
          filmstripView.invalidate();
          render();
        } else if (groupId) {
          const group = gallery.photoGroup(groupId);
          if (group) renderAnalysisResult(group);
        }
        if (!workspaceTransition && !preview) {
          if (error) showError(error);
          else analysisFeedback(done, total, complete);
        }
      },
    });
    applyScan(scan);
    analysisFeedback(0, scan.photoGroups.length);
  } catch (error) {
    if (error?.name === "AbortError") {
      renderOperationFeedback(operationFeedback.clear());
      setInteractionStatus("未选择目录。照片没有被读取或移动。");
    }
    else showError(error);
  } finally {
    workspaceTransition = false;
    setFolderActionsBusy(false);
  }
}

function renderAnalysisResult(group) {
  if (gridView.has(group.id)) gridView.update(group);
  const viewer = gallery?.viewerState();
  if (!viewer) return;
  if (filmstripView.has(group.id))
    filmstripView.update(group, viewer.photoGroupId);
  if (viewer.photoGroupId === group.id) {
    updateViewerCopy(group);
    updateViewerThumbnail(group);
  }
}
function decide(decision) {
  if (workspaceTransition) return;
  const group = currentGroup();
  if (!group) return;
  const next = neighbor(1);
  const previous = decisionFor(group);
  if (decisionHistory.record(state.review.decisions, group.id, decision)) {
    state.reviewedCount += Number(decision !== null) - Number(previous !== null);
    gallery.invalidateDecisions();
    persistReview();
  }
  if (next) gallery.goTo(next.id);
  const viewerReturnTarget = render();
  if (viewerReturnTarget)
    setInteractionStatus("当前大图不在新的筛选结果中，已关闭。");
}
function undoDecision() {
  if (workspaceTransition) return;
  const change = decisionHistory.changes.at(-1);
  const previous = change ? state.review.decisions[change.photoGroupId] ?? null : null;
  if (!decisionHistory.undo(state.review.decisions)) return;
  state.reviewedCount += Number(change.previous !== null) - Number(previous !== null);
  gallery.invalidateDecisions();
  persistReview();
  render();
}
function changeFilter(button) {
  if (!state || workspaceTransition) return;
  state.filter = button.dataset.filter;
  persistReview();
  const returnTarget = render({ viewerCloseFallback: button });
  if (!returnTarget) return;
  setInteractionStatus("当前大图不在新的筛选结果中，已关闭。");
}
function clearActionSelection() {
  gallery?.clearActionSelection();
  render();
}
async function moveActionSelection() {
  if (workspaceTransition) return;
  const selectedIds = gallery?.selectedPhotoGroupIds() ?? [];
  if (!selectedIds.length) return;
  let plan;
  try { plan = workspace.prepareMovePhotoGroups(selectedIds); }
  catch (error) { showError(error); return; }
  const { groupCount, fileCount } = plan;
  if (
    !window.confirm(
      `确认移动 ${groupCount} 个照片组、共 ${fileCount} 个文件到“${plan.batchName}”？\n位置：当前文件夹“${state.directoryName}”内。\n可从“已移动”恢复。`,
    )
  ) {
    setInteractionStatus("已取消移动；照片未改动。");
    return;
  }
  elements["move-button"].disabled = true;
  workspaceTransition = true;
  setFolderActionsBusy(true);
  progressOperation({
    kind: "move",
    title: "正在移动照片组",
    completed: 0,
    total: groupCount,
    detail: `已移动 0 / ${groupCount} 个照片组；文件 0 / ${fileCount}。`,
  });
  try {
    if (!await flushReview()) {
      renderOperationFeedback(operationFeedback.clear());
      return;
    }
    await workspace.movePhotoGroups(selectedIds, {
      batchName: plan.batchName,
      onProgress: ({
        filesDone,
        fileCount: totalFiles,
        groupsDone,
        groupCount: totalGroups,
      }) =>
        progressOperation({
          kind: "move",
          title: "正在移动照片组",
          completed: groupsDone,
          total: totalGroups,
          detail: `已移动 ${groupsDone} / ${totalGroups} 个照片组；文件 ${filesDone} / ${totalFiles}。`,
        }),
    });
    applyScan(workspace.current);
    completeOperation({
      kind: "move",
      title: "已移动到可恢复批次",
      detail: `${groupCount} 个照片组 可随时从“已移动”恢复。`,
    });
  } catch (error) {
    reconcileFileOperationError();
    showError(error);
  } finally {
    workspaceTransition = false;
    setFolderActionsBusy(false);
    renderControls();
  }
}
async function restoreBatch(batchId) {
  if (workspaceTransition) return;
  const batch = state?.movedBatches.find((candidate) => candidate.id === batchId);
  const groupCount = batch?.photoGroups.length ?? 0;
  const fileCount = batch?.photoGroups.reduce(
    (count, group) => count + group.members.length,
    0,
  );
  workspaceTransition = true;
  setFolderActionsBusy(true);
  progressOperation({
    kind: "restore",
    title: "正在恢复 可恢复批次",
    completed: 0,
    total: Math.max(groupCount, 1),
    detail: `已恢复 0 / ${groupCount} 个照片组；文件 0 / ${fileCount}。`,
  });
  try {
    if (!await flushReview()) {
      renderOperationFeedback(operationFeedback.clear());
      renderControls();
      return;
    }
    await workspace.restoreMovedBatch(batchId, {
      onProgress: ({ filesDone, fileCount: totalFiles, groupsDone, groupCount: totalGroups }) =>
        progressOperation({
          kind: "restore",
          title: "正在恢复 可恢复批次",
          completed: groupsDone,
          total: totalGroups,
          detail: `已恢复 ${groupsDone} / ${totalGroups} 个照片组；文件 ${filesDone} / ${totalFiles}。`,
        }),
    });
    applyScan(workspace.current);
    completeOperation({
      kind: "restore",
      title: "已恢复 可恢复批次",
      detail: `${groupCount} 个照片组 已回到原照片文件夹。`,
    });
  } catch (error) {
    reconcileFileOperationError();
    showError(error);
  } finally {
    workspaceTransition = false;
    setFolderActionsBusy(false);
    renderControls();
  }
}
async function restoreGroup(batchId, groupId) {
  if (workspaceTransition) return;
  const batch = state?.movedBatches.find((candidate) => candidate.id === batchId);
  const group = batch?.photoGroups.find((candidate) => candidate.id === groupId);
  const fileCount = group?.members.length ?? 0;
  workspaceTransition = true;
  setFolderActionsBusy(true);
  progressOperation({
    kind: "restore",
    title: "正在恢复照片组",
    completed: 0,
    total: 1,
    detail: `已恢复 0 / 1 个照片组；文件 0 / ${fileCount}。`,
  });
  try {
    if (!await flushReview()) {
      renderOperationFeedback(operationFeedback.clear());
      renderControls();
      return;
    }
    await workspace.restoreMovedPhotoGroup(batchId, groupId, {
      onProgress: ({ filesDone, fileCount: totalFiles }) =>
        progressOperation({
          kind: "restore",
          title: "正在恢复照片组",
          completed: filesDone === totalFiles ? 1 : 0,
          total: 1,
          detail: `已恢复 ${filesDone === totalFiles ? 1 : 0} / 1 个照片组；文件 ${filesDone} / ${totalFiles}。`,
        }),
    });
    applyScan(workspace.current);
    completeOperation({
      kind: "restore",
      title: "已恢复照片组",
      detail: "完整 照片组 已回到原照片文件夹。",
    });
  } catch (error) {
    reconcileFileOperationError();
    showError(error);
  } finally {
    workspaceTransition = false;
    setFolderActionsBusy(false);
    renderControls();
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
  elements["empty-choose-folder"].disabled = true;
  elements["capability-status"].hidden = false;
  elements["capability-status"].textContent =
    "此浏览器缺少安全的本地目录移动能力。请使用 HTTPS 下的最新版 macOS Chrome 或 Edge。";
} else elements["capability-status"].hidden = true;
function choosePhotoDirectory() {
  if (workspaceTransition) return;
  if (reviewSaveQueue?.error && !reviewSaveQueue.pending) return;
  // Request the picker in the click's activation window; persistence must
  // finish before opening the selected workspace, not before showing a picker.
  const pickedDirectory = window.showDirectoryPicker({ id: "photo-culler-source", mode: "readwrite" })
    .then((directory) => ({ directory }), (error) => ({ error }));
  void openWorkspace(async (options) => {
    const { directory, error } = await pickedDirectory;
    if (error) throw error;
    return workspace.openDirectory(directory, options);
  }, pickedDirectory);
}
function selectSuggestedRemovals() {
  gallery.selectVisiblePhotoGroups();
  render();
}
elements["choose-folder"].addEventListener("click", choosePhotoDirectory);
elements["empty-choose-folder"].addEventListener(
  "click",
  choosePhotoDirectory,
);
elements["resume-folder"].addEventListener("click", () =>
  openWorkspace((options) => workspace.resumeLastDirectory(options)),
);
elements["moved-groups-button"].addEventListener("click", () => {
  elements["moved-panel"].hidden = !elements["moved-panel"].hidden;
  if (!elements["moved-panel"].hidden) startMovedPreviews();
  else stopMovedPreviews();
});
elements["close-moved-button"].addEventListener("click", () => {
  elements["moved-panel"].hidden = true;
  stopMovedPreviews();
});
elements["viewer-close"].addEventListener("click", closeViewer);
elements["viewer-previous"].addEventListener("click", () => moveViewer(-1));
elements["viewer-next"].addEventListener("click", () => moveViewer(1));
elements["viewer-zoom-in"].addEventListener("click", () => {
  if (gallery?.viewer) zoomAtFrameCenter(viewerZoom.step);
});
elements["viewer-zoom-out"].addEventListener("click", () => {
  if (gallery?.viewer) zoomAtFrameCenter(1 / viewerZoom.step);
});
elements["viewer-zoom-reset"].addEventListener("click", () => {
  viewerZoom.reset();
  applyViewerZoom();
});
const viewerFrame = elements["viewer-image-frame"];
new ResizeObserver(() => {
  if (!gallery?.viewer || !viewerZoom.hasImage()) return;
  viewerZoom.resize(viewerFrame.clientWidth, viewerFrame.clientHeight);
  applyViewerZoom();
}).observe(viewerFrame);
viewerFrame.addEventListener(
  "wheel",
  (event) => {
    if (!gallery?.viewer || !viewerZoom.hasImage()) return;
    event.preventDefault();
    const point = viewerFramePoint(event);
    viewerZoom.zoomAt(
      point.x,
      point.y,
      event.deltaY < 0 ? viewerZoom.step : 1 / viewerZoom.step,
    );
    applyViewerZoom();
  },
  { passive: false },
);
viewerFrame.addEventListener("dblclick", (event) => {
  if (!gallery?.viewer || !viewerZoom.hasImage()) return;
  const point = viewerFramePoint(event);
  viewerZoom.toggle(point.x, point.y);
  applyViewerZoom();
});
let panPointerId = null;
let panLast = null;
viewerFrame.addEventListener("pointerdown", (event) => {
  if (!gallery?.viewer || !viewerZoom.isZoomed || event.button !== 0) return;
  panPointerId = event.pointerId;
  panLast = { x: event.clientX, y: event.clientY };
  viewerFrame.setPointerCapture(event.pointerId);
  viewerFrame.classList.add("is-panning");
  event.preventDefault();
});
viewerFrame.addEventListener("pointermove", (event) => {
  if (event.pointerId !== panPointerId) return;
  viewerZoom.panBy(event.clientX - panLast.x, event.clientY - panLast.y);
  panLast = { x: event.clientX, y: event.clientY };
  applyViewerZoom();
});
function endViewerPan(event) {
  if (event.pointerId !== panPointerId) return;
  panPointerId = null;
  panLast = null;
  viewerFrame.classList.remove("is-panning");
}
viewerFrame.addEventListener("pointerup", endViewerPan);
viewerFrame.addEventListener("pointercancel", endViewerPan);
elements["viewer-pick"].addEventListener("click", () => decide("pick"));
elements["viewer-keep"].addEventListener("click", () => decide("keep"));
elements["viewer-reject"].addEventListener("click", () => decide("reject"));
elements["viewer-clear-decision"].addEventListener("click", () => decide(null));
elements["select-suggested-removals"].addEventListener(
  "click",
  selectSuggestedRemovals,
);
elements["clear-action-selection"].addEventListener(
  "click",
  clearActionSelection,
);
elements["move-button"].addEventListener("click", moveActionSelection);
filters.forEach((button) =>
  button.addEventListener("click", () => changeFilter(button)),
);
densities.forEach((button) =>
  button.addEventListener("click", () => {
    if (!state || workspaceTransition) return;
    state.density = button.dataset.density;
    persistReview();
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
    if (!next) setInteractionStatus("没有下一个未筛的 照片组。");
    else if (gallery.visibleIndexOf(next.id) >= 0)
      gallery.goTo(next.id);
    else
      setInteractionStatus("下一个未筛项不在当前筛选结果中；请先切换到“未筛”继续。");
    render();
  } else if (event.key === "1" && gallery?.viewer) decide("pick");
  else if (event.key === "2" && gallery?.viewer) decide("keep");
  else if (key === "x" && gallery?.viewer) decide("reject");
  else if ((event.key === "+" || event.key === "=") && gallery?.viewer) {
    event.preventDefault();
    zoomAtFrameCenter(viewerZoom.step);
  } else if ((event.key === "-" || event.key === "_") && gallery?.viewer) {
    event.preventDefault();
    zoomAtFrameCenter(1 / viewerZoom.step);
  } else if (
    (event.metaKey || event.ctrlKey) &&
    event.key === "0" &&
    gallery?.viewer
  ) {
    event.preventDefault();
    viewerZoom.reset();
    applyViewerZoom();
  }
  else if (event.key === "0" && gallery?.viewer) decide(null);
  else if (key === "u" && gallery?.viewer) undoDecision();
  else if (event.key === "Escape" && gallery?.actionSelection.size) {
    event.preventDefault();
    clearActionSelection();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (positionTimer !== null || reviewSaveQueue?.pending || reviewSaveQueue?.error) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  clearTimeout(positionTimer);
  positionTimer = null;
  clearUrls();
  analyzer.close();
  void reviewStore.close();
});

window.addEventListener("scroll", () => {
  if (state && !gallery?.viewer) updateReviewPosition({ scrollY: Math.max(0, window.scrollY) });
}, { passive: true });
