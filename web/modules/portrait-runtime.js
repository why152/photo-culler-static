// Converted FaceMesh weights, TFJS/WASM only; no MediaPipe SDK or remote endpoints.
import * as tf from "@tensorflow/tfjs-core";
import { setWasmPaths, setThreadsCount } from "@tensorflow/tfjs-backend-wasm";
import { load } from "@tensorflow-models/face-landmarks-detection/dist/tfjs/detector.js";
let loading,
  disabled = false;
let peakBytes = 0;
export function loadPortraitModel() {
  return (loading ??= (async () => {
    // All model paths remain on the current static origin and Pages subpath.
    const local = new URL(
      import.meta.env.BASE_URL + "models/portrait-v1/",
      self.location.origin,
    );
    setThreadsCount(1);
    setWasmPaths(new URL("wasm/", local).href);
    if (!(await tf.setBackend("wasm"))) throw Error("WASM backend unavailable");
    await tf.ready();
    return load({
      runtime: "tfjs",
      maxFaces: 4,
      refineLandmarks: false,
      detectorModelUrl: new URL("detector/model.json", local).href,
      landmarkModelUrl: new URL("mesh/model.json", local).href,
    });
  })());
}
export async function detectPortrait(image) {
  if (disabled) throw Error("人物模型已安全停用，请重开会话重试");
  let timer;
  try {
    const detector = await Promise.race([
      loadPortraitModel(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          disabled = true;
          reject(Error("人物模型加载超时，使用规则推荐"));
        }, 15000);
      }),
    ]);
    const measured = await tf.profile(() =>
      detector.estimateFaces(image, {
        flipHorizontal: false,
        staticImageMode: true,
      }),
    );
    peakBytes = measured.peakBytes;
    const result = measured.result;
    if (Math.max(tf.memory().numBytes, peakBytes) > 128 * 1024 * 1024) {
      disabled = true;
      throw Error("人物模型达到资源上限");
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}
export function portraitMemory() {
  return { ...tf.memory(), peakBytes };
}
