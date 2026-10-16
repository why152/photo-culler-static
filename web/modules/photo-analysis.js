import { AnalysisTiming } from "./analysis-timing.js";

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

async function waitUnlessAborted(promise, signal) {
  throwIfAborted(signal);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(abortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export class BrowserPhotoAnalyzer {
  constructor({
    cache,
    workerFactory = () =>
      new Worker(new URL("./photo-analysis-worker.js", import.meta.url), {
        type: "module",
      }),
    onDiagnostics = null,
    cacheWriteConcurrency = 2,
  } = {}) {
    this.cache = cache;
    this.workerFactory = workerFactory;
    this.onDiagnostics = onDiagnostics;
    if (!Number.isInteger(cacheWriteConcurrency) || cacheWriteConcurrency < 1)
      throw new Error("缓存写入并发数必须为正整数。");
    this.cacheWriteConcurrency = cacheWriteConcurrency;
    this.cacheWrites = new Set();
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
      if (event.data.type === "preview") {
        try { pending.onPreview?.(event.data.thumbnail); }
        catch (error) { this.pending.delete(event.data.id); pending.reject(error); }
        return;
      }
      this.pending.delete(event.data.id);
      pending.onTimings?.(event.data.timings);
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
    { onProgress = () => {}, onResult = () => {}, onPreview,
      getPriority = () => [], signal, directory } = {},
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
      let cache = this.cache;
      let scopeFailed = false;
      if (cache?.analysisScope) {
        try { cache = directory ? await waitUnlessAborted(cache.analysisScope(directory), controller.signal) : null; }
        catch { throwIfAborted(controller.signal); cache = null; scopeFailed = true; }
      }
      const analyzed = new Map();
      const remaining = new Map(photoGroups.map((group) => [group.id, group]));
      const runWrites = new Set();
      while (remaining.size) {
        throwIfAborted(controller.signal);
        if (this.cacheWrites.size >= this.cacheWriteConcurrency)
          await waitUnlessAborted(Promise.race(this.cacheWrites), controller.signal);
        throwIfAborted(controller.signal);
        let group;
        for (const id of getPriority() ?? []) {
          if (remaining.has(id)) { group = remaining.get(id); break; }
        }
        group ??= remaining.values().next().value;
        remaining.delete(group.id);
        const timing = new AnalysisTiming(Boolean(this.onDiagnostics));
        let workerTimings = null;
        const cacheErrors = scopeFailed ? ["scope"] : [];
        throwIfAborted(controller.signal);
        let cached = null;
        try { cached = await timing.measureAsync("cacheRead", () => cache?.loadAnalysis
          ? waitUnlessAborted(Promise.resolve(cache.loadAnalysis(group.analysisFile)), controller.signal) : undefined); }
        catch { throwIfAborted(controller.signal); cacheErrors.push("read"); }
        throwIfAborted(controller.signal);
        let previewThumbnail = null;
        const emitPreview = onPreview ? (thumbnail) => {
          if (!controller.signal.aborted && thumbnail) {
            previewThumbnail = thumbnail;
            onPreview({ ...group, analysis: {
              status: "pending", sharpness: 0, exposureScore: 0, technicalScore: 0,
              reasons: ["正在分析技术指标"], thumbnail,
            } }, analyzed.size, photoGroups.length);
          }
        } : undefined;
        if (cached) emitPreview?.(cached.thumbnail);
        let analysis = cached ?? (await this.analyzeFile(group.analysisFile,
          (stages) => { workerTimings = stages; }, emitPreview));
        // Worker messages clone Blob wrappers separately. Retain the preview
        // wrapper so final scores do not replace an otherwise identical image.
        if (previewThumbnail && analysis.thumbnail) analysis = { ...analysis, thumbnail: previewThumbnail };
        throwIfAborted(controller.signal);
        const analyzedGroup = { ...group, analysis };
        analyzed.set(group.id, analyzedGroup);
        onProgress(analyzed.size, photoGroups.length);
        onResult(analyzedGroup, analyzed.size, photoGroups.length);
        throwIfAborted(controller.signal);
        const report = () => {
          if (!controller.signal.aborted) this.reportDiagnostics({ cacheHit: Boolean(cached), cacheErrors, stages: {
            ...workerTimings, ...timing.finish(), workerTotal: workerTimings?.total ?? null,
          } });
        };
        if (!cached && cache?.saveAnalysis) {
          const write = (async () => {
            try { await timing.measureAsync("cacheWrite", () => cache.saveAnalysis(group.analysisFile, analysis)); }
            catch { cacheErrors.push("write"); }
            report();
          })();
          this.cacheWrites.add(write);
          runWrites.add(write);
          void write.then(() => { this.cacheWrites.delete(write); runWrites.delete(write); });
        } else report();
      }
      await waitUnlessAborted(Promise.all(runWrites), controller.signal);
      return photoGroups.map((group) => analyzed.get(group.id));
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
      controller.signal.removeEventListener("abort", stopWorker);
      if (this.activeAnalysisController === controller)
        this.activeAnalysisController = null;
    }
  }

  reportDiagnostics(record) {
    // A diagnostic observer must not interrupt local photo review.
    try { this.onDiagnostics?.(record); } catch { /* observer only */ }
  }

  analyzeFile(file, onTimings, onPreview) {
    if (!this.worker) return Promise.reject(new Error("图像分析器不可用。"));
    const id = ++this.nextMessageId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onTimings, onPreview });
      this.worker.postMessage({ id, file, diagnostics: Boolean(this.onDiagnostics), preview: Boolean(onPreview) });
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
