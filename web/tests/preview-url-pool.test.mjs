import assert from "node:assert/strict";
import test from "node:test";
import { PreviewUrlPool } from "../modules/preview-url-pool.js";

function poolHarness() {
  const created = [];
  const revoked = [];
  const pool = new PreviewUrlPool({
    create: (blob) => { const url = `blob:${created.length}`; created.push({ blob, url }); return url; },
    revoke: (url) => revoked.push(url),
  });
  return { pool, created, revoked };
}

test("preview URLs are reused for the same group/blob and replaced when analysis changes", () => {
  const { pool, created, revoked } = poolHarness();
  const first = new Blob(["first"]);
  const replacement = new Blob(["replacement"]);
  assert.equal(pool.urlFor("a", first), "blob:0");
  assert.equal(pool.urlFor("a", first), "blob:0");
  assert.equal(created.length, 1);
  assert.equal(pool.urlFor("a", replacement), "blob:1");
  assert.deepEqual(revoked, ["blob:0"]);
  assert.equal(pool.matches("a", replacement), true);
  assert.equal(pool.urlFor("a", null), null);
  assert.deepEqual(revoked, ["blob:0", "blob:1"]);
});

test("filtering releases removed group URLs and clearing revokes each remaining URL exactly once", () => {
  const { pool, revoked } = poolHarness();
  const blob = new Blob(["thumbnail"]);
  pool.urlFor("a", blob);
  pool.urlFor("b", blob);
  pool.urlFor("c", blob);
  pool.retain(["b"]);
  assert.deepEqual(revoked, ["blob:0", "blob:2"]);
  assert.equal(pool.urlFor("b", blob), "blob:1");
  pool.clear();
  pool.clear();
  assert.deepEqual(revoked, ["blob:0", "blob:2", "blob:1"]);
});

test("grid and filmstrip URL ownership remains independent for a shared thumbnail blob", () => {
  const grid = poolHarness();
  const filmstrip = poolHarness();
  const blob = new Blob(["shared thumbnail"]);
  grid.pool.urlFor("a", blob);
  filmstrip.pool.urlFor("a", blob);
  grid.pool.clear();
  assert.equal(filmstrip.revoked.length, 0);
  assert.equal(filmstrip.pool.matches("a", blob), true);
});
