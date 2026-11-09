const ANALYSIS_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const PHOTO_MEMBER_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".rw2",
  ".xmp",
]);
const MEMBER_ORDER = new Map([
  [".jpg", 0],
  [".jpeg", 0],
  [".png", 1],
  [".webp", 2],
  [".rw2", 3],
  [".xmp", 4],
]);
export const REVIEW_BATCH_PREFIX = "_PhotoCull_Review_";
const MANIFEST_NAME = "move-manifest.json";
const REVIEW_DECISIONS = new Set(["pick", "keep", "reject"]);
const REVIEW_FILTERS = new Set(["all", "unreviewed", ...REVIEW_DECISIONS]);
const REVIEW_DENSITIES = new Set(["compact", "comfortable"]);

function abortError(reason) {
  if (reason?.name === "AbortError") return reason;
  const error = new Error(
    typeof reason === "string" ? reason : "目录分析已取消。",
  );
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal.aborted) throw abortError(signal.reason);
}

function extensionOf(name) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

function stemOf(name) {
  const index = name.lastIndexOf(".");
  return index < 0 ? name : name.slice(0, index);
}

function compareMembers(left, right) {
  const extensionOrder =
    MEMBER_ORDER.get(extensionOf(left.name)) ?? Number.MAX_SAFE_INTEGER;
  const otherExtensionOrder =
    MEMBER_ORDER.get(extensionOf(right.name)) ?? Number.MAX_SAFE_INTEGER;
  return (
    extensionOrder - otherExtensionOrder || left.name.localeCompare(right.name)
  );
}

function isOrdinarySourceDirectory(directory) {
  return (
    directory &&
    directory.kind === "directory" &&
    !directory.name.startsWith(REVIEW_BATCH_PREFIX)
  );
}

function normalizeReview(review, photoGroups) {
  const validIds = new Set(photoGroups.map((group) => group.id));
  const rawDecisions =
    review?.decisions && typeof review.decisions === "object"
      ? review.decisions
      : {};
  const decisions = Object.fromEntries(
    Object.entries(rawDecisions).filter(
      ([id, decision]) => validIds.has(id) && REVIEW_DECISIONS.has(decision),
    ),
  );
  const candidates = Array.isArray(review?.candidates)
    ? [...new Set(review.candidates.filter((id) => validIds.has(id)))].slice(
        0,
        4,
      )
    : [];
  const marked = Array.isArray(review?.marked)
    ? [...new Set(review.marked.filter((id) => validIds.has(id)))]
    : [];
  return {
    decisions,
    selectedId: validIds.has(review?.selectedId) ? review.selectedId : null,
    scrollY: Number.isFinite(review?.scrollY) && review.scrollY >= 0 ? review.scrollY : 0,
    viewerOpen: validIds.has(review?.selectedId) && review?.viewerOpen === true,
    candidates,
    marked,
    filter: REVIEW_FILTERS.has(review?.filter) ? review.filter : "all",
    density: REVIEW_DENSITIES.has(review?.density) ? review.density : "compact",
  };
}

async function writeJournal(directory, journal) {
  const handle = await directory.getFileHandle(MANIFEST_NAME, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(journal, null, 2));
  await writable.close();
}

async function markInterrupted(directory, journal, error) {
  journal.status = "interrupted";
  try {
    await writeJournal(directory, journal);
  } catch (journalError) {
    // Preserve the failure that stopped movement; the earlier journal still
    // lets recovery inspect the actual locations of every member.
    try {
      if (error && typeof error === "object") error.journalError = journalError;
    } catch {
      // A frozen or otherwise non-extensible primary error must still win.
    }
  }
}

async function readJournal(directory) {
  const handle = await directory.getFileHandle(MANIFEST_NAME);
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}

async function getFileOrNull(directory, name) {
  try {
    return await directory.getFileHandle(name);
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

async function getDirectoryOrNull(directory, name) {
  try {
    return await directory.getDirectoryHandle(name);
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

function validJournal(journal) {
  return (
    journal?.version === 1 &&
    ["moving", "completed", "interrupted"].includes(journal.status) &&
    Array.isArray(journal.records) &&
    journal.records.every(
      (record) =>
        typeof record?.source === "string" &&
        typeof record.destination === "string" &&
        typeof record.groupId === "string",
    )
  );
}

async function discoverMovedBatches(sourceDirectory) {
  const movedBatches = [];
  for await (const handle of sourceDirectory.values()) {
    if (
      handle.kind !== "directory" ||
      !handle.name.startsWith(REVIEW_BATCH_PREFIX)
    )
      continue;
    try {
      const journal = await readJournal(handle);
      if (!validJournal(journal)) continue;
      movedBatches.push({
        id: handle.name,
        directory: handle,
        journal,
        photoGroups: await scanPhotoGroups(handle),
      });
    } catch (error) {
      // Missing or malformed journals are not recoverable review batches.
      if (error?.name !== "NotFoundError" && error?.name !== "SyntaxError")
        throw error;
    }
  }
  return movedBatches.sort((left, right) => right.id.localeCompare(left.id));
}

function movementError(message) {
  return new Error(`无法安全地移动照片：${message}`);
}

function pendingAnalysis() {
  return {
    status: "review",
    sharpness: 0,
    exposureScore: 0,
    technicalScore: 0,
    reasons: ["正在分析照片；请先进行人工审核。"],
    thumbnail: null,
  };
}

function withPendingAnalysis(photoGroups) {
  return photoGroups.map((group) => ({
    ...group,
    analysis: pendingAnalysis(),
  }));
}

function restoreProgress(actions, index, groupCount) {
  return {
    filesDone: index + 1,
    fileCount: actions.length,
    groupsDone: new Set(
      actions.slice(0, index + 1).map(({ record }) => record.groupId),
    ).size,
    groupCount,
  };
}

async function prepareRestoreActions(sourceDirectory, batchDirectory, records) {
  const actions = [];
  for (const record of records) {
    const source = await getFileOrNull(sourceDirectory, record.source);
    const destination = await getFileOrNull(batchDirectory, record.destination);
    if (source && destination)
      throw movementError(`源目录已存在 ${record.source}，拒绝覆盖。`);
    if (!source && !destination)
      throw movementError(`无法找到 ${record.source} 或其 可恢复批次 成员。`);
    if (!source && destination) actions.push({ record, destination });
    record.state = source ? "restored" : "moved";
  }
  return actions;
}

async function restoreActions({
  actions,
  journal,
  batchDirectory,
  sourceDirectory,
  groupCount,
  onProgress,
}) {
  const reverseActions = [...actions].reverse();
  try {
    for (const [index, { record, destination }] of reverseActions.entries()) {
      await destination.move(sourceDirectory, record.source);
      record.state = "restored";
      journal.status = "completed";
      await writeJournal(batchDirectory, journal);
      onProgress(restoreProgress(reverseActions, index, groupCount));
    }
  } catch (error) {
    await markInterrupted(batchDirectory, journal, error);
    throw error;
  }
}

export async function scanPhotoGroups(directory) {
  const membersByStem = new Map();
  for await (const handle of directory.values()) {
    if (handle.kind !== "file") continue;
    const extension = extensionOf(handle.name);
    if (!PHOTO_MEMBER_EXTENSIONS.has(extension)) continue;
    const stem = stemOf(handle.name);
    const members = membersByStem.get(stem) ?? [];
    members.push(handle);
    membersByStem.set(stem, members);
  }

  const groups = [];
  for (const [stem, unsortedMembers] of [...membersByStem.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const members = unsortedMembers.sort(compareMembers);
    const analysisHandle = members.find((member) =>
      ANALYSIS_EXTENSIONS.has(extensionOf(member.name)),
    );
    if (!analysisHandle) continue;
    groups.push({
      id: `photo-group:${stem}`,
      stem,
      members,
      analysisHandle,
      hasRaw: members.some((member) => extensionOf(member.name) === ".rw2"),
    });
  }
  // File metadata crosses the browser filesystem boundary. Bound outstanding
  // reads while keeping the sorted photo-group order independent of completion.
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, async () => {
    while (!failed && next < groups.length) {
      const group = groups[next++];
      try {
        group.analysisFile = await group.analysisHandle.getFile();
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
  return groups;
}

export class ReviewWorkspace {
  constructor({
    pickDirectory = () =>
      window.showDirectoryPicker({
        mode: "read",
        id: "photo-culler-source",
      }),
    reviewStore = { load: async () => null, save: async () => {} },
    analyzer = async (photoGroups) => photoGroups,
    batchNameFactory = () =>
      `${REVIEW_BATCH_PREFIX}${new Date().toISOString().replace(/[-:.TZ]/g, "")}_${crypto.randomUUID().slice(0, 6)}`,
  } = {}) {
    this.pickDirectory = pickDirectory;
    this.reviewStore = reviewStore;
    this.analyzer = analyzer;
    this.batchNameFactory = batchNameFactory;
    this.current = null;
    this.analysisController = null;
    this.activeOperation = null;
  }

  #photoGroupIndices = new WeakMap();
  #completedAnalysis = new WeakMap();

  #indexPhotoGroups(current) {
    if (!this.#completedAnalysis.has(current)) this.#completedAnalysis.set(current, new Set());
    this.#photoGroupIndices.set(current, new Map(
      current.photoGroups.map((group) => [group.id, group]),
    ));
  }

  getPhotoGroup(photoGroupId, current = this.current) {
    return current ? this.#photoGroupIndices.get(current)?.get(photoGroupId) ?? null : null;
  }

  #applyAnalysis(current, analyzedGroup) {
    const indexed = this.#photoGroupIndices.get(current)?.get(analyzedGroup.id);
    if (!indexed) return false;
    // Preserve group identity for cached gallery queues and thumbnail handlers.
    // Membership changes rebuild this index; stale moved IDs are never added.
    Object.assign(indexed, analyzedGroup);
    this.#completedAnalysis.get(current).add(analyzedGroup.id);
    return true;
  }

  #applyPreview(current, previewGroup) {
    const group = this.getPhotoGroup(previewGroup.id, current);
    if (!group || this.current !== current || this.#completedAnalysis.get(current)?.has(group.id)) return false;
    group.analysis = { ...group.analysis, status: "pending", thumbnail: previewGroup.analysis.thumbnail };
    return true;
  }

  prepareMovePhotoGroups(photoGroupIds) {
    if (!this.current) throw new Error("请先选择一个照片文件夹。");
    if (this.activeOperation) throw movementError("请等待当前操作完成。");
    const ids = [...new Set(photoGroupIds)];
    const groups = ids.map((id) => this.getPhotoGroup(id));
    if (!groups.length || groups.some((group) => !group))
      throw movementError("请选择当前目录中的至少一个完整照片组。");
    const batchName = this.batchNameFactory();
    if (!batchName.startsWith(REVIEW_BATCH_PREFIX)) throw movementError("可恢复批次名称无效。");
    return { photoGroupIds: ids, batchName, groupCount: groups.length,
      fileCount: groups.reduce((count, group) => count + group.members.length, 0) };
  }

  async #withExclusiveOperation(operation, callback) {
    if (this.activeOperation) {
      throw new Error("正在打开目录、移动或恢复照片，请等待当前操作完成。");
    }
    this.activeOperation = operation;
    try {
      return await callback();
    } finally {
      this.activeOperation = null;
    }
  }

  async chooseDirectory(options = {}) {
    return this.#withExclusiveOperation("opening", async () => {
      const directory = await this.pickDirectory();
      return this.#openDirectoryContents(directory, options);
    });
  }

  async openDirectory(directory, options = {}) {
    return this.#withExclusiveOperation("opening", () =>
      this.#openDirectoryContents(directory, options),
    );
  }

  async #openDirectoryContents(directory, { onProgress, onAnalysis, onPreview, getPriority } = {}) {
    if (!isOrdinarySourceDirectory(directory)) {
      throw new Error("请选择一个有效的普通照片文件夹。");
    }
    this.analysisController?.abort(abortError());
    const analysisController = new AbortController();
    this.analysisController = analysisController;
    let nativeMoveVerified = false;
    try {
      const opfs = await globalThis.navigator?.storage?.getDirectory();
      nativeMoveVerified = !!opfs && ((await opfs.isSameEntry(directory)) || (await opfs.resolve(directory)) !== null);
    } catch { /* Real external movement remains disabled until platform acceptance. */ }
    const scannedPhotoGroups = await scanPhotoGroups(directory);
    throwIfAborted(analysisController.signal);
    const photoGroups = withPendingAnalysis(scannedPhotoGroups);
    const review = normalizeReview(
      await this.reviewStore.load(directory),
      photoGroups,
    );
    const movedBatches = await discoverMovedBatches(directory);
    const current = {
      directory,
      directoryName: directory.name,
      nativeMoveVerified,
      photoGroups,
      review,
      movedBatches,
    };
    await this.reviewStore.rememberDirectory?.(directory);
    throwIfAborted(analysisController.signal);
    this.current = current;
    this.#indexPhotoGroups(current);
    current.analysisPromise = Promise.resolve(
      this.analyzer(scannedPhotoGroups, {
        directory,
        getPriority,
        onPreview: (group, done, total) => {
          if (analysisController.signal.aborted || !this.#applyPreview(current, group)) return;
          onPreview?.(group, done, total);
          onAnalysis?.({ current, done, total, groupId: group.id, complete: false, preview: true });
        },
        signal: analysisController.signal,
        onProgress: (done, total) => {
          if (
            analysisController.signal.aborted ||
            this.current !== current
          )
            return;
          onProgress?.(done, total);
        },
        onResult: (analyzedGroup, done, total) => {
          if (
            analysisController.signal.aborted ||
            this.current !== current
          )
            return;
          if (!this.#applyAnalysis(current, analyzedGroup)) return;
          onAnalysis?.({
            current,
            done,
            total,
            complete: false,
            groupId: analyzedGroup.id,
          });
        },
      }),
    )
      .then((analyzedPhotoGroups) => {
        if (
          analysisController.signal.aborted ||
          this.current !== current
        )
          return current;
        for (const group of analyzedPhotoGroups) this.#applyAnalysis(current, group);
        onAnalysis?.({
          current,
          done: current.photoGroups.length,
          total: current.photoGroups.length,
          complete: true,
        });
        return current;
      })
      .catch((error) => {
        if (
          error?.name === "AbortError" ||
          analysisController.signal.aborted ||
          this.current !== current
        ) return current;
        if (this.current === current) {
          current.analysisError = error;
          onAnalysis?.({ current, error, complete: true });
        }
        return current;
      });
    return current;
  }

  async resumeLastDirectory(options = {}) {
    return this.#withExclusiveOperation("opening", async () => {
      const directory = await this.reviewStore.loadLastDirectory?.();
      if (!directory) throw new Error("没有可继续的上次照片文件夹。");
      if (typeof directory.requestPermission === "function") {
        const permission = await directory.requestPermission({ mode: "read" });
        if (permission !== "granted")
          throw new Error("需要重新授予该照片文件夹的读取权限。");
      }
      return this.#openDirectoryContents(directory, options);
    });
  }

  async saveReview(review, current = this.current, { apply = true } = {}) {
    if (!current) throw new Error("请先选择一个照片文件夹。");
    const snapshot = normalizeReview(review, current.photoGroups);
    if (apply) current.review = normalizeReview(snapshot, current.photoGroups);
    await this.reviewStore.save(current.directory, snapshot);
    return snapshot;
  }

  async movePhotoGroups(photoGroupIds, options = {}) {
    return this.#withExclusiveOperation("moving", () =>
      this.#movePhotoGroupsInWorkspace(photoGroupIds, options),
    );
  }

  async #movePhotoGroupsInWorkspace(photoGroupIds, { onProgress = () => {}, batchName: preparedBatchName } = {}) {
    const current = this.current;
    if (!current) throw new Error("请先选择一个照片文件夹。");
    const wanted = new Set(photoGroupIds);
    const groups = current.photoGroups.filter((group) =>
      wanted.has(group.id),
    );
    if (!groups.length || groups.length !== wanted.size)
      throw movementError("请选择当前目录中的至少一个完整 照片组。");
    if (
      groups.some((group) =>
        group.members.some((member) => typeof member.move !== "function"),
      )
    ) {
      throw movementError(
        "当前浏览器不支持本地文件移动。请使用最新版 macOS Chrome 或 Edge。",
      );
    }

    const batchName = preparedBatchName ?? this.batchNameFactory();
    if (!batchName.startsWith(REVIEW_BATCH_PREFIX))
      throw movementError("可恢复批次 名称无效。");
    if (await getDirectoryOrNull(current.directory, batchName))
      throw movementError("同名 可恢复批次 已存在，请重试。");
    const destination = await current.directory.getDirectoryHandle(
      batchName,
      { create: true },
    );
    const records = groups.flatMap((group) =>
      group.members.map((member) => ({
        groupId: group.id,
        source: member.name,
        destination: member.name,
        state: "pending",
      })),
    );
    const journal = {
      version: 1,
      createdAt: new Date().toISOString(),
      status: "moving",
      records,
    };
    await writeJournal(destination, journal);
    try {
      for (const [index, record] of records.entries()) {
        const source = await getFileOrNull(
          current.directory,
          record.source,
        );
        if (!source) throw movementError(`找不到源文件 ${record.source}。`);
        if (await getFileOrNull(destination, record.destination))
          throw movementError(`目标已存在 ${record.destination}。`);
        await source.move(destination, record.destination);
        record.state = "moved";
        await writeJournal(destination, journal);
        onProgress({
          filesDone: index + 1,
          fileCount: records.length,
          groupsDone: new Set(
            records.slice(0, index + 1).map((item) => item.groupId),
          ).size,
          groupCount: groups.length,
        });
      }
      journal.status = "completed";
      await writeJournal(destination, journal);
    } catch (error) {
      await markInterrupted(destination, journal, error);
      throw error;
    }

    const movedBatch = {
      id: batchName,
      directory: destination,
      journal,
      photoGroups: await scanPhotoGroups(destination),
    };
    current.photoGroups = current.photoGroups.filter(
      (group) => !wanted.has(group.id),
    );
    this.#indexPhotoGroups(current);
    current.review = normalizeReview(
      current.review,
      current.photoGroups,
    );
    current.movedBatches = [movedBatch, ...current.movedBatches];
    await this.saveReview(current.review, current, { apply: false });
    return {
      id: movedBatch.id,
      count: groups.length,
      fileCount: records.length,
      movedBatch,
    };
  }

  async restoreMovedBatch(batchId, options = {}) {
    return this.#withExclusiveOperation("restoring", () =>
      this.#restoreMovedBatchInWorkspace(batchId, options),
    );
  }

  async #restoreMovedBatchInWorkspace(batchId, { onProgress = () => {}, onPreview, getPriority } = {}) {
    const current = this.current;
    if (!current) throw new Error("请先选择一个照片文件夹。");
    const batch = current.movedBatches.find(
      (candidate) => candidate.id === batchId,
    );
    if (!batch)
      throw new Error("找不到可恢复的批次。请重新选择照片文件夹。");
    const journal = await readJournal(batch.directory);
    if (!validJournal(journal))
      throw new Error("可恢复批次 的 移动记录 无效。");

    const actions = await prepareRestoreActions(
      current.directory,
      batch.directory,
      journal.records,
    );
    await restoreActions({
      actions,
      journal,
      batchDirectory: batch.directory,
      sourceDirectory: current.directory,
      groupCount: new Set(journal.records.map((record) => record.groupId)).size,
      onProgress,
    });
    journal.status = "undone";
    await writeJournal(batch.directory, journal);
    await batch.directory.removeEntry(MANIFEST_NAME);
    await current.directory.removeEntry(batch.id);
    current.movedBatches = current.movedBatches.filter(
      (candidate) => candidate.id !== batchId,
    );
    this.analysisController?.abort(abortError());
    current.photoGroups = await this.analyzer(
      await scanPhotoGroups(current.directory),
      { directory: current.directory, getPriority, onPreview },
    );
    this.#indexPhotoGroups(current);
    current.review = normalizeReview(
      current.review,
      current.photoGroups,
    );
    await this.saveReview(current.review, current, { apply: false });
    return { restored: true, count: actions.length };
  }

  async restoreMovedPhotoGroup(batchId, photoGroupId, options = {}) {
    return this.#withExclusiveOperation("restoring", () =>
      this.#restoreMovedPhotoGroupInWorkspace(batchId, photoGroupId, options),
    );
  }

  async #restoreMovedPhotoGroupInWorkspace(
    batchId,
    photoGroupId,
    { onProgress = () => {}, onPreview, getPriority } = {},
  ) {
    const current = this.current;
    if (!current) throw new Error("请先选择一个照片文件夹。");
    const batch = current.movedBatches.find(
      (candidate) => candidate.id === batchId,
    );
    if (!batch)
      throw new Error("找不到可恢复的批次。请重新选择照片文件夹。");
    const journal = await readJournal(batch.directory);
    if (!validJournal(journal))
      throw new Error("可恢复批次 的 移动记录 无效。");
    const records = journal.records.filter(
      (record) => record.groupId === photoGroupId,
    );
    if (!records.length)
      throw new Error("该 照片组 不在指定的 可恢复批次 中。");

    const actions = await prepareRestoreActions(
      current.directory,
      batch.directory,
      records,
    );
    await restoreActions({
      actions,
      journal,
      batchDirectory: batch.directory,
      sourceDirectory: current.directory,
      groupCount: 1,
      onProgress,
    });

    const remainingPhotoGroups = await scanPhotoGroups(batch.directory);
    if (!remainingPhotoGroups.length) {
      journal.status = "undone";
      await writeJournal(batch.directory, journal);
      await batch.directory.removeEntry(MANIFEST_NAME);
      await current.directory.removeEntry(batch.id);
      current.movedBatches = current.movedBatches.filter(
        (candidate) => candidate.id !== batchId,
      );
    } else {
      journal.status = "completed";
      await writeJournal(batch.directory, journal);
      batch.journal = journal;
      batch.photoGroups = remainingPhotoGroups;
    }
    this.analysisController?.abort(abortError());
    current.photoGroups = await this.analyzer(
      await scanPhotoGroups(current.directory),
      { directory: current.directory, getPriority, onPreview },
    );
    this.#indexPhotoGroups(current);
    current.review = normalizeReview(
      current.review,
      current.photoGroups,
    );
    await this.saveReview(current.review, current, { apply: false });
    return { restored: true, remainingGroups: remainingPhotoGroups.length };
  }
}

export function browserCapabilities(scope = globalThis) {
  return {
    secureContext: scope.isSecureContext === true,
    directoryPicker: typeof scope.showDirectoryPicker === "function",
    directoryEnumeration:
      typeof scope.FileSystemDirectoryHandle?.prototype?.values === "function",
    fileWritable:
      typeof scope.FileSystemFileHandle?.prototype?.createWritable ===
      "function",
    fileMove: typeof scope.FileSystemFileHandle?.prototype?.move === "function",
  };
}
