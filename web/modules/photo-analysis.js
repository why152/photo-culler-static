function workerError(event) {
  return event.error instanceof Error
    ? event.error
    : new Error(event.message || "浏览器图像分析失败。");
}

export class BrowserPhotoAnalyzer {
  constructor({
    cache,
    workerFactory = () =>
      new Worker(new URL("./photo-analysis-worker.js", import.meta.url), {
        type: "module",
      }),
  } = {}) {
    this.cache = cache;
    this.worker = workerFactory();
    this.nextMessageId = 0;
    this.pending = new Map();
    this.worker.addEventListener("message", (event) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      pending.resolve(event.data.result);
    });
    this.worker.addEventListener("error", (event) => {
      const error = workerError(event);
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
    });
  }

  async analyze(
    photoGroups,
    { onProgress = () => {}, onResult = () => {} } = {},
  ) {
    const analyzed = [];
    for (const [index, group] of photoGroups.entries()) {
      const cached = await this.cache?.loadAnalysis(group.analysisFile);
      const analysis = cached ?? (await this.analyzeFile(group.analysisFile));
      if (!cached) await this.cache?.saveAnalysis(group.analysisFile, analysis);
      const analyzedGroup = { ...group, analysis };
      analyzed.push(analyzedGroup);
      onProgress(index + 1, photoGroups.length);
      onResult(analyzedGroup, index + 1, photoGroups.length);
    }
    return analyzed;
  }

  analyzeFile(file) {
    const id = ++this.nextMessageId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, file });
    });
  }

  close() {
    this.worker.terminate();
    this.pending.forEach(({ reject }) => reject(new Error("图像分析已停止。")));
    this.pending.clear();
  }
}
