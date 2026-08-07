import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  ViewerZoom,
  containGeometry,
} from "../modules/viewer-zoom.js";

test("contain geometry fits a wide photo inside a shorter frame", () => {
  assert.deepEqual(containGeometry(1200, 800, 2400, 1200), {
    scale: 0.5,
    width: 1200,
    height: 600,
    x: 0,
    y: 100,
  });
});

test("zoomAt keeps the image point under the cursor anchored", () => {
  const zoom = new ViewerZoom();
  zoom.setImage(1200, 800, 2400, 1200);

  const anchored = zoom.framePointFor(300, 200);
  zoom.zoomAt(300, 300, 2);

  assert.equal(zoom.zoomFactor, 2);
  assert.deepEqual(zoom.framePointFor(300, 200), anchored);
  assert.equal(zoom.offsetX, -300);
  assert.equal(zoom.offsetY, -200);
});

test("panBy clamps a zoomed image so it keeps covering the frame", () => {
  const zoom = new ViewerZoom();
  zoom.setImage(1200, 800, 2400, 1200);
  zoom.zoomAt(300, 300, 2);

  zoom.panBy(5000, 5000);
  assert.equal(zoom.offsetX, 0);
  assert.equal(zoom.offsetY, -100);

  zoom.panBy(-5000, -5000);
  assert.equal(zoom.offsetX, -1200);
  assert.equal(zoom.offsetY, -500);
});

test("a zoomed portrait image stays centered on the narrower frame axis", () => {
  const zoom = new ViewerZoom();
  zoom.setImage(1200, 800, 800, 1600);

  zoom.zoomAt(600, 400, 2);

  assert.equal(zoom.zoomFactor, 2);
  assert.equal(zoom.offsetX, -200);
  assert.equal(zoom.offsetY, -400);
});

test("reset returns to the fit zoom with centered offsets", () => {
  const zoom = new ViewerZoom();
  zoom.setImage(1200, 800, 2400, 1200);
  zoom.zoomAt(300, 300, 2);

  zoom.reset();

  assert.equal(zoom.zoomFactor, 1);
  assert.equal(zoom.offsetX, 0);
  assert.equal(zoom.offsetY, 0);
  assert.equal(zoom.isZoomed, false);
});

test("zoomAt respects the configured min and max bounds", () => {
  const zoom = new ViewerZoom();
  zoom.setImage(1200, 800, 2400, 1200);

  zoom.zoomAt(600, 400, 1_000);
  assert.equal(zoom.zoomFactor, MAX_ZOOM);

  zoom.zoomAt(600, 400, 1 / 1_000);
  assert.equal(zoom.zoomFactor, MIN_ZOOM);
});

test("toggle double-click zooms to 2x and returns to fit", () => {
  const zoom = new ViewerZoom();
  zoom.setImage(1200, 800, 2400, 1200);

  zoom.toggle(300, 300);
  assert.equal(zoom.zoomFactor, 2);
  assert.equal(zoom.isZoomed, true);

  zoom.toggle(300, 300);
  assert.equal(zoom.zoomFactor, 1);
  assert.equal(zoom.isZoomed, false);
});
