// Read source only. All browser writes are confined to a fresh temporary OPFS profile.
import { chromium, expect } from "@playwright/test";
import {
  readdir,
  stat,
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, join, extname, sep, isAbsolute } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
if (!process.argv[2])
  throw new Error(
    "Usage: node scripts/test-real-culler-2.mjs SOURCE_DIRECTORY [OUTPUT_JSON]",
  );
const source = resolve(process.argv[2]);
const port = process.env.PORT ?? "4178";
const proxyPath = process.env.CULLER_PROXY_LABELS;
const proxy = proxyPath ? JSON.parse(await readFile(proxyPath, "utf8")) : null;
const reportPath = resolve(
  process.argv[3] ?? "output/culler-2-real-acceptance.json",
);
const reportRelative = relative(source, reportPath);
assert.ok(
  isAbsolute(reportRelative) || reportRelative.startsWith(".." + sep),
  "Report must be outside the original source directory",
);
const report = {
  startedAt: new Date().toISOString(),
  scope:
    "All user-authorized supported photo/video original-byte copies in fresh temporary Chrome OPFS. No original directory handle is granted; external native picker/writes are not tested.",
  pageErrors: [],
  blockedNetwork: [],
  resourceErrors: [],
};
let browser, server, profile, before;
const log = (message) => console.log(new Date().toISOString(), message);
async function entries(root) {
  const list = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) list.push(relative(root, path));
      else throw new Error("Symlink/special file refused: " + entry.name);
    }
  }
  await walk(root);
  return list.sort();
}
async function hash(path) {
  const value = createHash("sha256");
  for await (const chunk of createReadStream(path)) value.update(chunk);
  return value.digest("hex");
}
async function snapshot(label) {
  const names = await entries(source),
    result = new Array(names.length);
  let next = 0,
    done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < names.length) {
        const i = next++,
          name = names[i],
          path = join(source, name),
          a = await stat(path);
        const sha = await hash(path),
          b = await stat(path);
        assert.equal(a.size, b.size);
        assert.equal(a.mtimeMs, b.mtimeMs);
        result[i] = {
          path: name,
          size: a.size,
          mtimeMs: a.mtimeMs,
          sha256: sha,
        };
        if (++done % 200 === 0)
          log(`${label} integrity ${done}/${names.length}`);
      }
    }),
  );
  return result;
}
try {
  before = await snapshot("before");
  report.source = {
    files: before.length,
    bytes: before.reduce((n, f) => n + f.size, 0),
    extensions: Object.fromEntries(
      [...new Set(before.map((f) => extname(f.path).toLowerCase()))].map(
        (ext) => [
          ext,
          before.filter((f) => extname(f.path).toLowerCase() === ext).length,
        ],
      ),
    ),
  };
  profile = await mkdtemp("/private/tmp/photo-culler-2-real-");
  server = spawn(process.execPath, ["scripts/dist-test-server.mjs"], {
    env: { ...process.env, PORT: port },
    stdio: "ignore",
  });
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + "/photo-culler-static/")
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.text().startsWith("REAL2 ")) log(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400)
      report.resourceErrors.push({
        status: r.status(),
        path: new URL(r.url()).pathname,
      });
  });
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = request.url();
    if (
      /^https?:/.test(url) &&
      (!url.startsWith(base + "/") || request.method() !== "GET")
    ) {
      report.blockedNetwork.push({
        origin: new URL(url).origin,
        method: request.method(),
      });
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base + "/photo-culler-static/");
  report.userAgent = await page.evaluate(() => navigator.userAgent);
  report.fixtureQuotaBefore = await page.evaluate(() =>
    navigator.storage.estimate(),
  );
  const cdp = await browser.newCDPSession(page);
  report.fixtureActualQuota = await cdp.send("Storage.getUsageAndQuota", {
    origin: base,
  });
  if (
    report.fixtureActualQuota.quota - report.fixtureActualQuota.usage <
    report.source.bytes * 2.1
  ) {
    await cdp.send("Storage.overrideQuotaForOrigin", {
      origin: base,
      quotaSize: Math.ceil(report.source.bytes * 2.2),
    });
    report.fixtureQuotaOverride =
      "Test-only CDP quota override for isolated OPFS source/output copies.";
  }
  report.fixtureActualQuotaAfter = await cdp.send("Storage.getUsageAndQuota", {
    origin: base,
  });
  assert.ok(
    report.fixtureActualQuotaAfter.quota -
      report.fixtureActualQuotaAfter.usage >
      report.source.bytes * 2.1,
    "Insufficient real test quota",
  );
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.hidden = true;
    input.id = "real-files";
    document.body.append(input);
  });
  const fixtureFiles = proxy
    ? before.filter((f) =>
        proxy.labels.some((label) => label.relativePath === f.path),
      )
    : before;
  await page
    .locator("#real-files")
    .setInputFiles(fixtureFiles.map((f) => join(source, f.path)));
  report.copy = await page.evaluate(async (manifest) => {
    const started = performance.now(),
      storage = await navigator.storage.getDirectory(),
      quota = await navigator.storage.estimate();
    const bytes = manifest.reduce((n, f) => n + f.size, 0);
    // Chrome's estimate API may intentionally report a static 10 GiB. Real test
    // quota was checked through CDP; do not treat the privacy estimate as a hard cap.
    const root = await storage.getDirectoryHandle("camera", { create: true }),
      output = await storage.getDirectoryHandle("output", { create: true });
    const files = [...document.querySelector("#real-files").files];
    if (files.length !== manifest.length)
      throw new Error("Fixture file count differs");
    for (let i = 0; i < files.length; i++) {
      const parts = manifest[i].path.split("/");
      let directory = root;
      for (const part of parts.slice(0, -1))
        directory = await directory.getDirectoryHandle(part, { create: true });
      const handle = await directory.getFileHandle(parts.at(-1), {
          create: true,
        }),
        writer = await handle.createWritable();
      await writer.write(files[i]);
      await writer.close();
      if ((await handle.getFile()).size !== manifest[i].size)
        throw new Error("Copy size mismatch");
      if ((i + 1) % 100 === 0)
        console.log("REAL2 fixture copied " + (i + 1) + "/" + files.length);
    }
    window.showDirectoryPicker = async (options) => {
      if (options.id === "photo-culler-source" && options.mode !== "read")
        throw new Error("Source unexpectedly requested write permission");
      return options.id === "photo-culler-output" ? output : root;
    };
    document.querySelector("#real-files").remove();
    // Verify every copied member with browser-native streaming reads (no source writes).
    for (let i = 0; i < manifest.length; i++) {
      let directory = root;
      const parts = manifest[i].path.split("/");
      for (const part of parts.slice(0, -1))
        directory = await directory.getDirectoryHandle(part);
      const file = await (
        await directory.getFileHandle(parts.at(-1))
      ).getFile();
      const actual = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      if (actual !== manifest[i].sha256)
        throw new Error("Fixture hash mismatch");
      if ((i + 1) % 200 === 0)
        console.log(
          "REAL2 fixture verified " + (i + 1) + "/" + manifest.length,
        );
    }
    window.__fixture = root;
    window.__output = output;
    return {
      files: files.length,
      bytes,
      milliseconds: performance.now() - started,
      allHashesVerified: true,
    };
  }, fixtureFiles);
  const t = performance.now();
  await page.locator("#choose").click();
  await expect(page.locator(".card").first()).toBeVisible({ timeout: 120000 });
  report.firstGridMs = performance.now() - t;
  let stage = "";
  for (let i = 0; i < 3600; i++) {
    const value = await page.locator("#global").textContent();
    if (value !== stage) {
      stage = value;
      if (i % 10 === 0 || value.includes("完成")) log("REAL2 " + value);
    }
    if (value.includes("本地分析完成")) break;
    if (await page.locator("#choose").isEnabled())
      throw new Error(
        "Analysis stopped before completion: " +
          (await page.locator("#feedback").textContent()),
      );
    await new Promise((r) => setTimeout(r, 1000));
  }
  await expect(page.locator("#global")).toContainText("本地分析完成");
  report.coldMs = performance.now() - t;
  report.analysis = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("photo-culler-local");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const getAll = (store) =>
      new Promise((resolve, reject) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const sessions = await getAll("cull-sessions"),
      cache = await getAll("analysis");
    const formats = {};
    const statuses = {},
      exif = { valid: 0, subsecond: 0 };
    let decoded = 0;
    for (const entry of cache) {
      const a = entry.analysis;
      const members = JSON.parse(a.fingerprint);
      const sourcePath = members.find(([path]) =>
        /\.(jpe?g|png|webp|heic|heif)$/i.test(path),
      )?.[0];
      const ext =
        sourcePath?.slice(sourcePath.lastIndexOf(".")).toLowerCase() ??
        "unknown";
      const format = formats[ext] ?? { cached: 0, decoded: 0, failed: 0 };
      format.cached++;
      if (a.analysis?.thumbnail) format.decoded++;
      else format.failed++;
      formats[ext] = format;
      statuses[a.analysis?.status ?? "unknown"] =
        (statuses[a.analysis?.status ?? "unknown"] ?? 0) + 1;
      if (a.analysis?.thumbnail) decoded++;
      if (a.metadata?.capturedAt != null) exif.valid++;
      if (a.metadata?.SubSecTimeOriginal != null) exif.subsecond++;
    }
    db.close();
    return {
      sessions: sessions.length,
      cached: cache.length,
      decoded,
      statuses,
      formats,
      exif,
      stats: [...document.querySelectorAll("#stats>div")].map(
        (e) => e.textContent,
      ),
      cards: document.querySelectorAll(".card").length,
    };
  });
  if (proxy) {
    report.scope =
      "AI-proxy quality comparison on read-only source JPEG copies, all source bytes hashed before/after; no export and no human-preference acceptance claim.";
    await page.locator("#benchmark-open").click();
    await page.locator("#benchmark-import").setInputFiles(resolve(proxyPath));
    await expect(page.locator("#feedback")).toContainText(
      "已导入 " + fixtureFiles.length + " 个 AI 代理标签",
    );
    const study = await page.evaluate(async () => {
      const db = await new Promise((r) => {
        const q = indexedDB.open("photo-culler-local");
        q.onsuccess = () => r(q.result);
      });
      const rows = await new Promise((r) => {
        const q = db
          .transaction("cull-sessions")
          .objectStore("cull-sessions")
          .getAll();
        q.onsuccess = () => r(q.result);
      });
      db.close();
      return rows[0].benchmark;
    });
    const { evaluateBenchmark } = await import(
      "../web/modules/cull-benchmark.js"
    );
    report.proxyEvaluation = evaluateBenchmark(study);
    assert.equal(report.proxyEvaluation.total, fixtureFiles.length);
    assert.equal(report.proxyEvaluation.metricsProvenance, "ai-proxy");
    assert.equal(report.proxyEvaluation.humanConfirmed, 0);
    report.study = study;
  } else {
    const expectedGroups = new Map();
    for (const file of before) {
      if (
        !/\.(jpe?g|png|webp|heic|heif|rw2|raw|cr2|cr3|nef|arw|dng|orf|raf|xmp|mov|mp4|m4v|avi)$/i.test(
          file.path,
        )
      )
        continue;
      const stem = file.path.replace(/\.[^/.]+$/, "");
      const members = expectedGroups.get(stem) ?? [];
      members.push(file.path);
      expectedGroups.set(stem, members);
    }
    report.expected = {
      groups: expectedGroups.size,
      imageGroups: [...expectedGroups.values()].filter((m) =>
        m.some((p) => /\.(jpe?g|png|webp|heic|heif)$/i.test(p)),
      ).length,
    };
    assert.equal(report.analysis.cached, report.expected.imageGroups);
    assert.ok(report.analysis.cards <= 60);
    await page.locator(".card img").first().click();
    await page.locator("#zoom-one").click();
    await expect
      .poll(() =>
        page.locator(".compare-frame img").evaluate((img) => {
          const frame = img.parentElement.getBoundingClientRect();
          return (
            Math.min(
              frame.width / img.naturalWidth,
              frame.height / img.naturalHeight,
            ) * new DOMMatrix(getComputedStyle(img).transform).a
          );
        }),
      )
      .toBeCloseTo(1, 2);
    report.viewer = await page
      .locator(".compare-frame img")
      .evaluate((img) => ({
        width: img.naturalWidth,
        height: img.naturalHeight,
      }));
    await page.keyboard.press("Escape");
    await page.locator("#accept").click();
    await expect(page.locator("#export-space")).toBeVisible();
    report.plan = await page.evaluate(() => ({
      summary: document.querySelector("#plan").textContent,
      detail: JSON.parse(document.querySelector("#unprocessed").textContent),
    }));
    report.defaultPlan = report.plan;
    await page.locator("#include-protected").check();
    await page
      .getByRole("button", { name: "接受当前输出计划", exact: true })
      .click();
    report.plan = await page.evaluate(() => ({
      summary: document.querySelector("#plan").textContent,
      detail: JSON.parse(document.querySelector("#unprocessed").textContent),
    }));
    report.explicitProtectedInclusion = true;
    // Cancel once before writing: the target must remain entirely empty.
    await page.locator("#target").click();
    await page.locator("#copy").click();
    await page.locator("#confirm-cancel").click();
    assert.equal(
      await page.evaluate(
        async () => (await Array.fromAsync(window.__output.values())).length,
      ),
      0,
    );
    report.cancelBeforeWrite = true;
    await page.locator("#copy").click();
    await page.locator("#confirm-copy").click();
    let last = "";
    for (let i = 0; i < 3600; i++) {
      const value = await page.locator("#feedback").textContent();
      if (i % 20 === 0 && value !== last) {
        last = value;
        log("REAL2 " + value);
      }
      if (value.includes("已复制并校验")) break;
      if (value.includes("导出未完成")) throw new Error(value);
      await new Promise((r) => setTimeout(r, 1000));
    }
    await expect(page.locator("#feedback")).toContainText("已复制并校验");
    report.export = await page.evaluate(async (original) => {
      const outputs = await Array.fromAsync(window.__output.values());
      if (outputs.length !== 1)
        throw new Error("Expected one output directory");
      const output = outputs[0];
      const reports = await output.getDirectoryHandle("Reports");
      const manifest = JSON.parse(
        await (
          await (await reports.getFileHandle("manifest.json")).getFile()
        ).text(),
      );
      const expected = new Map(original.map((f) => [f.path, f.sha256]));
      let verified = 0;
      for (const record of manifest.records) {
        if (
          record.sourceSHA !== record.destinationSHA ||
          record.sourceSHA !== expected.get(record.source)
        )
          throw new Error("Export SHA does not match original baseline");
        verified++;
      }
      const groupMembers = new Map();
      for (const file of original) {
        if (
          !/\.(jpe?g|png|webp|heic|heif|rw2|raw|cr2|cr3|nef|arw|dng|orf|raf|xmp|mov|mp4|m4v|avi)$/i.test(
            file.path,
          )
        )
          continue;
        const id = "group:" + file.path.replace(/\.[^/.]+$/, "");
        const list = groupMembers.get(id) ?? [];
        list.push(file.path);
        groupMembers.set(id, list);
      }
      const exported = new Set(manifest.records.map((r) => r.source));
      for (const record of manifest.records)
        for (const path of groupMembers.get(record.groupId) ?? [])
          if (!exported.has(path)) throw new Error("Companion member split");
      let videoGroups = 0,
        protectedIncluded = 0;
      for (const group of manifest.groups) {
        const members = groupMembers.get(group.id) ?? [];
        if (members.some((p) => /\.(mov|mp4|m4v|avi)$/i.test(p))) {
          videoGroups++;
          if (group.decision !== "protected")
            throw new Error("Video group was not protected");
        }
        if (group.decision === "protected") {
          protectedIncluded++;
          for (const path of members)
            if (!exported.has(path))
              throw new Error("Explicit protected inclusion missing member");
        }
      }
      return {
        status: manifest.status,
        groupCount: manifest.groupCount,
        fileCount: manifest.fileCount,
        bytes: manifest.bytes,
        allHashesMatchOriginals: verified,
        companionsComplete: true,
        videoGroups,
        protectedIncluded,
        protected: manifest.unprocessed.length,
        groups: manifest.groups.map((g) => ({
          id: g.id,
          decision: g.decision,
          groupId: g.machine?.groupId,
          rank: g.machine?.rank,
          confidence: g.machine?.confidence,
          reasons: g.machine?.reasons,
        })),
      };
    }, before);
    const warmStart = performance.now();
    await page.reload();
    await page.locator("#sessions button").first().click();
    await expect(page.locator("#global")).toContainText("本地分析完成", {
      timeout: 600000,
    });
    report.warmMs = performance.now() - warmStart;
    report.warm = {
      completed: true,
      lastReportPresent: await page.evaluate(async () => {
        const db = await new Promise((r) => {
          const q = indexedDB.open("photo-culler-local");
          q.onsuccess = () => r(q.result);
        });
        const rows = await new Promise((r) => {
          const q = db
            .transaction("cull-sessions")
            .objectStore("cull-sessions")
            .getAll();
          q.onsuccess = () => r(q.result);
        });
        db.close();
        return rows[0]?.lastReport?.status === "completed";
      }),
    };
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.blockedNetwork, []);
  assert.deepEqual(report.resourceErrors, []);
  if (!proxy) assert.equal(report.export.status, "completed");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
  log("REAL2 FAILURE " + error.message);
} finally {
  await browser?.close();
  server?.kill();
  if (profile) {
    await rm(profile, { recursive: true, force: true });
    report.isolatedCopiesRemoved = true;
  }
  if (before) {
    try {
      const after = await snapshot("after");
      assert.deepEqual(after, before);
      report.sourceIntegrity = {
        allFileHashesUnchanged: true,
        sizeAndMtimeUnchanged: true,
        files: after.length,
      };
    } catch (error) {
      report.passed = false;
      report.sourceIntegrity = { verified: false, error: error.message };
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  log("REAL2 report " + reportPath);
}
