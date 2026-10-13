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
    if (existing) throw new DOMException(`${name} is not a file`, "TypeMismatchError");
    if (!create) throw new DOMException(`${name} does not exist`, "NotFoundError");
    return this.addFile(name, "");
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    const existing = this.entries.get(name);
    if (existing?.kind === "directory") return existing;
    if (existing) throw new DOMException(`${name} is not a directory`, "TypeMismatchError");
    if (!create) throw new DOMException(`${name} does not exist`, "NotFoundError");
    const handle = new MemoryDirectoryHandle(name);
    this.entries.set(name, handle);
    return handle;
  }

  async removeEntry(name) {
    const entry = this.entries.get(name);
    if (!entry) throw new DOMException(`${name} does not exist`, "NotFoundError");
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function readManifest(directory) {
  return JSON.parse(await (await directory.getFileHandle("move-manifest.json"))
    .getFile().then((file) => file.text()));
}

test("movement holds an exclusive lock against opening and every other file action", async () => {
  const source = new MemoryDirectoryHandle("source");
  const file = source.addFile("ONE.JPG");
  source.addFile("TWO.JPG");
  const entered = deferred();
  const release = deferred();
  const nativeMove = file.move.bind(file);
  file.move = async (...args) => {
    entered.resolve();
    await release.promise;
    return nativeMove(...args);
  };
  let pickerCalls = 0;
  const workspace = new ReviewWorkspace({
    pickDirectory: async () => { pickerCalls += 1; return source; },
    batchNameFactory: () => "_PhotoCull_Review_lock",
  });
  const current = await workspace.openDirectory(source);
  const moving = workspace.movePhotoGroups(["photo-group:ONE"]);
  await entered.promise;
  const other = new MemoryDirectoryHandle("other");
  await assert.rejects(workspace.openDirectory(other), /等待当前操作/);
  await assert.rejects(workspace.chooseDirectory(), /等待当前操作/);
  await assert.rejects(workspace.resumeLastDirectory(), /等待当前操作/);
  await assert.rejects(workspace.movePhotoGroups(["photo-group:TWO"]), /等待当前操作/);
  await assert.rejects(workspace.restoreMovedBatch("any"), /等待当前操作/);
  await assert.rejects(workspace.restoreMovedPhotoGroup("any", "photo-group:ONE"), /等待当前操作/);
  assert.equal(pickerCalls, 0);
  assert.equal(workspace.current, current);
  release.resolve();
  await moving;
  assert.deepEqual(current.photoGroups.map((group) => group.id), ["photo-group:TWO"]);
  assert.equal((await workspace.openDirectory(other)).directory, other);
});

test("a pending directory scan cannot overlap a file action on the previous workspace", async () => {
  const source = new MemoryDirectoryHandle("source");
  source.addFile("ONE.JPG");
  const workspace = new ReviewWorkspace();
  const oldCurrent = await workspace.openDirectory(source);
  const entered = deferred();
  const release = deferred();
  const next = new MemoryDirectoryHandle("next");
  const nextFile = next.addFile("TWO.JPG");
  const getFile = nextFile.getFile.bind(nextFile);
  nextFile.getFile = async () => { entered.resolve(); await release.promise; return getFile(); };
  const opening = workspace.openDirectory(next);
  await entered.promise;
  await assert.rejects(workspace.movePhotoGroups(["photo-group:ONE"]), /等待当前操作/);
  await assert.rejects(workspace.openDirectory(source), /等待当前操作/);
  assert.equal(workspace.current, oldCurrent);
  release.resolve();
  assert.equal((await opening).directory, next);
  assert.equal(source.moves.length, 0);
});

test("pending picker and resume permission requests reserve the operation lock", async () => {
  for (const entry of ["choose", "resume"]) {
    const source = new MemoryDirectoryHandle("source");
    source.addFile("ONE.JPG");
    const entered = deferred();
    const release = deferred();
    const wait = async () => { entered.resolve(); await release.promise; };
    source.requestPermission = async () => { await wait(); return "granted"; };
    const workspace = new ReviewWorkspace({
      pickDirectory: async () => { await wait(); return source; },
      reviewStore: { load: async () => null, save: async () => {}, loadLastDirectory: async () => source },
    });
    await workspace.openDirectory(source);
    const opening = entry === "choose" ? workspace.chooseDirectory() : workspace.resumeLastDirectory();
    await entered.promise;
    await assert.rejects(workspace.movePhotoGroups(["photo-group:ONE"]), /等待当前操作/);
    release.resolve();
    await opening;
  }
});

test("restore holds its lock through asynchronous member movement and releases it on error", async () => {
  const source = new MemoryDirectoryHandle("source");
  const file = source.addFile("ONE.JPG");
  const workspace = new ReviewWorkspace({ batchNameFactory: () => "_PhotoCull_Review_restore_lock" });
  await workspace.openDirectory(source);
  const moved = await workspace.movePhotoGroups(["photo-group:ONE"]);
  const entered = deferred();
  const release = deferred();
  const failure = new DOMException("Permission revoked", "NotAllowedError");
  file.move = async () => { entered.resolve(); await release.promise; throw failure; };
  const restoring = workspace.restoreMovedPhotoGroup(moved.id, "photo-group:ONE");
  const rejected = assert.rejects(restoring, (error) => error === failure);
  await entered.promise;
  await assert.rejects(workspace.restoreMovedBatch(moved.id), /等待当前操作/);
  await assert.rejects(workspace.openDirectory(source), /等待当前操作/);
  release.resolve();
  await rejected;
  assert.equal((await readManifest(moved.movedBatch.directory)).status, "interrupted");
  assert.equal((await workspace.openDirectory(source)).movedBatches.length, 1);
});

test("permission and type errors during batch collision checks propagate without creating a destination", async () => {
  for (const name of ["NotAllowedError", "TypeMismatchError", "UnknownError"]) {
    const source = new MemoryDirectoryHandle("source");
    source.addFile("ONE.JPG");
    const workspace = new ReviewWorkspace({ batchNameFactory: () => "_PhotoCull_Review_denied" });
    await workspace.openDirectory(source);
    const failure = new DOMException("Lookup failed", name);
    source.getDirectoryHandle = async () => { throw failure; };
    await assert.rejects(workspace.movePhotoGroups(["photo-group:ONE"]), (error) => error === failure);
    assert.deepEqual([...source.entries.keys()], ["ONE.JPG"]);
    assert.equal((await workspace.openDirectory(source)).directory, source);
  }
});

test("member lookup permission errors preserve the original error and an interrupted journal", async () => {
  const source = new MemoryDirectoryHandle("source");
  source.addFile("ONE.JPG");
  const workspace = new ReviewWorkspace({ batchNameFactory: () => "_PhotoCull_Review_lookup" });
  await workspace.openDirectory(source);
  const failure = new DOMException("Read permission revoked", "NotAllowedError");
  const nativeLookup = source.getFileHandle.bind(source);
  source.getFileHandle = async (name, options) => {
    if (name === "ONE.JPG") throw failure;
    return nativeLookup(name, options);
  };
  await assert.rejects(workspace.movePhotoGroups(["photo-group:ONE"]), (error) => error === failure);
  const batch = await source.getDirectoryHandle("_PhotoCull_Review_lookup");
  assert.equal((await readManifest(batch)).status, "interrupted");
  assert.equal(source.moves.length, 0);
  source.getFileHandle = nativeLookup;
  const reopened = await workspace.openDirectory(source);
  assert.equal(reopened.movedBatches.length, 1);
  await workspace.restoreMovedBatch(reopened.movedBatches[0].id);
  assert.ok(source.entries.has("ONE.JPG"));
});

test("a failed interrupted-journal write does not hide the primary move failure", async () => {
  const source = new MemoryDirectoryHandle("source");
  const file = source.addFile("ONE.JPG");
  const workspace = new ReviewWorkspace({ batchNameFactory: () => "_PhotoCull_Review_double_failure" });
  await workspace.openDirectory(source);
  const primary = new Error("Movement failed");
  const secondary = new DOMException("Journal write denied", "NotAllowedError");
  file.move = async (batch) => {
    const journal = await batch.getFileHandle("move-manifest.json");
    journal.createWritable = async () => { throw secondary; };
    throw primary;
  };
  await assert.rejects(workspace.movePhotoGroups(["photo-group:ONE"]), (error) => error === primary);
  assert.equal(primary.journalError, secondary);
  const batch = await source.getDirectoryHandle("_PhotoCull_Review_double_failure");
  assert.equal((await readManifest(batch)).status, "moving");
  assert.equal((await workspace.openDirectory(source)).movedBatches.length, 1);
});

test("batch discovery propagates journal permission failures rather than hiding recovery", async () => {
  const source = new MemoryDirectoryHandle("source");
  source.addFile("ONE.JPG");
  const workspace = new ReviewWorkspace({ batchNameFactory: () => "_PhotoCull_Review_discovery" });
  await workspace.openDirectory(source);
  const moved = await workspace.movePhotoGroups(["photo-group:ONE"]);
  const failure = new DOMException("Journal access denied", "NotAllowedError");
  moved.movedBatch.directory.getFileHandle = async () => { throw failure; };
  await assert.rejects(workspace.openDirectory(source), (error) => error === failure);
  const other = new MemoryDirectoryHandle("other");
  assert.equal((await workspace.openDirectory(other)).directory, other);
});

test("restore refuses permission and IO lookup failures without moving any member", async () => {
  for (const lookupTarget of ["source", "batch"]) {
    const source = new MemoryDirectoryHandle("source");
    source.addFile("ONE.JPG");
    const workspace = new ReviewWorkspace({ batchNameFactory: () => "_PhotoCull_Review_restore_lookup" });
    await workspace.openDirectory(source);
    const moved = await workspace.movePhotoGroups(["photo-group:ONE"]);
    const target = lookupTarget === "source" ? source : moved.movedBatch.directory;
    const original = target.getFileHandle.bind(target);
    const failure = new DOMException("Lookup denied", "NotAllowedError");
    target.getFileHandle = async (name, options) => {
      if (name === "ONE.JPG") throw failure;
      return original(name, options);
    };
    await assert.rejects(workspace.restoreMovedBatch(moved.id), (error) => error === failure);
    assert.equal(moved.movedBatch.directory.moves.length, 0);
    assert.equal((await readManifest(moved.movedBatch.directory)).status, "completed");
    target.getFileHandle = original;
    await workspace.restoreMovedBatch(moved.id);
    assert.ok(source.entries.has("ONE.JPG"));
  }
});

test("frozen primary errors remain visible when interrupted-journal persistence also fails", async () => {
  const source = new MemoryDirectoryHandle("source");
  const file = source.addFile("ONE.JPG");
  const workspace = new ReviewWorkspace({ batchNameFactory: () => "_PhotoCull_Review_frozen_error" });
  await workspace.openDirectory(source);
  const primary = Object.freeze(new Error("Frozen move failure"));
  file.move = async (batch) => {
    const manifest = await batch.getFileHandle("move-manifest.json");
    manifest.createWritable = async () => { throw new Error("Journal write failure"); };
    throw primary;
  };
  await assert.rejects(workspace.movePhotoGroups(["photo-group:ONE"]), (error) => error === primary);
  assert.equal((await workspace.openDirectory(source)).movedBatches.length, 1);
});

test("completed file movement remains reflected in the workspace if review persistence fails", async () => {
  const source = new MemoryDirectoryHandle("source");
  source.addFile("ONE.JPG");
  const failure = new Error("Review storage unavailable");
  const workspace = new ReviewWorkspace({
    batchNameFactory: () => "_PhotoCull_Review_save_failure",
    reviewStore: { load: async () => null, save: async () => { throw failure; } },
  });
  const current = await workspace.openDirectory(source);
  await assert.rejects(workspace.movePhotoGroups(["photo-group:ONE"]), (error) => error === failure);
  assert.equal(current.photoGroups.length, 0);
  assert.equal(current.movedBatches.length, 1);
  assert.equal((await readManifest(current.movedBatches[0].directory)).status, "completed");
  assert.equal((await workspace.openDirectory(source)).movedBatches.length, 1);
});

test("restoration supersedes old background analysis even when stale results arrive later", async () => {
  const source = new MemoryDirectoryHandle("source");
  source.addFile("ONE.JPG");
  let oldOptions;
  let finishOld;
  let calls = 0;
  const workspace = new ReviewWorkspace({
    batchNameFactory: () => "_PhotoCull_Review_analysis_restore",
    analyzer: (groups, options) => {
      calls += 1;
      if (calls === 1) {
        oldOptions = options;
        return new Promise((resolve) => { finishOld = () => resolve(groups); });
      }
      return Promise.resolve(groups.map((group) => ({ ...group, analysis: { technicalScore: 91 } })));
    },
  });
  const current = await workspace.openDirectory(source);
  const oldGroup = current.photoGroups[0];
  const moved = await workspace.movePhotoGroups([oldGroup.id]);
  await workspace.restoreMovedBatch(moved.id);
  assert.equal(oldOptions.signal.aborted, true);
  oldOptions.onResult({ ...oldGroup, analysis: { technicalScore: 1 } }, 1, 1);
  finishOld();
  await current.analysisPromise;
  assert.equal(current.photoGroups[0].analysis.technicalScore, 91);
});

test("a worker failure arriving after restoration cannot overwrite operation feedback", async () => {
  const source = new MemoryDirectoryHandle("source");
  source.addFile("ONE.JPG");
  let rejectOld;
  let calls = 0;
  const events = [];
  const workspace = new ReviewWorkspace({
    batchNameFactory: () => "_PhotoCull_Review_late_error",
    analyzer: (groups) => {
      calls += 1;
      if (calls === 1) return new Promise((_resolve, reject) => { rejectOld = reject; });
      return Promise.resolve(groups);
    },
  });
  const current = await workspace.openDirectory(source, { onAnalysis: (event) => events.push(event) });
  const moved = await workspace.movePhotoGroups(["photo-group:ONE"]);
  await workspace.restoreMovedBatch(moved.id);
  rejectOld(new Error("Late GPU/worker failure"));
  await current.analysisPromise;
  assert.equal(current.analysisError, undefined);
  assert.deepEqual(events, []);
});

test("analysis indexes rebuild after membership changes and ignore moved IDs", async () => {
  const source = new MemoryDirectoryHandle("source");
  for (const name of ["ONE.JPG", "TWO.JPG", "THREE.JPG"]) source.addFile(name);
  let callbacks;
  let finish;
  let calls = 0;
  const events = [];
  const workspace = new ReviewWorkspace({
    batchNameFactory: () => "_PhotoCull_Review_index_membership",
    analyzer: (groups, options) => {
      calls += 1;
      if (calls > 1) return Promise.resolve(groups);
      callbacks = options;
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const current = await workspace.openDirectory(source, { onAnalysis: (event) => events.push(event) });
  const retained = workspace.getPhotoGroup("photo-group:TWO");
  const moved = await workspace.movePhotoGroups(["photo-group:ONE"]);
  assert.equal(workspace.getPhotoGroup("photo-group:ONE"), null);
  assert.equal(workspace.getPhotoGroup("photo-group:TWO"), retained);
  callbacks.onResult({ id: "photo-group:ONE", analysis: { technicalScore: 1 } }, 1, 3);
  assert.deepEqual(events, []);
  callbacks.onResult({ id: "photo-group:TWO", analysis: { technicalScore: 82 } }, 2, 3);
  assert.equal(retained.analysis.technicalScore, 82);
  assert.equal(current.photoGroups.find(({ id }) => id === retained.id), retained);
  finish([
    { id: "photo-group:ONE", analysis: { technicalScore: 2 } },
    { id: "photo-group:TWO", analysis: { technicalScore: 83 } },
  ]);
  await current.analysisPromise;
  assert.equal(retained.analysis.technicalScore, 83);
  assert.equal(current.photoGroups.length, 2);
  await workspace.restoreMovedBatch(moved.id);
  assert.equal(workspace.getPhotoGroup("photo-group:ONE")?.id, "photo-group:ONE");
  assert.equal(workspace.getPhotoGroup("photo-group:TWO"), current.photoGroups.find(({ id }) => id === "photo-group:TWO"));
});
