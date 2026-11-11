/*! EAR/pose adaptation: Facet (c)2026 Nicolas Coevoet; bounded face preference:
 * Selects (c)2026 selects contributors. MIT notices in UPSTREAM_NOTICES.txt.
 * 468-point indices adapt the upstream geometry; no identity/emotion inference. */
import { analyzeGrayFocus } from "./upstream-focus.js";
export const PORTRAIT_VERSION = "tfjs-facemesh-4";
const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function eyeAspectRatio(points, indices) {
  const p = indices.map((i) => points[i]);
  if (p.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return null;
  const width = pointDistance(p[0], p[1]);
  return width < 8
    ? null
    : (pointDistance(p[2], p[4]) + pointDistance(p[3], p[5])) / (2 * width);
}
export function faceGeometry(points) {
  if (!points?.[454]) return { eyesOpen: null, yaw: null };
  const left = points[33],
    right = points[263],
    nose = points[1];
  const eyeMid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const eyeDistance = pointDistance(left, right);
  const yaw =
    eyeDistance > 0
      ? Math.max(-1, Math.min(1, (nose.x - eyeMid.x) / eyeDistance)) * 90
      : null;
  const earL = eyeAspectRatio(points, [33, 133, 160, 158, 144, 153]);
  const earR = eyeAspectRatio(points, [362, 263, 385, 387, 380, 373]);
  // Facet pose gate: foreshortened/profile eyes are unknown, never closed.
  const mouth = {
    x: (points[61].x + points[291].x) / 2,
    y: (points[61].y + points[291].y) / 2,
  };
  const pitch =
    Math.abs(mouth.y - eyeMid.y) > 1
      ? (0.55 - (nose.y - eyeMid.y) / (mouth.y - eyeMid.y)) * 90
      : null;
  const roll = (Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI;
  const ear =
    earL != null &&
    earR != null &&
    Math.abs(yaw) <= 35 &&
    pitch != null &&
    Math.abs(pitch) <= 35 &&
    Math.abs(roll) <= 25
      ? (earL + earR) / 2
      : null;
  return {
    ear,
    pitch,
    eyesOpen:
      ear == null ? null : Math.max(0, Math.min(1, (ear - 0.12) / 0.18)),
    yaw,
  };
}
export function summarizeFaces(detected, image) {
  const { width, height, data } = image;
  return detected
    .slice(0, 4)
    .map((face, faceIndex) => {
      const b = face.box;
      const x = Math.min(width, Math.max(0, Math.floor(b.xMin))),
        y = Math.min(height, Math.max(0, Math.floor(b.yMin)));
      const w = Math.max(0, Math.min(width - x, Math.ceil(b.width))),
        h = Math.max(0, Math.min(height - y, Math.ceil(b.height)));
      const area = (w * h) / (width * height);
      const geometry = faceGeometry(face.keypoints);
      // Selects applies the .5% area gate to eye penalties, not face grouping:
      // a full-body portrait can still have a usable face-focus crop.
      if (area < 0.005) geometry.eyesOpen = null;
      const gray = new Uint8Array(Math.max(0, w * h));
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const k = ((y + j) * width + x + i) * 4;
          gray[j * w + i] = Math.round(
            0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2],
          );
        }
      const focus = w >= 16 && h >= 16 ? analyzeGrayFocus(gray, w, h) : null;
      return {
        faceIndex,
        box: {
          x: x / width,
          y: y / height,
          width: w / width,
          height: h / height,
        },
        area,
        ...geometry,
        usable: w >= 48 && h >= 48 && focus != null,
        sharpness: focus
          ? focus.laplacianVariance / (focus.luminanceVariance + 1e-6)
          : null,
      };
    })
    .filter((f) => f.area > 0)
    .sort((a, b) => b.area - a.area);
}
export function usablePortrait(group) {
  const p = group.analysis?.portrait;
  return (
    p?.version === PORTRAIT_VERSION &&
    p.status === "ready" &&
    p.faces.length > 0 &&
    p.faces.length < 4 &&
    p.faces.every((f) => f.usable)
  );
}
// Selects uses a capped face preference: it only breaks near-quality ties.
export function portraitQuality(group) {
  const faces = group.analysis?.portrait?.faces ?? [];
  if (!usablePortrait(group)) return null;
  return {
    sharpness: Math.min(...faces.map((f) => f.sharpness)),
    eyesOpen: faces.every((f) => f.eyesOpen != null)
      ? Math.min(...faces.map((f) => f.eyesOpen))
      : null,
  };
}
export function portraitPreference(a, b, scale = null) {
  const x = portraitQuality(a),
    y = portraitQuality(b);
  if (!x || !y) return 0;
  const normalizer = scale ?? Math.max(x.sharpness, y.sharpness, 1e-6);
  const score = (q, g) =>
    q.sharpness / normalizer -
    (q.eyesOpen != null && q.eyesOpen < 0.35
      ? g.analysis.portrait.faces.length >= 3
        ? 0.045
        : 0.03
      : 0);
  return score(y, b) - score(x, a);
}
