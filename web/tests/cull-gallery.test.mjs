import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryRows } from "../modules/cull-gallery.js";
const groups = ["a", "b", "c", "d"].map((id) => ({ id }));
const machine = Object.fromEntries(
  groups.map((g, i) => [g.id, { similarityKind: "burst", rank: i + 1 }]),
);

test("collapsed gallery shows every chosen representative and expands all members without changing choices", () => {
  const labels = { a: "include", b: "suppress", c: "include", d: "protected" };
  const state = (g) => labels[g.id];
  const rows = galleryRows(groups, [groups], machine, state);
  assert.deepEqual(
    rows.map((r) => r.group.id),
    ["a", "c"],
  );
  assert.equal(rows[0].batch.length, 4);
  assert.equal(rows[0].hiddenCount, 2);
  assert.equal(rows.filter((r) => r.toggle).length, 1);
  const expanded = galleryRows(
    groups,
    [groups],
    machine,
    state,
    new Set(["a"]),
  );
  assert.deepEqual(
    expanded.map((r) => r.group.id),
    groups.map((g) => g.id),
  );
  assert.deepEqual(labels, {
    a: "include",
    b: "suppress",
    c: "include",
    d: "protected",
  });
  labels.b = "include";
  assert.deepEqual(
    galleryRows(groups, [groups], machine, state).map((r) => r.group.id),
    ["a", "b", "c"],
  );
});
test("unselected and unknown batches stay reachable, filtered groups do not leak back", () => {
  const state = (g) => (g.id === "d" ? "protected" : "suppress");
  assert.equal(galleryRows(groups, [groups], machine, state)[0].group.id, "d");
  assert.equal(
    galleryRows(
      groups,
      [groups],
      Object.fromEntries(
        groups.map((g) => [
          g.id,
          { ...machine[g.id], similarityKind: "unknown" },
        ]),
      ),
      state,
    ).length,
    4,
  );
  assert.deepEqual(
    galleryRows([groups[1]], [groups], machine, state).map((r) => r.group.id),
    ["b"],
  );
  assert.equal(
    galleryRows(
      groups,
      groups.map((g) => [g]),
      machine,
      state,
    ).length,
    4,
  );
});
