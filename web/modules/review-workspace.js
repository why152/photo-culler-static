const JPEG_EXTENSIONS = new Set([".jpg", ".jpeg"]);
const PHOTO_MEMBER_EXTENSIONS = new Set([".jpg", ".jpeg", ".rw2", ".xmp"]);
const MEMBER_ORDER = new Map([
  [".jpg", 0],
  [".jpeg", 0],
  [".rw2", 1],
  [".xmp", 2],
]);
export const REVIEW_BATCH_PREFIX = "_PhotoCull_Review_";
const MANIFEST_NAME = "move-manifest.json";
const REVIEW_DECISIONS = new Set(["pick", "keep", "reject"]);
const REVIEW_FILTERS = new Set(["all", "unreviewed", ...REVIEW_DECISIONS]);
const REVIEW_DENSITIES = new Set(["compact", "comfortable"]);

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

async function readJournal(directory) {
  const handle = await directory.getFileHandle(MANIFEST_NAME);
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}

async function getFileOrNull(directory, name) {
  try {
    return await directory.getFileHandle(name);
  } catch {
    return null;
  }
}

async function getDirectoryOrNull(directory, name) {
  try {
    return await directory.getDirectoryHandle(name);
  } catch {
    return null;
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
    } catch {
      // A directory without a valid journal is not a recoverable review batch.
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
    reasons: ["正在分析 JPEG；请先进行人工审核。"],
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
      throw movementError(`无法找到 ${record.source} 或其 review batch 成员。`);
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
  for (const [index, { record, destination }] of reverseActions.entries()) {
    await destination.move(sourceDirectory, record.source);
    record.state = "restored";
    journal.status = "completed";
    await writeJournal(batchDirectory, journal);
    onProgress(restoreProgress(reverseActions, index, groupCount));
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
      JPEG_EXTENSIONS.has(extensionOf(member.name)),
    );
    if (!analysisHandle) continue;
    groups.push({
      id: `photo-group:${stem}`,
      stem,
      members,
      analysisHandle,
      analysisFile: await analysisHandle.getFile(),
      hasRaw: members.some((member) => extensionOf(member.name) === ".rw2"),
    });
  }
  return groups;
}

export class ReviewWorkspace {
  constructor({
    pickDirectory = () =>
      window.showDirectoryPicker({
        mode: "readwrite",
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
  }

  async chooseDirectory({ onProgress, onAnalysis } = {}) {
    const directory = await this.pickDirectory();
    return this.openDirectory(directory, { onProgress, onAnalysis });
  }

  async openDirectory(directory, { onProgress, onAnalysis } = {}) {
    if (!isOrdinarySourceDirectory(directory)) {
      throw new Error("请选择一个有效的普通照片文件夹。");
    }
    const scannedPhotoGroups = await scanPhotoGroups(directory);
    const photoGroups = withPendingAnalysis(scannedPhotoGroups);
    const review = normalizeReview(
      await this.reviewStore.load(directory),
      photoGroups,
    );
    const movedBatches = await discoverMovedBatches(directory);
    const current = {
      directory,
      directoryName: directory.name,
      photoGroups,
      review,
      movedBatches,
    };
    this.current = current;
    await this.reviewStore.rememberDirectory?.(directory);
    current.analysisPromise = Promise.resolve(
      this.analyzer(scannedPhotoGroups, {
        onProgress,
        onResult: (analyzedGroup, done, total) => {
          if (this.current !== current) return;
          current.photoGroups = current.photoGroups.map((group) =>
            group.id === analyzedGroup.id ? analyzedGroup : group,
          );
          current.review = normalizeReview(current.review, current.photoGroups);
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
        if (this.current !== current) return current;
        const analysisById = new Map(
          analyzedPhotoGroups.map((group) => [group.id, group]),
        );
        current.photoGroups = current.photoGroups.map(
          (group) => analysisById.get(group.id) ?? group,
        );
        current.review = normalizeReview(current.review, current.photoGroups);
        onAnalysis?.({
          current,
          done: current.photoGroups.length,
          total: current.photoGroups.length,
          complete: true,
        });
        return current;
      })
      .catch((error) => {
        if (this.current === current) {
          current.analysisError = error;
          onAnalysis?.({ current, error, complete: true });
        }
        return current;
      });
    return current;
  }

  async resumeLastDirectory({ onProgress, onAnalysis } = {}) {
    const directory = await this.reviewStore.loadLastDirectory?.();
    if (!directory) throw new Error("没有可继续的上次照片文件夹。");
    if (typeof directory.requestPermission === "function") {
      const permission = await directory.requestPermission({
        mode: "readwrite",
      });
      if (permission !== "granted")
        throw new Error("需要重新授予该照片文件夹的读写权限。");
    }
    return this.openDirectory(directory, { onProgress, onAnalysis });
  }

  async saveReview(review) {
    if (!this.current) throw new Error("请先选择一个照片文件夹。");
    this.current.review = normalizeReview(review, this.current.photoGroups);
    await this.reviewStore.save(this.current.directory, this.current.review);
    return this.current.review;
  }

  async movePhotoGroups(photoGroupIds, { onProgress = () => {} } = {}) {
    if (!this.current) throw new Error("请先选择一个照片文件夹。");
    const wanted = new Set(photoGroupIds);
    const groups = this.current.photoGroups.filter((group) =>
      wanted.has(group.id),
    );
    if (!groups.length || groups.length !== wanted.size)
      throw movementError("请选择当前目录中的至少一个完整 photo group。");
    if (
      groups.some((group) =>
        group.members.some((member) => typeof member.move !== "function"),
      )
    ) {
      throw movementError(
        "当前浏览器不支持本地文件移动。请使用最新版 macOS Chrome 或 Edge。",
      );
    }

    const batchName = this.batchNameFactory();
    if (!batchName.startsWith(REVIEW_BATCH_PREFIX))
      throw movementError("review batch 名称无效。");
    if (await getDirectoryOrNull(this.current.directory, batchName))
      throw movementError("同名 review batch 已存在，请重试。");
    const destination = await this.current.directory.getDirectoryHandle(
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
          this.current.directory,
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
      journal.status = "interrupted";
      await writeJournal(destination, journal);
      throw error;
    }

    const movedBatch = {
      id: batchName,
      directory: destination,
      journal,
      photoGroups: await scanPhotoGroups(destination),
    };
    this.current.photoGroups = this.current.photoGroups.filter(
      (group) => !wanted.has(group.id),
    );
    this.current.review = normalizeReview(
      this.current.review,
      this.current.photoGroups,
    );
    await this.reviewStore.save(this.current.directory, this.current.review);
    this.current.movedBatches = [movedBatch, ...this.current.movedBatches];
    return {
      id: movedBatch.id,
      count: groups.length,
      fileCount: records.length,
      movedBatch,
    };
  }

  async restoreMovedBatch(batchId, { onProgress = () => {} } = {}) {
    if (!this.current) throw new Error("请先选择一个照片文件夹。");
    const batch = this.current.movedBatches.find(
      (candidate) => candidate.id === batchId,
    );
    if (!batch)
      throw new Error("找不到可恢复的 review batch。请重新选择照片文件夹。");
    const journal = await readJournal(batch.directory);
    if (!validJournal(journal))
      throw new Error("review batch 的 movement journal 无效。");

    const actions = await prepareRestoreActions(
      this.current.directory,
      batch.directory,
      journal.records,
    );
    await restoreActions({
      actions,
      journal,
      batchDirectory: batch.directory,
      sourceDirectory: this.current.directory,
      groupCount: new Set(journal.records.map((record) => record.groupId)).size,
      onProgress,
    });
    journal.status = "undone";
    await writeJournal(batch.directory, journal);
    await batch.directory.removeEntry(MANIFEST_NAME);
    await this.current.directory.removeEntry(batch.id);
    this.current.movedBatches = this.current.movedBatches.filter(
      (candidate) => candidate.id !== batchId,
    );
    this.current.photoGroups = await this.analyzer(
      await scanPhotoGroups(this.current.directory),
    );
    this.current.review = normalizeReview(
      this.current.review,
      this.current.photoGroups,
    );
    await this.reviewStore.save(this.current.directory, this.current.review);
    return { restored: true, count: actions.length };
  }

  async restoreMovedPhotoGroup(
    batchId,
    photoGroupId,
    { onProgress = () => {} } = {},
  ) {
    if (!this.current) throw new Error("请先选择一个照片文件夹。");
    const batch = this.current.movedBatches.find(
      (candidate) => candidate.id === batchId,
    );
    if (!batch)
      throw new Error("找不到可恢复的 review batch。请重新选择照片文件夹。");
    const journal = await readJournal(batch.directory);
    if (!validJournal(journal))
      throw new Error("review batch 的 movement journal 无效。");
    const records = journal.records.filter(
      (record) => record.groupId === photoGroupId,
    );
    if (!records.length)
      throw new Error("该 photo group 不在指定的 review batch 中。");

    const actions = await prepareRestoreActions(
      this.current.directory,
      batch.directory,
      records,
    );
    await restoreActions({
      actions,
      journal,
      batchDirectory: batch.directory,
      sourceDirectory: this.current.directory,
      groupCount: 1,
      onProgress,
    });

    const remainingPhotoGroups = await scanPhotoGroups(batch.directory);
    if (!remainingPhotoGroups.length) {
      journal.status = "undone";
      await writeJournal(batch.directory, journal);
      await batch.directory.removeEntry(MANIFEST_NAME);
      await this.current.directory.removeEntry(batch.id);
      this.current.movedBatches = this.current.movedBatches.filter(
        (candidate) => candidate.id !== batchId,
      );
    } else {
      journal.status = "completed";
      await writeJournal(batch.directory, journal);
      batch.journal = journal;
      batch.photoGroups = remainingPhotoGroups;
    }
    this.current.photoGroups = await this.analyzer(
      await scanPhotoGroups(this.current.directory),
    );
    this.current.review = normalizeReview(
      this.current.review,
      this.current.photoGroups,
    );
    await this.reviewStore.save(this.current.directory, this.current.review);
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
