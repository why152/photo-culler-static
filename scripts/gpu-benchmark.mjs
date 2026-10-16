// Run sequentially after browser tests: node scripts/gpu-benchmark.mjs [output.json]
// Uses stock installed Chrome, never enables software adapters or GPU flags.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const origin = "http://127.0.0.1:4173";
const output = process.argv[2];
let server;
let browser;
async function ready() {
  try { return (await fetch(`${origin}/modules/photo-analysis-gpu.js`)).ok; }
  catch { return false; }
}
try {
  if (!await ready()) {
    server = spawn(process.execPath, ["scripts/static-test-server.mjs"], { stdio: "ignore" });
    for (let attempt = 0; attempt < 50 && !await ready(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!await ready()) throw new Error("Static test server unavailable");
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto(origin);
  const report = await page.evaluate(async () => {
    const { ExperimentalGpuScorer } = await import("/modules/photo-analysis-gpu.js");
    const { scorePixels, decodeBitmap } = await import("/modules/photo-analysis-worker.js");
    const { dimensionsWithin } = await import("/modules/image-dimensions.js");
    const { AnalysisTiming } = await import("/modules/analysis-timing.js");
    const scorer = new ExperimentalGpuScorer();
    const info = await scorer.initialize();
    const report = { userAgent: navigator.userAgent, adapter: info, corpus: "generated pixels and generated 24MP files",
      interpretation: "Scoring-only speed excludes directory scans, source decoding, thumbnail encoding, persistence and UI. End-to-end rows include shared decode/resize and thumbnail work, but exclude source file reads and cache.",
      scoring: [], pipelines: [] };
    const median = (samples) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    const summarize = (samples) => ({ medianMs: median(samples), samplesMs: samples });
    const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    let seed = 29;
    const fill = (width, height) => {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < pixels.length; index += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels[index] = seed & 255;
        pixels[index + 1] = (seed >>> 8) & 255;
        pixels[index + 2] = (seed >>> 16) & 255;
        pixels[index + 3] = 255;
      }
      return pixels;
    };
    for (const [width, height] of [[420, 280], [1600, 1067], [1067, 1600], [1600, 1600]]) {
      const pixels = fill(width, height);
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
      context.putImageData(new ImageData(pixels, width, height), 0, 0);
      const expected = scorePixels(pixels, width, height);
      const samples = { cpuPixels: [], cpuCanvas: [], gpuPixels: [], gpuCanvas: [] };
      const row = { width, height, consistent: true };
      const cpuPixels = () => scorePixels(pixels, width, height);
      const cpuCanvas = () => scorePixels(context.getImageData(0, 0, width, height).data, width, height);
      const actions = { cpuPixels, cpuCanvas };
      if (info.available) {
        actions.gpuPixels = async () => (await scorer.scorePixels(pixels, width, height)).result;
        actions.gpuCanvas = async () => (await scorer.scoreSource(canvas)).result;
      }
      for (const action of Object.values(actions)) await action();
      for (let iteration = 0; iteration < 9; iteration += 1) {
        // Alternate ordering to reduce JIT/thermal/order bias.
        const entries = Object.entries(actions);
        if (iteration % 2) entries.reverse();
        for (const [name, action] of entries) {
          const started = performance.now();
          const actual = await action();
          samples[name].push(performance.now() - started);
          row.consistent &&= equal(actual, expected);
        }
      }
      for (const [name, timings] of Object.entries(samples)) if (timings.length) row[name] = summarize(timings);
      if (info.available) {
        row.scoringSpeedupPixels = row.cpuPixels.medianMs / row.gpuPixels.medianMs;
        row.scoringSpeedupCanvas = row.cpuCanvas.medianMs / row.gpuCanvas.medianMs;
      }
      report.scoring.push(row);
    }
    // Each backend gets the same optimized decoder/resize and thumbnail work.
    // Canvas comparison avoids any whole-image getImageData on the GPU path.
    const original = new OffscreenCanvas(6000, 4000);
    const originalContext = original.getContext("2d");
    const originalPixels = fill(6000, 4000);
    originalContext.putImageData(new ImageData(originalPixels, 6000, 4000), 0, 0);
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      const blob = await original.convertToBlob({ type, quality: 0.9 });
      const file = new File([blob], `generated.${type.split("/")[1]}`, { type });
      const actions = {
        cpu: async () => pipeline(file, "cpu"),
      };
      if (info.available) actions.gpu = async () => pipeline(file, "gpu");
      const row = { type, sourceWidth: 6000, sourceHeight: 4000, fileBytes: file.size, consistent: true, cpu: [], gpu: [] };
      const expected = (await pipeline(file, "cpu")).result;
      for (const action of Object.values(actions)) await action();
      for (let iteration = 0; iteration < 5; iteration += 1) {
        const entries = Object.entries(actions);
        if (iteration % 2) entries.reverse();
        for (const [name, action] of entries) {
          const actual = await action();
          row[name].push(actual.timings);
          row.consistent &&= equal(actual.result, expected);
        }
      }
      for (const name of ["cpu", "gpu"]) {
        if (!row[name].length) { delete row[name]; continue; }
        const samples = row[name];
        row[name] = { samples, medians: Object.fromEntries(Object.keys(samples[0]).map((stage) =>
          [stage, median(samples.map((sample) => sample[stage]))])) };
      }
      if (info.available) row.pipelineSpeedup = row.cpu.medians.total / row.gpu.medians.total;
      report.pipelines.push(row);
    }
    async function pipeline(file, backend) {
      const timing = new AnalysisTiming(true);
      const bitmap = await decodeBitmap(file, timing);
      try {
        const size = dimensionsWithin(1600, bitmap.width, bitmap.height);
        const canvas = new OffscreenCanvas(size.width, size.height);
        // CPU's willReadFrequently can choose a different Canvas backing;
        // each backend uses the context appropriate for its own path.
        const context = canvas.getContext("2d", { willReadFrequently: backend === "cpu", colorSpace: "srgb" });
        timing.measure("analysisResize", () => context.drawImage(bitmap, 0, 0, size.width, size.height));
        let result;
        if (backend === "cpu") {
          const pixels = timing.measure("pixelsReadback", () => context.getImageData(0, 0, size.width, size.height).data);
          result = timing.measure("score", () => scorePixels(pixels, size.width, size.height));
        } else result = (await timing.measureAsync("score", () => scorer.scoreSource(canvas))).result;
        const thumbSize = dimensionsWithin(420, bitmap.width, bitmap.height);
        const thumbnail = new OffscreenCanvas(thumbSize.width, thumbSize.height);
        timing.measure("thumbnailResize", () => thumbnail.getContext("2d").drawImage(bitmap, 0, 0, thumbSize.width, thumbSize.height));
        await timing.measureAsync("thumbnailEncode", () => thumbnail.convertToBlob({ type: "image/jpeg", quality: 0.84 }));
        return { result, timings: timing.finish() };
      } finally { bitmap.close(); }
    }
    scorer.close();
    return report;
  });
  report.measuredAt = new Date().toISOString();
  report.promotableHardwareMeasurement = report.adapter.available && report.adapter.adapterKind === "hardware";
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    await writeFile(output, serialized);
    process.stdout.write(`${JSON.stringify({ output, adapter: report.adapter,
      hardware: report.promotableHardwareMeasurement,
      scoring: report.scoring.map(({ width, height, consistent, cpuCanvas, gpuCanvas }) =>
        ({ width, height, consistent, cpuMs: cpuCanvas.medianMs, gpuMs: gpuCanvas?.medianMs })),
      pipelines: report.pipelines.map(({ type, consistent, cpu, gpu, pipelineSpeedup }) =>
        ({ type, consistent, cpuMs: cpu.medians.total, gpuMs: gpu?.medians.total, pipelineSpeedup })),
    }, null, 2)}\n`);
  } else process.stdout.write(serialized);
} finally {
  await browser?.close();
  server?.kill();
}
