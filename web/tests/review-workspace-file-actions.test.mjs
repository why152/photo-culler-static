import assert from "node:assert/strict";
import test from "node:test";

import { ReviewWorkspace } from "../modules/review-workspace.js";

class MemoryFileHandle {
  constructor(directory, name, contents = "") {
    this.kind = "file";
    this.directory = directory;
    this.name = name;
    this.contents = contents;
    this.revision = 1;
  }

  async getFile() {
    const contents = this.contents;
    return {
      name: this.name,
      size:
        typeof contents === "string"
          ? new TextEncoder().encode(contents).byteLength
          : contents.size,
      lastModified: this.revision,
      async text() {
        return typeof contents === "string" ? contents : "";
      },
    };
  }

  async createWritable() {
    return {
      write: async (contents) => {
        this.contents = contents;
      },
      close: async () => {
        this.revision += 1;
      },
    };
  }

  async move(destination, targetName = this.name) {
    if (destination.entries.has(targetName))
      throw new Error(`refusing to overwrite ${targetName}`);
    this.directory.entries.delete(this.name);
    this.directory.moves.push(this.name);
    this.directory = destination;
    this.name = targetName;
    destination.entries.set(targetName, this);
  }
}

class MemoryDirectoryHandle {
  constructor(name) {
    this.kind = "directory";
    this.name = name;
    this.entries = new Map();
    this.moves = [];
  }

  addFile(name, contents = name) {
    const handle = new MemoryFileHandle(this, name, contents);
    this.entries.set(name, handle);
    return handle;
  }

  async *values() {
    yield* [...this.entries.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async getFileHandle(name, { create = false } = {}) {
    const existing = this.entries.get(name);
    if (existing?.kind === "file") return existing;
    if (existing) throw new Error(`${name} is not a file`);
    if (!create) throw new Error(`${name} does not exist`);
    return this.addFile(name, "");
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    const existing = this.entries.get(name);
    if (existing?.kind === "directory") return existing;
    if (existing) throw new Error(`${name} is not a directory`);
    if (!create) throw new Error(`${name} does not exist`);
    const handle = new MemoryDirectoryHandle(name);
    this.entries.set(name, handle);
    return handle;
  }

  async removeEntry(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`${name} does not exist`);
    if (entry.kind === "directory" && entry.entries.size > 0)
      throw new Error(`${name} is not empty`);
    this.entries.delete(name);
  }
}

test("Review Workspace moves a complete photo group with a disk journal and restores its batch", async () => {
  const source = new MemoryDirectoryHandle("camera-import");
  source.addFile("P1000001.JPG", "jpeg");
  source.addFile("P1000001.RW2", "raw");
  source.addFile("P1000001.XMP", "xmp");
  source.addFile("P1000002.JPG", "jpeg-2");
  const workspace = new ReviewWorkspace({
    pickDirectory: async () => source,
    batchNameFactory: () => "_PhotoCull_Review_test",
  });
  const opened = await workspace.chooseDirectory();

  const progress = [];
  const moved = await workspace.movePhotoGroups([opened.photoGroups[0].id], {
    onProgress: (update) => progress.push(update),
  });

  assert.equal(moved.count, 1);
  assert.deepEqual(progress.at(-1), {
    filesDone: 3,
    fileCount: 3,
    groupsDone: 1,
    groupCount: 1,
  });
  assert.deepEqual([...source.entries.keys()].sort(), [
    "P1000002.JPG",
    "_PhotoCull_Review_test",
  ]);
  const batchDirectory = await source.getDirectoryHandle(
    "_PhotoCull_Review_test",
  );
  assert.deepEqual([...batchDirectory.entries.keys()].sort(), [
    "P1000001.JPG",
    "P1000001.RW2",
    "P1000001.XMP",
    "move-manifest.json",
  ]);
  const manifest = JSON.parse(
    await (await batchDirectory.getFileHandle("move-manifest.json"))
      .getFile()
      .then((file) => file.text()),
  );
  assert.equal(manifest.status, "completed");
  assert.deepEqual(
    manifest.records.map((record) => record.state),
    ["moved", "moved", "moved"],
  );

  const restarted = new ReviewWorkspace({ pickDirectory: async () => source });
  const recovered = await restarted.chooseDirectory();
  batchDirectory.moves = [];
  assert.equal(recovered.movedBatches.length, 1);
  await restarted.restoreMovedBatch(recovered.movedBatches[0].id);

  assert.deepEqual(batchDirectory.moves, [
    "P1000001.XMP",
    "P1000001.RW2",
    "P1000001.JPG",
  ]);

  assert.deepEqual([...source.entries.keys()].sort(), [
    "P1000001.JPG",
    "P1000001.RW2",
    "P1000001.XMP",
    "P1000002.JPG",
  ]);
});

test("Review Workspace restores one complete photo group while keeping the remaining review batch recoverable", async () => {
  const source = new MemoryDirectoryHandle("camera-import");
  source.addFile("P1000001.JPG", "jpeg");
  source.addFile("P1000001.RW2", "raw");
  source.addFile("P1000001.XMP", "xmp");
  source.addFile("P1000002.JPG", "jpeg-2");
  const workspace = new ReviewWorkspace({
    pickDirectory: async () => source,
    batchNameFactory: () => "_PhotoCull_Review_test",
  });
  const opened = await workspace.chooseDirectory();
  const moved = await workspace.movePhotoGroups(
    opened.photoGroups.map((group) => group.id),
  );

  const restored = await workspace.restoreMovedPhotoGroup(
    moved.id,
    "photo-group:P1000001",
  );

  assert.deepEqual([...source.entries.keys()].sort(), [
    "P1000001.JPG",
    "P1000001.RW2",
    "P1000001.XMP",
    "_PhotoCull_Review_test",
  ]);
  assert.equal(restored.remainingGroups, 1);
  const batch = await source.getDirectoryHandle("_PhotoCull_Review_test");
  assert.deepEqual([...batch.entries.keys()].sort(), [
    "P1000002.JPG",
    "move-manifest.json",
  ]);
  const resumed = await new ReviewWorkspace({
    pickDirectory: async () => source,
  }).chooseDirectory();
  assert.deepEqual(
    resumed.movedBatches[0].photoGroups.map((group) => group.stem),
    ["P1000002"],
  );
});

test("Review Workspace keeps an interrupted batch discoverable and restores only members that moved", async () => {
  const source = new MemoryDirectoryHandle("camera-import");
  source.addFile("P1000001.JPG", "jpeg");
  const failingRaw = source.addFile("P1000001.RW2", "raw");
  source.addFile("P1000001.XMP", "xmp");
  failingRaw.move = async () => {
    throw new Error("simulated move interruption");
  };
  const workspace = new ReviewWorkspace({
    pickDirectory: async () => source,
    batchNameFactory: () => "_PhotoCull_Review_test",
  });
  const opened = await workspace.chooseDirectory();

  await assert.rejects(
    workspace.movePhotoGroups([opened.photoGroups[0].id]),
    /simulated move interruption/,
  );
  const batch = await source.getDirectoryHandle("_PhotoCull_Review_test");
  const journal = JSON.parse(
    await (await batch.getFileHandle("move-manifest.json"))
      .getFile()
      .then((file) => file.text()),
  );
  assert.equal(journal.status, "interrupted");
  assert.deepEqual([...batch.entries.keys()].sort(), [
    "P1000001.JPG",
    "move-manifest.json",
  ]);

  const recoveryWorkspace = new ReviewWorkspace({
    pickDirectory: async () => source,
  });
  const reopened = await recoveryWorkspace.chooseDirectory();
  assert.equal(reopened.movedBatches.length, 1);
  await recoveryWorkspace.restoreMovedBatch("_PhotoCull_Review_test");
  assert.deepEqual([...source.entries.keys()].sort(), [
    "P1000001.JPG",
    "P1000001.RW2",
    "P1000001.XMP",
  ]);
});

test("Review Workspace refuses a batch restore that would overwrite a later source file", async () => {
  const source = new MemoryDirectoryHandle("camera-import");
  source.addFile("P1000001.JPG", "jpeg");
  source.addFile("P1000001.RW2", "raw");
  source.addFile("P1000001.XMP", "xmp");
  const workspace = new ReviewWorkspace({
    pickDirectory: async () => source,
    batchNameFactory: () => "_PhotoCull_Review_test",
  });
  const opened = await workspace.chooseDirectory();
  await workspace.movePhotoGroups([opened.photoGroups[0].id]);
  source.addFile("P1000001.JPG", "later-file");

  await assert.rejects(
    workspace.restoreMovedBatch("_PhotoCull_Review_test"),
    /拒绝覆盖/,
  );
  const batch = await source.getDirectoryHandle("_PhotoCull_Review_test");
  assert.ok(await batch.getFileHandle("P1000001.JPG"));
  assert.equal(
    (await (await source.getFileHandle("P1000001.JPG")).getFile()).size,
    new TextEncoder().encode("later-file").byteLength,
  );
});

test("a late analysis result never brings a moved photo group back into the workbench", async () => {
  const source = new MemoryDirectoryHandle("camera-import");
  source.addFile("P1000001.JPG", "jpeg");
  let resolveAnalysis;
  const workspace = new ReviewWorkspace({
    pickDirectory: async () => source,
    analyzer: (groups) =>
      new Promise((resolve) => {
        resolveAnalysis = () =>
          resolve(
            groups.map((group) => ({
              ...group,
              analysis: {
                status: "keep",
                sharpness: 80,
                exposureScore: 90,
                technicalScore: 82,
                reasons: ["完成"],
              },
            })),
          );
      }),
    batchNameFactory: () => "_PhotoCull_Review_test",
  });
  const opened = await workspace.chooseDirectory();

  await workspace.movePhotoGroups([opened.photoGroups[0].id]);
  resolveAnalysis();
  await opened.analysisPromise;

  assert.equal(workspace.current.photoGroups.length, 0);
});
