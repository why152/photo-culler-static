import assert from "node:assert/strict";
import test from "node:test";

import {
  browserCapabilities,
  ReviewWorkspace,
  scanPhotoGroups,
} from "../modules/review-workspace.js";

function fileHandle(name, { size = 100, lastModified = 1 } = {}) {
  return {
    kind: "file",
    name,
    async getFile() {
      return { name, size, lastModified };
    },
  };
}

function directoryHandle(name, entries) {
  return {
    kind: "directory",
    name,
    async *values() {
      yield* entries;
    },
  };
}

test("Review Workspace selects only JPEG-first photo groups from an ordinary directory", async () => {
  const source = directoryHandle("camera-import", [
    fileHandle("P1000001.JPG", { size: 101, lastModified: 11 }),
    fileHandle("P1000001.RW2", { size: 102, lastModified: 12 }),
    fileHandle("P1000001.XMP", { size: 103, lastModified: 13 }),
    fileHandle("P1000002.jpeg", { size: 201, lastModified: 21 }),
    fileHandle("P1000003.RW2", { size: 301, lastModified: 31 }),
    fileHandle("notes.txt"),
    directoryHandle("_PhotoCull_Review_20260802", []),
  ]);
  const workspace = new ReviewWorkspace({ pickDirectory: async () => source });

  const scan = await workspace.chooseDirectory();

  assert.equal(scan.directoryName, "camera-import");
  assert.deepEqual(
    scan.photoGroups.map((group) => ({
      stem: group.stem,
      analysisFilename: group.analysisFile.name,
      memberNames: group.members.map((member) => member.name),
      hasRaw: group.hasRaw,
    })),
    [
      {
        stem: "P1000001",
        analysisFilename: "P1000001.JPG",
        memberNames: ["P1000001.JPG", "P1000001.RW2", "P1000001.XMP"],
        hasRaw: true,
      },
      {
        stem: "P1000002",
        analysisFilename: "P1000002.jpeg",
        memberNames: ["P1000002.jpeg"],
        hasRaw: false,
      },
    ],
  );
});

test("Review Workspace refuses to use a recoverable review batch as a source directory", async () => {
  const batch = directoryHandle("_PhotoCull_Review_20260802", [
    fileHandle("P1000001.JPG"),
  ]);
  const workspace = new ReviewWorkspace({ pickDirectory: async () => batch });

  await assert.rejects(workspace.chooseDirectory(), /普通照片文件夹/);
});

test("Review Workspace restores valid review decisions when the same directory is opened again", async () => {
  const source = directoryHandle("camera-import", [
    fileHandle("P1000001.JPG", { size: 101, lastModified: 11 }),
    fileHandle("P1000002.JPG", { size: 201, lastModified: 21 }),
  ]);
  const savedReviews = new Map();
  const reviewStore = {
    async load(directory) {
      return savedReviews.get(directory) ?? null;
    },
    async save(directory, review) {
      savedReviews.set(directory, review);
    },
  };
  const analyzer = async (photoGroups) =>
    photoGroups.map((group) => ({
      ...group,
      analysis: {
        status: group.stem === "P1000001" ? "review" : "keep",
        sharpness: 35,
      },
    }));
  const first = new ReviewWorkspace({
    pickDirectory: async () => source,
    reviewStore,
    analyzer,
  });
  const opened = await first.chooseDirectory();
  await first.saveReview({
    decisions: {
      "photo-group:P1000001": "keep",
      "photo-group:missing": "reject",
    },
    selectedId: "photo-group:P1000002",
    candidates: ["photo-group:P1000001", "photo-group:missing"],
    marked: ["photo-group:P1000001", "photo-group:missing"],
    filter: "keep",
    density: "comfortable",
  });

  assert.equal(opened.photoGroups[0].analysis.status, "review");
  const later = new ReviewWorkspace({
    pickDirectory: async () => source,
    reviewStore,
    analyzer,
  });
  const resumed = await later.chooseDirectory();

  assert.deepEqual(resumed.review, {
    decisions: { "photo-group:P1000001": "keep" },
    selectedId: "photo-group:P1000002",
    candidates: ["photo-group:P1000001"],
    marked: ["photo-group:P1000001"],
    filter: "keep",
    density: "comfortable",
  });
});

test("Review Workspace only resumes the last directory after it regains read-write permission", async () => {
  const source = directoryHandle("camera-import", [fileHandle("P1000001.JPG")]);
  source.requestPermission = async ({ mode }) =>
    mode === "readwrite" ? "granted" : "denied";
  const reviewStore = {
    async load() {
      return null;
    },
    async save() {},
    async loadLastDirectory() {
      return source;
    },
  };
  const workspace = new ReviewWorkspace({ reviewStore });

  const resumed = await workspace.resumeLastDirectory();

  assert.equal(resumed.directory, source);
  assert.equal(resumed.photoGroups.length, 1);
});

test("Review Workspace opens the review workbench before a slow analysis completes", async () => {
  const source = directoryHandle("camera-import", [fileHandle("P1000001.JPG")]);
  let resolveAnalysis;
  const workspace = new ReviewWorkspace({
    pickDirectory: async () => source,
    analyzer: () =>
      new Promise((resolve) => {
        resolveAnalysis = resolve;
      }),
  });
  const opening = workspace.chooseDirectory();
  for (let turn = 0; turn < 10 && !resolveAnalysis; turn += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(resolveAnalysis);

  try {
    const scan = await Promise.race([
      opening,
      Promise.resolve("analysis-blocked-workbench"),
    ]);
    assert.notEqual(scan, "analysis-blocked-workbench");
    assert.equal(scan.photoGroups[0].analysis.status, "review");
    assert.match(scan.photoGroups[0].analysis.reasons[0], /正在分析/);
  } finally {
    resolveAnalysis?.([
      {
        ...(await scanPhotoGroups(source))[0],
        analysis: {
          status: "keep",
          sharpness: 70,
          exposureScore: 90,
          technicalScore: 74,
          reasons: ["完成"],
        },
      },
    ]);
    await opening;
  }
});

test("browser capability gate requires a secure directory picker, enumeration, writable files and native move support", () => {
  const supported = browserCapabilities({
    isSecureContext: true,
    showDirectoryPicker() {},
    FileSystemFileHandle: { prototype: { createWritable() {}, move() {} } },
    FileSystemDirectoryHandle: { prototype: { values() {} } },
  });
  const readOnly = browserCapabilities({
    isSecureContext: true,
    showDirectoryPicker() {},
    FileSystemFileHandle: { prototype: {} },
    FileSystemDirectoryHandle: { prototype: { values() {} } },
  });

  assert.deepEqual(supported, {
    secureContext: true,
    directoryPicker: true,
    directoryEnumeration: true,
    fileWritable: true,
    fileMove: true,
  });
  assert.deepEqual(readOnly, {
    secureContext: true,
    directoryPicker: true,
    directoryEnumeration: true,
    fileWritable: false,
    fileMove: false,
  });
});
