import { expect, test } from "@playwright/test";

test("over-capacity reopens preserve resident analysis hits with bounded cache admission", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const { BrowserPhotoAnalyzer } = await import("/modules/photo-analysis.js");
    const root = await navigator.storage.getDirectory();
    const parentName = `cache-admission-${crypto.randomUUID()}`;
    const parent = await root.getDirectoryHandle(parentName, { create: true });
    const directory = await parent.getDirectoryHandle("source", { create: true });
    const otherDirectory = await parent.getDirectoryHandle("other", { create: true });
    const databaseName = `cache-admission-${crypto.randomUUID()}`;
    const store = new BrowserReviewStore({ databaseName, analysisCacheLimit: 3 });
    const diagnostics = [];
    const analyzer = new BrowserPhotoAnalyzer({ cache: store, cacheWriteConcurrency: 1,
      onDiagnostics: (record) => diagnostics.push(record) });
    try {
      const canvas = new OffscreenCanvas(32, 24);
      canvas.getContext("2d").fillRect(0, 0, 32, 24);
      const jpeg = await canvas.convertToBlob({ type: "image/jpeg" });
      const groups = [];
      for (let index = 0; index < 5; index++) {
        const handle = await directory.getFileHandle(`P${index}.JPG`, { create: true });
        const writer = await handle.createWritable();
        await writer.write(jpeg);
        await writer.close();
        groups.push({ id: `photo-group:P${index}`, analysisFile: await handle.getFile() });
      }
      // Populate the same resident tail that a larger-than-capacity cold scan leaves.
      await analyzer.analyze(groups.slice(-3), { directory });
      const scope = await store.analysisScope(directory);
      const files = groups.map(({ analysisFile }) => analysisFile);
      const resident = [...(await scope.cachedFiles(files)).files].map(({ name }) => name);
      const reopenedScope = await store.analysisScope(await parent.getDirectoryHandle("source"));
      const reopenedResident = [...(await reopenedScope.cachedFiles(files)).files].map(({ name }) => name);
      const otherScope = await store.analysisScope(otherDirectory);
      const versionScope = await store.analysisScope(directory, { algorithmVersion: "different-version" });
      const foreignCount = (await otherScope.cachedFiles(files)).files.size;
      const versionCount = (await versionScope.cachedFiles(files)).files.size;
      const changedFiles = files.slice(-3).map((file) => ({
        name: file.name, size: file.size, lastModified: file.lastModified + 1,
      }));
      const changedCount = (await scope.cachedFiles(changedFiles)).files.size;
      const legacyDiagnostics = [];
      const legacyAnalyzer = new BrowserPhotoAnalyzer({ cacheWriteConcurrency: 1,
        onDiagnostics: (record) => legacyDiagnostics.push(record),
        cache: { analysisScope: async (handle) => {
          const legacyScope = await store.analysisScope(handle);
          // Reproduce the previous admission policy without changing storage,
          // analysis, cache capacity or the order of this same photo group set.
          return { loadAnalysis: legacyScope.loadAnalysis, saveAnalysis: legacyScope.saveAnalysis };
        } },
      });
      try { await legacyAnalyzer.analyze(groups, { directory }); }
      finally { legacyAnalyzer.close(); }
      const baseline = {
        hits: legacyDiagnostics.filter(({ cacheHit }) => cacheHit).length,
        misses: legacyDiagnostics.filter(({ cacheHit }) => !cacheHit).length,
      };
      const rounds = [];
      for (let index = 0; index < 3; index++) {
        diagnostics.length = 0;
        const results = await analyzer.analyze(groups, { directory });
        rounds.push({ hits: diagnostics.filter(({ cacheHit }) => cacheHit).length,
          misses: diagnostics.filter(({ cacheHit }) => !cacheHit).length,
          ids: results.map(({ id }) => id),
          thumbnails: results.every(({ analysis }) => analysis.thumbnail instanceof Blob && analysis.thumbnail.size > 0) });
      }
      // Admission protection is run-local: a different directory can fill the cache.
      diagnostics.length = 0;
      await analyzer.analyze(groups.slice(0, 2), { directory: otherDirectory });
      const otherHits = (await otherScope.cachedFiles(files)).files.size;
      const database = await store.database;
      const count = await new Promise((resolve, reject) => {
        const request = database.transaction("analysis").objectStore("analysis").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return { resident, reopenedResident, foreignCount, versionCount, changedCount, baseline, rounds, otherHits, count };
    } finally {
      analyzer.close();
      await store.close();
      await root.removeEntry(parentName, { recursive: true });
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  });
  expect(result.resident).toEqual(["P2.JPG", "P3.JPG", "P4.JPG"]);
  expect(result.reopenedResident).toEqual(result.resident);
  expect(result.foreignCount).toBe(0);
  expect(result.versionCount).toBe(0);
  expect(result.changedCount).toBe(0);
  expect(result.baseline).toEqual({ hits: 0, misses: 5 });
  expect(result.rounds).toEqual(Array.from({ length: 3 }, () => ({
    hits: 3, misses: 2,
    ids: ["photo-group:P0", "photo-group:P1", "photo-group:P2", "photo-group:P3", "photo-group:P4"],
    thumbnails: true,
  })));
  expect(result.otherHits).toBe(2);
  expect(result.count).toBe(3);
});

test("early new analysis sources consume global free capacity without evicting future hits", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const { BrowserPhotoAnalyzer } = await import("/modules/photo-analysis.js");
    const root = await navigator.storage.getDirectory();
    const parentName = `cache-free-capacity-${crypto.randomUUID()}`;
    const parent = await root.getDirectoryHandle(parentName, { create: true });
    const directory = await parent.getDirectoryHandle("source", { create: true });
    const otherDirectory = await parent.getDirectoryHandle("other", { create: true });
    try {
      const canvas = new OffscreenCanvas(32, 24);
      canvas.getContext("2d").fillRect(0, 0, 32, 24);
      const jpeg = await canvas.convertToBlob({ type: "image/jpeg" });
      const createGroup = async (directory, name) => {
        const handle = await directory.getFileHandle(`${name}.JPG`, { create: true });
        const writer = await handle.createWritable();
        await writer.write(jpeg);
        await writer.close();
        return { id: `photo-group:${name}`, analysisFile: await handle.getFile() };
      };
      const groups = [];
      for (const name of ["A-new", "B-new", "C-existing"]) groups.push(await createGroup(directory, name));
      const foreign = await createGroup(otherDirectory, "foreign");
      const cases = [];
      for (const capacity of [4, 3]) {
        const databaseName = `cache-free-capacity-${crypto.randomUUID()}`;
        const store = new BrowserReviewStore({ databaseName, analysisCacheLimit: capacity });
        const diagnostics = [];
        const analyzer = new BrowserPhotoAnalyzer({ cache: store, cacheWriteConcurrency: 1,
          onDiagnostics: (record) => diagnostics.push(record) });
        try {
          // The protected source is oldest, so an incorrectly overestimated
          // budget would evict it before its turn in the first scan below.
          await analyzer.analyze([groups[2]], { directory });
          await analyzer.analyze([foreign], { directory: otherDirectory });
          const scope = await store.analysisScope(directory);
          const files = groups.map(({ analysisFile }) => analysisFile);
          const initial = await scope.cachedFiles(files);
          const rounds = [];
          for (let round = 0; round < 2; round++) {
            diagnostics.length = 0;
            await analyzer.analyze(groups, { directory });
            rounds.push({ hits: diagnostics.filter(({ cacheHit }) => cacheHit).length,
              misses: diagnostics.filter(({ cacheHit }) => !cacheHit).length });
          }
          cases.push({ capacity, availableSlots: initial.availableSlots, rounds,
            resident: [...(await scope.cachedFiles(files)).files].map(({ name }) => name),
            foreignRetained: Boolean(await (await store.analysisScope(otherDirectory)).loadAnalysis(foreign.analysisFile)),
          });
        } finally {
          analyzer.close();
          await store.close();
          await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(databaseName);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
          });
        }
      }
      return cases;
    } finally { await root.removeEntry(parentName, { recursive: true }); }
  });
  expect(result).toEqual([
    { capacity: 4, availableSlots: 2,
      rounds: [{ hits: 1, misses: 2 }, { hits: 3, misses: 0 }],
      resident: ["A-new.JPG", "B-new.JPG", "C-existing.JPG"], foreignRetained: true },
    { capacity: 3, availableSlots: 1,
      rounds: [{ hits: 1, misses: 2 }, { hits: 2, misses: 1 }],
      resident: ["A-new.JPG", "C-existing.JPG"], foreignRetained: true },
  ]);
});
