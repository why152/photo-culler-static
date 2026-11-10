// Manual, read-only source benchmark. File inputs are transferred to a local Worker,
// never submitted, and no original directory handle or output file action is exposed.
import { chromium } from "@playwright/test";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { compareFocusGroups } from "./upstream-focus-comparison.mjs";
const [
  sourceArg,
  labelsArg,
  outputArg = "output/upstream-focus-comparison.json",
] = process.argv.slice(2);
if (!sourceArg || !labelsArg)
  throw Error(
    "Usage: node scripts/compare-upstream-focus.mjs SOURCE LABELS_JSON [REPORT_JSON]",
  );
const source = resolve(sourceArg),
  out = resolve(outputArg),
  rel = relative(source, out);
assert.ok(rel.startsWith(".." + sep), "Report must be outside source");
const draft = JSON.parse(await readFile(resolve(labelsArg), "utf8"));
assert.equal(draft.provenance, "ai-proxy");
const port = process.env.PORT ?? "4190",
  base = "http://127.0.0.1:" + port;
const report = {
  scope:
    "Read-only original File objects; local browser Worker; retrospective AI proxy only, not independent human acceptance.",
  pageErrors: [],
  blockedRequests: [],
  startedAt: new Date().toISOString(),
};
const log = (s) => console.log(new Date().toISOString(), s);
async function sha(path) {
  const h = createHash("sha256");
  for await (const c of createReadStream(path)) h.update(c);
  return h.digest("hex");
}
async function snapshot() {
  const files = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        const a = await stat(p),
          hash = await sha(p),
          b = await stat(p);
        assert.equal(a.size, b.size);
        assert.equal(a.mtimeMs, b.mtimeMs);
        files.push({
          path: relative(source, p),
          size: a.size,
          mtimeMs: a.mtimeMs,
          sha256: hash,
        });
      } else throw Error("Refusing symlink/special file");
    }
  }
  await walk(source);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
let browser, server, before;
try {
  log("Hashing full original inventory before analysis");
  before = await snapshot();
  const files = draft.labels.map((label) => {
    const file = before.find((f) => f.path === label.relativePath);
    assert.ok(file, "Label source missing");
    assert.equal(file.sha256, label.sourceSHA256);
    return file;
  });
  server = spawn(process.execPath, ["scripts/dist-test-server.mjs"], {
    env: { ...process.env, PORT: port },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + "/photo-culler-static/")
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    channel: process.env.PW_CHANNEL ?? "chrome",
    headless: true,
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.text().startsWith("FOCUS ")) log(m.text());
  });
  await page.route("**/*", (route) => {
    const r = route.request();
    if (
      /^https?:/.test(r.url()) &&
      (!r.url().startsWith(base + "/") || r.method() !== "GET")
    ) {
      report.blockedRequests.push({
        method: r.method(),
        origin: new URL(r.url()).origin,
      });
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base + "/photo-culler-static/");
  await page.evaluate(() => {
    const i = document.createElement("input");
    i.type = "file";
    i.multiple = true;
    i.id = "readonly-benchmark";
    document.body.append(i);
  });
  await page
    .locator("#readonly-benchmark")
    .setInputFiles(files.map((f) => join(source, f.path)));
  const assets = await readdir("dist/assets"),
    workerPath = assets.find((p) => /^cull-worker-.*\.js$/.test(p));
  assert.ok(workerPath);
  const started = performance.now();
  report.groups = await page.evaluate(
    async ({ manifest, url }) => {
      const files = [...document.querySelector("#readonly-benchmark").files],
        worker = new Worker(url, { type: "module" }),
        groups = [];
      try {
        for (let i = 0; i < files.length; i++) {
          const result = await new Promise((resolve, reject) => {
            worker.onmessage = (e) =>
              e.data.error ? reject(Error(e.data.error)) : resolve(e.data);
            worker.onerror = (e) => reject(Error(e.message));
            worker.postMessage({
              protocol: "cull-v2",
              id: String(i),
              file: files[i],
            });
          });
          if (result.sourceSHA !== manifest[i].sha256)
            throw Error("Source hash mismatch during analysis");
          const { thumbnail, ...analysis } = result.analysis;
          const path = manifest[i].path.replace(/\.[^/.]+$/, "");
          groups.push({
            id: "group:" + path,
            path,
            source: { path: manifest[i].path, size: manifest[i].size },
            fingerprint: JSON.stringify([
              [manifest[i].path, manifest[i].size, manifest[i].mtimeMs],
            ]),
            analysis,
            hash: result.hash,
            metadata: result.metadata,
            sourceSHA: result.sourceSHA,
            protected: !result.hash,
            members: [],
          });
          if ((i + 1) % 100 === 0)
            console.log("FOCUS analyzed " + (i + 1) + "/" + files.length);
        }
      } finally {
        worker.terminate();
        document.querySelector("#readonly-benchmark").remove();
      }
      return groups;
    },
    {
      manifest: files,
      url: base + "/photo-culler-static/assets/" + workerPath,
    },
  );
  report.analysisMs = performance.now() - started;
  const sizes = new Map();
  for (const g of report.groups) {
    const a = sizes.get(g.source.size) ?? [];
    a.push(g);
    sizes.set(g.source.size, a);
  }
  for (const a of sizes.values())
    if (a.length > 1) for (const g of a) g.exact = g.sourceSHA;
  Object.assign(report, compareFocusGroups(report.groups, draft));
  report.focusComputeMs = report.groups.reduce(
    (n, g) => n + (g.analysis.focusAnalysisMs ?? 0),
    0,
  );
  report.originalFiles = before.length;
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.blockedRequests, []);
  report.passed = true;
  log("Fixed strategies compared; no threshold tuning performed");
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
  log(error.message);
} finally {
  await browser?.close();
  server?.kill();
  report.temporaryBrowserRemoved = true;
  if (before) {
    log("Hashing full original inventory after analysis");
    try {
      assert.deepEqual(await snapshot(), before);
      report.sourceIntegrity = {
        allHashesSizesMtimesAndPathsUnchanged: true,
        files: before.length,
      };
    } catch (error) {
      report.sourceIntegrity = { passed: false, error: error.message };
      report.passed = false;
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(resolve(out, ".."), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2));
  log("Report saved locally");
  for (const [name, s] of Object.entries(report.strategies ?? {}))
    console.log(
      name,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(s).map(([split, m]) => [
            split,
            {
              moment: m.importantMomentRecall,
              visibleMoment: m.importantVisibleMomentRecall,
              photo: m.shortlistPhotoRecall,
              visible: m.visibleCount,
              shortlist: m.shortlistCount,
              hidden: m.hiddenWantedPhotoIds.length,
            },
          ]),
        ),
      ),
    );
}
