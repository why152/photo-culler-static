const DATABASE_NAME = "photo-culler-local";
const DATABASE_VERSION = 1;
const WORKSPACE_STORE = "workspace";
const ANALYSIS_STORE = "analysis";
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

export class BrowserReviewStore {
  constructor() {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WORKSPACE_STORE))
          database.createObjectStore(WORKSPACE_STORE);
        if (!database.objectStoreNames.contains(ANALYSIS_STORE))
          database.createObjectStore(ANALYSIS_STORE);
      });
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
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
    return await this.read(ANALYSIS_STORE, fileKey(file));
  }

  async saveAnalysis(file, analysis) {
    await this.write(ANALYSIS_STORE, fileKey(file), analysis);
  }
}
