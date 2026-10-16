import { GridRenderWindow, reflowScrollOffset } from "./grid-render-window.js";
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
    filterLabels, decisionLabels, indexOf, batchSize = 160 }) {
    super(element);
    Object.assign(this, { visibleGroups, context, onOpen, onSelection, filterLabels, decisionLabels, indexOf });
    this.renderWindow = new GridRenderWindow({ batchSize });
    this.frame = null;
    this.layout = null;
    this.lastWidth = 0;
    this.lastRange = null;
    const viewportChanged = () => {
      if (this.visibleGroups().length <= batchSize || this.frame !== null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.render({ refresh: false });
      });
    };
    this.document.defaultView.addEventListener("scroll", viewportChanged, { passive: true });
    this.document.defaultView.addEventListener("resize", viewportChanged, { passive: true });
    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      if (this.element.clientWidth !== this.lastWidth) viewportChanged();
    }) : null;
    this.resizeObserver?.observe(element);
    this.element.addEventListener("keydown", (event) => this.handleNavigation(event));
  }

  clear() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.renderWindow.reset();
    this.layout = null;
    super.clear();
  }

  measureLayout(density) {
    const style = this.document.defaultView.getComputedStyle(this.element);
    const tracks = style.gridTemplateColumns.split(/\s+/).map(Number.parseFloat).filter(Number.isFinite);
    const columns = Math.max(1, tracks.length);
    const gap = Number.parseFloat(style.columnGap) || 0;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const width = this.element.clientWidth;
    const cardWidth = tracks[0] ?? Math.max(1, (width - gap * (columns - 1)) / columns);
    return { columns, rowGap, cardHeight: cardWidth + 62,
      rowHeight: cardWidth + 62 + rowGap,
      gridTop: this.element.getBoundingClientRect().top + window.scrollY,
      scrollTop: Math.max(0, window.scrollY - (this.element.getBoundingClientRect().top + window.scrollY)),
      viewportHeight: window.innerHeight };
  }

  priorityIds() {
    return this.lastVisibleIds ?? [];
  }

  ensureGroup(photoGroupId) {
    const visible = this.visibleGroups();
    const index = this.indexOf ? this.indexOf(photoGroupId) : visible.findIndex(({ id }) => id === photoGroupId);
    if (index < 0) return null;
    this.render();
    if (!this.has(photoGroupId) && this.layout) {
      const gridTop = this.element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: gridTop + Math.floor(index / this.layout.columns) * this.layout.rowHeight });
      this.render();
    }
    return this.items.get(photoGroupId) ?? null;
  }

  handleNavigation(event) {
    if (this.visibleGroups().length <= this.renderWindow.batchSize) return;
    const item = event.target.closest(".photo-group-card");
    if (!item) return;
    const visible = this.visibleGroups();
    const index = Number(item.dataset.queueIndex);
    let next;
    let selection = false;
    if (event.key === "Tab") {
      if (!event.shiftKey && event.target.classList.contains("selection-toggle") && index === this.renderWindow.end - 1)
        next = index + 1;
      else if (event.shiftKey && event.target.classList.contains("photo-card") && index === this.renderWindow.start) {
        next = index - 1;
        selection = true;
      }
    } else if (event.key === "ArrowRight") next = index + 1;
    else if (event.key === "ArrowLeft") next = index - 1;
    else if (event.key === "ArrowDown") next = index + this.layout.columns;
    else if (event.key === "ArrowUp") next = index - this.layout.columns;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    if (next === undefined || next < 0 || next >= visible.length) return;
    event.preventDefault();
    this.ensureGroup(visible[next].id)?.querySelector(selection ? ".selection-toggle" : ".photo-card")?.focus();
  }

  render({ refresh = true } = {}) {
    const visible = this.visibleGroups();
    const state = this.context();
    // Keep virtual row geometry active while computed styles force layout.
    this.element.className = `photo-grid density-${state.density}${visible.length > this.renderWindow.batchSize ? " is-virtual" : ""}`;
    const layout = this.measureLayout(state.density);
    const previous = this.layout;
    const reflow = previous && this.renderWindow.photoGroups === visible &&
      visible.length > this.renderWindow.batchSize && window.scrollY >= layout.gridTop &&
      (previous.columns !== layout.columns || Math.abs(previous.rowHeight - layout.rowHeight) > 0.1);
    if (reflow) layout.scrollTop = reflowScrollOffset(layout.scrollTop, previous, layout, visible.length);
    this.layout = layout;
    this.lastWidth = this.element.clientWidth;
    const range = this.renderWindow.update(visible, layout);
    this.element.classList.toggle("is-virtual", range.virtual);
    this.element.style.setProperty("--virtual-card-height", `${layout.cardHeight}px`);
    if (!visible.length) {
      const empty = this.document.createElement("p");
      empty.className = "grid-empty";
      empty.setAttribute("role", "status");
      empty.textContent = `没有符合“${this.filterLabels[state.filter]}”筛选条件的 照片组。`;
      this.element.replaceChildren(empty);
      this.prune([]);
      this.lastVisibleIds = null;
      return;
    }
    const visibleIds = range.groups.map((group) => group.id);
    const active = this.document.activeElement;
    const focusedCard = this.element.contains(active) ? active.closest(".photo-group-card") : null;
    const focusState = focusedCard ? { id: focusedCard.dataset.photoGroupId,
      index: Number(focusedCard.dataset.queueIndex), selection: active.classList.contains("selection-toggle") } : null;
    const sameVisibleSet = this.sameVisibleIds(visibleIds) &&
      this.lastRange?.total === range.total && this.lastRange?.virtual === range.virtual &&
      Boolean(this.lastRange?.topOffset) === Boolean(range.topOffset) &&
      Boolean(this.lastRange?.bottomOffset) === Boolean(range.bottomOffset);
    this.prune(visibleIds);
    this.lastRange = range;
    if (!sameVisibleSet) {
      const children = [];
      const spacer = (offset) => {
        const node = this.document.createElement("div");
        node.className = "grid-virtual-spacer";
        node.setAttribute("aria-hidden", "true");
        node.style.height = `${Math.max(0, offset - layout.rowGap)}px`;
        return node;
      };
      if (range.topOffset) children.push(spacer(range.topOffset));
      for (const [offset, group] of range.groups.entries()) {
        const item = this.update(group);
        item.dataset.queueIndex = range.start + offset;
        item.setAttribute("aria-posinset", String(range.start + offset + 1));
        item.setAttribute("aria-setsize", String(range.total));
        children.push(item);
      }
      if (range.bottomOffset) children.push(spacer(range.bottomOffset));
      this.element.replaceChildren(...children);
      this.lastVisibleIds = visibleIds;
    } else {
      if (refresh) range.groups.forEach((group) => this.update(group));
      const spacers = this.element.querySelectorAll(".grid-virtual-spacer");
      let index = 0;
      if (range.topOffset) spacers[index++].style.height = `${Math.max(0, range.topOffset - layout.rowGap)}px`;
      if (range.bottomOffset) spacers[index].style.height = `${Math.max(0, range.bottomOffset - layout.rowGap)}px`;
    }
    if (reflow) {
      window.scrollTo({ top: layout.gridTop + layout.scrollTop });
      layout.scrollTop = Math.max(0, window.scrollY - layout.gridTop);
    }
    if (!sameVisibleSet && focusState) {
      const edge = focusState.index < range.start
        ? Math.floor(layout.scrollTop / layout.rowHeight) * layout.columns
        : (Math.ceil((layout.scrollTop + layout.viewportHeight) / layout.rowHeight) * layout.columns) - 1;
      const fallbackIndex = Math.max(range.start, Math.min(range.end - 1, edge));
      const target = this.items.get(focusState.id) ?? this.items.get(visible[fallbackIndex]?.id);
      target?.querySelector(focusState.selection ? ".selection-toggle" : ".photo-card")?.focus({ preventScroll: true });
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
      : group.analysis.status === "pending" ? "正在分析技术指标"
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
    this.positions = new Map();
    this.frame = null;
    this.start = 0;
    this.end = 0;
    const scroll = () => {
      if (!this.groups || this.groups.length <= 160 || this.frame !== null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.renderRange(this.element.scrollLeft);
      });
    };
    this.element.addEventListener("scroll", scroll, { passive: true });
    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scroll) : null;
    this.resizeObserver?.observe(element);
    this.element.addEventListener("keydown", (event) => {
      const item = event.target.closest(".viewer-thumbnail");
      if (!item) return;
      const index = this.positions.get(item.dataset.photoGroupId);
      let next;
      if (event.key === "ArrowRight") next = index + 1;
      else if (event.key === "ArrowLeft") next = index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = this.groups.length - 1;
      else if (event.key === "Tab" && !event.shiftKey && index === this.end - 1) next = index + 1;
      else if (event.key === "Tab" && event.shiftKey && index === this.start) next = index - 1;
      if (next === undefined || next < 0 || next >= this.groups.length) return;
      event.preventDefault();
      event.stopPropagation();
      this.onNavigate(this.groups[next].id);
      this.items.get(this.groups[next].id)?.focus({ preventScroll: true });
    });
  }

  render(groups, currentPhotoGroupId) {
    const changed = groups !== this.groups;
    const moved = currentPhotoGroupId !== this.currentPhotoGroupId;
    if (changed) {
      this.groups = groups;
      this.positions = new Map(groups.map((group, index) => [group.id, index]));
    }
    this.currentPhotoGroupId = currentPhotoGroupId;
    const index = this.positions.get(currentPhotoGroupId) ?? 0;
    this.measureStep();
    const desired = Math.max(0, index * this.step - this.element.clientWidth / 2 + this.itemWidth / 2);
    this.renderRange(changed || moved ? desired : this.element.scrollLeft, changed, changed || moved);
    if (changed || moved) {
      if (groups.length > 160) {
        this.element.scrollLeft = desired;
        this.lastRange.scrollLeft = this.element.scrollLeft;
      }
      else this.items.get(currentPhotoGroupId)?.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  measureStep() {
    const style = this.document.defaultView.getComputedStyle(this.element);
    this.itemWidth = Number.parseFloat(style.getPropertyValue("--filmstrip-item-width")) || 58;
    this.gap = Number.parseFloat(style.columnGap) || 0;
    this.step = this.itemWidth + this.gap;
  }

  renderRange(scrollLeft, refresh = false, newCoordinates = false) {
    if (!this.groups) return;
    // The rendered step survives render() measuring the new CSS before this call.
    const previousStep = this.lastRange?.step;
    this.measureStep();
    const reflow = !newCoordinates && previousStep &&
      (previousStep !== this.step || this.lastRange.width !== this.element.clientWidth);
    if (reflow) {
      scrollLeft = this.lastRange.scrollLeft ?? scrollLeft;
      const selectedIndex = this.positions.get(this.currentPhotoGroupId);
      const selectedLeft = selectedIndex * previousStep;
      const selectedWasVisible = selectedLeft >= scrollLeft &&
        selectedLeft + this.lastRange.itemWidth <= scrollLeft + this.lastRange.width + 1;
      scrollLeft = scrollLeft / previousStep * this.step;
      // Preserve manually browsed positions; keep an already-visible selection
      // within the narrower viewport rather than scrolling it out of sight.
      if (selectedWasVisible) {
        const selected = selectedIndex * this.step;
        scrollLeft = Math.min(scrollLeft, selected);
        scrollLeft = Math.max(scrollLeft, selected + this.itemWidth - this.element.clientWidth);
      }
    }
    const groups = this.groups;
    const virtual = groups.length > 160;
    const count = Math.max(40, Math.ceil(this.element.clientWidth / this.step) + 10);
    this.start = virtual ? Math.max(0, Math.min(groups.length - count, Math.floor(scrollLeft / this.step) - 5)) : 0;
    this.end = virtual ? Math.min(groups.length, this.start + count) : groups.length;
    const active = this.document.activeElement;
    const focusedItem = this.element.contains(active) ? active.closest(".viewer-thumbnail") : null;
    const focusId = focusedItem?.dataset.photoGroupId;
    const shown = groups.slice(this.start, this.end);
    const ids = shown.map(({ id }) => id);
    const same = this.sameVisibleIds(ids) && this.lastRange?.total === groups.length &&
      this.lastRange?.virtual === virtual && this.lastRange?.step === this.step;
    this.lastRange = { total: groups.length, virtual, step: this.step, itemWidth: this.itemWidth, width: this.element.clientWidth };
    this.prune(ids);
    if (!same) {
      const children = [];
      const spacer = (count) => {
        const node = this.document.createElement("span");
        node.className = "filmstrip-virtual-spacer";
        node.setAttribute("aria-hidden", "true");
        node.style.width = `${Math.max(0, count * this.step - this.gap)}px`;
        return node;
      };
      if (this.start) children.push(spacer(this.start));
      shown.forEach((group) => children.push(this.update(group)));
      if (this.end < groups.length) children.push(spacer(groups.length - this.end));
      this.element.replaceChildren(...children);
      this.lastVisibleIds = ids;
    } else if (refresh) shown.forEach((group) => this.update(group));
    else {
      for (const [id, item] of this.items) {
        const selected = id === this.currentPhotoGroupId;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-current", String(selected));
      }
    }
    if (reflow) this.element.scrollLeft = scrollLeft;
    this.lastRange.scrollLeft = this.element.scrollLeft;
    if (!same && focusId) {
      const index = Math.max(this.start, Math.min(this.end - 1, Math.floor(scrollLeft / this.step)));
      (this.items.get(focusId) ?? this.items.get(groups[index]?.id))?.focus({ preventScroll: true });
    }
  }

  invalidate() {
    this.groups = null;
  }

  clear() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.groups = null;
    this.positions.clear();
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
