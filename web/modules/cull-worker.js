import { analyzeFile } from "./photo-analysis-worker.js";
import { computePhashFromImage } from "@stabilityprotocol.com/phash";
import { digest } from "./cull-similarity.js";
import { captureMetadata } from "./cull-inventory.js";
self.onmessage = async ({ data }) => {
  if (data.protocol !== "cull-v2") return;
  const { id, file } = data;
  try {
    const analysis = await analyzeFile(file);
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
      metadata: await captureMetadata(file),
      sourceSHA: await digest(file),
    });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
