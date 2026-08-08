function workerError(event) {
  return event.error instanceof Error
    ? event.error
    : new Error(event.message || "浏览器图像分析失败。");
}

function abortError(reason) {
  if (reason?.name === "AbortError") return reason;
  const error = new Error(
    typeof reason === "string" ? reason : "图像分析已取消。",
  );
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal.reason);
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
    this.workerFactory = workerFactory;
    this.worker = null;
    this.nextMessageId = 0;
    this.pending = new Map();
    this.activeAnalysisController = null;
    this.closed = false;
    this.startWorker();
  }

  startWorker() {
    const worker = this.workerFactory();
    this.worker = worker;
    worker.addEventListener("message", (event) => {
      if (this.worker !== worker) return;
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      pending.resolve(event.data.result);
    });
    worker.addEventListener("error", (event) => {
      if (this.worker !== worker) return;
      this.replaceWorker(workerError(event));
    });
  }

  replaceWorker(error) {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    if (!this.closed) this.startWorker();
  }

  async analyze(
    photoGroups,
    { onProgress = () => {}, onResult = () => {}, signal } = {},
  ) {
    if (this.closed) throw new Error("图像分析器已关闭。");
    this.activeAnalysisController?.abort(abortError());
    const controller = new AbortController();
    this.activeAnalysisController = controller;
    const stopWorker = () => this.replaceWorker(abortError(controller.signal.reason));
    const forwardAbort = () => controller.abort(signal?.reason);
    controller.signal.addEventListener("abort", stopWorker, { once: true });
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener("abort", forwardAbort, { once: true });

    try {
      const analyzed = [];
      for (const [index, group] of photoGroups.entries()) {
        throwIfAborted(controller.signal);
        const cached = await this.cache?.loadAnalysis(group.analysisFile);
        throwIfAborted(controller.signal);
        const analysis =
          cached ?? (await this.analyzeFile(group.analysisFile));
        throwIfAborted(controller.signal);
        if (!cached)
          await this.cache?.saveAnalysis(group.analysisFile, analysis);
        throwIfAborted(controller.signal);
        const analyzedGroup = { ...group, analysis };
        analyzed.push(analyzedGroup);
        onProgress(index + 1, photoGroups.length);
        onResult(analyzedGroup, index + 1, photoGroups.length);
      }
      return analyzed;
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
      controller.signal.removeEventListener("abort", stopWorker);
      if (this.activeAnalysisController === controller)
        this.activeAnalysisController = null;
    }
  }

  analyzeFile(file) {
    if (!this.worker) return Promise.reject(new Error("图像分析器不可用。"));
    const id = ++this.nextMessageId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, file });
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.activeAnalysisController?.abort(abortError("图像分析已停止。"));
    this.activeAnalysisController = null;
    if (this.worker)
      this.replaceWorker(abortError("图像分析已停止。"));
  }
}
