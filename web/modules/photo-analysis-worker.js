const ANALYSIS_LONG_EDGE = 1600;
const THUMBNAIL_EDGE = 420;

function dimensionsWithin(longEdge, width, height) {
  if (Math.max(width, height) <= longEdge) return { width, height };
  const scale = longEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function regionVariance(gray, width, startX, startY, endX, endY) {
  let count = 0;
  let mean = 0;
  let squaredDeviation = 0;
  for (
    let y = Math.max(1, startY);
    y < Math.min(endY, gray.length / width - 1);
    y += 1
  ) {
    for (let x = Math.max(1, startX); x < Math.min(endX, width - 1); x += 1) {
      const point = y * width + x;
      const laplacian =
        -4 * gray[point] +
        gray[point - 1] +
        gray[point + 1] +
        gray[point - width] +
        gray[point + width];
      count += 1;
      const delta = laplacian - mean;
      mean += delta / count;
      squaredDeviation += delta * (laplacian - mean);
    }
  }
  return count > 1 ? squaredDeviation / count : 0;
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
  const globalVariance = regionVariance(gray, width, 0, 0, width, height);
  let localVariance = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      localVariance = Math.max(
        localVariance,
        regionVariance(
          gray,
          width,
          Math.floor((column * width) / 3),
          Math.floor((row * height) / 3),
          Math.floor(((column + 1) * width) / 3),
          Math.floor(((row + 1) * height) / 3),
        ),
      );
    }
  }
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
        100 - (Math.max(darkCount, brightCount) / gray.length) * 100,
      ) * 10,
    ) / 10;
  const technicalScore =
    Math.round((sharpness * 0.8 + exposureScore * 0.2) * 10) / 10;
  const reasons = [];
  if (darkCount / gray.length > 0.96)
    reasons.push("画面几乎全黑，建议确认是否为误拍");
  if (brightCount / gray.length > 0.96)
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

async function analyzeFile(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
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
    analysisContext.drawImage(
      bitmap,
      0,
      0,
      analysisSize.width,
      analysisSize.height,
    );
    const result = scorePixels(
      analysisContext.getImageData(
        0,
        0,
        analysisSize.width,
        analysisSize.height,
      ).data,
      analysisSize.width,
      analysisSize.height,
    );
    const thumbnailSize = dimensionsWithin(
      THUMBNAIL_EDGE,
      bitmap.width,
      bitmap.height,
    );
    const thumbnailCanvas = new OffscreenCanvas(
      thumbnailSize.width,
      thumbnailSize.height,
    );
    thumbnailCanvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, thumbnailSize.width, thumbnailSize.height);
    return {
      ...result,
      thumbnail: await thumbnailCanvas.convertToBlob({
        type: "image/jpeg",
        quality: 0.84,
      }),
    };
  } catch (error) {
    return {
      status: "review",
      sharpness: 0,
      exposureScore: 0,
      technicalScore: 0,
      reasons: [`无法读取 JPEG：${error.message || error}`],
      thumbnail: null,
    };
  } finally {
    bitmap?.close();
  }
}

if (typeof self !== "undefined") {
  self.addEventListener("message", async (event) => {
    self.postMessage({
      id: event.data.id,
      result: await analyzeFile(event.data.file),
    });
  });
}
