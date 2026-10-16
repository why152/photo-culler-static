import { PHOTO_ANALYSIS_VERSION } from "./photo-analysis-version.js";

const DATABASE_NAME = "photo-culler-local";
const DATABASE_VERSION = 3;
const WORKSPACE_STORE = "workspace";
const ANALYSIS_STORE = "analysis";
const DIRECTORY_IDENTITIES_STORE = "directory-identities";
const SCOPED_ANALYSIS_CACHE_VERSION = 2;
const identityQueues = new Map();
const ANALYSIS_CACHED_AT_INDEX = "cached-at";
const DEFAULT_ANALYSIS_CACHE_LIMIT = 2_000;
const LAST_DIRECTORY_KEY = "last-directory";

function fileKey(directoryId, algorithmVersion, file) {
  return JSON.stringify([directoryId, algorithmVersion, file.name, file.size, file.lastModified]);
}

function serializeIdentity(databaseName, callback) {
  const previous = identityQueues.get(databaseName) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(() => {
    if (globalThis.navigator?.locks?.request)
      return navigator.locks.request(`photo-culler-cache-identity:${databaseName}`, callback);
    return callback();
  });
  identityQueues.set(databaseName, result);
  void result.finally(() => {
    if (identityQueues.get(databaseName) === result) identityQueues.delete(databaseName);
  }).catch(() => {});
  return result;
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
    value?.cacheVersion === SCOPED_ANALYSIS_CACHE_VERSION &&
    typeof value.directoryId === "string" &&
    typeof value.algorithmVersion === "string" &&
    Number.isFinite(value.cachedAt) &&
    Object.hasOwn(value, "analysis")
  );
}

function migrateAnalysisStore(store) {
  if (!store.indexNames.contains(ANALYSIS_CACHED_AT_INDEX))
    store.createIndex(ANALYSIS_CACHED_AT_INDEX, "cachedAt");
  // Old entries have no trustworthy directory identity or algorithm version.
  // Recompute only analysis; workspace decisions and directory handles survive.
  store.clear();
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
    this.databaseName = databaseName;
    this.directoryIds = new WeakMap();
    this.directoryIdentityLimit = analysisCacheLimit + 32;
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
        if (!database.objectStoreNames.contains(DIRECTORY_IDENTITIES_STORE))
          database.createObjectStore(DIRECTORY_IDENTITIES_STORE);
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

  async #directoryId(directory) {
    if (directory?.kind !== "directory" || typeof directory.isSameEntry !== "function")
      throw new Error("图像分析缓存需要有效的照片文件夹身份。");
    let identity = this.directoryIds.get(directory);
    if (!identity) {
      identity = serializeIdentity(this.databaseName, async () => {
        const database = await this.database;
        const transaction = database.transaction(DIRECTORY_IDENTITIES_STORE, "readonly");
        const done = transactionDone(transaction);
        const entries = await requestAsPromise(transaction.objectStore(DIRECTORY_IDENTITIES_STORE).getAll());
        await done;
        // isSameEntry may await browser IPC: never keep an IDB transaction open.
        for (const entry of entries) {
          try {
            if (await entry.directory.isSameEntry(directory)) return entry.id;
          } catch (error) {
            if (error?.name !== "NotFoundError") throw error;
            const removal = database.transaction(DIRECTORY_IDENTITIES_STORE, "readwrite");
            const removed = transactionDone(removal);
            removal.objectStore(DIRECTORY_IDENTITIES_STORE).delete(entry.id);
            await removed;
          }
        }
        const id = crypto.randomUUID();
        const identity = { id, directory, createdAt: Date.now() };
        await this.write(DIRECTORY_IDENTITIES_STORE, id, identity);
        if (entries.length >= this.directoryIdentityLimit)
          await this.#pruneDirectoryIdentities(id);
        return id;
      });
      this.directoryIds.set(directory, identity);
      void identity.catch(() => {
        if (this.directoryIds.get(directory) === identity) this.directoryIds.delete(directory);
      });
    }
    return identity;
  }

  async #pruneDirectoryIdentities(retainedId) {
    const database = await this.database;
    const transaction = database.transaction([DIRECTORY_IDENTITIES_STORE, ANALYSIS_STORE], "readwrite");
    const done = transactionDone(transaction);
    const identities = transaction.objectStore(DIRECTORY_IDENTITIES_STORE);
    const entriesRequest = requestAsPromise(identities.getAll());
    const keysRequest = requestAsPromise(transaction.objectStore(ANALYSIS_STORE).getAllKeys());
    const [entries, keys] = await Promise.all([entriesRequest, keysRequest]);
    const cachedIds = new Set(keys.map((key) => JSON.parse(key)[0]));
    let excess = entries.length - this.directoryIdentityLimit;
    for (const entry of entries.sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))) {
      if (excess <= 0) break;
      // Keep every cached namespace and the scope being resolved. Pruning an
      // old orphan only causes a cache miss if that directory is opened again.
      if (entry.id === retainedId || cachedIds.has(entry.id)) continue;
      identities.delete(entry.id);
      excess -= 1;
    }
    await done;
  }

  async analysisScope(directory, { algorithmVersion = PHOTO_ANALYSIS_VERSION } = {}) {
    if (typeof algorithmVersion !== "string" || !algorithmVersion)
      throw new Error("图像分析缓存需要有效的算法版本。");
    const directoryId = await this.#directoryId(directory);
    return {
      loadAnalysis: (file) => this.#loadScopedAnalysis(file, directoryId, algorithmVersion),
      saveAnalysis: (file, analysis) => this.#saveScopedAnalysis(file, analysis, directoryId, algorithmVersion),
    };
  }

  // Unscoped callers cannot prove a file belongs to the cached directory.
  async loadAnalysis(file, { directory, algorithmVersion } = {}) {
    if (!directory) return null;
    return (await this.analysisScope(directory, { algorithmVersion })).loadAnalysis(file);
  }

  async saveAnalysis(file, analysis, { directory, algorithmVersion } = {}) {
    if (!directory) return;
    return (await this.analysisScope(directory, { algorithmVersion })).saveAnalysis(file, analysis);
  }

  async #loadScopedAnalysis(file, directoryId, algorithmVersion) {
    const cached = await this.read(ANALYSIS_STORE, fileKey(directoryId, algorithmVersion, file));
    return isAnalysisCacheRecord(cached) && cached.directoryId === directoryId &&
      cached.algorithmVersion === algorithmVersion ? cached.analysis : null;
  }

  async #saveScopedAnalysis(file, analysis, directoryId, algorithmVersion) {
    const database = await this.database;
    const transaction = database.transaction(ANALYSIS_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ANALYSIS_STORE);
    this.lastCachedAt = Math.max(Date.now(), this.lastCachedAt + 1);
    store.put(
      {
        cacheVersion: SCOPED_ANALYSIS_CACHE_VERSION,
        directoryId,
        algorithmVersion,
        cachedAt: this.lastCachedAt,
        analysis,
      },
      fileKey(directoryId, algorithmVersion, file),
    );
    const count = await requestAsPromise(store.count());
    await deleteOldestAnalysisRecords(store, count - this.analysisCacheLimit);
    await done;
  }

  async close() {
    const database = await this.database;
    database.close();
  }
}
