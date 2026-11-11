import { digest } from "./cull-similarity.js";
import { safeParts, checkAbort } from "./cull-inventory.js";
import { outputDecision, selectionState, ALGORITHM_VERSION } from "./cull-session.js";
export function exportPlan(
  groups,
  human,
  recommendations,
  includeProtected = false,
  { organize = false, binary = false } = {},
) {
  const records = [],
    unprocessed = [];
  for (const group of groups) {
    const machine = recommendations[group.id] ?? {};
    const rawDecision = outputDecision(human[group.id], machine);
    const decision = binary ? selectionState(human[group.id], machine) : rawDecision;
    if (group.protected || rawDecision === "protected" || !group.hash)
      unprocessed.push({
        id: group.id,
        path: group.path,
        reasons: machine.reasons ?? ["未分析"],
      });
    if (
      !organize &&
      decision !== "include" &&
      !(includeProtected && decision === "protected")
    )
      continue;
    for (const member of group.members) {
      safeParts(member.path);
      records.push({
        source: member.path,
        destination:
          (organize ? organizationFolder(decision) : "Keepers") +
          "/" +
          member.path,
        groupId: group.id,
        size: member.size,
        lastModified: member.lastModified,
        fingerprint: group.fingerprint,
        sourceSHA:
          member.path === group.source?.path ? group.sourceSHA : undefined,
        decision,
        human: human[group.id] ?? null,
        machine,
        status: "pending",
        handle: member.handle,
      });
    }
  }
  return {
    version: 2,
    algorithmVersion: ALGORITHM_VERSION,
    createdAt: new Date().toISOString(),
    status: "planned",
    groupCount: new Set(records.map((r) => r.groupId)).size,
    fileCount: records.length,
    bytes: records.reduce((n, r) => n + r.size, 0),
    includeProtected,
    layout: organize ? (binary ? "binary" : "organized") : "keepers",
    unprocessed,
    groups: groups.map((group) => ({
      id: group.id,
      path: group.path,
      fingerprint: group.fingerprint,
      members: group.members.map((member) => ({
        path: member.path,
        size: member.size,
      })),
      human: human[group.id] ?? null,
      machine: recommendations[group.id] ?? null,
      decision: (binary ? selectionState : outputDecision)(human[group.id], recommendations[group.id]),
    })),
    records,
  };
}
export function organizationFolder(decision) {
  const folder = { include: "已选", protected: "待复核", suppress: "未选" }[
    decision
  ];
  if (!folder) throw new Error("无效的照片选择状态");
  return folder;
}
export function publicManifest(plan) {
  return {
    ...plan,
    records: plan.records.map(({ handle, ...record }) => record),
  };
}
export function reviewCSV(plan) {
  // Report every reviewed member, including suppressed and protected groups.
  // Prefix spreadsheet formulas without changing source/destination paths on disk.
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const records = new Map(
    plan.records.map((record) => [record.source, record]),
  );
  const rows = plan.groups
    ? plan.groups.flatMap((group) =>
        group.members.map((member) => {
          const record = records.get(member.path);
          return [
            member.path,
            record?.destination,
            group.decision,
            record?.status ?? "not-exported",
            record?.sourceSHA,
            record?.error,
            group.id,
            group.human?.decision,
            group.human?.favorite ?? false,
            group.machine?.plan,
            group.machine?.reasons?.join("; "),
          ];
        }),
      )
    : plan.records.map((r) => [
        r.source,
        r.destination,
        r.decision,
        r.status,
        r.sourceSHA,
        r.error,
        r.groupId,
        r.human?.decision,
        r.human?.favorite,
        r.machine?.plan,
        r.machine?.reasons?.join("; "),
      ]);
  return (
    "\ufeff" +
    [
      [
        "source",
        "destination",
        "decision",
        "status",
        "sha256",
        "error",
        "groupId",
        "humanDecision",
        "favorite",
        "machinePlan",
        "reasons",
      ],
      ...rows,
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
async function fileOrNull(directory, name) {
  try {
    return await directory.getFileHandle(name);
  } catch (error) {
    if (error.name === "NotFoundError") return null;
    throw error;
  }
}
async function parent(directory, path) {
  const parts = safeParts(path);
  const name = parts.pop();
  for (const part of parts)
    directory = await directory.getDirectoryHandle(part, { create: true });
  return { directory, name };
}
async function writeReport(directory, name, data) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}
export async function assertIndependent(source, target) {
  if (await source.isSameEntry(target))
    throw new Error("目标与源目录相同，请选择独立目标目录。");
  if (
    typeof source.resolve !== "function" ||
    typeof target.resolve !== "function"
  )
    throw new Error("无法验证目录是否重叠；照片未导出，可下载报告。");
  if (
    (await source.resolve(target)) !== null ||
    (await target.resolve(source)) !== null
  )
    throw new Error("源目录与目标目录重叠，请选择独立目标目录。");
}
export async function createOutput(source, target) {
  await assertIndependent(source, target);
  if (
    target.requestPermission &&
    (await target.requestPermission({ mode: "readwrite" })) !== "granted"
  )
    throw new Error("目标写权限被拒绝；照片未导出。");
  // Random suffix plus exclusive existence check; no existing user folder is reused.
  const name =
    "PhotoCull_Output_" +
    new Date().toISOString().replace(/[:.\-TZ]/g, "") +
    "_" +
    crypto.randomUUID();
  try {
    await target.getDirectoryHandle(name);
    throw new Error("输出目录已存在，请重试。");
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
  return {
    name,
    directory: await target.getDirectoryHandle(name, { create: true }),
  };
}
export async function copyPlan(
  plan,
  output,
  { signal, onProgress = () => {} } = {},
) {
  const reports = await output.getDirectoryHandle("Reports", { create: true });
  const save = () =>
    writeReport(
      reports,
      "manifest.json",
      JSON.stringify(publicManifest(plan), null, 2),
    );
  plan.status = "copying";
  await save();
  try {
    let done = 0;
    for (const record of plan.records) {
      checkAbort(signal);
      // Revalidate current source at execution, including retries; never copy stale content.
      const file = await record.handle.getFile();
      if (
        file.size !== record.size ||
        file.lastModified !== record.lastModified
      )
        throw new Error("来源已更改：" + record.source + "。请重新扫描。");
      const hash = await digest(file, signal);
      if (record.sourceSHA && record.sourceSHA !== hash)
        throw new Error("来源内容已更改：" + record.source);
      record.sourceSHA = hash;
      const { directory, name } = await parent(output, record.destination);
      const existing = await fileOrNull(directory, name);
      if (existing) {
        const outputHash = await digest(await existing.getFile(), signal);
        if (outputHash !== hash)
          throw new Error(
            "同名内容冲突，未覆盖：" +
              record.destination +
              "。请在新输出目录重试。",
          );
        record.destinationSHA = outputHash;
        record.status = "verified";
      } else {
        checkAbort(signal);
        record.status = "copying";
        await save();
        const handle = await directory.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        try {
          for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
            checkAbort(signal);
            await writable.write(
              await file.slice(offset, offset + 1024 * 1024).arrayBuffer(),
            );
          }
          checkAbort(signal);
          await writable.close();
        } catch (error) {
          await writable.abort().catch(() => {});
          throw error;
        }
        record.destinationSHA = await digest(await handle.getFile(), signal);
        if (record.destinationSHA !== hash)
          throw new Error("输出校验失败：" + record.destination);
        record.status = "verified";
      }
      delete record.error;
      await save();
      onProgress(++done, plan.records.length);
    }
    plan.status = "completed";
    await save();
    await writeReport(reports, "review.csv", reviewCSV(plan));
    await writeReport(
      reports,
      "unprocessed.json",
      JSON.stringify(plan.unprocessed, null, 2),
    );
    return plan;
  } catch (error) {
    plan.status = "interrupted";
    plan.error = error.message;
    const record = plan.records.find((r) => r.status !== "verified");
    if (record) record.error = error.message;
    try {
      await save();
    } catch {
      /* Earlier journal remains; never hide primary error. */
    }
    throw error;
  }
}

export function resumePlan(report, groups) {
  if (report?.version !== 2 || !Array.isArray(report.records))
    throw new Error("不支持的导出记录");
  if (
    report.layout != null &&
    !["organized", "binary", "keepers"].includes(report.layout)
  )
    throw new Error("不支持的整理方式");
  return {
    ...report,
    records: report.records.map((record) => {
      safeParts(record.source);
      const groupReport = report.groups?.find((g) => g.id === record.groupId);
      if (report.layout === "binary" && !["include", "suppress"].includes(groupReport?.decision))
        throw new Error("无效的照片选择状态");
      const folder =
        ["organized", "binary"].includes(report.layout)
          ? organizationFolder(groupReport?.decision)
          : "Keepers";
      if (
        record.destination !== folder + "/" + record.source ||
        (["organized", "binary"].includes(report.layout) &&
          record.decision !== groupReport?.decision)
      )
        throw new Error("导出记录路径无效");
      const group = groups.find(
        (g) => g.id === record.groupId && g.fingerprint === record.fingerprint,
      );
      const member = group?.members.find((m) => m.path === record.source);
      if (!member)
        throw new Error("来源清单已改变，请重新生成计划：" + record.source);
      return { ...record, handle: member.handle };
    }),
  };
}
