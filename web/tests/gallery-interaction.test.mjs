import assert from "node:assert/strict";
import test from "node:test";

import { GalleryInteraction } from "../modules/gallery-interaction.js";

function photoGroup(id) {
  return { id };
}

test("Photo Viewer opens a thumbnail, browses its visible neighbors, and restores its grid return target", () => {
  const interaction = new GalleryInteraction({
    photoGroups: [
      photoGroup("photo-group:0001"),
      photoGroup("photo-group:0002"),
      photoGroup("photo-group:0003"),
    ],
  });

  const opened = interaction.open("photo-group:0002", {
    focusId: "photo-card:photo-group:0002",
    scrollY: 640,
  });

  assert.deepEqual(opened, {
    photoGroupId: "photo-group:0002",
    index: 1,
    total: 3,
    canGoPrevious: true,
    canGoNext: true,
  });
  assert.equal(interaction.move(1).photoGroupId, "photo-group:0003");
  assert.equal(interaction.move(-1).photoGroupId, "photo-group:0002");
  assert.deepEqual(interaction.close(), {
    focusId: "photo-card:photo-group:0002",
    scrollY: 640,
  });
  assert.equal(interaction.viewer, null);
});

test("Photo Viewer refuses hidden photo groups and never owns review decisions", () => {
  const decisions = { "photo-group:0001": "keep" };
  const interaction = new GalleryInteraction({
    photoGroups: [photoGroup("photo-group:0001"), photoGroup("photo-group:0002")],
    filter: "unreviewed",
    decisions,
  });

  assert.throws(
    () => interaction.open("photo-group:0001"),
    /当前筛选结果/,
  );
  interaction.open("photo-group:0002");
  interaction.move(1);

  assert.deepEqual(decisions, { "photo-group:0001": "keep" });
});

test("Photo Viewer lets its filmstrip jump within the visible queue and closes when that queue hides its current group", () => {
  const interaction = new GalleryInteraction({
    photoGroups: [
      photoGroup("photo-group:0001"),
      photoGroup("photo-group:0002"),
      photoGroup("photo-group:0003"),
    ],
    decisions: { "photo-group:0002": "pick" },
  });

  interaction.open("photo-group:0001", {
    focusId: "photo-card:photo-group:0001",
    scrollY: 320,
  });
  assert.deepEqual(interaction.goTo("photo-group:0003"), {
    photoGroupId: "photo-group:0003",
    index: 2,
    total: 3,
    canGoPrevious: true,
    canGoNext: false,
  });

  assert.deepEqual(
    interaction.update({ filter: "pick" }),
    { focusId: "photo-card:photo-group:0001", scrollY: 320 },
  );
  assert.equal(interaction.viewer, null);
});

test("action selection supports individual and Shift range selection without changing review decisions or the Photo Viewer", () => {
  const decisions = { "photo-group:0002": "keep" };
  const interaction = new GalleryInteraction({
    photoGroups: [
      photoGroup("photo-group:0001"),
      photoGroup("photo-group:0002"),
      photoGroup("photo-group:0003"),
      photoGroup("photo-group:0004"),
    ],
    decisions,
  });

  interaction.open("photo-group:0002");
  interaction.toggleSelection("photo-group:0001");
  assert.deepEqual(interaction.selectedPhotoGroupIds(), ["photo-group:0001"]);
  interaction.toggleSelection("photo-group:0003", { range: true });

  assert.deepEqual(interaction.selectedPhotoGroupIds(), [
    "photo-group:0001",
    "photo-group:0002",
    "photo-group:0003",
  ]);
  assert.equal(interaction.viewerState().photoGroupId, "photo-group:0002");
  assert.deepEqual(decisions, { "photo-group:0002": "keep" });
  interaction.clearActionSelection();
  assert.deepEqual(interaction.selectedPhotoGroupIds(), []);
});
