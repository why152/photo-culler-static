// jsfeat MIT ORB extraction; bounded to same-orientation photographic sequences.
import jsfeat from "jsfeat";
export function sceneFeatures(image) {
  const { width, height, data } = image;
  const full = new jsfeat.matrix_t(width, height, jsfeat.U8_t | jsfeat.C1_t);
  jsfeat.imgproc.grayscale(data, width, height, full);
  const scale = Math.min(1, 320 / Math.max(width, height));
  const w = Math.round(width * scale),
    h = Math.round(height * scale);
  const gray = new jsfeat.matrix_t(w, h, jsfeat.U8_t | jsfeat.C1_t);
  jsfeat.imgproc.resample(full, gray, w, h);
  const corners = Array.from(
    { length: w * h },
    () => new jsfeat.keypoint_t(0, 0, 0, 0, 0),
  );
  const count = jsfeat.yape06.detect(gray, corners, 20);
  const points = corners
    .slice(0, count)
    .sort((a, b) => b.score - a.score)
    .slice(0, 128);
  for (const p of points) p.angle = 0;
  if (points.length < 16) return null;
  const descriptors = new jsfeat.matrix_t(
    32,
    points.length,
    jsfeat.U8_t | jsfeat.C1_t,
  );
  jsfeat.orb.describe(gray, points, points.length, descriptors);
  return {
    version: 1,
    count: points.length,
    descriptors: descriptors.data.slice(0, points.length * 32),
  };
}
