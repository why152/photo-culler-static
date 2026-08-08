import { BrowserPhotoAnalyzer } from "./modules/photo-analysis.js";
import { BrowserReviewStore } from "./modules/browser-store.js";
import { GalleryInteraction } from "./modules/gallery-interaction.js";
import { GridRenderWindow } from "./modules/grid-render-window.js";
import { OperationFeedback } from "./modules/operation-feedback.js";
import { ViewerZoom } from "./modules/viewer-zoom.js";
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
const gridRenderWindow = new GridRenderWindow({ batchSize: 160 });
const gridItems = new Map();
const filmstripItems = new Map();
const gridPreviewUrls = [];
const filmstripPreviewUrls = [];
const movedPreviewUrlCache = new Map();
const movedPreviewGroups = new Map();
const movedPreviewImages = new Map();
let movedPreviewQueue = Promise.resolve();
let movedPreviewGeneration = 0;
let viewerPreview = null;
const viewerZoom = new ViewerZoom();
let decisionHistory = [];
let operationCompletionTimer = null;
let interactionStatusTimer = null;
let lastGridVisibleIds = null;
let lastFilmstripVisibleIds = null;
let lastMovedBatchesSignature = null;
const gridContinuationObserver =
  typeof IntersectionObserver === "function"
    ? new IntersectionObserver(
        (entries) => {
          if (
            entries.some((entry) => entry.isIntersecting) &&
            gridRenderWindow.revealNext()
          )
            renderGrid();
        },
        { rootMargin: "480px 0px" },
      )
    : null;
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
function revokeUrls(urls) {
  urls.splice(0).forEach(URL.revokeObjectURL);
}
function stopMovedPreviews() {
  movedPreviewGeneration += 1;
}
function releaseViewerPreview() {
  const viewerImage = elements["viewer-image"];
  viewerImage.onload = null;
  viewerImage.onerror = null;
  viewerImage.removeAttribute("src");
  viewerImage.alt = "";
  if (viewerPreview) URL.revokeObjectURL(viewerPreview.url);
  viewerPreview = null;
}
function releaseFilmstripPreviews() {
  revokeUrls(filmstripPreviewUrls);
  filmstripItems.clear();
  elements["viewer-filmstrip"].replaceChildren();
  lastFilmstripVisibleIds = null;
}
function clearUrls() {
  gridContinuationObserver?.disconnect();
  gridRenderWindow.reset();
  stopMovedPreviews();
  revokeUrls(gridPreviewUrls);
  releaseFilmstripPreviews();
  movedPreviewUrlCache.forEach((url) => URL.revokeObjectURL(url));
  movedPreviewUrlCache.clear();
  movedPreviewGroups.clear();
  movedPreviewImages.clear();
  releaseViewerPreview();
  gridItems.clear();
  lastGridVisibleIds = null;
  lastMovedBatchesSignature = null;
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
  const visible = visibleGroups();
  const renderWindow = gridRenderWindow.update(visible);
  elements["photo-grid"].className = `photo-grid density-${state.density}`;
  if (!visible.length) {
    gridContinuationObserver?.disconnect();
    const empty = document.createElement("p");
    empty.className = "grid-empty";
    empty.setAttribute("role", "status");
    empty.textContent = `没有符合“${filterLabels[state.filter]}”筛选条件的 photo group。`;
    elements["photo-grid"].replaceChildren(empty);
    lastGridVisibleIds = null;
    return;
  }
  const visibleIds = renderWindow.groups.map((group) => group.id);
  const sameVisibleSet =
    lastGridVisibleIds &&
    visibleIds.length === lastGridVisibleIds.length &&
    visibleIds.every((id, index) => id === lastGridVisibleIds[index]);
  if (sameVisibleSet) renderWindow.groups.forEach(renderGridItem);
  else {
    gridContinuationObserver?.disconnect();
    const children = renderWindow.groups.map(renderGridItem);
    if (renderWindow.hasMore) {
      const continuation = document.createElement("div");
      continuation.id = "grid-continuation";
      continuation.className = "grid-continuation";
      const status = document.createElement("p");
      status.textContent = `已显示 ${renderWindow.shown} / ${renderWindow.total}`;
      const button = document.createElement("button");
      button.id = "grid-load-more";
      button.type = "button";
      button.className = "secondary-action";
      button.textContent = `继续显示 ${Math.min(
        gridRenderWindow.batchSize,
        renderWindow.total - renderWindow.shown,
      )} 个`;
      button.addEventListener("click", () => {
        if (gridRenderWindow.revealNext()) renderGrid();
      });
      continuation.append(status, button);
      children.push(continuation);
    }
    elements["photo-grid"].replaceChildren(...children);
    const continuation = elements["photo-grid"].querySelector(
      "#grid-continuation",
    );
    if (continuation) gridContinuationObserver?.observe(continuation);
    lastGridVisibleIds = visibleIds;
  }
}
function createPreview(group) {
  if (!group.analysis.thumbnail) {
    const preview = document.createElement("div");
    preview.className = "photo-card-preview thumbnail-placeholder";
    preview.setAttribute("aria-hidden", "true");
    const shimmer = document.createElement("span");
    shimmer.className = "thumbnail-placeholder-shimmer";
    preview.append(shimmer);
    return preview;
  }
  const preview = document.createElement("img");
  preview.className = "photo-card-preview";
  preview.loading = "lazy";
  preview.decoding = "async";
  const url = URL.createObjectURL(group.analysis.thumbnail);
  gridPreviewUrls.push(url);
  preview.src = url;
  preview.alt = group.analysisFile.name;
  return preview;
}
function renderGridItem(group) {
  let item = gridItems.get(group.id);
  if (!item) {
    item = document.createElement("article");
    item.dataset.photoGroupId = group.id;
    const card = document.createElement("button");
    card.type = "button";
    card.id = `photo-card:${group.id}`;
    card.className = "photo-card";
    card.addEventListener("click", () => {
      const photoGroup = state?.photoGroups.find(
        ({ id }) => id === item.dataset.photoGroupId,
      );
      if (!photoGroup) return;
      gallery.open(photoGroup.id, {
        focusId: card.id,
        scrollY: window.scrollY,
      });
      render();
      requestAnimationFrame(() => elements["viewer-close"].focus());
    });
    const detail = document.createElement("div");
    detail.className = "photo-card-detail";
    const selection = document.createElement("button");
    selection.type = "button";
    selection.className = "selection-toggle";
    selection.addEventListener("click", (event) => {
      gallery.toggleSelection(item.dataset.photoGroupId, { range: event.shiftKey });
      render();
    });
    item.append(card, selection);
    card.append(detail);
    gridItems.set(group.id, item);
  }
  const selected = gallery.actionSelection.has(group.id);
  const card = item.querySelector(".photo-card");
  const detail = item.querySelector(".photo-card-detail");
  const selection = item.querySelector(".selection-toggle");
  const pendingPreview = !group.analysis.thumbnail;
  item.className = `photo-group-card${selected ? " action-selected" : ""}${state.filter === "reject" ? " reject-action-context" : ""}`;
  card.className = `photo-card${pendingPreview ? " is-pending" : ""}`;
  const preview = card.querySelector(".photo-card-preview");
  if (!preview) card.insertBefore(createPreview(group), detail);
  else if (
    (pendingPreview && preview.tagName === "IMG") ||
    (!pendingPreview && preview.tagName !== "IMG")
  )
    preview.replaceWith(createPreview(group));
  const filename = document.createElement("strong");
  filename.textContent = group.analysisFile.name;
  const meta = document.createElement("small");
  meta.className = pendingPreview
    ? "analysis-pending"
    : `analysis-${group.analysis.status}`;
  meta.textContent = pendingPreview
    ? "正在准备预览"
    : `${group.analysis.status.toUpperCase()} · F ${Math.round(group.analysis.sharpness)}`;
  const decision = decisionFor(group);
  if (decision) {
    const reviewDecision = document.createElement("small");
    reviewDecision.className = `review-decision review-decision-${decision}`;
    reviewDecision.textContent = decisionLabels[decision];
    detail.replaceChildren(filename, meta, reviewDecision);
  } else detail.replaceChildren(filename, meta);
  selection.setAttribute(
    "aria-label",
    `${selected ? "取消选择" : "选择"} ${group.analysisFile.name}`,
  );
  selection.setAttribute("aria-pressed", String(selected));
  selection.textContent = selected ? "✓" : "○";
  return item;
}
function renderViewer() {
  const viewer = gallery?.viewerState();
  const group = currentGroup();
  elements["photo-viewer"].hidden = !viewer || !group;
  if (!viewer || !group) {
    releaseViewerPreview();
    releaseFilmstripPreviews();
    elements["viewer-image-frame"].setAttribute("aria-busy", "false");
    elements["viewer-image-status"].hidden = true;
    viewerZoom.reset();
    applyViewerZoom();
    return;
  }
  const viewerImage = elements["viewer-image"];
  if (viewerPreview?.photoGroupId !== group.id) {
    releaseViewerPreview();
    viewerZoom.reset();
    applyViewerZoom();
    const url = URL.createObjectURL(group.analysisFile);
    viewerPreview = { photoGroupId: group.id, url };
    elements["viewer-image-frame"].setAttribute("aria-busy", "true");
    elements["viewer-image-status"].hidden = false;
    elements["viewer-image-status"].textContent = `正在呈现 ${group.analysisFile.name}…`;
    viewerImage.onload = () => {
      if (viewerImage.src !== url) return;
      elements["viewer-image-frame"].setAttribute("aria-busy", "false");
      elements["viewer-image-status"].hidden = true;
      viewerZoom.setImage(
        elements["viewer-image-frame"].clientWidth,
        elements["viewer-image-frame"].clientHeight,
        viewerImage.naturalWidth,
        viewerImage.naturalHeight,
      );
      applyViewerZoom();
    };
    viewerImage.onerror = () => {
      if (viewerImage.src !== url) return;
      elements["viewer-image-frame"].setAttribute("aria-busy", "false");
      elements["viewer-image-status"].textContent = "无法呈现这张照片。";
      elements["viewer-image-status"].hidden = false;
      viewerZoom.reset();
      applyViewerZoom();
    };
    viewerImage.src = url;
  }
  viewerImage.alt = `${group.analysisFile.name} 全分辨率预览`;
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
  const visible = gallery.visiblePhotoGroups();
  const visibleIds = visible.map((photoGroup) => photoGroup.id);
  const sameVisibleSet =
    lastFilmstripVisibleIds &&
    visibleIds.length === lastFilmstripVisibleIds.length &&
    visibleIds.every((id, index) => id === lastFilmstripVisibleIds[index]);
  if (sameVisibleSet) {
    visible.forEach((photoGroup) =>
      renderFilmstripItem(photoGroup, group.id),
    );
  } else {
    elements["viewer-filmstrip"].replaceChildren(
      ...visible.map((photoGroup) => renderFilmstripItem(photoGroup, group.id)),
    );
    lastFilmstripVisibleIds = visibleIds;
  }
  elements["viewer-filmstrip"]
    .querySelector('[aria-current="true"]')
    ?.scrollIntoView({ block: "nearest", inline: "center" });
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
    `${group.analysis.status.toUpperCase()} · ${group.members.length} 个成员${group.hasRaw ? " · RAW" : ""}`;
  elements["viewer-name"].textContent = group.analysisFile.name;
  elements["viewer-reasons"].textContent = group.analysis.reasons.join("；");
}
function createFilmstripPreview(group) {
  if (!group.analysis.thumbnail) {
    const placeholder = document.createElement("span");
    placeholder.className = "filmstrip-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }
  const image = document.createElement("img");
  image.className = "filmstrip-image";
  image.loading = "lazy";
  image.decoding = "async";
  const url = URL.createObjectURL(group.analysis.thumbnail);
  filmstripPreviewUrls.push(url);
  image.src = url;
  image.alt = "";
  return image;
}
function renderFilmstripItem(group, currentPhotoGroupId) {
  let thumbnail = filmstripItems.get(group.id);
  if (!thumbnail) {
    thumbnail = document.createElement("button");
    thumbnail.type = "button";
    thumbnail.dataset.photoGroupId = group.id;
    thumbnail.addEventListener("click", () => {
      gallery.goTo(thumbnail.dataset.photoGroupId);
      render();
    });
    filmstripItems.set(group.id, thumbnail);
  }
  const pendingPreview = !group.analysis.thumbnail;
  thumbnail.className = `viewer-thumbnail${group.id === currentPhotoGroupId ? " selected" : ""}${pendingPreview ? " is-pending" : ""}`;
  thumbnail.setAttribute("aria-label", `查看 ${group.analysisFile.name}`);
  thumbnail.setAttribute(
    "aria-current",
    String(group.id === currentPhotoGroupId),
  );
  const preview = thumbnail.firstElementChild;
  if (!preview) thumbnail.append(createFilmstripPreview(group));
  else if (
    (pendingPreview && preview.tagName === "IMG") ||
    (!pendingPreview && preview.tagName !== "IMG")
  )
    preview.replaceWith(createFilmstripPreview(group));
  return thumbnail;
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
      ? `已选 ${selectedCount} 个 photo group`
      : suggestedRemovals.length
        ? "选择候选项以创建可恢复 review batch"
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
  if (!returnTarget) return;
  requestAnimationFrame(() => {
    window.scrollTo({ top: returnTarget.scrollY ?? window.scrollY });
    document.getElementById(returnTarget.focusId)?.focus({ preventScroll: true });
  });
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
      detail: `已分析 ${done} / ${total} 个 photo group。`,
    });
    return;
  }
  progressOperation({
    kind: "analysis",
    title: "正在分析照片",
    completed: done,
    total,
    detail: `已分析 ${done} / ${total} 个 photo group。`,
  });
}
function setFolderActionsBusy(isBusy) {
  for (const id of ["choose-folder", "empty-choose-folder", "resume-folder"]) {
    elements[id].disabled = isBusy;
    elements[id].setAttribute("aria-busy", String(isBusy));
  }
}
function applyScan(scan) {
  clearUrls();
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
  elements["review-rail"].hidden = false;
  elements["resume-folder"].hidden = false;
  elements["choose-folder"].hidden = false;
  render();
}
async function openWorkspace(action) {
  setFolderActionsBusy(true);
  beginOperation({
    kind: "scan",
    title: "正在读取照片文件夹",
    detail: "正在整理本地 photo group…",
  });
  try {
    const scan = await action({
      onProgress: (done, total) => analysisFeedback(done, total),
      onAnalysis: ({ current, done, total, complete, error, groupId }) => {
        if (!state || state.directory !== current.directory) return;
        state.photoGroups = current.photoGroups;
        state.review = current.review;
        if (complete || error) {
          render();
        } else if (groupId) {
          const group = state.photoGroups.find(
            (candidate) => candidate.id === groupId,
          );
          if (group) renderAnalysisResult(group);
        }
        if (error) showError(error);
        else analysisFeedback(done, total, complete);
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
    setFolderActionsBusy(false);
  }
}

function renderAnalysisResult(group) {
  if (gridItems.has(group.id)) renderGridItem(group);
  const viewer = gallery?.viewerState();
  if (!viewer) return;
  if (filmstripItems.has(group.id))
    renderFilmstripItem(group, viewer.photoGroupId);
  if (viewer.photoGroupId === group.id) updateViewerCopy(group);
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
    setInteractionStatus("当前大图不在新的筛选结果中，已关闭。");
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
  setInteractionStatus("当前大图不在新的筛选结果中，已关闭。");
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
    setInteractionStatus("已取消移动；照片未改动。");
    return;
  }
  elements["move-button"].disabled = true;
  progressOperation({
    kind: "move",
    title: "正在移动 photo group",
    completed: 0,
    total: groupCount,
    detail: `已移动 0 / ${groupCount} 个 photo group；文件 0 / ${fileCount}。`,
  });
  try {
    await workspace.movePhotoGroups(selectedIds, {
      onProgress: ({
        filesDone,
        fileCount: totalFiles,
        groupsDone,
        groupCount: totalGroups,
      }) =>
        progressOperation({
          kind: "move",
          title: "正在移动 photo group",
          completed: groupsDone,
          total: totalGroups,
          detail: `已移动 ${groupsDone} / ${totalGroups} 个 photo group；文件 ${filesDone} / ${totalFiles}。`,
        }),
    });
    applyScan(workspace.current);
    completeOperation({
      kind: "move",
      title: "已移动到可恢复 review batch",
      detail: `${groupCount} 个 photo group 可随时从“已移动”恢复。`,
    });
  } catch (error) {
    showError(error);
  } finally {
    renderControls();
  }
}
async function restoreBatch(batchId) {
  const batch = state?.movedBatches.find((candidate) => candidate.id === batchId);
  const groupCount = batch?.photoGroups.length ?? 0;
  const fileCount = batch?.photoGroups.reduce(
    (count, group) => count + group.members.length,
    0,
  );
  progressOperation({
    kind: "restore",
    title: "正在恢复 review batch",
    completed: 0,
    total: Math.max(groupCount, 1),
    detail: `已恢复 0 / ${groupCount} 个 photo group；文件 0 / ${fileCount}。`,
  });
  try {
    await workspace.restoreMovedBatch(batchId, {
      onProgress: ({ filesDone, fileCount: totalFiles, groupsDone, groupCount: totalGroups }) =>
        progressOperation({
          kind: "restore",
          title: "正在恢复 review batch",
          completed: groupsDone,
          total: totalGroups,
          detail: `已恢复 ${groupsDone} / ${totalGroups} 个 photo group；文件 ${filesDone} / ${totalFiles}。`,
        }),
    });
    applyScan(workspace.current);
    completeOperation({
      kind: "restore",
      title: "已恢复 review batch",
      detail: `${groupCount} 个 photo group 已回到原照片文件夹。`,
    });
  } catch (error) {
    showError(error);
  }
}
async function restoreGroup(batchId, groupId) {
  const batch = state?.movedBatches.find((candidate) => candidate.id === batchId);
  const group = batch?.photoGroups.find((candidate) => candidate.id === groupId);
  const fileCount = group?.members.length ?? 0;
  progressOperation({
    kind: "restore",
    title: "正在恢复 photo group",
    completed: 0,
    total: 1,
    detail: `已恢复 0 / 1 个 photo group；文件 0 / ${fileCount}。`,
  });
  try {
    await workspace.restoreMovedPhotoGroup(batchId, groupId, {
      onProgress: ({ filesDone, fileCount: totalFiles }) =>
        progressOperation({
          kind: "restore",
          title: "正在恢复 photo group",
          completed: filesDone === totalFiles ? 1 : 0,
          total: 1,
          detail: `已恢复 ${filesDone === totalFiles ? 1 : 0} / 1 个 photo group；文件 ${filesDone} / ${totalFiles}。`,
        }),
    });
    applyScan(workspace.current);
    completeOperation({
      kind: "restore",
      title: "已恢复 photo group",
      detail: "完整 photo group 已回到原照片文件夹。",
    });
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
  elements["empty-choose-folder"].disabled = true;
  elements["capability-status"].hidden = false;
  elements["capability-status"].textContent =
    "此浏览器缺少安全的本地目录移动能力。请使用 HTTPS 下的最新版 macOS Chrome 或 Edge。";
} else elements["capability-status"].hidden = true;
function choosePhotoDirectory() {
  void openWorkspace((options) => workspace.chooseDirectory(options));
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
    if (!next) setInteractionStatus("没有下一个未筛的 photo group。");
    else if (gallery.visiblePhotoGroups().some((group) => group.id === next.id))
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
window.addEventListener("beforeunload", () => {
  clearUrls();
  analyzer.close();
  void reviewStore.close();
});
