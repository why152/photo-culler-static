import { AnalysisTiming } from "./analysis-timing.js";
import { imageDimensions, dimensionsWithin, orientedDimensions } from "./image-dimensions.js";

const ANALYSIS_LONG_EDGE = 1600;
const THUMBNAIL_EDGE = 420;
export async function decodeBitmap(file, timing = new AnalysisTiming(), onDimensions) {
  const metadata = await timing.measureAsync("metadata", () => imageDimensions(file));
  if (metadata) {
    const dimensions = orientedDimensions(metadata);
    onDimensions?.(dimensions);
    const target = dimensionsWithin(ANALYSIS_LONG_EDGE, dimensions.width, dimensions.height);
    if (target.width !== dimensions.width || target.height !== dimensions.height) {
      try {
        return await timing.measureAsync("decode", () => createImageBitmap(file, { imageOrientation: "from-image",
          resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" }));
      } catch {
        // Some decoders reject native resizing. Only then retry ordinary decode.
      }
    }
  }
  const bitmap = await timing.measureAsync("decode", () => createImageBitmap(file, { imageOrientation: "from-image" }));
  if (!metadata) onDimensions?.({width:bitmap.width,height:bitmap.height});
  return bitmap;
}

function laplacianVariances(gray, width, height) {
  let count = 0, mean = 0, squaredDeviation = 0;
  const counts = new Uint32Array(9);
  const means = new Float64Array(9);
  const deviations = new Float64Array(9);
  const starts = [1, Math.max(1, Math.floor(width / 3)), Math.max(1, Math.floor(2 * width / 3))];
  const ends = [Math.min(width - 1, Math.floor(width / 3)), Math.min(width - 1, Math.floor(2 * width / 3)), width - 1];
  const top = Math.floor(height / 3), bottom = Math.floor(2 * height / 3);
  for (let y = 1; y < height - 1; y++) {
    const regionRow = y < top ? 0 : y < bottom ? 3 : 6;
    const row = y * width;
    for (let column = 0; column < 3; column++) {
      const region = regionRow + column;
      let localCount = counts[region], localMean = means[region], localDeviation = deviations[region];
      for (let x = starts[column]; x < ends[column]; x++) {
        const point = row + x;
        const laplacian = -4 * gray[point] + gray[point - 1] + gray[point + 1]
          + gray[point - width] + gray[point + width];
        count++;
        const delta = laplacian - mean;
        mean += delta / count;
        squaredDeviation += delta * (laplacian - mean);
        localCount++;
        const localDelta = laplacian - localMean;
        localMean += localDelta / localCount;
        localDeviation += localDelta * (laplacian - localMean);
      }
      counts[region] = localCount;
      means[region] = localMean;
      deviations[region] = localDeviation;
    }
  }
  let localVariance = 0;
  for (let region = 0; region < 9; region++) {
    if (counts[region] > 1) localVariance = Math.max(localVariance, deviations[region] / counts[region]);
  }
  return { globalVariance: count > 1 ? squaredDeviation / count : 0, localVariance };
}

export function scorePixels(imageData, width, height) {
  const gray = new Uint8Array(width * height);
  let darkCount = 0;
  let brightCount = 0;
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    const value = Math.round(
      imageData[offset] * 0.299 +
        imageData[offset + 1] * 0.587 +
        imageData[offset + 2] * 0.114,
    );
    gray[index] = value;
    if (value <= 8) darkCount += 1;
    if (value >= 247) brightCount += 1;
  }
  const { globalVariance, localVariance } = laplacianVariances(gray, width, height);
  return scoreStatistics(globalVariance, localVariance, darkCount, brightCount, gray.length);
}

export function scoreStatistics(globalVariance, localVariance, darkCount, brightCount, pixelCount) {
  const sharpness =
    Math.round(
      Math.min(
        100,
        Math.max(
          0,
          Math.log1p(globalVariance * 0.65 + localVariance * 0.35) * 13,
        ),
      ) * 10,
    ) / 10;
  const exposureScore =
    Math.round(
      Math.max(
        0,
        100 - (Math.max(darkCount, brightCount) / pixelCount) * 100,
      ) * 10,
    ) / 10;
  const technicalScore =
    Math.round((sharpness * 0.8 + exposureScore * 0.2) * 10) / 10;
  const reasons = [];
  if (darkCount / pixelCount > 0.96)
    reasons.push("画面几乎全黑，建议确认是否为误拍");
  if (brightCount / pixelCount > 0.96)
    reasons.push("画面几乎全白，建议确认是否为误拍");
  let status = "keep";
  if (reasons.length) status = "review";
  else if (sharpness < 22) {
    status = "review";
    reasons.push("整体与局部清晰度都很低，建议人工确认");
  } else if (sharpness < 40 || exposureScore < 70) {
    status = "review";
    reasons.push("技术指标处于保守复核区间");
  } else reasons.push("未发现明显技术问题");
  return { status, sharpness, exposureScore, technicalScore, reasons };
}

export async function analyzeFile(file, timing = new AnalysisTiming(), onPreview) {
  let bitmap, sourceDimensions;
  try {
    bitmap = await decodeBitmap(file, timing, dimensions => {sourceDimensions=dimensions;});
    const analysisSize = dimensionsWithin(
      ANALYSIS_LONG_EDGE,
      bitmap.width,
      bitmap.height,
    );
    const analysisCanvas = new OffscreenCanvas(
      analysisSize.width,
      analysisSize.height,
    );
    const analysisContext = analysisCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    timing.measure("resize", () => analysisContext.drawImage(
      bitmap,
      0,
      0,
      analysisSize.width,
      analysisSize.height,
    ));
    const thumbnailSize = dimensionsWithin(
      THUMBNAIL_EDGE,
      bitmap.width,
      bitmap.height,
    );
    const thumbnailCanvas = new OffscreenCanvas(
      thumbnailSize.width,
      thumbnailSize.height,
    );
    timing.measure("thumbnailResize", () => thumbnailCanvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, thumbnailSize.width, thumbnailSize.height));
    const thumbnail = await timing.measureAsync("thumbnailEncode", () => thumbnailCanvas.convertToBlob({
      type: "image/jpeg", quality: 0.84,
    }));
    onPreview?.(thumbnail);
    const pixels = timing.measure("readback", () => analysisContext.getImageData(
        0,
        0,
        analysisSize.width,
        analysisSize.height,
      ).data);
    const result = timing.measure("score", () => scorePixels(pixels,
      analysisSize.width, analysisSize.height));
    return { ...result, thumbnail, sourceDimensions };
  } catch (error) {
    return {
      status: "review",
      sharpness: 0,
      exposureScore: 0,
      technicalScore: 0,
      reasons: [`无法读取照片：${error.message || error}`],
      thumbnail: null,
    };
  } finally {
    bitmap?.close();
  }
}

if (typeof DedicatedWorkerGlobalScope !== "undefined" && self instanceof DedicatedWorkerGlobalScope) {
  self.addEventListener("message", async (event) => {
    if (event.data.protocol === "cull-v2") return;
    const timing = new AnalysisTiming(Boolean(event.data.diagnostics));
    const result = await analyzeFile(event.data.file, timing, event.data.preview ? (thumbnail) => {
      self.postMessage({ id: event.data.id, type: "preview", thumbnail });
    } : undefined);
    self.postMessage({
      id: event.data.id,
      result,
      timings: timing.finish(),
    });
  });
}
