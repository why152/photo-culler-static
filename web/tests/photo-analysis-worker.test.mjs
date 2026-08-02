import assert from "node:assert/strict";
import test from "node:test";

import { scorePixels } from "../modules/photo-analysis-worker.js";

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
