import { analyzeFile } from "./photo-analysis-worker.js";
import { computePhashFromImage } from "@stabilityprotocol.com/phash";
import { digest } from "./cull-similarity.js";
import { captureMetadata } from "./cull-inventory.js";
import { analyzeCanvasFocus, classifyFocus } from "./upstream-focus.js";
self.onmessage = async ({ data }) => {
  if (data.protocol !== "cull-v2") return;
  const { id, file } = data;
  try {
    const metadata = await captureMetadata(file);
    const analysis = await analyzeFile(file, undefined, undefined, (canvas) => {
      const start = performance.now();
      try {
        const focus = analyzeCanvasFocus(canvas);
        return {
          focus: focus ? classifyFocus(focus, metadata) : null,
          focusAnalysisMs: performance.now() - start,
        };
      } catch {
        return {
          focus: null,
          focusUnavailable: true,
          focusAnalysisMs: performance.now() - start,
        };
      }
    });
    let hash = null;
    if (analysis.thumbnail) {
      const bitmap = await createImageBitmap(analysis.thumbnail);
      try {
        hash = computePhashFromImage(bitmap);
      } finally {
        bitmap.close();
      }
    }
    self.postMessage({
      id,
      analysis,
      hash,
      metadata,
      sourceSHA: await digest(file),
    });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
