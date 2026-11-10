import { expect, test } from "@playwright/test";

test("existing analysis hook adds bounded local focus without changing legacy scores", async ({
  page,
}) => {
  await page.goto("/legacy.html");
  const result = await page.evaluate(async () => {
    const { analyzeFile } = await import("/modules/photo-analysis-worker.js");
    const { analyzeCanvasFocus } = await import("/modules/upstream-focus.js");
    const canvas = new OffscreenCanvas(2048, 1536),
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#888";
    ctx.fillRect(0, 0, 2048, 1536);
    for (let x = 0; x < 2048; x += 16) {
      ctx.fillStyle = x % 32 ? "#555" : "#bbb";
      ctx.fillRect(x, 0, 16, 1536);
    }
    const file = new File(
      [await canvas.convertToBlob({ type: "image/jpeg" })],
      "synthetic.jpg",
    );
    const legacy = await analyzeFile(file);
    const enhanced = await analyzeFile(
      file,
      undefined,
      undefined,
      (analyzed) => ({ focus: analyzeCanvasFocus(analyzed) }),
    );
    return {
      legacy: {
        score: legacy.technicalScore,
        sharpness: legacy.sharpness,
        exposure: legacy.exposureScore,
      },
      enhanced: {
        score: enhanced.technicalScore,
        sharpness: enhanced.sharpness,
        exposure: enhanced.exposureScore,
      },
      focus: enhanced.focus,
    };
  });
  expect(result.enhanced).toEqual(result.legacy);
  expect(result.focus.version).toBe("upstream-focus-1");
  expect(Number.isFinite(result.focus.normalizedSharpness)).toBe(true);
  expect(result.focus.sharpTileFraction).toBeGreaterThan(0);
});
