import assert from "node:assert/strict";
import test from "node:test";

import { GridRenderWindow } from "../modules/grid-render-window.js";

function groups(count, prefix = "photo-group") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}:${index + 1}`,
  }));
}

test("GridRenderWindow bounds the first DOM batch and reveals every group in stable chunks", () => {
  const window = new GridRenderWindow({ batchSize: 160 });
  const allGroups = groups(800);

  assert.deepEqual(window.update(allGroups), {
    groups: allGroups.slice(0, 160),
    shown: 160,
    total: 800,
    hasMore: true,
  });
  assert.equal(window.revealNext(), true);
  assert.deepEqual(window.update(allGroups), {
    groups: allGroups.slice(0, 320),
    shown: 320,
    total: 800,
    hasMore: true,
  });

  while (window.revealNext());
  assert.deepEqual(window.update(allGroups), {
    groups: allGroups,
    shown: 800,
    total: 800,
    hasMore: false,
  });
});

test("GridRenderWindow resets its budget when the filtered photo group set changes", () => {
  const window = new GridRenderWindow({ batchSize: 2 });
  const allGroups = groups(5);
  window.update(allGroups);
  window.revealNext();

  const filtered = [allGroups[1], allGroups[3], allGroups[4]];
  assert.deepEqual(window.update(filtered), {
    groups: filtered.slice(0, 2),
    shown: 2,
    total: 3,
    hasMore: true,
  });
});

test("stable analysis updates skip membership scans while new membership resets the window", () => {
  let idReads = 0;
  const allGroups = Array.from({ length: 1000 }, (_, index) => ({
    get id() { idReads++; return `group:${index}`; },
    analysis: { status: "pending" },
  }));
  const window = new GridRenderWindow({ batchSize: 2 });
  window.update(allGroups);
  assert.equal(idReads, 1000);
  allGroups[0].analysis = { status: "review" };
  window.revealNext();
  const rendered = window.update(allGroups);
  assert.equal(rendered.shown, 4);
  assert.equal(rendered.groups[0].analysis.status, "review");
  assert.equal(idReads, 1000);
  window.update(allGroups.slice(1));
  assert.equal(window.limit, 2);
  assert.equal(idReads, 1999);
  window.reset();
  window.update(allGroups);
  assert.equal(window.limit, 2);
  assert.equal(idReads, 2999);
});

