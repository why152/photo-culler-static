import { expect, test } from "@playwright/test";

test("experimental GPU scorer has an explicit CPU fallback and rejects malformed pixels", async ({ page }) => {
  await page.goto("/legacy.html");
  const result = await page.evaluate(async () => {
    const { ExperimentalGpuScorer } = await import("/modules/photo-analysis-gpu.js");
    const { scorePixels } = await import("/modules/photo-analysis-worker.js");
    const scorer = new ExperimentalGpuScorer({ gpu: null });
    const pixels = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    const actual = await scorer.scorePixelsOrCpu(pixels, 16, 16);
    let invalid = false;
    try { await scorer.scorePixelsOrCpu(new Uint8Array(3), 2, 2); }
    catch { invalid = true; }
    let invalidDimensions = false;
    try { await scorer.scorePixelsOrCpu(new Uint8Array(0), 0, 0); }
    catch { invalidDimensions = true; }
    scorer.close();
    return { actual, expected: scorePixels(pixels, 16, 16), invalid, invalidDimensions };
  });
  expect(result.actual.backend).toBe("cpu-fallback");
  expect(result.actual.result).toEqual(result.expected);
  expect(result.invalid).toBe(true);
  expect(result.invalidDimensions).toBe(true);
});

test("integer WebGPU reduction matches CPU technical scores across regions and rounding boundaries", async ({ page }) => {
  await page.goto("/legacy.html");
  const result = await page.evaluate(async () => {
    const { ExperimentalGpuScorer } = await import("/modules/photo-analysis-gpu.js");
    const { scorePixels } = await import("/modules/photo-analysis-worker.js");
    const scorer = new ExperimentalGpuScorer();
    const info = await scorer.initialize();
    if (!info.available) return { info, cases: [] };
    const cases = [];
    let state = 7;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 24; };
    const dimensions = [[1, 1], [2, 4], [3, 3], [4, 5], [5, 7], [257, 193], [1600, 1000]];
    for (const [width, height] of dimensions) {
      for (const mode of ["black", "white", "noise", "smooth", "half", "bright-half"]) {
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let index = 0; index < width * height; index += 1) {
          const offset = index * 4;
          const value = mode === "black" ? 0 : mode === "white" ? 255 : mode === "smooth" ? 128 + (random() > 120 ? 1 : 0) : random();
          pixels[offset] = mode === "half" ? index % 256 : value;
          pixels[offset + 1] = mode === "half" ? Math.floor(index / 256) % 256 : value;
          pixels[offset + 2] = mode === "half" ? (index * 193) % 256 : value;
          // 299*250+587*252+114*209 == 246500, but the original JS
          // binary64 expression rounds down to 246, below the bright cutoff.
          if (mode === "bright-half") pixels.set([250, 252, 209], offset);
          pixels[offset + 3] = 255;
        }
        const actual = await scorer.scorePixels(pixels, width, height);
        cases.push({ dimensions: [width, height], mode, expected: scorePixels(pixels, width, height), actual: actual.result,
          readbackBytes: actual.readbackBytes });
      }
    }
    scorer.close();
    return { info, cases };
  });
  test.info().annotations.push({ type: "WebGPU adapter", description: JSON.stringify(result.info) });
  test.skip(result.info.adapterKind === "unavailable", result.info.reason ?? "No WebGPU adapter");
  expect(result.info.available, result.info.reason).toBe(true);
  expect(result.cases).toHaveLength(42);
  for (const entry of result.cases) {
    expect(entry.actual, JSON.stringify({ dimensions: entry.dimensions, mode: entry.mode })).toEqual(entry.expected);
    expect(entry.readbackBytes).toBe(168);
  }
});

test("GPU external Canvas upload preserves transparent pixel semantics and device loss falls back", async ({ page }) => {
  await page.goto("/legacy.html");
  const result = await page.evaluate(async () => {
    const { ExperimentalGpuScorer } = await import("/modules/photo-analysis-gpu.js");
    const { scorePixels } = await import("/modules/photo-analysis-worker.js");
    const scorer = new ExperimentalGpuScorer();
    const info = await scorer.initialize();
    if (!info.available) return { info };
    const canvas = new OffscreenCanvas(31, 17);
    const context = canvas.getContext("2d", { colorSpace: "srgb" });
    context.fillStyle = "rgba(230,120,80,0.4)";
    context.fillRect(0, 0, 31, 17);
    context.clearRect(0, 0, 8, 8);
    const pixels = context.getImageData(0, 0, 31, 17).data;
    const expected = scorePixels(pixels, 31, 17);
    const actual = (await scorer.scoreSource(canvas)).result;
    let invalidSource = false;
    try { await scorer.scoreSource({}, 31, 17); } catch { invalidSource = true; }
    scorer.device.destroy();
    await scorer.device.lost;
    const fallback = await scorer.scorePixelsOrCpu(pixels, 31, 17);
    scorer.close();
    return { info, expected, actual, invalidSource, fallback };
  });
  test.skip(result.info.adapterKind === "unavailable", result.info.reason ?? "No WebGPU adapter");
  expect(result.info.available, result.info.reason).toBe(true);
  expect(result.actual).toEqual(result.expected);
  expect(result.invalidSource).toBe(true);
  expect(result.fallback.backend).toBe("cpu-fallback");
  expect(result.fallback.result).toEqual(result.expected);
});
