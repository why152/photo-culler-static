import { GridRenderWindow } from "./grid-render-window.js";
import { PreviewUrlPool } from "./preview-url-pool.js";

class ThumbnailView {
  constructor(element) {
    this.element = element;
    this.document = element.ownerDocument;
    this.items = new Map();
    this.urls = new PreviewUrlPool();
    this.lastVisibleIds = null;
  }

  has(id) { return this.items.has(id); }

  prune(ids) {
    const retained = new Set(ids);
    for (const id of this.items.keys()) {
      if (!retained.has(id)) this.items.delete(id);
    }
    this.urls.retain(retained);
  }

  sameVisibleIds(ids) {
    return this.lastVisibleIds && ids.length === this.lastVisibleIds.length &&
      ids.every((id, index) => id === this.lastVisibleIds[index]);
  }

  clear() {
    this.element.replaceChildren();
    this.items.clear();
    this.urls.clear();
    this.lastVisibleIds = null;
  }
}

export class PhotoGridView extends ThumbnailView {
  constructor({ element, visibleGroups, context, onOpen, onSelection,
    filterLabels, decisionLabels, batchSize = 160 }) {
    super(element);
    Object.assign(this, { visibleGroups, context, onOpen, onSelection, filterLabels, decisionLabels });
    this.renderWindow = new GridRenderWindow({ batchSize });
    this.observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting) && this.renderWindow.revealNext()) this.render();
      }, { rootMargin: "480px 0px" })
      : null;
  }

  clear() {
    this.observer?.disconnect();
    this.renderWindow.reset();
    super.clear();
  }

  render() {
    const visible = this.visibleGroups();
    const state = this.context();
    const renderWindow = this.renderWindow.update(visible);
    this.element.className = `photo-grid density-${state.density}`;
    if (!visible.length) {
      this.observer?.disconnect();
      const empty = this.document.createElement("p");
      empty.className = "grid-empty";
      empty.setAttribute("role", "status");
      empty.textContent = `没有符合“${this.filterLabels[state.filter]}”筛选条件的 photo group。`;
      this.element.replaceChildren(empty);
      this.prune([]);
      this.lastVisibleIds = null;
      return;
    }
    const visibleIds = renderWindow.groups.map((group) => group.id);
    this.prune(visibleIds);
    const sameVisibleSet = this.sameVisibleIds(visibleIds);
    if (sameVisibleSet) renderWindow.groups.forEach((group) => this.update(group));
    else {
      this.observer?.disconnect();
      const children = renderWindow.groups.map((group) => this.update(group));
      if (renderWindow.hasMore) {
        const continuation = this.document.createElement("div");
        continuation.id = "grid-continuation";
        continuation.className = "grid-continuation";
        const status = this.document.createElement("p");
        status.textContent = `已显示 ${renderWindow.shown} / ${renderWindow.total}`;
        const button = this.document.createElement("button");
        button.id = "grid-load-more";
        button.type = "button";
        button.className = "secondary-action";
        button.textContent = `继续显示 ${Math.min(
          this.renderWindow.batchSize,
          renderWindow.total - renderWindow.shown,
        )} 个`;
        button.addEventListener("click", () => {
          if (this.renderWindow.revealNext()) this.render();
        });
        continuation.append(status, button);
        children.push(continuation);
      }
      this.element.replaceChildren(...children);
      const continuation = this.element.querySelector(
        "#grid-continuation",
      );
      if (continuation) this.observer?.observe(continuation);
      this.lastVisibleIds = visibleIds;
    }
  }
  createPreview(group) {
    if (!group.analysis.thumbnail) {
      this.urls.release(group.id);
      const preview = this.document.createElement("div");
      preview.className = "photo-card-preview thumbnail-placeholder";
      preview.setAttribute("aria-hidden", "true");
      const shimmer = this.document.createElement("span");
      shimmer.className = "thumbnail-placeholder-shimmer";
      preview.append(shimmer);
      return preview;
    }
    const preview = this.document.createElement("img");
    preview.className = "photo-card-preview";
    preview.loading = "lazy";
    preview.decoding = "async";
    const url = this.urls.urlFor(group.id, group.analysis.thumbnail);
    preview.src = url;
    preview.alt = group.analysisFile.name;
    return preview;
  }
  update(group) {
    const state = this.context();
    let item = this.items.get(group.id);
    if (!item) {
      item = this.document.createElement("article");
      item.dataset.photoGroupId = group.id;
      const card = this.document.createElement("button");
      card.type = "button";
      card.id = `photo-card:${group.id}`;
      card.className = "photo-card";
      card.addEventListener("click", () => {
        this.onOpen(item.dataset.photoGroupId, card.id);
      });
      const detail = this.document.createElement("div");
      detail.className = "photo-card-detail";
      const selection = this.document.createElement("button");
      selection.type = "button";
      selection.className = "selection-toggle";
      selection.addEventListener("click", (event) => {
        this.onSelection(item.dataset.photoGroupId, event.shiftKey);
      });
      item.append(card, selection);
      card.append(detail);
      this.items.set(group.id, item);
    }
    const selected = state.actionSelection.has(group.id);
    const card = item.querySelector(".photo-card");
    const detail = item.querySelector(".photo-card-detail");
    const selection = item.querySelector(".selection-toggle");
    const pendingPreview = !group.analysis.thumbnail;
    item.className = `photo-group-card${selected ? " action-selected" : ""}${state.filter === "reject" ? " reject-action-context" : ""}`;
    card.className = `photo-card${pendingPreview ? " is-pending" : ""}`;
    const preview = card.querySelector(".photo-card-preview");
    if (!preview) card.insertBefore(this.createPreview(group), detail);
    else if (
      (pendingPreview && preview.tagName === "IMG") ||
      (!pendingPreview && (preview.tagName !== "IMG" || !this.urls.matches(group.id, group.analysis.thumbnail)))
    )
      preview.replaceWith(this.createPreview(group));
    const filename = this.document.createElement("strong");
    filename.textContent = group.analysisFile.name;
    const meta = this.document.createElement("small");
    meta.className = pendingPreview
      ? "analysis-pending"
      : `analysis-${group.analysis.status}`;
    meta.textContent = pendingPreview
      ? "正在准备预览"
      : `${group.analysis.status.toUpperCase()} · F ${Math.round(group.analysis.sharpness)}`;
    const decision = state.decisions[group.id] ?? null;
    if (decision) {
      const reviewDecision = this.document.createElement("small");
      reviewDecision.className = `review-decision review-decision-${decision}`;
      reviewDecision.textContent = this.decisionLabels[decision];
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
}

export class FilmstripView extends ThumbnailView {
  constructor({ element, onNavigate }) {
    super(element);
    this.onNavigate = onNavigate;
    this.currentPhotoGroupId = null;
    this.groups = null;
  }

  render(groups, currentPhotoGroupId) {
    if (groups === this.groups) {
      const previous = this.items.get(this.currentPhotoGroupId);
      const current = this.items.get(currentPhotoGroupId);
      if (previous !== current) {
        previous?.classList.remove("selected");
        previous?.setAttribute("aria-current", "false");
        current?.classList.add("selected");
        current?.setAttribute("aria-current", "true");
      }
      this.currentPhotoGroupId = currentPhotoGroupId;
      current?.scrollIntoView({ block: "nearest", inline: "center" });
      return;
    }
    this.groups = groups;
    this.currentPhotoGroupId = currentPhotoGroupId;
    const ids = groups.map(({ id }) => id);
    this.prune(ids);
    const children = groups.map((group) => this.update(group));
    if (!this.sameVisibleIds(ids)) this.element.replaceChildren(...children);
    this.lastVisibleIds = ids;
    this.items.get(currentPhotoGroupId)?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  invalidate() {
    // A completion-only analyzer can refresh stable group objects without
    // sending per-group callbacks. Revisit thumbnails once at completion.
    this.groups = null;
  }

  clear() {
    this.groups = null;
    this.currentPhotoGroupId = null;
    super.clear();
  }

  createPreview(group) {
    if (!group.analysis.thumbnail) {
      this.urls.release(group.id);
      const placeholder = this.document.createElement("span");
      placeholder.className = "filmstrip-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      return placeholder;
    }
    const image = this.document.createElement("img");
    image.className = "filmstrip-image";
    image.loading = "lazy";
    image.decoding = "async";
    const url = this.urls.urlFor(group.id, group.analysis.thumbnail);
    image.src = url;
    image.alt = "";
    return image;
  }
  update(group, currentPhotoGroupId = this.currentPhotoGroupId) {
    let thumbnail = this.items.get(group.id);
    if (!thumbnail) {
      thumbnail = this.document.createElement("button");
      thumbnail.type = "button";
      thumbnail.dataset.photoGroupId = group.id;
      thumbnail.addEventListener("click", () => {
        this.onNavigate(thumbnail.dataset.photoGroupId);
      });
      this.items.set(group.id, thumbnail);
    }
    const pendingPreview = !group.analysis.thumbnail;
    thumbnail.className = `viewer-thumbnail${group.id === currentPhotoGroupId ? " selected" : ""}${pendingPreview ? " is-pending" : ""}`;
    thumbnail.setAttribute("aria-label", `查看 ${group.analysisFile.name}`);
    thumbnail.setAttribute(
      "aria-current",
      String(group.id === currentPhotoGroupId),
    );
    const preview = thumbnail.firstElementChild;
    if (!preview) thumbnail.append(this.createPreview(group));
    else if (
      (pendingPreview && preview.tagName === "IMG") ||
      (!pendingPreview && (preview.tagName !== "IMG" || !this.urls.matches(group.id, group.analysis.thumbnail)))
    )
      preview.replaceWith(this.createPreview(group));
    return thumbnail;
  }
}
