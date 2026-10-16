// A bounded, row-aligned window. The full queue stays in memory; only viewport
// neighbors become DOM nodes. Membership/order changes supply a new array.
export class GridRenderWindow {
  constructor({ batchSize = 160, overscanRows = 3 } = {}) {
    if (!Number.isInteger(batchSize) || batchSize < 1)
      throw new Error("Grid batch size must be a positive integer.");
    this.batchSize = batchSize;
    this.overscanRows = overscanRows;
    this.reset();
  }

  update(photoGroups, { columns = 1, rowHeight = 1, scrollTop = 0,
    viewportHeight = this.batchSize, overscanRows = this.overscanRows } = {}) {
    columns = Math.max(1, Math.floor(columns));
    rowHeight = Math.max(1, rowHeight);
    const total = photoGroups.length;
    this.photoGroups = photoGroups;
    if (total <= this.batchSize) {
      this.start = 0;
      this.end = total;
      return { groups: photoGroups, start: 0, end: total, total,
        topOffset: 0, bottomOffset: 0, virtual: false };
    }
    const rows = Math.ceil(total / columns);
    const viewportRows = Math.ceil(viewportHeight / rowHeight) + 1;
    // Bounds scale with the actual viewport if it can display more than the
    // normal budget, rather than leaving visible rows blank on giant screens.
    const rowBudget = Math.max(viewportRows, Math.floor(this.batchSize / columns));
    const renderRows = Math.min(rows, rowBudget, viewportRows + overscanRows * 2);
    const overscan = Math.max(0, Math.min(overscanRows, Math.floor((renderRows - viewportRows) / 2)));
    const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight));
    const startRow = Math.min(Math.max(0, rows - renderRows), Math.max(0, firstVisible - overscan));
    const endRow = Math.min(rows, startRow + renderRows);
    this.start = startRow * columns;
    this.end = Math.min(total, endRow * columns);
    return { groups: photoGroups.slice(this.start, this.end),
      start: this.start, end: this.end, total, virtual: true,
      topOffset: startRow * rowHeight,
      bottomOffset: (rows - endRow) * rowHeight };
  }

  reset() {
    this.photoGroups = null;
    this.start = 0;
    this.end = 0;
  }
}

// Keep the same queue item and fractional row visible when column geometry
// changes. The caller uses current scrollTop with the previous row dimensions.
export function reflowScrollOffset(scrollTop, previous, next, total) {
  if (!total || scrollTop <= 0) return 0;
  const oldRow = Math.floor(scrollTop / previous.rowHeight);
  const anchor = Math.min(total - 1, oldRow * previous.columns);
  const fraction = (scrollTop % previous.rowHeight) / previous.rowHeight;
  return (Math.floor(anchor / next.columns) + fraction) * next.rowHeight;
}
