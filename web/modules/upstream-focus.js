/*! Adapted MIT numerical analysis: Copyright (c) 2026 Paolo Cortez;
 * Copyright (c) 2026 Zane. Full notices: UPSTREAM_NOTICES.txt.
 * Photo-Curator 1cb56a07, photo_ranking_v3.py:_sharpness;
 * OpenPhotoCull 8824c83b, commands/scan.rs:compute_blur,largest_cluster_size,exif_intent.
 * Input adapter uses browser-decoded 1024px luminance, not native model inference.
 */
export const FOCUS_ANALYSIS_VERSION = "upstream-focus-2";
const TILE_SIZE = 64,
  SHARP_THRESHOLD = 100;
export function normalizedFocus(laplacianVariance, luminanceVariance) {
  const norm =
    (Math.max(0, laplacianVariance) / (Math.max(0, luminanceVariance) + 1e-6)) *
    1000;
  return Math.max(0, Math.min(1, norm / 600)) * 100;
}
export function largestSharpCluster(grid, width, height) {
  const visited = new Uint8Array(grid.length);
  let best = 0;
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let size = 0;
    while (stack.length) {
      const i = stack.pop(),
        x = i % width,
        y = Math.floor(i / width);
      size++;
      for (const next of [
        x > 0 ? i - 1 : -1,
        x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y + 1 < height ? i + width : -1,
      ]) {
        if (next >= 0 && grid[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    best = Math.max(best, size);
  }
  return best;
}
export function focusIntent(metadata = {}) {
  const aperture = Number(metadata.FNumber),
    focal = Number(metadata.FocalLength),
    shutter = Number(metadata.ExposureTime);
  return {
    bokehLikely:
      aperture > 0 && (aperture < 2.8 || (aperture < 4 && focal >= 70)),
    shakeRisk: shutter > 0 && focal > 0 && shutter * focal > 1,
  };
}
export function classifyFocus(metrics, metadata = {}) {
  const { bokehLikely, shakeRisk } = focusIntent(metadata);
  const [peak, fraction, cluster] = bokehLikely
    ? [700, 0.04, 0.025]
    : [900, 0.12, 0.06];
  const hasStrongSharp =
    metrics.maxTileVariance >= peak ||
    (metrics.sharpTileFraction >= fraction &&
      metrics.largestSharpCluster >= cluster);
  return {
    ...metrics,
    bokehLikely,
    shakeRisk,
    hasStrongSharp,
    isBlurry: !hasStrongSharp && metrics.laplacianVariance < SHARP_THRESHOLD,
  };
}
export function analyzeGrayFocus(gray, width, height) {
  if (width < 3 || height < 3 || gray.length !== width * height) return null;
  const tx = Math.ceil(width / TILE_SIZE),
    ty = Math.ceil(height / TILE_SIZE),
    n = tx * ty;
  const sums = new Float64Array(n),
    squares = new Float64Array(n),
    counts = new Uint32Array(n);
  let lumSum = 0,
    lumSquares = 0;
  const histogram = new Uint32Array(256);
  for (const value of gray) {
    histogram[value]++;
    lumSum += value;
    lumSquares += value * value;
  }
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        tile = Math.floor(y / TILE_SIZE) * tx + Math.floor(x / TILE_SIZE);
      const lap =
        gray[i - width] +
        gray[i + width] +
        gray[i - 1] +
        gray[i + 1] -
        4 * gray[i];
      sums[tile] += lap;
      squares[tile] += lap * lap;
      counts[tile]++;
    }
  let sum = 0,
    squared = 0,
    count = 0;
  const vars = [],
    grid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    sum += sums[i];
    squared += squares[i];
    count += counts[i];
    if (counts[i] < (TILE_SIZE * TILE_SIZE) / 4) continue;
    const v = Math.max(0, squares[i] / counts[i] - (sums[i] / counts[i]) ** 2);
    vars.push(v);
    grid[i] = v >= SHARP_THRESHOLD ? 1 : 0;
  }
  const laplacianVariance = Math.max(0, squared / count - (sum / count) ** 2),
    luminanceVariance = Math.max(
      0,
      lumSquares / gray.length - (lumSum / gray.length) ** 2,
    );
  vars.sort((a, b) => a - b);
  const valid = vars.length || 1;
  return {
    version: FOCUS_ANALYSIS_VERSION,
    exposure: luminanceEvidence(histogram, gray.length),
    laplacianVariance,
    luminanceVariance,
    normalizedSharpness: normalizedFocus(laplacianVariance, luminanceVariance),
    maxTileVariance: vars.length ? vars.at(-1) : laplacianVariance,
    p95TileVariance: vars.length
      ? vars[Math.min(vars.length - 1, Math.floor(vars.length * 0.95))]
      : laplacianVariance,
    meanTileVariance: vars.length
      ? vars.reduce((a, b) => a + b, 0) / valid
      : laplacianVariance,
    sharpTileFraction: grid.reduce((a, b) => a + b, 0) / valid,
    largestSharpCluster: largestSharpCluster(grid, tx, ty) / valid,
  };
}
export function analyzeCanvasFocus(canvas) {
  const scale = Math.min(1, 1024 / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale)),
    height = Math.max(1, Math.round(canvas.height * scale));
  const surface = new OffscreenCanvas(width, height),
    context = surface.getContext("2d", { willReadFrequently: true });
  context.drawImage(canvas, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data,
    gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = Math.round(
      rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114,
    );
  }
  return analyzeGrayFocus(gray, width, height);
}

export function luminanceEvidence(histogram, count) {
  const quantile = (fraction) => {
    let n = 0;
    for (let i = 0; i < 256; i++) {
      n += histogram[i];
      if (n >= Math.ceil(count * fraction)) return i;
    }
    return 255;
  };
  const sum = (start, end) => {
    let n = 0;
    for (let i = start; i <= end; i++) n += histogram[i];
    return n / count;
  };
  return {
    version: "luminance-1",
    darkFraction: sum(0, 8),
    brightFraction: sum(247, 255),
    midtoneFraction: sum(32, 224),
    p05: quantile(0.05),
    p50: quantile(0.5),
    p95: quantile(0.95),
  };
}
