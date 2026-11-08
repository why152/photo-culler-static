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

test("large gallery navigation reuses one visible queue and constant-time ID positions", () => {
  let decisionReads = 0;
  let idReads = 0;
  const groups = Array.from({ length: 5000 }, (_, index) => ({
    get id() { idReads += 1; return `group:${index}`; },
  }));
  const decisions = new Proxy({}, {
    get(target, key) { decisionReads += 1; return target[key]; },
  });
  const gallery = new GalleryInteraction({ photoGroups: groups, filter: "unreviewed", decisions });
  const visible = gallery.visiblePhotoGroups();
  const readsAfterIndexing = { idReads, decisionReads };
  gallery.open("group:2000");
  for (let index = 0; index < 200; index += 1) {
    assert.equal(gallery.move(1).index, 2001);
    assert.equal(gallery.move(-1).index, 2000);
    assert.equal(gallery.viewerState().total, 5000);
    assert.equal(gallery.visiblePhotoGroups(), visible);
    assert.equal(gallery.photoGroup("group:4999"), groups[4999]);
    assert.equal(gallery.visibleIndexOf("group:3000"), 3000);
    gallery.update({ photoGroups: groups, decisions });
  }
  assert.equal(decisionReads, readsAfterIndexing.decisionReads);
  // The only extra ID reads are the selected next group in each move.
  assert.equal(idReads - readsAfterIndexing.idReads, 400);
});

test("in-place decisions invalidate membership and preserve viewer closure semantics", () => {
  const groups = [photoGroup("one"), photoGroup("two"), photoGroup("three")];
  const decisions = { one: "keep" };
  const gallery = new GalleryInteraction({ photoGroups: groups, decisions, filter: "unreviewed" });
  const visible = gallery.visiblePhotoGroups();
  gallery.open("two", { focusId: "card:two", scrollY: 20 });
  decisions.two = "reject";
  gallery.invalidateDecisions();
  assert.notEqual(gallery.visiblePhotoGroups(), visible);
  assert.deepEqual(gallery.visiblePhotoGroups().map(({ id }) => id), ["three"]);
  assert.deepEqual(gallery.update(), { focusId: "card:two", scrollY: 20 });
  delete decisions.two;
  gallery.update({ decisionsChanged: true });
  assert.deepEqual(gallery.visiblePhotoGroups().map(({ id }) => id), ["two", "three"]);
  gallery.update({ filter: "keep" });
  assert.deepEqual(gallery.visiblePhotoGroups().map(({ id }) => id), ["one"]);
});

test("membership changes rebuild positions, prune removed selections, and keep directory ordering", () => {
  const one = photoGroup("one");
  const two = photoGroup("two");
  const three = photoGroup("three");
  const gallery = new GalleryInteraction({ photoGroups: [one, two, three] });
  gallery.toggleSelection("three");
  gallery.toggleSelection("one");
  assert.deepEqual(gallery.selectedPhotoGroupIds(), ["one", "three"]);
  gallery.open("one");
  gallery.update({ photoGroups: [three, two] });
  assert.equal(gallery.photoGroup("one"), null);
  assert.equal(gallery.viewerState(), null);
  assert.equal(gallery.selectionAnchorId, null);
  assert.deepEqual(gallery.selectedPhotoGroupIds(), ["three"]);
  assert.equal(gallery.visibleIndexOf("three"), 0);
  gallery.open("three");
  assert.equal(gallery.neighborPhotoGroup(1), two);
  assert.equal(gallery.nextUnreviewedPhotoGroup(), two);
  gallery.decisions.two = "keep";
  gallery.invalidateDecisions();
  assert.equal(gallery.nextUnreviewedPhotoGroup(), null);
});

test("cached queue and group lookup see analysis changes through stable object references", () => {
  const group = photoGroup("one");
  const gallery = new GalleryInteraction({ photoGroups: [group] });
  const visible = gallery.visiblePhotoGroups();
  Object.assign(group, { analysis: { technicalScore: 91 } });
  assert.equal(gallery.visiblePhotoGroups(), visible);
  assert.equal(visible[0].analysis.technicalScore, 91);
  assert.equal(gallery.photoGroup("one"), group);
});

test("all photo groups retain their queue and positions through decision edits, undo, and replacement", () => {
  let idReads = 0;
  const groups = Array.from({ length: 5000 }, (_, index) => ({
    get id() { idReads += 1; return `group:${index}`; },
  }));
  const decisions = {};
  const gallery = new GalleryInteraction({ photoGroups: groups, decisions });
  const visible = gallery.visiblePhotoGroups();
  gallery.open("group:2000");
  const indexedReads = idReads;
  for (let index = 0; index < 100; index += 1) {
    decisions[`group:${index}`] = "keep";
    gallery.invalidateDecisions();
    assert.equal(gallery.visiblePhotoGroups(), visible);
    delete decisions[`group:${index}`];
    gallery.update({ decisionsChanged: true });
    assert.equal(gallery.visibleIndexOf("group:2000"), 2000);
  }
  const replacement = { "group:2000": "pick" };
  gallery.update({ decisions: replacement });
  assert.equal(gallery.visiblePhotoGroups(), visible);
  assert.equal(idReads, indexedReads);
  gallery.update({ filter: "pick" });
  assert.deepEqual(gallery.visiblePhotoGroups().map(({ id }) => id), ["group:2000"]);
  gallery.update({ decisions: {} });
  assert.equal(gallery.viewer, null);
  assert.deepEqual(gallery.visiblePhotoGroups(), []);
});
