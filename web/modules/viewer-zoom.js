export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.25;

function clamp(value, min, max) {
  const result = Math.min(max, Math.max(min, value));
  return result === 0 ? 0 : result;
}

export function containGeometry(frameWidth, frameHeight, naturalWidth, naturalHeight) {
  const scale = Math.min(
    frameWidth / naturalWidth,
    frameHeight / naturalHeight,
  );
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    scale,
    width,
    height,
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
  };
}

export class ViewerZoom {
  constructor({ minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM, step = ZOOM_STEP } = {}) {
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.step = step;
    this.frameWidth = 0;
    this.frameHeight = 0;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.contentX = 0;
    this.contentY = 0;
    this.contentWidth = 0;
    this.contentHeight = 0;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  hasImage() {
    return (
      this.frameWidth > 0 &&
      this.frameHeight > 0 &&
      this.naturalWidth > 0 &&
      this.naturalHeight > 0
    );
  }

  setImage(frameWidth, frameHeight, naturalWidth, naturalHeight) {
    const geometry = containGeometry(
      frameWidth,
      frameHeight,
      naturalWidth,
      naturalHeight,
    );
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.naturalWidth = naturalWidth;
    this.naturalHeight = naturalHeight;
    this.contentX = geometry.x;
    this.contentY = geometry.y;
    this.contentWidth = geometry.width;
    this.contentHeight = geometry.height;
    this.reset();
  }

  get zoomFactor() {
    return this.zoom;
  }

  get isZoomed() {
    return this.zoom > 1 + 1e-6;
  }

  zoomAt(frameX, frameY, factor) {
    if (!this.hasImage()) return;
    const nextZoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    if (nextZoom === this.zoom) return;
    const imageX = (frameX - this.contentX - this.offsetX) / this.zoom;
    const imageY = (frameY - this.contentY - this.offsetY) / this.zoom;
    this.zoom = nextZoom;
    this.offsetX = frameX - this.contentX - imageX * this.zoom;
    this.offsetY = frameY - this.contentY - imageY * this.zoom;
    this.clampOffsets();
  }

  framePointFor(imageX, imageY) {
    return {
      x: this.contentX + this.offsetX + imageX * this.zoom,
      y: this.contentY + this.offsetY + imageY * this.zoom,
    };
  }

  panBy(deltaX, deltaY) {
    if (!this.hasImage()) return;
    this.offsetX += deltaX;
    this.offsetY += deltaY;
    this.clampOffsets();
  }

  toggle(frameX, frameY) {
    if (!this.hasImage()) return;
    if (this.isZoomed) this.reset();
    else this.zoomAt(frameX, frameY, 2);
  }

  applyTo(style) {
    style.transformOrigin = "0 0";
    style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
  }

  reset() {
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  clampOffsets() {
    const width = this.contentWidth * this.zoom;
    const height = this.contentHeight * this.zoom;
    if (width >= this.frameWidth) {
      this.offsetX = clamp(
        this.offsetX,
        this.frameWidth - width - this.contentX,
        -this.contentX,
      );
    } else {
      this.offsetX = (this.frameWidth - width) / 2 - this.contentX;
    }
    if (height >= this.frameHeight) {
      this.offsetY = clamp(
        this.offsetY,
        this.frameHeight - height - this.contentY,
        -this.contentY,
      );
    } else {
      this.offsetY = (this.frameHeight - height) / 2 - this.contentY;
    }
  }
}
