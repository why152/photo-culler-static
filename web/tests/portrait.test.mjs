import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eyeAspectRatio,
  faceGeometry,
  portraitPreference,
  PORTRAIT_VERSION,
} from "../modules/portrait-evidence.js";
import { cluster } from "../modules/cull-similarity.js";
import { rank } from "../modules/cull-ranking.js";
function frame(
  id,
  time = 0,
  hash = "0000000000000000",
  eyesOpen = 1,
  sharpness = 0.4,
) {
  return {
    id,
    path: id,
    hash,
    metadata: { capturedAt: time },
    source: { path: id + ".jpg" },
    analysis: {
      exposureScore: 90,
      technicalScore: 85,
      sharpness: 80,
      sourceDimensions: { width: 1200, height: 800 },
      focus: { isBlurry: false, normalizedSharpness: 80 },
      portrait: {
        version: PORTRAIT_VERSION,
        status: "ready",
        faces: [
          {
            usable: true,
            hash: "0000000000000000",
            area: 0.1,
            box: { x: 0.3, y: 0.2, width: 0.3, height: 0.4 },
            eyesOpen,
            sharpness,
          },
        ],
      },
    },
    members: [],
  };
}
test("EAR detects small/invalid evidence and compares real eye geometry without forcing a blink", () => {
  const p = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 5, y: 3 },
    { x: 15, y: 3 },
    { x: 5, y: -3 },
    { x: 15, y: -3 },
  ];
  assert.equal(eyeAspectRatio(p, [0, 1, 2, 3, 4, 5]), 0.3);
  assert.equal(
    eyeAspectRatio(
      p.map((v) => ({ x: v.x / 10, y: v.y / 10 })),
      [0, 1, 2, 3, 4, 5],
    ),
    null,
  );
  assert.equal(faceGeometry([]).eyesOpen, null);
});
test("portrait preference breaks close focus ties with open eyes but preserves a substantial focus advantage and unknowns", () => {
  const closed = frame("closed", 0, undefined, 0, 0.4),
    open = frame("open", 0, undefined, 1, 0.39),
    blurred = frame("blurred", 0, undefined, 1, 0.1);
  assert.ok(portraitPreference(open, closed) < 0);
  assert.ok(portraitPreference(closed, blurred) < 0);
  open.analysis.portrait.faces[0].eyesOpen = null;
  closed.analysis.portrait.faces[0].eyesOpen = null;
  assert.ok(portraitPreference(open, closed) > 0);
  open.analysis.portrait.status = "unavailable";
  assert.equal(portraitPreference(open, closed), 0);
});
test("optional portrait groups span short same-scene sequences without transitive chains, identity-hash or manual-split merges", () => {
  const a = frame("a", 0),
    b = frame("b", 8000),
    c = frame("c", 16000);
  assert.equal(cluster([a, b, c]).length, 3);
  assert.deepEqual(
    cluster([a, b, c], { portrait: true }).map((b) => b.length),
    [2, 1],
  );
  b.analysis.portrait.faces[0].hash = "ffffffffffffffff";
  assert.equal(cluster([a, b], { portrait: true }).length, 2);
  b.analysis.portrait.faces[0].hash = a.hash;
  b.manualSplit = true;
  assert.equal(cluster([a, b], { portrait: true }).length, 2);
  b.manualSplit = false;
  b.protected = true;
  assert.equal(cluster([a, b], { portrait: true }).length, 2);
});
test("portrait keeper budget and ranking never suppress protected frames or special sequences and leave baseline off behavior intact", () => {
  const frames = [
    frame("closed", 0, undefined, 0),
    frame("open", 1000, undefined, 1),
    frame("other", 2000, undefined, 0.8),
  ];
  const base = rank(frames, { strength: "compact" });
  assert.equal(
    Object.values(base.recommendations).filter((r) => r.plan === "include")
      .length,
    1,
  );
  const enhanced = rank(frames, {
    portrait: true,
    portraitKeep: 2,
    strength: "compact",
  });
  assert.equal(
    Object.values(enhanced.recommendations).filter((r) => r.plan === "include")
      .length,
    2,
  );
  assert.equal(enhanced.recommendations.open.rank, 1);
  frames[2].protected = true;
  assert.equal(
    rank(frames, { portrait: true }).recommendations.other.plan,
    "protected",
  );
  frames[0].metadata.ExposureBiasValue = -1;
  frames[1].metadata.ExposureBiasValue = 1;
  const bracket = rank(frames, { portrait: true });
  assert.equal(bracket.recommendations.closed.plan, "protected");
});

test("self-hosted portrait assets match pinned SHA and bounded size with explicit model licenses", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const root = new URL("../public/models/portrait-v1/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("ASSETS.json", root)));
  assert.equal(manifest.license, "Apache-2.0");
  let total = 0;
  for (const f of manifest.files) {
    const b = await readFile(new URL(f.path, root));
    assert.equal(b.length, f.bytes);
    assert.equal(createHash("sha256").update(b).digest("hex"), f.sha256);
    total += b.length;
  }
  assert.ok(total < 4 * 1024 * 1024);
  assert.equal(manifest.files.length, 7);
});

test("profile pose makes eye state unknown instead of misclassifying a blink", () => {
  const p = Array.from({ length: 468 }, () => ({ x: 20, y: 20 }));
  Object.assign(p, {
    33: { x: 0, y: 0 },
    133: { x: 18, y: 0 },
    263: { x: 40, y: 0 },
    362: { x: 22, y: 0 },
    1: { x: 20, y: 27.5 },
    61: { x: 10, y: 50 },
    291: { x: 30, y: 50 },
    160: { x: 5, y: -3 },
    158: { x: 14, y: -3 },
    144: { x: 5, y: 3 },
    153: { x: 14, y: 3 },
    385: { x: 26, y: -3 },
    387: { x: 35, y: -3 },
    380: { x: 26, y: 3 },
    373: { x: 35, y: 3 },
  });
  assert.equal(faceGeometry(p).eyesOpen, 1);
  p[1].x = 50;
  assert.equal(faceGeometry(p).eyesOpen, null);
});
test("upstream reciprocal ORB confirmation rejects unrelated features and one-to-many descriptor matches", async () => {
  const { orbAgreement } = await import("../modules/orb-match.js");
  const descriptors = Uint8Array.from(
    { length: 16 * 32 },
    (_, k) => (k * 13 + Math.floor(k / 32) * 61) % 256,
  );
  const a = { count: 16, descriptors };
  assert.equal(
    orbAgreement(a, { count: 16, descriptors: descriptors.slice() }),
    1,
  );
  assert.equal(
    orbAgreement(a, {
      count: 16,
      descriptors: descriptors.map((x) => x ^ 255),
    }),
    0,
  );
  assert.equal(
    orbAgreement(
      { count: 16, descriptors: new Uint8Array(512) },
      { count: 16, descriptors: new Uint8Array(512) },
    ),
    1 / 16,
  );
  assert.equal(orbAgreement(null, a), 0);
});

test("disabled or unavailable portrait evidence reproduces frozen beta4 recommendations apart from version", async () => {
  const { rank: baseline } =
    await import("../../scripts/baselines/cull-ranking-beta4.mjs");
  const frames = [
    frame("a", 0),
    frame("b", 500),
    frame("c", 1000),
    frame("other", 9000),
  ];
  for (const g of frames)
    g.analysis.portrait = {
      version: PORTRAIT_VERSION,
      status: "unavailable",
      faces: [],
    };
  const normalize = (r) =>
    Object.fromEntries(
      Object.entries(r.recommendations).map(([id, p]) => [
        id,
        { ...p, algorithmVersion: "normalized" },
      ]),
    );
  assert.deepEqual(
    normalize(rank(frames, { portrait: true, strength: "compact" })),
    normalize(baseline(frames, { strength: "compact" })),
  );
});

test("resized distinct captures remain a burst only with complete-link scene evidence; edit copies stay protected", () => {
  const orb = () => ({
    count: 16,
    descriptors: Uint8Array.from(
      { length: 512 },
      (_, i) => (i * 37 + Math.floor(i / 32) * 71) % 256,
    ),
  });
  const a = frame("a", 1000),
    b = frame("b", 1500),
    c = frame("c", 2000);
  for (const g of [a, b, c]) g.analysis.portrait.orb = orb();
  b.analysis.sourceDimensions = { width: 900, height: 600 };
  let result = rank([a, b, c], {
    portrait: true,
    mode: "burst",
    strength: "compact",
    portraitKeep: 1,
  });
  assert.equal(result.recommendations.a.similarityKind, "burst");
  assert.equal(
    Object.values(result.recommendations).filter((r) => r.plan === "include")
      .length,
    1,
  );
  b.metadata.capturedAt = a.metadata.capturedAt;
  result = rank([a, b, c], { portrait: true, mode: "burst" });
  assert.equal(result.recommendations.a.similarityKind, "same-image-version");
  assert.ok(
    Object.values(result.recommendations).every((r) => r.plan === "protected"),
  );
  b.metadata.capturedAt = 1500;
  b.analysis.portrait.orb = null;
  result = rank([a, b], { portrait: true, mode: "burst" });
  assert.equal(result.recommendations.a.similarityKind, "same-image-version");
});

test("very close captures tolerate face-hash jitter only when full-frame ORB and geometry strongly agree", () => {
  const makeOrb = () => ({
    count: 16,
    descriptors: Uint8Array.from(
      { length: 512 },
      (_, i) => (i * 37 + Math.floor(i / 32) * 71) % 256,
    ),
  });
  const a = frame("a", 1000),
    b = frame("b", 1500, "00000000000000ff");
  a.analysis.portrait.orb = makeOrb();
  b.analysis.portrait.orb = makeOrb();
  b.analysis.portrait.faces[0].hash = "000000000fffffff";
  assert.equal(cluster([a, b], { portrait: true }).length, 1);
  b.metadata.capturedAt = 5000;
  assert.equal(cluster([a, b], { portrait: true }).length, 2);
  b.metadata.capturedAt = 1500;
  b.analysis.portrait.orb = null;
  assert.equal(cluster([a, b], { portrait: true }).length, 2);
  b.analysis.portrait.orb = makeOrb();
  b.analysis.portrait.faces[0].box.x = 0.65;
  assert.equal(cluster([a, b], { portrait: true }).length, 2);
});

test("fluctuating detector counts can form a strong scene stack, but uncertain alternatives are not suppressed", () => {
  const makeOrb = () => ({
    count: 16,
    descriptors: Uint8Array.from(
      { length: 512 },
      (_, i) => (i * 37 + Math.floor(i / 32) * 71) % 256,
    ),
  });
  const a = frame("a", 1000),
    b = frame("b", 1500, "00000000000000ff");
  a.analysis.portrait.orb = makeOrb();
  b.analysis.portrait.orb = makeOrb();
  b.analysis.portrait.faces.push(structuredClone(b.analysis.portrait.faces[0]));
  const r = rank([a, b], {
    portrait: true,
    mode: "burst",
    strength: "compact",
  });
  assert.equal(r.batches.length, 1);
  assert.equal(
    Object.values(r.recommendations).filter((x) => x.plan === "include").length,
    1,
  );
  assert.equal(
    Object.values(r.recommendations).filter((x) => x.plan === "protected")
      .length,
    1,
  );
  assert.equal(
    Object.values(r.recommendations).filter((x) => x.plan === "suppress")
      .length,
    0,
  );
  for (const f of b.analysis.portrait.faces) f.hash = "ffffffffffffffff";
  assert.equal(cluster([a, b], { portrait: true }).length, 2);
});
