import { performance } from "node:perf_hooks";
import { scorePixels } from "../web/modules/photo-analysis-worker.js";
import { scorePixels as reference } from "../web/tests/fixtures/original-score-pixels.mjs";

const width = 1600, height = 1067;
const pixels = new Uint8ClampedArray(width * height * 4);
let seed = 42;
for (let index = 0; index < pixels.length; index += 4) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  pixels[index] = seed & 255; pixels[index + 1] = (seed >>> 8) & 255;
  pixels[index + 2] = (seed >>> 16) & 255; pixels[index + 3] = 255;
}
const results = {};
for (const [label, score] of [["reference", reference], ["current", scorePixels]]) {
  score(pixels, width, height);
  const samples = [];
  for (let iteration = 0; iteration < 7; iteration++) {
    const start = performance.now(); score(pixels, width, height);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  results[label] = { median: samples[3], samples };
}
process.stdout.write(`${JSON.stringify({ width, height, results }, null, 2)}\n`);
