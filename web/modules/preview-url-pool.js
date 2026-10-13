// Each view owns its own URLs, so removing a grid entry cannot invalidate a
// filmstrip preview of the same photo group.
export class PreviewUrlPool {
  constructor({ create = URL.createObjectURL, revoke = URL.revokeObjectURL } = {}) {
    this.create = create;
    this.revoke = revoke;
    this.entries = new Map();
  }

  matches(key, blob) {
    return this.entries.get(key)?.blob === blob;
  }

  urlFor(key, blob) {
    if (!blob) {
      this.release(key);
      return null;
    }
    const existing = this.entries.get(key);
    if (existing?.blob === blob) return existing.url;
    this.release(key);
    const url = this.create(blob);
    this.entries.set(key, { blob, url });
    return url;
  }

  release(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.revoke(entry.url);
  }

  retain(keys) {
    const retained = new Set(keys);
    for (const key of this.entries.keys()) {
      if (!retained.has(key)) this.release(key);
    }
  }

  clear() {
    for (const key of this.entries.keys()) this.release(key);
  }
}
