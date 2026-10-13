function isVisible(photoGroup, filter, decisions) {
  const decision = decisions[photoGroup.id] ?? null;
  return (
    filter === "all" ||
    (filter === "unreviewed" ? !decision : decision === filter)
  );
}

export class GalleryInteraction {
  constructor({ photoGroups = [], filter = "all", decisions = {} } = {}) {
    this.photoGroups = photoGroups;
    this.filter = filter;
    this.decisions = decisions;
    this.viewer = null;
    this.actionSelection = new Set();
    this.selectionAnchorId = null;
    this.#indexPhotoGroups();
  }

  #groupIndex = new Map();
  #visible = null;
  #visibleIndex = new Map();

  #indexPhotoGroups() {
    this.#groupIndex = new Map(
      this.photoGroups.map((group, index) => [group.id, { group, index }]),
    );
    for (const id of this.actionSelection) {
      if (!this.#groupIndex.has(id)) this.actionSelection.delete(id);
    }
    if (!this.#groupIndex.has(this.selectionAnchorId)) this.selectionAnchorId = null;
    this.#visible = null;
  }

  visiblePhotoGroups() {
    if (this.#visible === null) {
      this.#visible = this.photoGroups.filter((photoGroup) =>
        isVisible(photoGroup, this.filter, this.decisions),
      );
      this.#visibleIndex = new Map(
        this.#visible.map((group, index) => [group.id, index]),
      );
    }
    return this.#visible;
  }

  visibleIndexOf(photoGroupId) {
    this.visiblePhotoGroups();
    return this.#visibleIndex.get(photoGroupId) ?? -1;
  }

  photoGroup(photoGroupId) {
    return this.#groupIndex.get(photoGroupId)?.group ?? null;
  }

  neighborPhotoGroup(direction) {
    if (!this.viewer) return null;
    const index = this.visibleIndexOf(this.viewer.photoGroupId);
    return index < 0 ? null : this.visiblePhotoGroups()[index + direction] ?? null;
  }

  nextUnreviewedPhotoGroup() {
    if (!this.viewer) return null;
    const index = this.#groupIndex.get(this.viewer.photoGroupId)?.index;
    if (index === undefined) return null;
    for (let next = index + 1; next < this.photoGroups.length; next += 1) {
      const group = this.photoGroups[next];
      if (!this.decisions[group.id]) return group;
    }
    return null;
  }

  // Review decisions can be edited in place; callers explicitly invalidate
  // after a decision or undo, without rescanning on ordinary navigation.
  invalidateDecisions() {
    this.#visible = null;
  }

  // Membership/order changes must supply a new photoGroups array. Analysis
  // updates mutate existing group objects so cached queues keep fresh values.
  // In-place decisions require invalidateDecisions() or decisionsChanged:true.
  update({
    photoGroups = this.photoGroups,
    filter = this.filter,
    decisions = this.decisions,
    decisionsChanged = false,
  } = {}) {
    const membershipChanged = photoGroups !== this.photoGroups;
    const visibilityChanged = membershipChanged || filter !== this.filter ||
      decisions !== this.decisions || decisionsChanged;
    this.photoGroups = photoGroups;
    this.filter = filter;
    this.decisions = decisions;
    if (membershipChanged) this.#indexPhotoGroups();
    else if (visibilityChanged) this.#visible = null;
    return this.viewer && !this.viewerState() ? this.close() : null;
  }

  open(photoGroupId, returnTarget = {}) {
    const index = this.visibleIndexOf(photoGroupId);
    if (index < 0)
      throw new Error("该 photo group 不在当前筛选结果中，无法打开 Photo Viewer。");
    this.viewer = {
      photoGroupId,
      returnTarget: {
        focusId: returnTarget.focusId ?? null,
        scrollY: returnTarget.scrollY ?? null,
      },
    };
    return this.viewerState();
  }

  move(direction) {
    if (!this.viewer) return null;
    const next = this.neighborPhotoGroup(direction);
    if (next) this.viewer.photoGroupId = next.id;
    return this.viewerState();
  }

  goTo(photoGroupId) {
    if (!this.viewer) return null;
    if (this.visibleIndexOf(photoGroupId) < 0)
      throw new Error("该 photo group 不在当前筛选结果中，无法显示在 Photo Viewer。");
    this.viewer.photoGroupId = photoGroupId;
    return this.viewerState();
  }

  close() {
    const returnTarget = this.viewer?.returnTarget ?? null;
    this.viewer = null;
    return returnTarget;
  }

  toggleSelection(photoGroupId, { range = false } = {}) {
    const visible = this.visiblePhotoGroups();
    const index = this.visibleIndexOf(photoGroupId);
    if (index < 0)
      throw new Error("该 photo group 不在当前筛选结果中，无法加入 action selection。");
    const anchorIndex = this.visibleIndexOf(this.selectionAnchorId);
    if (range && anchorIndex >= 0) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      visible.slice(start, end + 1).forEach((photoGroup) => {
        this.actionSelection.add(photoGroup.id);
      });
    } else if (this.actionSelection.has(photoGroupId)) {
      this.actionSelection.delete(photoGroupId);
    } else this.actionSelection.add(photoGroupId);
    this.selectionAnchorId = photoGroupId;
    return this.selectedPhotoGroupIds();
  }

  clearActionSelection() {
    this.actionSelection.clear();
    this.selectionAnchorId = null;
  }

  selectVisiblePhotoGroups() {
    const visible = this.visiblePhotoGroups();
    visible.forEach(({ id }) => this.actionSelection.add(id));
    this.selectionAnchorId = visible.at(-1)?.id ?? null;
    return this.selectedPhotoGroupIds();
  }

  selectedPhotoGroupIds() {
    return [...this.actionSelection].sort((left, right) =>
      this.#groupIndex.get(left).index - this.#groupIndex.get(right).index,
    );
  }

  viewerState() {
    if (!this.viewer) return null;
    const visible = this.visiblePhotoGroups();
    const index = this.visibleIndexOf(this.viewer.photoGroupId);
    if (index < 0) return null;
    return {
      photoGroupId: this.viewer.photoGroupId,
      index,
      total: visible.length,
      canGoPrevious: index > 0,
      canGoNext: index < visible.length - 1,
    };
  }
}
