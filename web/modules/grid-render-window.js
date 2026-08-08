export class GridRenderWindow {
  constructor({ batchSize = 160 } = {}) {
    if (!Number.isInteger(batchSize) || batchSize < 1)
      throw new Error("Grid batch size must be a positive integer.");
    this.batchSize = batchSize;
    this.ids = [];
    this.limit = 0;
  }

  update(photoGroups) {
    const ids = photoGroups.map(({ id }) => id);
    const sameSet =
      ids.length === this.ids.length &&
      ids.every((id, index) => id === this.ids[index]);
    if (!sameSet) {
      this.ids = ids;
      this.limit = Math.min(this.batchSize, ids.length);
    }
    const shown = Math.min(this.limit, photoGroups.length);
    return {
      groups: photoGroups.slice(0, shown),
      shown,
      total: photoGroups.length,
      hasMore: shown < photoGroups.length,
    };
  }

  revealNext() {
    const nextLimit = Math.min(
      this.ids.length,
      this.limit + this.batchSize,
    );
    if (nextLimit === this.limit) return false;
    this.limit = nextLimit;
    return true;
  }

  reset() {
    this.ids = [];
    this.limit = 0;
  }
}

