import { expect, test } from "@playwright/test";

test("analysis cache isolates identical file signatures and same directory names, reuses handles, and versions results", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("./modules/browser-store.js");
    const root = await navigator.storage.getDirectory();
    const parentName = `cache-scope-${crypto.randomUUID()}`;
    const parent = await root.getDirectoryHandle(parentName, { create: true });
    const leftParent = await parent.getDirectoryHandle("left", { create: true });
    const rightParent = await parent.getDirectoryHandle("right", { create: true });
    const left = await leftParent.getDirectoryHandle("camera-import", { create: true });
    const right = await rightParent.getDirectoryHandle("camera-import", { create: true });
    const databaseName = `cache-scope-${crypto.randomUUID()}`;
    const file = { name: "ONE.JPG", size: 100, lastModified: 1 };
    const store = new BrowserReviewStore({ databaseName });
    const second = new BrowserReviewStore({ databaseName });
    try {
      const [leftScope, sameScope] = await Promise.all([
        store.analysisScope(left, { algorithmVersion: "v1" }),
        second.analysisScope(await leftParent.getDirectoryHandle("camera-import"), { algorithmVersion: "v1" }),
      ]);
      const rightScope = await store.analysisScope(right, { algorithmVersion: "v1" });
      await leftScope.saveAnalysis(file, { technicalScore: 10 });
      const isolation = await rightScope.loadAnalysis(file);
      const concurrentReuse = await sameScope.loadAnalysis(file);
      await rightScope.saveAnalysis(file, { technicalScore: 99 });
      const leftAfterRight = await leftScope.loadAnalysis(file);
      const rightAfterRight = await rightScope.loadAnalysis(file);
      const newAlgorithm = await store.analysisScope(left, { algorithmVersion: "v2" });
      const invalidated = await newAlgorithm.loadAnalysis(file);
      await newAlgorithm.saveAnalysis(file, { technicalScore: 20 });
      const oldAlgorithm = await leftScope.loadAnalysis(file);
      const unscoped = await store.loadAnalysis(file);
      await store.saveAnalysis(file, { technicalScore: -1 });
      const afterUnscopedWrite = await leftScope.loadAnalysis(file);
      await store.close();
      const reopened = new BrowserReviewStore({ databaseName });
      const reopenedScope = await reopened.analysisScope(await leftParent.getDirectoryHandle("camera-import"), { algorithmVersion: "v2" });
      const afterReopen = await reopenedScope.loadAnalysis(file);
      const database = await reopened.database;
      const identities = await new Promise((resolve, reject) => {
        const request = database.transaction("directory-identities").objectStore("directory-identities").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await reopened.close();
      return { isolation, concurrentReuse, leftAfterRight, rightAfterRight, invalidated, oldAlgorithm, unscoped, afterUnscopedWrite, afterReopen, identities };
    } finally {
      await store.close();
      await second.close();
      await root.removeEntry(parentName, { recursive: true });
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  });
  expect(result.isolation).toBeNull();
  expect(result.concurrentReuse).toEqual({ technicalScore: 10 });
  expect(result.leftAfterRight).toEqual({ technicalScore: 10 });
  expect(result.rightAfterRight).toEqual({ technicalScore: 99 });
  expect(result.invalidated).toBeNull();
  expect(result.oldAlgorithm).toEqual({ technicalScore: 10 });
  expect(result.unscoped).toBeNull();
  expect(result.afterUnscopedWrite).toEqual({ technicalScore: 10 });
  expect(result.afterReopen).toEqual({ technicalScore: 20 });
  expect(result.identities).toBe(2);
});

for (const version of [1, 2]) {
  test(`version-${version} cache migration discards unscoped scores and preserves directory and review state`, async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async (legacyVersion) => {
      const { BrowserReviewStore } = await import("./modules/browser-store.js");
      const root = await navigator.storage.getDirectory();
      const name = `legacy-cache-${crypto.randomUUID()}`;
      const source = await root.getDirectoryHandle(name, { create: true });
      const databaseName = `legacy-cache-${crypto.randomUUID()}`;
      const file = { name: "ONE.JPG", size: 100, lastModified: 1 };
      const review = { decisions: { "photo-group:ONE": "keep" }, filter: "keep", density: "comfortable" };
      const legacy = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, legacyVersion);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("workspace");
          const store = request.result.createObjectStore("analysis");
          if (legacyVersion === 2) store.createIndex("cached-at", "cachedAt");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = legacy.transaction(["workspace", "analysis"], "readwrite");
        transaction.objectStore("workspace").put({ directory: source, review }, "last-directory");
        const analysis = { technicalScore: 1, thumbnail: null };
        transaction.objectStore("analysis").put(legacyVersion === 1 ? analysis : { cacheVersion: 1, cachedAt: 1, analysis }, "ONE.JPG:100:1");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      legacy.close();
      const store = new BrowserReviewStore({ databaseName });
      try {
        const scope = await store.analysisScope(source);
        const cached = await scope.loadAnalysis(file);
        const savedReview = await store.load(source);
        const lastDirectory = await store.loadLastDirectory();
        const sameDirectory = await source.isSameEntry(lastDirectory);
        await scope.saveAnalysis(file, { technicalScore: 88 });
        const fresh = await scope.loadAnalysis(file);
        return { cached, savedReview, sameDirectory, fresh };
      } finally {
        await store.close();
        await root.removeEntry(name, { recursive: true });
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(databaseName);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
        });
      }
    }, version);
    expect(result.cached).toBeNull();
    expect(result.savedReview).toEqual({ decisions: { "photo-group:ONE": "keep" }, filter: "keep", density: "comfortable" });
    expect(result.sameDirectory).toBe(true);
    expect(result.fresh).toEqual({ technicalScore: 88 });
  });
}

test("directory registry removes missing handles and bounds orphan identities without losing cached results", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("./modules/browser-store.js");
    const root = await navigator.storage.getDirectory();
    const parentName = `cache-registry-${crypto.randomUUID()}`;
    const parent = await root.getDirectoryHandle(parentName, { create: true });
    const databaseName = `cache-registry-${crypto.randomUUID()}`;
    const store = new BrowserReviewStore({ databaseName, analysisCacheLimit: 2 });
    const file = { name: "ONE.JPG", size: 100, lastModified: 1 };
    try {
      const cachedDirectory = await parent.getDirectoryHandle("cached", { create: true });
      const cachedScope = await store.analysisScope(cachedDirectory);
      await cachedScope.saveAnalysis(file, { technicalScore: 55 });
      const stale = await parent.getDirectoryHandle("stale", { create: true });
      await store.analysisScope(stale);
      await parent.removeEntry("stale");
      // Real implementations may compare a deleted handle as false. Exercise
      // the explicit NotFoundError IPC path without changing user file APIs.
      const isSameEntry = FileSystemDirectoryHandle.prototype.isSameEntry;
      FileSystemDirectoryHandle.prototype.isSameEntry = function (other) {
        if (this.name === "stale") return Promise.reject(new DOMException("Removed directory", "NotFoundError"));
        return isSameEntry.call(this, other);
      };
      try {
        for (let index = 0; index < 40; index++) {
          const directory = await parent.getDirectoryHandle(`empty-${index}`, { create: true });
          await store.analysisScope(directory);
        }
      } finally {
        FileSystemDirectoryHandle.prototype.isSameEntry = isSameEntry;
      }
      const database = await store.database;
      const identities = await new Promise((resolve, reject) => {
        const request = database.transaction("directory-identities").objectStore("directory-identities").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const reopened = new BrowserReviewStore({ databaseName, analysisCacheLimit: 2 });
      const scope = await reopened.analysisScope(await parent.getDirectoryHandle("cached"));
      const cached = await scope.loadAnalysis(file);
      await reopened.close();
      return { count: identities.length, names: identities.map(({ directory }) => directory.name), cached };
    } finally {
      await store.close();
      await root.removeEntry(parentName, { recursive: true });
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  });
  expect(result.count).toBeLessThanOrEqual(34);
  expect(result.names).not.toContain("stale");
  expect(result.cached).toEqual({ technicalScore: 55 });
});
