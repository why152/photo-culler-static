import { imageDimensions } from "./image-dimensions.js";

function canceledPreview() {
  return new DOMException("预览已切换。", "AbortError");
}

// Keep the current full-size image plus at most two small neighboring images.
// Large camera files are shown progressively but never speculatively decoded.
export class ViewerPreviewCache {
  constructor({ imageFactory = () => new Image(), create = URL.createObjectURL,
    revoke = URL.revokeObjectURL, dimensions = imageDimensions,
    neighborPixelLimit = 8_000_000 } = {}) {
    Object.assign(this, { imageFactory, create, revoke, dimensions, neighborPixelLimit });
    this.entries = new Map();
    this.retained = new Set();
    this.generation = 0;
    this.warming = new Map();
  }

  retain(groups) {
    const retained = new Set(groups.filter(Boolean).slice(0, 3).map(({ id }) => id));
    if (retained.size === this.retained.size && [...retained].every((id) => this.retained.has(id))) return;
    this.retained = retained;
    this.generation += 1;
    for (const id of this.entries.keys()) {
      if (!this.retained.has(id)) this.release(id);
    }
  }

  load(group) {
    const existing = this.entries.get(group.id);
    if (existing?.file === group.analysisFile) return existing.promise;
    if (existing) this.release(group.id);
    // Standalone callers also receive the same hard resource bound.
    if (this.entries.size >= 3) this.release(this.entries.keys().next().value);
    const image = this.imageFactory();
    const url = this.create(group.analysisFile);
    const entry = { image, url, file: group.analysisFile, ready: false, reject: null };
    entry.promise = new Promise((resolve, reject) => {
      entry.reject = reject;
      image.onload = () => {
        entry.ready = true;
        image.onload = image.onerror = null;
        resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        reject(new Error(`无法加载 ${group.analysisFile.name} 的清晰大图。`));
        this.release(group.id);
      };
    });
    // A navigation can cancel preloading before a caller attaches a handler.
    void entry.promise.catch(() => {});
    this.entries.set(group.id, entry);
    image.src = url;
    return entry.promise;
  }

  warm(group) {
    if (!group || this.entries.has(group.id)) return Promise.resolve();
    const existing = this.warming.get(group.id);
    if (existing) return existing;
    const task = this.#warmGroup(group);
    this.warming.set(group.id, task);
    void task.finally(() => {
      if (this.warming.get(group.id) === task) this.warming.delete(group.id);
    }).catch(() => {});
    return task;
  }

  async #warmGroup(group) {
    try {
      const generation = this.generation;
      const dimensions = await this.dimensions(group.analysisFile);
      if (generation !== this.generation || !this.retained.has(group.id)) return;
      if (!dimensions || dimensions.width * dimensions.height > this.neighborPixelLimit) return;
      await this.load(group);
    } catch { /* Speculative metadata and decode failures never affect review. */ }
  }

  release(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    entry.image.onload = entry.image.onerror = null;
    entry.image.removeAttribute?.("src");
    entry.reject(canceledPreview());
    this.revoke(entry.url);
  }

  clear() {
    this.generation += 1;
    this.retained.clear();
    this.warming.clear();
    for (const id of this.entries.keys()) this.release(id);
  }
}
