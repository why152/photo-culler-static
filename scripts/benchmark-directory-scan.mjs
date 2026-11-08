import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep the reference tied to the reviewed pre-concurrency implementation.
const baselineCommit = "0bcb619";
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const baselineSource = execFileSync("git", ["show", `${baselineCommit}:web/modules/review-workspace.js`], {
  cwd: repository, encoding: "utf8",
});
const output = resolve(process.argv[2] ?? "output/directory-scan-performance.json");
const baseURL = "http://127.0.0.1:4173";
let server;
let browser;
try {
  if (!await fetch(baseURL).then((response) => response.ok).catch(() => false)) {
    server = spawn(process.execPath, ["scripts/static-test-server.mjs"], {
      cwd: repository, stdio: "ignore",
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await fetch(baseURL).then((response) => response.ok).catch(() => false)) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("Local benchmark server did not start.");
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto(baseURL);
  const measured = await page.evaluate(async ({ baselineSource, baselineCommit }) => {
    const baselineURL = URL.createObjectURL(new Blob([baselineSource], { type: "text/javascript" }));
    const { scanPhotoGroups: sequential } = await import(baselineURL);
    URL.revokeObjectURL(baselineURL);
    const { scanPhotoGroups: bounded } = await import("/modules/review-workspace.js");
    const root = await navigator.storage.getDirectory();
    const fixtureName = `directory-scan-benchmark-${crypto.randomUUID()}`;
    const fixture = await root.getDirectoryHandle(fixtureName, { create: true });
    const results = [];
    try {
      for (const count of [500, 2000]) {
        const source = await fixture.getDirectoryHandle(String(count), { create: true });
        const handles = [];
        for (let index = 0; index < count; index++) {
          const handle = await source.getFileHandle(`P${String(index).padStart(5, "0")}.jpg`, { create: true });
          const writer = await handle.createWritable();
          await writer.write(new Uint8Array(32));
          await writer.close();
          handles.push(handle);
        }
        const modes = [
          ["metadata-with-in-memory-enumeration", { async *values() { yield* handles; } }],
          ["full-opfs-directory-enumeration", source],
        ];
        for (const [mode, directory] of modes) {
          // Warm both functions once, outside the timed interleaved rounds.
          await sequential(directory);
          await bounded(directory);
          for (let round = 0; round < 5; round++) {
            const variants = round % 2 ? [["bounded", bounded], ["sequential", sequential]]
              : [["sequential", sequential], ["bounded", bounded]];
            for (const [variant, scan] of variants) {
              const started = performance.now();
              const groups = await scan(directory);
              const milliseconds = performance.now() - started;
              if (groups.length !== count || groups.some((group, index) =>
                group.analysisFile.name !== `P${String(index).padStart(5, "0")}.jpg`))
                throw new Error("Measured scan changed the sorted photo-group results.");
              results.push({ count, mode, round, variant, milliseconds });
            }
          }
        }
      }
      return {
        measuredAt: new Date().toISOString(), userAgent: navigator.userAgent,
        baselineCommit, concurrency: 4, rounds: 5,
        fixture: "Synthetic 32-byte JPEG-named OPFS files; no decoding. Creation and warm-up excluded. Two scan variants alternate order each round in one browser session.",
        results,
      };
    } finally {
      await root.removeEntry(fixtureName, { recursive: true });
    }
  }, { baselineSource, baselineCommit });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(measured, null, 2)}\n`);
  console.log(output);
} finally {
  await browser?.close();
  server?.kill();
}
