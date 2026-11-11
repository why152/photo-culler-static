// Reuse jsfeat ORB on the same bounded preview for faces and distant subjects.
// This evidence describes a scene, not a person's identity or preferred pose.
import { sceneFeatures } from "./portrait-orb.js";
import { SCENE_VERSION } from "./scene-evidence-version.js";
export async function sceneEvidence(thumbnail) {
  if (!thumbnail) return { version: SCENE_VERSION, status: "unavailable" };
  let bitmap;
  try {
    bitmap = await createImageBitmap(thumbnail);
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = surface.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return {
      version: SCENE_VERSION, status: "ready",
      orb: sceneFeatures(ctx.getImageData(0, 0, surface.width, surface.height)),
    };
  } catch {
    return { version: SCENE_VERSION, status: "unavailable" };
  } finally { bitmap?.close(); }
}
