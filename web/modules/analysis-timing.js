// Diagnostics are opt-in and contain only elapsed stages, never file names,
// pixels, directory handles or image content.
export class AnalysisTiming {
  constructor(enabled = false, now = () => performance.now()) {
    this.enabled = enabled;
    this.now = now;
    this.stages = {};
    this.started = enabled ? now() : 0;
  }

  measure(name, action) {
    if (!this.enabled) return action();
    const start = this.now();
    try { return action(); }
    finally { this.stages[name] = (this.stages[name] ?? 0) + this.now() - start; }
  }

  async measureAsync(name, action) {
    if (!this.enabled) return action();
    const start = this.now();
    try { return await action(); }
    finally { this.stages[name] = (this.stages[name] ?? 0) + this.now() - start; }
  }

  finish() {
    if (!this.enabled) return null;
    return { ...this.stages, total: this.now() - this.started };
  }
}
