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
  }

  visiblePhotoGroups() {
    return this.photoGroups.filter((photoGroup) =>
      isVisible(photoGroup, this.filter, this.decisions),
    );
  }

  update({
    photoGroups = this.photoGroups,
    filter = this.filter,
    decisions = this.decisions,
  } = {}) {
    this.photoGroups = photoGroups;
    this.filter = filter;
    this.decisions = decisions;
    const existingIds = new Set(photoGroups.map((photoGroup) => photoGroup.id));
    this.actionSelection = new Set(
      [...this.actionSelection].filter((photoGroupId) =>
        existingIds.has(photoGroupId),
      ),
    );
    if (!existingIds.has(this.selectionAnchorId)) this.selectionAnchorId = null;
    return this.viewer && !this.viewerState() ? this.close() : null;
  }

  open(photoGroupId, returnTarget = {}) {
    const visible = this.visiblePhotoGroups();
    const index = visible.findIndex((photoGroup) => photoGroup.id === photoGroupId);
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
    const visible = this.visiblePhotoGroups();
    const index = visible.findIndex(
      (photoGroup) => photoGroup.id === this.viewer.photoGroupId,
    );
    const next = visible[index + direction];
    if (next) this.viewer.photoGroupId = next.id;
    return this.viewerState();
  }

  goTo(photoGroupId) {
    if (!this.viewer) return null;
    if (
      !this.visiblePhotoGroups().some(
        (photoGroup) => photoGroup.id === photoGroupId,
      )
    )
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
    const index = visible.findIndex(
      (photoGroup) => photoGroup.id === photoGroupId,
    );
    if (index < 0)
      throw new Error("该 photo group 不在当前筛选结果中，无法加入 action selection。");
    const anchorIndex = visible.findIndex(
      (photoGroup) => photoGroup.id === this.selectionAnchorId,
    );
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
    return this.photoGroups
      .filter((photoGroup) => this.actionSelection.has(photoGroup.id))
      .map((photoGroup) => photoGroup.id);
  }

  viewerState() {
    if (!this.viewer) return null;
    const visible = this.visiblePhotoGroups();
    const index = visible.findIndex(
      (photoGroup) => photoGroup.id === this.viewer.photoGroupId,
    );
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
