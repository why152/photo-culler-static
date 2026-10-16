import assert from "node:assert/strict";
import test from "node:test";

import { scorePixels } from "../modules/photo-analysis-worker.js";
import { scorePixels as originalScorePixels } from "./fixtures/original-score-pixels.mjs";

function solidImageData(red, green, blue, size = 16) {
  return new Uint8ClampedArray(
    Array.from({ length: size * size }, () => [red, green, blue, 255]).flat(),
  );
}

test("low-sharpness JPEGs remain review candidates instead of direct rejects", () => {
  const result = scorePixels(solidImageData(128, 128, 128), 16, 16);

  assert.equal(result.status, "review");
  assert.match(result.reasons.join("；"), /清晰度/);
});

test("combined Laplacian pass exactly preserves original scores, thresholds and nine-cell borders", () => {
  let seed = 31;
  for (const [width, height] of [[1,1], [1,5], [2,2], [3,3], [4,5], [5,4], [7,11], [31,29], [160,107]]) {
    for (const pattern of ["noise", "black", "white", "flat", "gradient", "edges", "local"]) {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        let rgb;
        if (pattern === "noise") rgb = [seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255];
        else {
          const value = pattern === "black" ? 0 : pattern === "white" ? 255 : pattern === "flat" ? 128
            : pattern === "gradient" ? Math.round(255 * x / Math.max(1, width - 1))
            : pattern === "edges" ? (x + y) % 2 * 255
            : x < Math.floor(width / 3) && y < Math.floor(height / 3) ? (x + y) % 2 * 255 : 128;
          rgb = [value, value, value];
        }
        pixels.set([...rgb, seed & 255], offset);
      }
      assert.deepEqual(scorePixels(pixels, width, height), originalScorePixels(pixels, width, height), `${width}x${height} ${pattern}`);
    }
  }
  for (let amplitude = 0; amplitude < 45; amplitude++) {
    const size = 23;
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let index = 0; index < size * size; index++) {
      const value = 128 + (index % 2 ? amplitude : -amplitude);
      pixels.set([value, value, value, 255], index * 4);
    }
    assert.deepEqual(scorePixels(pixels, size, size), originalScorePixels(pixels, size, size), `threshold amplitude ${amplitude}`);
  }
});
