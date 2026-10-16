import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("opt-in synthetic camera-size analysis benchmark", async ({ page }) => {
  test.skip(!process.env.PHOTO_CULLER_BENCHMARK, "Opt-in generated-fixture benchmark");
  test.setTimeout(180_000);
  await page.goto("/");
  const report = await page.evaluate(async () => {
    const { BrowserPhotoAnalyzer } = await import("/modules/photo-analysis.js");
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(`synthetic-benchmark-${crypto.randomUUID()}`, { create: true });
    const store = new BrowserReviewStore();
    const cache = store.analysisScope ? await store.analysisScope(directory) : store;
    const diagnostics = [];
    const analyzer = new BrowserPhotoAnalyzer({ cache, onDiagnostics: (record) => diagnostics.push(record) });
    const tile = new OffscreenCanvas(256, 256);
    const tileContext = tile.getContext("2d");
    const tilePixels = tileContext.createImageData(256, 256);
    let seed = 42;
    for (let index = 0; index < tilePixels.data.length; index += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      tilePixels.data[index] = seed & 255;
      tilePixels.data[index + 1] = (seed >>> 8) & 255;
      tilePixels.data[index + 2] = (seed >>> 16) & 255;
      tilePixels.data[index + 3] = 255;
    }
    tileContext.putImageData(tilePixels, 0, 0);
    const fixtures = [
      { label: "24MP-landscape-jpeg", width: 6000, height: 4000, type: "image/jpeg" },
      { label: "24MP-portrait-jpeg", width: 4000, height: 6000, type: "image/jpeg" },
      { label: "24MP-landscape-png", width: 6000, height: 4000, type: "image/png" },
      { label: "24MP-portrait-webp", width: 4000, height: 6000, type: "image/webp" },
    ];
    const results = [];
    try {
      for (const fixture of fixtures) {
        const canvas = new OffscreenCanvas(fixture.width, fixture.height);
        const context = canvas.getContext("2d");
        context.fillStyle = context.createPattern(tile, "repeat");
        context.fillRect(0, 0, fixture.width, fixture.height);
        const encoded = await canvas.convertToBlob({ type: fixture.type, quality: 0.92 });
        const file = new File([encoded], `${fixture.label}.${fixture.type.split("/")[1]}`, { type: fixture.type, lastModified: 1 });
        canvas.width = 1; canvas.height = 1;
        const runs = [];
        for (const cacheState of ["cold", "warm"]) {
          const started = performance.now();
          let firstResult = null;
          let firstPreview = null;
          const [group] = await analyzer.analyze([{ id: "synthetic", analysisFile: file }], {
            onResult: () => { firstResult = performance.now() - started; },
            onPreview: () => { firstPreview ??= performance.now() - started; },
          });
          runs.push({ cacheState, firstPreview, firstResult, elapsed: performance.now() - started,
            diagnostic: diagnostics.at(-1), scores: {
              status: group.analysis.status, sharpness: group.analysis.sharpness,
              exposureScore: group.analysis.exposureScore, technicalScore: group.analysis.technicalScore,
            } });
        }
        results.push({ ...fixture, bytes: file.size, runs });
      }
    } finally {
      analyzer.close(); await store.close();
      await root.removeEntry(directory.name, { recursive: true });
    }
    return { generatedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      fixtures: results, note: "Generated repeating noise; cache and worker timings are end-to-end. Native resize includes decoder internal work. No user photos." };
  });
  for (const fixture of report.fixtures) {
    expect(fixture.runs[0].diagnostic.cacheHit).toBe(false);
    expect(fixture.runs[1].diagnostic.cacheHit).toBe(true);
  }
  await writeFile(process.env.PHOTO_CULLER_BENCHMARK_OUTPUT || "/tmp/photo-culler-analysis-benchmark.json", `${JSON.stringify(report, null, 2)}\n`);
});
