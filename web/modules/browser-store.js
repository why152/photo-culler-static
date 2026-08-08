const DATABASE_NAME = "photo-culler-local";
const DATABASE_VERSION = 2;
const WORKSPACE_STORE = "workspace";
const ANALYSIS_STORE = "analysis";
const ANALYSIS_CACHED_AT_INDEX = "cached-at";
const DEFAULT_ANALYSIS_CACHE_LIMIT = 2_000;
const LAST_DIRECTORY_KEY = "last-directory";

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("浏览器本地存储操作失败。")),
      { once: true },
    );
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener(
      "abort",
      () =>
        reject(transaction.error ?? new Error("浏览器本地存储操作被中止。")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("浏览器本地存储操作失败。")),
      { once: true },
    );
  });
}

function isAnalysisCacheRecord(value) {
  return (
    value?.cacheVersion === 1 &&
    Number.isFinite(value.cachedAt) &&
    Object.hasOwn(value, "analysis")
  );
}

function migrateAnalysisStore(store) {
  if (!store.indexNames.contains(ANALYSIS_CACHED_AT_INDEX))
    store.createIndex(ANALYSIS_CACHED_AT_INDEX, "cachedAt");
  let legacyCachedAt = 0;
  const request = store.openCursor();
  request.addEventListener("success", () => {
    const cursor = request.result;
    if (!cursor) return;
    if (!isAnalysisCacheRecord(cursor.value))
      cursor.update({
        cacheVersion: 1,
        cachedAt: legacyCachedAt++,
        analysis: cursor.value,
      });
    cursor.continue();
  });
}

function deleteOldestAnalysisRecords(store, count) {
  if (count <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let remaining = count;
    const request = store
      .index(ANALYSIS_CACHED_AT_INDEX)
      .openCursor();
    request.addEventListener("success", () => {
      const cursor = request.result;
      if (!cursor || remaining <= 0) {
        resolve();
        return;
      }
      cursor.delete();
      remaining -= 1;
      cursor.continue();
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("无法清理旧的图像分析缓存。")),
      { once: true },
    );
  });
}

export class BrowserReviewStore {
  constructor({
    databaseName = DATABASE_NAME,
    analysisCacheLimit = DEFAULT_ANALYSIS_CACHE_LIMIT,
  } = {}) {
    if (!Number.isInteger(analysisCacheLimit) || analysisCacheLimit < 1)
      throw new Error("图像分析缓存上限必须是正整数。");
    this.analysisCacheLimit = analysisCacheLimit;
    this.lastCachedAt = 0;
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WORKSPACE_STORE))
          database.createObjectStore(WORKSPACE_STORE);
        const analysisStore = database.objectStoreNames.contains(ANALYSIS_STORE)
          ? request.transaction.objectStore(ANALYSIS_STORE)
          : database.createObjectStore(ANALYSIS_STORE);
        migrateAnalysisStore(analysisStore);
      });
      request.addEventListener(
        "success",
        () => {
          const database = request.result;
          database.addEventListener("versionchange", () => database.close(), {
            once: true,
          });
          resolve(database);
        },
        { once: true },
      );
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("无法打开浏览器本地存储。")),
        { once: true },
      );
    });
  }

  async read(storeName, key) {
    const database = await this.database;
    const transaction = database.transaction(storeName, "readonly");
    const value = await requestAsPromise(
      transaction.objectStore(storeName).get(key),
    );
    await transactionDone(transaction);
    return value;
  }

  async write(storeName, key, value) {
    const database = await this.database;
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    await transactionDone(transaction);
  }

  async rememberDirectory(directory) {
    const existing = await this.read(WORKSPACE_STORE, LAST_DIRECTORY_KEY);
    const sameDirectory =
      existing?.directory &&
      typeof existing.directory.isSameEntry === "function"
        ? await existing.directory.isSameEntry(directory)
        : false;
    await this.write(WORKSPACE_STORE, LAST_DIRECTORY_KEY, {
      directory,
      review: sameDirectory ? existing.review : null,
    });
  }

  async loadLastDirectory() {
    return (
      (await this.read(WORKSPACE_STORE, LAST_DIRECTORY_KEY))?.directory ?? null
    );
  }

  async load(directory) {
    const existing = await this.read(WORKSPACE_STORE, LAST_DIRECTORY_KEY);
    if (
      !existing?.directory ||
      typeof existing.directory.isSameEntry !== "function"
    )
      return null;
    return (await existing.directory.isSameEntry(directory))
      ? existing.review
      : null;
  }

  async save(directory, review) {
    const existing = await this.read(WORKSPACE_STORE, LAST_DIRECTORY_KEY);
    const sameDirectory =
      existing?.directory &&
      typeof existing.directory.isSameEntry === "function"
        ? await existing.directory.isSameEntry(directory)
        : false;
    await this.write(WORKSPACE_STORE, LAST_DIRECTORY_KEY, {
      directory: sameDirectory ? existing.directory : directory,
      review,
    });
  }

  async loadAnalysis(file) {
    const cached = await this.read(ANALYSIS_STORE, fileKey(file));
    return isAnalysisCacheRecord(cached) ? cached.analysis : cached;
  }

  async saveAnalysis(file, analysis) {
    const database = await this.database;
    const transaction = database.transaction(ANALYSIS_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ANALYSIS_STORE);
    this.lastCachedAt = Math.max(Date.now(), this.lastCachedAt + 1);
    store.put(
      {
        cacheVersion: 1,
        cachedAt: this.lastCachedAt,
        analysis,
      },
      fileKey(file),
    );
    const count = await requestAsPromise(store.count());
    await deleteOldestAnalysisRecords(
      store,
      count - this.analysisCacheLimit,
    );
    await done;
  }

  async close() {
    const database = await this.database;
    database.close();
  }
}
