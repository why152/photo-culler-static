import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewLayout, unitForPhoto } from "../modules/cull-gallery-layout.js";
import { GridRenderWindow } from "../modules/grid-render-window.js";
test("packing preserves every photo and keeps expanded group boundaries through column reflow", () => {
  const photos = Array.from({ length: 13 }, (_, i) => ({
    group: { id: String(i) },
  }));
  const rows = photos.map((r, i) => ({
    ...r,
    ...(i >= 2 && i <= 7
      ? { key: "batch", expanded: true, toggle: i === 2, last: i === 7 }
      : {}),
  }));
  for (const columns of [2, 3, 5]) {
    const { units } = reviewLayout(rows, {
      columns,
      width: 1200,
      gap: 18,
      rowGap: 26,
    });
    assert.deepEqual(
      units.flatMap((u) => u.cards?.map((r) => r.group.id) ?? []),
      photos.map((r) => r.group.id),
    );
    assert.equal(units.filter((u) => u.kind === "header").length, 1);
    assert.equal(units.filter((u) => u.kind === "end").length, 1);
    for (const row of rows) assert.ok(unitForPhoto(units, row.group.id) >= 0);
    const window = new GridRenderWindow({ batchSize: 2, overscanRows: 1 });
    const range = window.updateVariable(units, {
      scrollTop: 0,
      viewportHeight: 600,
    });
    assert.equal(range.topOffset, 0);
    assert.equal(
      range.offsets.at(-1),
      units.reduce((s, u) => s + u.height, 0),
    );
  }
});
