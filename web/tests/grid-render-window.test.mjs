import assert from "node:assert/strict";
import test from "node:test";
import { GridRenderWindow } from "../modules/grid-render-window.js";

function groups(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `group:${index}`,
  }));
}

test("large grid windows stay bounded and cover first, middle, and final rows", () => {
  const window = new GridRenderWindow({ batchSize: 160 });
  const all = groups(2000);
  const viewport = { columns: 5, rowHeight: 220, viewportHeight: 800 };
  const first = window.update(all, viewport);
  assert.equal(first.start, 0);
  assert.equal(first.topOffset, 0);
  assert.equal(first.virtual, true);
  assert.ok(first.groups.length <= 160);
  const middle = window.update(all, { ...viewport, scrollTop: 44000 });
  assert.ok(middle.start > 0);
  assert.ok(middle.start <= 1000 && middle.end > 1000);
  assert.ok(middle.groups.length <= 160);
  assert.equal(middle.start % 5, 0);
  assert.equal(middle.topOffset / 220, middle.start / 5);
  const last = window.update(all, { ...viewport, scrollTop: 200000 });
  assert.equal(last.end, 2000);
  assert.equal(last.bottomOffset, 0);
  assert.ok(last.groups.length <= 160);
  assert.equal(last.groups.at(-1), all.at(-1));
});

test("small directories retain the full queue and membership/density changes recalculate spacers", () => {
  const window = new GridRenderWindow({ batchSize: 160 });
  const small = groups(160);
  const rendered = window.update(small, { scrollTop: 50000 });
  assert.equal(rendered.groups, small);
  assert.equal(rendered.virtual, false);
  assert.equal(rendered.topOffset, 0);
  assert.equal(rendered.bottomOffset, 0);
  const large = groups(1000);
  const compact = window.update(large, {
    columns: 6,
    rowHeight: 200,
    viewportHeight: 600,
    scrollTop: 10000,
  });
  const comfortable = window.update(large, {
    columns: 3,
    rowHeight: 300,
    viewportHeight: 600,
    scrollTop: 10000,
  });
  assert.equal(compact.start % 6, 0);
  assert.equal(comfortable.start % 3, 0);
  assert.notEqual(compact.start, comfortable.start);
  const filtered = large.slice(0, 30);
  assert.equal(window.update(filtered).groups, filtered);
});

test("stable analysis results require no full membership/ID scans", () => {
  let reads = 0;
  const all = Array.from({ length: 2000 }, (_, index) => ({
    get id() {
      reads += 1;
      return `group:${index}`;
    },
    analysis: { status: "pending" },
  }));
  const window = new GridRenderWindow();
  for (let index = 0; index < 500; index++) {
    window.update(all, {
      columns: 5,
      rowHeight: 200,
      viewportHeight: 800,
      scrollTop: index * 200,
    });
  }
  assert.equal(reads, 0);
  all[0].analysis.status = "keep";
  assert.equal(window.update(all).groups[0].analysis.status, "keep");
  window.reset();
  assert.equal(window.start, 0);
});

test("responsive reflow preserves queue anchors instead of stale absolute pixels", async () => {
  const { reflowScrollOffset } =
    await import("../modules/grid-render-window.js");
  const wide = { columns: 4, rowHeight: 240 };
  const narrow = { columns: 2, rowHeight: 350 };
  // Wide row 84 shows group 336 at a quarter-row offset. Narrow geometry
  // must still show group 336, rather than jump back to the middle of a queue.
  const next = reflowScrollOffset(84.25 * wide.rowHeight, wide, narrow, 360);
  assert.equal(next, 168.25 * narrow.rowHeight);
  assert.equal(
    reflowScrollOffset(next, narrow, wide, 360),
    84.25 * wide.rowHeight,
  );
  assert.equal(reflowScrollOffset(0, wide, narrow, 360), 0);
});

test("variable group headers keep every row reachable in a bounded continuous window", () => {
  const view = new GridRenderWindow({ batchSize: 20, overscanRows: 3 });
  const rows = Array.from({ length: 2000 }, (_, i) => ({
    id: i,
    height: i % 17 === 0 ? 52 : 250,
  }));
  let result = view.updateVariable(rows, { scrollTop: 0, viewportHeight: 800 });
  assert.equal(result.start, 0);
  assert.ok(result.groups.length < 20);
  const total = result.offsets.at(-1);
  result = view.updateVariable(rows, {
    scrollTop: total - 800,
    viewportHeight: 800,
  });
  assert.equal(result.end, 2000);
  assert.equal(result.bottomOffset, 0);
  assert.equal(result.groups.at(-1).id, 1999);
  for (let y = 0; y < total; y += 777) {
    const r = view.updateVariable(rows, { scrollTop: y, viewportHeight: 800 });
    assert.ok(r.topOffset <= y);
    assert.ok(r.offsets[r.end] >= Math.min(total, y + 800));
    assert.ok(r.groups.length < 20);
  }
});
