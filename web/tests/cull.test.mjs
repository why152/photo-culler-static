import { computePhashFromRgba } from "@stabilityprotocol.com/phash";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  migrateDecision,
  migrateLegacy,
  outputDecision,
  validHuman,
} from "../modules/cull-session.js";
import { inventory, safeParts } from "../modules/cull-inventory.js";
import { cluster, digest, distance } from "../modules/cull-similarity.js";
import { rank } from "../modules/cull-ranking.js";
import {
  exportPlan,
  copyPlan,
  assertIndependent,
  publicManifest,
  resumePlan,
} from "../modules/cull-export.js";
function file(name, data = "abc", mtime = 1) {
  return {
    kind: "file",
    name,
    getFile: async () =>
      Object.assign(new Blob([data]), { name, lastModified: mtime }),
    createWritable: async () => {
      throw new Error("must not write source");
    },
  };
}
function dir(name, children = []) {
  return {
    kind: "directory",
    name,
    async *values() {
      yield* children;
    },
  };
}
const g = (id, time, hash, score = 80) => ({
  id,
  path: id,
  source: { size: 3 },
  hash,
  metadata: { capturedAt: time },
  analysis: { technicalScore: score, exposureScore: 90, sharpness: 70 },
  members: [],
  fingerprint: id,
});
test("legacy migration is one-to-one, additive and idempotent; favorite and human precedence", () => {
  assert.deepEqual(migrateDecision("pick"), {
    decision: "keep",
    favorite: true,
  });
  assert.deepEqual(migrateDecision("reject"), {
    decision: "exclude",
    favorite: false,
  });
  const groups = [{ id: "a", legacyId: "photo-group:a", fingerprint: "a" }],
    review = { decisions: { "photo-group:a": "pick" } };
  const first = migrateLegacy(review, groups);
  assert.deepEqual(migrateLegacy(review, groups, first), first);
  assert.equal(first.a.favorite, true);
  assert.equal(outputDecision(first.a, { plan: "suppress" }), "include");
  assert.equal(
    outputDecision({ decision: "exclude" }, { plan: "include" }),
    "suppress",
  );
  assert.equal(
    validHuman(first.a, { fingerprint: "changed" }).decision,
    "unreviewed",
  );
});
test("recursive inventory isolates same names, binds RAW/XMP/MOV, exposes unsupported and skips output", async () => {
  const root = dir("root", [
    dir("a", [file("IMG.jpg"), file("IMG.rw2"), file("IMG.xmp")]),
    dir("b", [file("IMG.jpg"), file("IMG.mov")]),
    file("alone.rw2"),
    file("bad.heic"),
    dir("PhotoCull_Output_old", [file("out.jpg")]),
    dir("_PhotoCull_Review_old", [file("old.jpg")]),
  ]);
  const scan = await inventory(root);
  assert.equal(scan.groups.length, 4);
  assert.equal(scan.skipped.length, 2);
  assert.equal(scan.groups.find((g) => g.path === "a/IMG").members.length, 3);
  assert.equal(scan.groups.find((g) => g.path === "b/IMG").protected, true);
  assert.equal(scan.groups.find((g) => g.path === "alone").protected, true);
  assert.equal(new Set(scan.groups.map((g) => g.id)).size, 4);
  assert.throws(() => safeParts("../bad"));
  assert.throws(() => safeParts("a\\b"));
});
test("complete-link burst clustering stops transitive drift and missing times never use mtime", () => {
  const a = g("a", 0, "0000000000000000"),
    b = g("b", 1000, "000000000000000f"),
    c = g("c", 2000, "00000000000000ff");
  assert.equal(distance(a.hash, b.hash), 4);
  assert.equal(cluster([a, b, c]).length, 2);
  assert.equal(cluster([g("x", null, a.hash), g("y", null, a.hash)]).length, 2);
  assert.equal(cluster([a, g("other", 10000, a.hash)]).length, 2);
});
test("ranking preserves at least one candidate per moment, protects exposure sequences and failures", () => {
  const a = g("a", 0, "0000000000000000"),
    b = g("b", 1, "0000000000000000", 70);
  let result = rank([a, b], { strength: "compact" });
  assert.equal(result.recommendations.a.plan, "include");
  assert.equal(result.recommendations.b.plan, "suppress");
  a.metadata.ExposureBiasValue = -1;
  b.metadata.ExposureBiasValue = 1;
  result = rank([a, b]);
  assert.equal(result.recommendations.b.plan, "protected");
  assert.equal(
    rank([{ ...a, hash: null }]).recommendations.a.plan,
    "protected",
  );
});
test("chunked digest matches SHA256 and observes cancellation", async () => {
  assert.equal(
    await digest(new Blob(["abc"])),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const c = new AbortController();
  c.abort(new DOMException("stop", "AbortError"));
  await assert.rejects(digest(new Blob(["abc"]), c.signal), {
    name: "AbortError",
  });
});
// In-memory writable target models normal conflicts, interrupted/denied writes and retries.
function outputDir(name = "output") {
  const files = new Map(),
    dirs = new Map();
  let writes = 0;
  return {
    name,
    files,
    dirs,
    get writes() {
      return writes;
    },
    async getDirectoryHandle(n, { create = false } = {}) {
      if (!dirs.has(n)) {
        if (!create) throw new DOMException("missing", "NotFoundError");
        dirs.set(n, outputDir(n));
      }
      return dirs.get(n);
    },
    async getFileHandle(n, { create = false } = {}) {
      if (!files.has(n)) {
        if (!create) throw new DOMException("missing", "NotFoundError");
        files.set(n, new Blob([]));
      }
      return {
        async getFile() {
          return files.get(n);
        },
        async createWritable() {
          let data = [];
          writes++;
          return {
            async write(value) {
              if (value instanceof ArrayBuffer) data.push(value);
              else data = [value];
            },
            async close() {
              files.set(n, new Blob(data));
            },
            async abort() {},
          };
        },
      };
    },
  };
}
function planFor() {
  const member = {
    path: "sub/a.jpg",
    handle: file("a.jpg"),
    size: 3,
    lastModified: 1,
  };
  const group = { ...g("a", 0, "0000"), members: [member] };
  return exportPlan([group], {}, { a: { plan: "include" } });
}
test("copy export verifies original bytes, preserves paths, retries idempotently, never overwrites conflicts", async () => {
  const plan = planFor(),
    output = outputDir();
  await copyPlan(plan, output);
  assert.equal(plan.status, "completed");
  assert.equal(plan.records[0].status, "verified");
  assert.equal(plan.records[0].sourceSHA, plan.records[0].destinationSHA);
  assert.equal(publicManifest(plan).records[0].handle, undefined);
  await copyPlan(plan, output);
  assert.equal(output.dirs.get("Keepers").dirs.get("sub").writes, 1);
  output.dirs
    .get("Keepers")
    .dirs.get("sub")
    .files.set("a.jpg", new Blob(["other"]));
  await assert.rejects(copyPlan(plan, output), /同名内容冲突/);
  assert.equal(
    await output.dirs.get("Keepers").dirs.get("sub").files.get("a.jpg").text(),
    "other",
  );
  assert.equal(plan.status, "interrupted");
});
test("source changes, permission loss, and cancellation do not pretend successful export", async () => {
  let plan = planFor();
  plan.records[0].handle = file("a.jpg", "changed");
  await assert.rejects(copyPlan(plan, outputDir()), /来源已更改/);
  plan = planFor();
  const c = new AbortController();
  c.abort(new DOMException("stop", "AbortError"));
  await assert.rejects(copyPlan(plan, outputDir(), { signal: c.signal }), {
    name: "AbortError",
  });
  plan = planFor();
  await assert.rejects(
    copyPlan(plan, {
      getDirectoryHandle: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    }),
    { name: "NotAllowedError" },
  );
});
test("explicit protected inclusion and complete companion groups; source/target overlap rejected", async () => {
  const group = {
    ...g("a", null, null),
    protected: true,
    members: [
      { path: "a.rw2", size: 5 },
      { path: "a.xmp", size: 2 },
    ],
  };
  assert.equal(
    exportPlan([group], {}, { a: { plan: "protected" } }).fileCount,
    0,
  );
  assert.equal(
    exportPlan([group], {}, { a: { plan: "protected" } }, true).fileCount,
    2,
  );
  await assert.rejects(
    assertIndependent({ isSameEntry: async () => true }, {}),
    /相同/,
  );
  await assert.rejects(
    assertIndependent(
      { isSameEntry: async () => false, resolve: async () => ["inside"] },
      { resolve: async () => null },
    ),
    /重叠/,
  );
});
test("30-frame bursts stay bounded, manual split is stable, strong thresholds never override human keep", () => {
  const frames = Array.from({ length: 30 }, (_, i) =>
    g("frame-" + i, i * 30, "aaff00ff00ff00ff", 80 + i / 10),
  );
  const ranked = rank(frames, { strength: "compact" });
  assert.equal(ranked.batches.length, 1);
  assert.equal(
    Object.values(ranked.recommendations).filter((r) => r.plan === "include")
      .length,
    1,
  );
  frames[0].manualSplit = true;
  assert.equal(cluster(frames).length, 2);
  assert.equal(
    outputDecision(
      { decision: "keep", favorite: true },
      ranked.recommendations["frame-1"],
    ),
    "include",
  );
  const unrelated = g("different-scene", 10, "5500ff00ff00ff00");
  assert.equal(cluster([...frames, unrelated]).length, 3);
});

test("pinned pHash is stable for pixel replication and small JPEG-like quantization", () => {
  const make = (size, quantize = false) => {
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const value =
          (Math.floor((x * 64) / size) * 13 + Math.floor((y * 64) / size) * 7) %
          256;
        pixels[i] =
          pixels[i + 1] =
          pixels[i + 2] =
            quantize ? Math.round(value / 8) * 8 : value;
        pixels[i + 3] = 255;
      }
    return pixels;
  };
  const original = computePhashFromRgba(make(64), 64, 64);
  const resized = computePhashFromRgba(make(128), 128, 128);
  const quantized = computePhashFromRgba(make(64, true), 64, 64);
  assert.ok(distance(original, resized) <= 6);
  assert.ok(distance(original, quantized) <= 6);
});

test('resume validates saved relative paths and current inventory before binding handles',()=>{
 const plan=planFor(),record=plan.records[0];
 const groups=[{id:record.groupId,fingerprint:record.fingerprint,members:[{path:record.source,handle:record.handle}]}];
 assert.equal(resumePlan(publicManifest(plan),groups).records[0].handle,record.handle);
 assert.throws(()=>resumePlan(publicManifest(plan),[]),/来源清单已改变/);
 const bad=publicManifest(plan);bad.records[0].destination='../escape';assert.throws(()=>resumePlan(bad,groups),/路径无效/);
});
