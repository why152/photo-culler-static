// TFJS-only adapter: deliberately excludes the MediaPipe JavaScript SDK.
import { load } from "@tensorflow-models/face-detection/dist/tfjs/detector.js";
export const SupportedModels = {
  MediaPipeFaceDetector: "MediaPipeFaceDetector",
};
export function createDetector(_model, config) {
  return load({ ...config, modelType: "full" });
}
