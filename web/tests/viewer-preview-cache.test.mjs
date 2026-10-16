import assert from "node:assert/strict";
import test from "node:test";
import { ViewerPreviewCache } from "../modules/viewer-preview-cache.js";

function fixture({ dimensions = async () => ({ width: 1000, height: 1000 }) } = {}) {
  const created = [];
  const revoked = [];
  const images = [];
  const cache = new ViewerPreviewCache({
    imageFactory: () => {
      const image = { naturalWidth: 1000, naturalHeight: 600, removeAttribute() {} };
      images.push(image);
      return image;
    },
    create: (file) => { const url = `blob:${file.name}:${created.length}`; created.push(url); return url; },
    revoke: (url) => revoked.push(url), dimensions,
  });
  const group = (id) => ({ id, analysisFile: { name: `${id}.JPG` } });
  return { cache, created, revoked, images, group };
}

test("viewer reuses decoded neighbors and releases URLs outside its three-entry window", async () => {
  const { cache, created, revoked, images, group } = fixture();
  const groups = [group("one"), group("two"), group("three"), group("four")];
  cache.retain(groups.slice(0, 3));
  const first = cache.load(groups[0]);
  images[0].onload();
  assert.deepEqual(await first, { url: created[0], width: 1000, height: 600 });
  assert.equal(cache.load(groups[0]), first);
  const second = cache.load(groups[1]);
  const third = cache.load(groups[2]);
  images[1].onload(); images[2].onload();
  await Promise.all([second, third]);
  cache.retain(groups.slice(1));
  assert.deepEqual(revoked, [created[0]]);
  const fourth = cache.load(groups[3]); images[3].onload(); await fourth;
  assert.equal(cache.entries.size, 3);
  cache.clear();
  assert.equal(cache.entries.size, 0);
  assert.equal(revoked.length, 4);
});

test("large or unknown neighbors are not decoded speculatively", async () => {
  for (const dimensions of [null, { width: 6000, height: 4000 }]) {
    const { cache, created, group } = fixture({ dimensions: async () => dimensions });
    const neighbor = group("neighbor");
    cache.retain([neighbor]);
    await cache.warm(neighbor);
    assert.deepEqual(created, []);
  }
});

test("metadata completing after navigation cannot start stale neighbor decodes", async () => {
  let finish;
  const { cache, created, group } = fixture({ dimensions: () => new Promise((resolve) => { finish = resolve; }) });
  const old = group("old");
  cache.retain([old]);
  const warming = cache.warm(old);
  cache.retain([group("new")]);
  finish({ width: 1000, height: 1000 });
  await warming;
  assert.deepEqual(created, []);
});

test("closing a pending preview settles cancellation and revokes its URL", async () => {
  const { cache, revoked, group } = fixture();
  const current = group("current");
  cache.retain([current]);
  const pending = cache.load(current);
  cache.clear();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(revoked.length, 1);
});

test("speculative metadata failures leave review and preload resources untouched", async () => {
  const { cache, created, group } = fixture({ dimensions: async () => { throw new Error("Permission revoked"); } });
  const neighbor = group("neighbor");
  cache.retain([neighbor]);
  await cache.warm(neighbor);
  assert.deepEqual(created, []);
  assert.equal(cache.entries.size, 0);
});

test("failed full preview releases its URL and can be retried", async () => {
  const { cache, revoked, images, group } = fixture();
  const current = group("current");
  cache.retain([current]);
  const failed = cache.load(current);
  images[0].onerror();
  await assert.rejects(failed, /无法加载/);
  assert.equal(cache.entries.size, 0);
  assert.equal(revoked.length, 1);
  const retry = cache.load(current);
  images[1].onload();
  await retry;
  assert.equal(cache.entries.size, 1);
});
