import { analyzeFile } from "./photo-analysis-worker.js";
import { computePhashFromImage } from "@stabilityprotocol.com/phash";
import { digest } from "./cull-similarity.js";
import { captureMetadata } from "./cull-inventory.js";
import { summarizeFaces, PORTRAIT_VERSION } from "./portrait-evidence.js";
import { analyzeCanvasFocus, classifyFocus } from "./upstream-focus.js";
self.onmessage = async ({ data }) => {
  if (data.protocol !== "cull-v2") return;
  const { id, file } = data;
  try {
    const metadata = await captureMetadata(file);
    let portraitInput = null;
    const analysis = await analyzeFile(file, undefined, undefined, (canvas) => {
      const start = performance.now();
      if (data.portrait) {
        const scale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
        const c = new OffscreenCanvas(
          Math.round(canvas.width * scale),
          Math.round(canvas.height * scale),
        );
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0, c.width, c.height);
        portraitInput = ctx.getImageData(0, 0, c.width, c.height);
      }
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
    if (data.portrait && portraitInput) {
      const start = performance.now();
      try {
        const { detectPortrait, portraitMemory } =
          await import("./portrait-runtime.js");
        const faces = await detectPortrait(portraitInput);
        const summaries = summarizeFaces(faces, portraitInput);
        const surface = new OffscreenCanvas(
          portraitInput.width,
          portraitInput.height,
        );
        surface.getContext("2d").putImageData(portraitInput, 0, 0);
        for (const f of summaries)
          if (f.usable) {
            const points = faces[f.faceIndex].keypoints;
            const l = points[33],
              r = points[263];
            const d = Math.hypot(r.x - l.x, r.y - l.y),
              angle = Math.atan2(r.y - l.y, r.x - l.x),
              scale = 24 / d;
            const crop = new OffscreenCanvas(64, 64),
              ctx = crop.getContext("2d");
            ctx.translate(20, 24);
            ctx.rotate(-angle);
            ctx.scale(scale, scale);
            ctx.translate(-l.x, -l.y);
            ctx.drawImage(surface, 0, 0);
            f.hash = computePhashFromImage(crop);
          }
        for (const f of summaries) delete f.faceIndex;
        const { sceneFeatures } = await import("./portrait-orb.js");
        const orb = summaries.some((f) => f.usable)
          ? sceneFeatures(portraitInput)
          : null;
        analysis.portrait = {
          version: PORTRAIT_VERSION,
          status: "ready",
          faces: summaries,
          orb,
          memory: {
            tensors: portraitMemory().numTensors,
            bytes: portraitMemory().numBytes,
            peakBytes: portraitMemory().peakBytes,
          },
          milliseconds: performance.now() - start,
        };
      } catch (error) {
        analysis.portrait = {
          version: PORTRAIT_VERSION,
          status: "unavailable",
          faces: [],
          reason: error.message,
        };
      }
    }
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
