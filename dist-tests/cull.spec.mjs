import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("built subpath ships full upstream MIT notices", async ({ request }) => {
  const response = await request.get("UPSTREAM_NOTICES.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain("Copyright (c) 2026 Paolo Cortez");
  expect(text).toContain("Copyright (c) 2026 Zane");
  expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
});
async function fixture(page) {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle("camera", { create: true });
    const target = await root.getDirectoryHandle("exports", { create: true });
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#888";
    ctx.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = i % 2 ? "#ddd" : "#333";
      ctx.fillRect((i * 37) % 256, (i * 17) % 160, 8, 8);
    }
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.95));
    const write = async (d, name, data) => {
      const h = await d.getFileHandle(name, { create: true });
      const w = await h.createWritable();
      await w.write(data);
      await w.close();
    };
    await write(source, "A.jpg", blob);
    await write(source, "B.jpg", blob);
    await write(source, "C.jpg", blob);
    await write(source, "A.rw2", "raw-bytes");
    await write(source, "A.xmp", "metadata");
    const sub = await source.getDirectoryHandle("sub", { create: true });
    await write(sub, "A.jpg", blob);
    await write(sub, "only.rw2", "raw-only");
    await write(sub, "clip.mov", "video");
    await write(sub, "bad.heic", "undecodable");
    const historical = await source.getDirectoryHandle("PhotoCull_Output_old", {
      create: true,
    });
    await write(historical, "skip.jpg", blob);
    window.__source = source;
    window.__target = target;
    window.__blob = blob;
    window.showDirectoryPicker = async (options) =>
      options.id === "photo-culler-output" ? target : source;
  });
}
test("built root: readonly import, workers, protected formats, comparisons, export and session reopen without uploads", async ({
  page,
}) => {
  const errors = [],
    bad = [],
    requests = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGEERROR", e.message);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) bad.push(r.url());
  });
  page.on("request", (r) =>
    requests.push({ url: r.url(), method: r.method() }),
  );
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await expect(page.locator(".card")).toHaveCount(4);
  await page.locator("#filter").selectOption("all");
  await expect(page.locator(".card")).toHaveCount(7);
  await expect(page.locator("#global")).toContainText("7 组");
  const images = page.locator(".card img");
  await images.first().click();
  await expect(page.locator("#compare")).toBeVisible();
  await page.locator("#zoom-one").click();
  await expect
    .poll(() =>
      page
        .locator(".compare-frame img")
        .first()
        .evaluate((img) => {
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
  await page.keyboard.press("Escape");
  await page.locator(".card input").nth(0).check();
  await page.locator(".card input").nth(1).check();
  await page.locator("#compare-two").click();
  await expect(page.locator(".compare-frame")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.locator(".card input").nth(2).check();
  await page.locator(".card input").nth(3).check();
  await page.locator("#compare-four").click();
  await expect(page.locator(".compare-frame")).toHaveCount(4);
  await page.keyboard.press("Escape");
  // A human favorite is independent of machine ranking and survives thresholds.
  await page
    .locator(".card")
    .first()
    .getByRole("button", { name: "☆ 精选", exact: true })
    .click();
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "★ 精选", exact: true }),
  ).toBeVisible();
  await page.locator('[data-space="import"]').click();
  await page.locator("#strength").selectOption("compact");
  await page.locator('[data-space="results"]').click();
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "★ 精选", exact: true }),
  ).toBeVisible();
  await page.locator('[data-space="export"]').click();
  await page.locator("#include-protected").check();
  await page
    .getByRole("button", { name: "接受当前输出计划", exact: true })
    .click();
  await page.locator("#target").click();
  await page.locator("#copy").click();
  await expect(page.locator("#confirm")).toBeVisible();
  await page.locator("#confirm-cancel").click();
  expect(
    await page.evaluate(async () =>
      Array.fromAsync(window.__target.values()).then((a) => a.length),
    ),
  ).toBe(0);
  await page.locator("#copy").click();
  await page.locator("#confirm-copy").click();
  await expect(page.locator("#feedback")).toContainText("已复制并校验");
  const report = await page.evaluate(async () => {
    const outputs = await Array.fromAsync(window.__target.values());
    const out = outputs[0];
    const reports = await out.getDirectoryHandle("Reports");
    const manifest = JSON.parse(
      await (
        await (await reports.getFileHandle("manifest.json")).getFile()
      ).text(),
    );
    const keep = await out.getDirectoryHandle("Keepers");
    const sub = await keep.getDirectoryHandle("sub");
    return {
      manifest,
      raw: await (await (await keep.getFileHandle("A.rw2")).getFile()).text(),
      protected: await (
        await (await sub.getFileHandle("only.rw2")).getFile()
      ).text(),
      originals: (await Array.fromAsync(window.__source.values())).map(
        (h) => h.name,
      ),
    };
  });
  expect(report.manifest.status).toBe("completed");
  expect(report.raw).toBe("raw-bytes");
  expect(report.protected).toBe("raw-only");
  expect(
    report.manifest.records.every((r) => r.sourceSHA === r.destinationSHA),
  ).toBeTruthy();
  expect(report.originals).toContain("A.jpg");
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "★ 精选", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(bad).toEqual([]);
  expect(
    requests.every(
      (r) =>
        r.method === "GET" &&
        (r.url.startsWith("http://127.0.0.1:4175/") ||
          r.url.startsWith("blob:http://127.0.0.1:4175/")),
    ),
  ).toBeTruthy();
});
test("read directory works without native move support, v1 remains reachable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete FileSystemFileHandle.prototype.move;
  });
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await expect(page.locator("#choose")).toBeEnabled();
  await page.getByRole("link", { name: "1.0 图库与历史恢复" }).click();
  await expect(page.locator("#choose-folder")).toBeEnabled();
});

test("an interrupted copy resumes after reload using its saved output without changing source files", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator('[data-space="export"]').click();
  await page.locator("#include-protected").check();
  await page
    .getByRole("button", { name: "接受当前输出计划", exact: true })
    .click();
  await page.locator("#target").click();
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
    let fail = true;
    FileSystemDirectoryHandle.prototype.getDirectoryHandle = function (
      name,
      options,
    ) {
      if (name === "Keepers" && fail) {
        fail = false;
        return Promise.reject(
          new DOMException("simulated disk full", "QuotaExceededError"),
        );
      }
      return original.call(this, name, options);
    };
  });
  await page.locator("#copy").click();
  await page.locator("#confirm-copy").click();
  await expect(page.locator("#feedback")).toContainText("导出未完成");
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator('[data-space="export"]').click();
  await page.getByRole("button", { name: "继续上次中断导出" }).click();
  await page.locator("#confirm-copy").click();
  await expect(page.locator("#feedback")).toContainText("已复制并校验");
  const count = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const target = await root.getDirectoryHandle("exports");
    return (await Array.fromAsync(target.values())).length;
  });
  expect(count).toBe(1);
});

test("accept saves the exact plan, undo gates copy, changes invalidate it, and reload restores it", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await expect(page.locator("#strength")).toHaveValue("compact");
  await page.locator("#accept").click();
  await expect(page.locator("#export-space")).toBeVisible();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "已采纳：",
  );
  await page.locator("#target").click();
  await expect(page.locator("#copy")).toBeEnabled();
  const read = () =>
    page.evaluate(async () => {
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
      return rows[0].acceptedPlan;
    });
  const accepted = await read();
  expect(accepted.plan.fileCount).toBeGreaterThan(0);
  expect(accepted.version).toBe(1);
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator('[data-space="export"]').click();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "已采纳：",
  );
  expect(await read()).toEqual(accepted);
  await page.evaluate(async () => {
    const storage = await navigator.storage.getDirectory();
    const output = await storage.getDirectoryHandle("exports");
    window.showDirectoryPicker = async () => output;
  });
  await page.locator("#target").click();
  await page
    .locator("#export-space")
    .getByRole("button", { name: "取消本批采纳", exact: true })
    .click();
  await expect(page.locator("#copy")).toBeDisabled();
  await expect(page.locator("#feedback")).toContainText("已取消采纳");
  expect(await read()).toBeNull();
  await page
    .getByRole("button", { name: "接受当前输出计划", exact: true })
    .click();
  await page.locator("#include-protected").check();
  await expect(page.locator("#copy")).toBeDisabled();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "尚未采纳",
  );
  await page
    .getByRole("button", { name: "接受当前输出计划", exact: true })
    .click();
  await expect(page.locator("#copy")).toBeEnabled();
  await page.locator('[data-space="import"]').click();
  await page.locator("#strength").selectOption("loose");
  await page.locator('[data-space="export"]').click();
  await expect(page.locator("#copy")).toBeDisabled();
  expect(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const target = await root.getDirectoryHandle("exports");
      return (await Array.fromAsync(target.values())).length;
    }),
  ).toBe(0);
});

test("favorite-filtered paging wraps 90 results instead of using the whole inventory", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.evaluate(async () => {
    const storage = await navigator.storage.getDirectory(),
      source = await storage.getDirectoryHandle("camera");
    const file = await (await source.getFileHandle("A.jpg")).getFile();
    const human = {};
    for (let i = 0; i < 120; i++) {
      const stem = "Fav" + String(i).padStart(3, "0"),
        name = stem + ".jpg",
        handle = await source.getFileHandle(name, { create: true }),
        writer = await handle.createWritable();
      await writer.write(file);
      await writer.close();
      const copy = await handle.getFile();
      if (i < 90)
        human["group:" + stem] = {
          decision: "keep",
          favorite: true,
          fingerprint: JSON.stringify([[name, copy.size, copy.lastModified]]),
        };
    }
    const db = await new Promise((r) => {
      const q = indexedDB.open("photo-culler-local");
      q.onsuccess = () => r(q.result);
    });
    await new Promise((r) => {
      const tx = db.transaction("cull-sessions", "readwrite"),
        store = tx.objectStore("cull-sessions"),
        q = store.openCursor();
      q.onsuccess = () => {
        const c = q.result;
        if (c) c.update({ ...c.value, human });
      };
      tx.oncomplete = r;
    });
    db.close();
  });
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#filter").selectOption("favorite");
  await expect(page.locator(".card")).toHaveCount(60);
  await page.locator("#more").click();
  await expect(page.locator(".card")).toHaveCount(30);
  await page.locator("#more").click();
  await expect(page.locator(".card")).toHaveCount(60);
});

test("AI labels import locally by path and SHA, persist separately and require individual human confirmation", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  const read = () =>
    page.evaluate(async () => {
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
      return rows[0];
    });
  const before = await read();
  const label = await page.evaluate(async () => {
    const f = await (await window.__source.getFileHandle("A.jpg")).getFile();
    const sha = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await f.arrayBuffer()),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    return {
      relativePath: "A.jpg",
      sourceSHA256: sha,
      mustKeep: true,
      momentId: "test-moment",
      reason: "AI draft reason",
    };
  });
  await page.locator("#benchmark-open").click();
  await page.locator("#benchmark-import").setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        provenance: "ai-proxy",
        labels: [
          label,
          { ...label, relativePath: "B.jpg", sourceSHA256: "wrong" },
        ],
      }),
    ),
  });
  await expect(page.locator("#feedback")).toContainText(
    "已导入 1 个 AI 代理标签；1 个未匹配",
  );
  await expect(page.locator("#benchmark-reason")).toContainText(
    "AI draft reason",
  );
  await expect(page.locator("#benchmark-result")).toContainText(
    "ai-proxy-only",
  );
  await page.locator("#benchmark-yes").click();
  await expect(page.locator("#benchmark-result")).toContainText(
    "human-confirmed-ai-draft-not-independent-blind",
  );
  const session = await read();
  expect(session.human).toEqual(before.human);
  expect(session.acceptedPlan).toBeNull();
  expect(Object.values(session.benchmark.labels)[0].source).toBe("human");
  await page
    .locator("#benchmark")
    .getByRole("button", { name: "保存进度并关闭" })
    .click();
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#benchmark-open").click();
  await expect(page.locator("#benchmark-result")).toContainText(
    "human-confirmed-ai-draft-not-independent-blind",
  );
});

test("review shortcuts undo independently, narrow survey falls back, inputs keep typed keys", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator(".card img").first().click();
  await page.keyboard.press("?");
  await expect(page.locator("#compare-shortcuts")).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.locator("#compare-shortcuts")).toBeHidden();
  await page.keyboard.press("f");
  await expect
    .poll(() =>
      page.evaluate(() => document.fullscreenElement?.tagName.toLowerCase()),
    )
    .toBe("html");
  await page.keyboard.press("f");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await page.keyboard.press("1");
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "★ 精选", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("u");
  await page.keyboard.press("Escape");
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "☆ 精选", exact: true }),
  ).toBeVisible();
  await page.locator("#filter").selectOption("all");
  for (let i = 0; i < 4; i++) await page.locator(".card input").nth(i).check();
  await page.locator("#compare-four").click();
  await expect(page.locator(".compare-frame")).toHaveCount(4);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator(".compare-frame")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.locator("#benchmark-open").click();
  await page.locator("#benchmark-moment").pressSequentially("1?x3u");
  await expect(page.locator("#benchmark-moment")).toHaveValue("1?x3u");
  expect(await page.locator("#shortcut-help").evaluate((e) => e.open)).toBe(
    false,
  );
});

for (const priorAlgorithm of [
  "rules-2.0-beta.2",
  "rules-2.0-beta.3",
  "rules-2.0-beta.4",
])
  test(`${priorAlgorithm} accepted plan requires reacceptance after upgrade while favorite survives`, async ({
    page,
  }) => {
    await page.goto("./");
    await page.locator("#tools-toggle").click();
    await fixture(page);
    await page.locator("#choose").click();
    await expect(page.locator("#global")).toContainText("本地分析完成");
    await page
      .locator(".card")
      .first()
      .getByRole("button", { name: "☆ 精选", exact: true })
      .click();
    await page.locator("#accept").click();
    await expect(page.locator("#acceptance-status-export")).toContainText(
      "已采纳",
    );
    await page.evaluate(async (priorAlgorithm) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("photo-culler-local");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        const tx = db.transaction("cull-sessions", "readwrite"),
          store = tx.objectStore("cull-sessions");
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const value = cursor.value;
          if (!value.acceptedPlan)
            throw Error("Fixture acceptance not persisted");
          const signature = JSON.parse(value.acceptedPlan.signature);
          signature.algorithmVersion = priorAlgorithm;
          value.acceptedPlan.signature = JSON.stringify(signature);
          value.algorithmVersion = value.acceptedAlgorithm = priorAlgorithm;
          cursor.update(value);
          cursor.continue();
        };
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }, priorAlgorithm);
    await page.reload();
    await page.locator("#sessions button").first().click();
    await expect(page.locator("#global")).toContainText("本地分析完成");
    await expect(page.locator("#acceptance-status-results")).toContainText(
      "尚未采纳",
    );
    await expect(
      page
        .locator(".card")
        .first()
        .getByRole("button", { name: "★ 精选", exact: true }),
    ).toBeVisible();
  });

test("changed source invalidates a saved acceptance without aborting session analysis", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#accept").click();
  await page.evaluate(async () => {
    const handle = await window.__source.getFileHandle("A.jpg"),
      writer = await handle.createWritable();
    await writer.write("changed test-owned source bytes");
    await writer.close();
  });
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator('[data-space="export"]').click();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "尚未采纳",
  );
  await expect(page.locator("#copy")).toBeDisabled();
});

test("actual resized, recompressed and cropped image versions remain safe, original dimensions and panoramas are preserved", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await page.evaluate(async () => {
    const storage = await navigator.storage.getDirectory(),
      root = await storage.getDirectoryHandle("versions", { create: true });
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 400;
    const c = canvas.getContext("2d");
    const gradient = c.createLinearGradient(0, 0, 600, 400);
    gradient.addColorStop(0, "#263759");
    gradient.addColorStop(1, "#e3bc83");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 600, 400);
    c.fillStyle = "#192d34";
    c.fillRect(120, 80, 100, 270);
    c.fillStyle = "#dacfaa";
    c.beginPath();
    c.arc(420, 120, 65, 0, Math.PI * 2);
    c.fill();
    const write = async (name, w, h, type, quality, crop = false) => {
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out
        .getContext("2d")
        .drawImage(canvas, crop ? 50 : 0, 0, crop ? 500 : 600, 400, 0, 0, w, h);
      const blob = await new Promise((r) => out.toBlob(r, type, quality));
      const handle = await root.getFileHandle(name, { create: true }),
        writer = await handle.createWritable();
      await writer.write(blob);
      await writer.close();
    };
    await write("base.jpg", 600, 400, "image/jpeg", 0.98);
    await write("resized.png", 300, 200, "image/png");
    await write("recompressed.jpg", 600, 400, "image/jpeg", 0.65);
    await write("cropped.jpg", 500, 400, "image/jpeg", 0.9, true);
    await write("panorama.jpg", 900, 250, "image/jpeg", 0.95);
    window.showDirectoryPicker = async () => root;
  });
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#filter").selectOption("all");
  await expect(page.locator(".card")).toHaveCount(5);
  const states = await page.locator(".card").evaluateAll((cards) =>
    cards.map((card) => ({
      name: card.querySelector("img")?.alt,
      detail: card.querySelector(".recommendation-detail").textContent,
    })),
  );
  expect(states.every((s) => !s.detail.startsWith("暂不导出"))).toBe(true);
  expect(states.some((s) => s.detail.includes("疑似同图版本"))).toBe(true);
  expect(states.find((s) => s.name === "panorama").detail).toContain("待复核");
  const dimensions = await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("photo-culler-local");
      q.onsuccess = () => r(q.result);
    });
    const rows = await new Promise((r) => {
      const q = db.transaction("analysis").objectStore("analysis").getAll();
      q.onsuccess = () => r(q.result);
    });
    db.close();
    return rows.map((r) => r.analysis.analysis.sourceDimensions);
  });
  expect(dimensions).toContainEqual({ width: 600, height: 400 });
  expect(dimensions).toContainEqual({ width: 300, height: 200 });
});

test("target permission denial explains the safe fallback and allows retry without losing acceptance", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#accept").click();
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.locator("#target").click();
  await expect(page.locator("#feedback")).toContainText("未取得目标写权限");
  await expect(page.locator("#copy")).toBeDisabled();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "已采纳",
  );
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => window.__target;
  });
  await page.locator("#target").click();
  await expect(page.locator("#copy")).toBeEnabled();
  expect(
    await page.evaluate(
      async () => (await Array.fromAsync(window.__target.values())).length,
    ),
  ).toBe(0);
});

async function readStudySession(page) {
  return page.evaluate(async () => {
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
    return rows[0];
  });
}
async function oneProxyDraft(page) {
  return page.evaluate(async () => {
    const file = await (await window.__source.getFileHandle("A.jpg")).getFile();
    const sha = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    return {
      version: 1,
      provenance: "ai-proxy",
      labels: [
        {
          relativePath: "A.jpg",
          sourceSHA256: sha,
          mustKeep: true,
          momentId: "moment-a",
        },
      ],
    };
  });
}
function localJSON(value) {
  return {
    name: "local-study.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  };
}

test("downloaded labels restore after browser study loss, invalid imports or declined replacements preserve existing work", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page
    .locator(".card")
    .first()
    .getByRole("button", { name: "☆ 精选", exact: true })
    .click();
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "★ 精选", exact: true }),
  ).toBeVisible();
  await page.locator("#accept").click();
  await expect(page.locator("#feedback")).toContainText("已采纳");
  const decisions = await readStudySession(page);
  await page.locator("#benchmark-open").click();
  await page
    .locator("#benchmark-import")
    .setInputFiles(localJSON(await oneProxyDraft(page)));
  await expect(page.locator("#feedback")).toContainText("已导入 1");
  await page.locator("#benchmark-yes").click();
  await expect(page.locator("#benchmark-result")).toContainText(
    "human-confirmed-ai-draft-not-independent-blind",
  );
  const pending = page.waitForEvent("download");
  await page.locator("#benchmark-download").click();
  const file = await pending;
  const backup = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(backup.study.preferences).toEqual({
    mode: "burst",
    strength: "compact",
    portrait: false,
    portraitKeep: 1,
  });
  expect(backup.study.labels["group:A"].source).toBe("human");
  await page
    .locator("#benchmark-import")
    .setInputFiles(
      localJSON({ study: { ...backup.study, algorithmVersion: "old" } }),
    );
  await expect(page.locator("#feedback")).toContainText("备份来源或算法");
  expect((await readStudySession(page)).benchmark).toEqual(backup.study);
  const replacing = page.waitForEvent("dialog");
  await page.locator("#benchmark-import").setInputFiles(localJSON(backup));
  await (await replacing).dismiss();
  await expect(page.locator("#benchmark-import")).toHaveValue("");
  expect((await readStudySession(page)).benchmark).toEqual(backup.study);
  await page
    .locator("#benchmark")
    .getByRole("button", { name: "保存进度并关闭" })
    .click();
  await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("photo-culler-local");
      q.onsuccess = () => r(q.result);
    });
    await new Promise((r) => {
      const tx = db.transaction("cull-sessions", "readwrite"),
        store = tx.objectStore("cull-sessions"),
        q = store.openCursor();
      q.onsuccess = () => {
        const c = q.result;
        if (c) c.update({ ...c.value, benchmark: null });
      };
      tx.oncomplete = r;
    });
    db.close();
  });
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#benchmark-open").click();
  await page.locator("#benchmark-import").setInputFiles(localJSON(backup));
  await expect(page.locator("#feedback")).toContainText(
    "已恢复标注进度与冻结推荐",
  );
  const restored = await readStudySession(page);
  expect(restored.benchmark).toEqual(backup.study);
  expect(restored.human).toEqual(decisions.human);
  expect(restored.acceptedPlan).toEqual(decisions.acceptedPlan);
  await expect(page.locator("#benchmark-result")).toContainText(
    "human-confirmed-ai-draft-not-independent-blind",
  );
});
test("label save failure preserves prior draft and position, then retry persists a single human confirmation", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#benchmark-open").click();
  await page
    .locator("#benchmark-import")
    .setInputFiles(localJSON(await oneProxyDraft(page)));
  await expect(page.locator("#feedback")).toContainText("已导入 1");
  const before = (await readStudySession(page)).benchmark;
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.__labelSaveFail = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "cull-sessions" && window.__labelSaveFail) {
        window.__labelSaveFail = false;
        throw new DOMException("simulated label quota", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  await page.locator("#benchmark-yes").click();
  await expect(page.locator("#feedback")).toContainText(
    "simulated label quota",
  );
  await expect(page.locator("#benchmark-result")).toContainText(
    "ai-proxy-only",
  );
  expect((await readStudySession(page)).benchmark).toEqual(before);
  await expect(page.locator("#benchmark-yes")).toBeEnabled();
  await page.locator("#benchmark-yes").click();
  await expect(page.locator("#benchmark-result")).toContainText(
    "human-confirmed-ai-draft-not-independent-blind",
  );
  const after = (await readStudySession(page)).benchmark;
  expect(after.index).toBe(1);
  expect(after.labels["group:A"].source).toBe("human");
});

test("low-key representative keeps protected peers and technical-review filter respects manual choice", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(),
      source = await root.getDirectoryHandle("synthetic-low-key", {
        create: true,
      });
    const night = new OffscreenCanvas(128, 128),
      ctx = night.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 32; y < 96; y++)
      for (let x = 32; x < 96; x++) {
        ctx.fillStyle = (x + y) % 2 ? "rgb(32,32,32)" : "rgb(96,96,96)";
        ctx.fillRect(x, y, 1, 1);
      }
    const nightBlob = await night.convertToBlob({ type: "image/png" });
    const day = new OffscreenCanvas(128, 128),
      dc = day.getContext("2d");
    dc.fillStyle = "#888";
    dc.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 30; i++) {
      dc.fillStyle = i % 2 ? "#555" : "#bbb";
      dc.fillRect((i * 7) % 128, (i * 19) % 128, 8, 8);
    }
    const white = new OffscreenCanvas(128, 128);
    white.getContext("2d").fillStyle = "white";
    white.getContext("2d").fillRect(0, 0, 128, 128);
    for (const [name, blob] of [
      ["A.png", nightBlob],
      ["B.png", nightBlob],
      ["Day.png", await day.convertToBlob({ type: "image/png" })],
      ["White.png", await white.convertToBlob({ type: "image/png" })],
    ]) {
      const f = await source.getFileHandle(name, { create: true }),
        w = await f.createWritable();
      await w.write(blob);
      await w.close();
    }
    window.showDirectoryPicker = async () => source;
  });
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#filter").selectOption("all");
  await expect(page.locator(".card")).toHaveCount(4);
  const candidate = page
    .locator(".card")
    .filter({ hasText: "低曝光画面存在连续清晰区域" });
  await expect(candidate).toHaveCount(1);
  await expect(candidate).toContainText("其余疑难照片继续保护");
  await page.locator("#filter").selectOption("technical-review");
  await expect(page.locator(".card")).toHaveCount(3);
  await candidate.getByRole("button", { name: "保留", exact: true }).click();
  await expect(page.locator(".card")).toHaveCount(2);
  await page.locator("#filter").selectOption("all");
  await expect(page.locator(".card")).toHaveCount(4);
});

test("opt-in local effort records observe image opens, persist paused and preserve accepted output", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#accept").click();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "已采纳",
  );
  const read = () =>
    page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const q = indexedDB.open("photo-culler-local");
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction("cull-sessions"),
            q = tx.objectStore("cull-sessions").getAll();
          q.onsuccess = () => resolve(q.result[0]);
          q.onerror = () => reject(q.error);
        });
      } finally {
        db.close();
      }
    });
  const before = await read();
  expect(before.effort).toBeUndefined();
  const signature = before.acceptedPlan.signature;
  await page.bringToFront();
  await page.locator("#effort-open").click();
  await page.locator("#effort-role").selectOption("baseline");
  await page.locator("#effort-operator").selectOption("human");
  await page.locator("#effort-start").click();
  await expect(page.locator("#effort")).not.toBeVisible();
  await expect(page.locator("#effort-summary")).toContainText("记录中");
  await page.locator(".card img").first().click();
  await expect(page.locator("#effort-summary")).toContainText("打开大图 1/4");
  await page.keyboard.press("Escape");
  await page.locator("#effort-open").click();
  await page.locator("#effort-pause").click();
  await expect(page.locator("#effort-status")).toContainText("已暂停");
  await expect(page.locator("#effort-resume")).toBeEnabled();
  const paused = await read();
  expect(paused.acceptedPlan.signature).toBe(signature);
  expect(paused.human).toEqual(before.human);
  expect(paused.effort.runs[0].operator).toBe("synthetic");
  expect(paused.effort.runs[0].viewerIds).toHaveLength(1);
  expect(paused.effort.runs[0].foregroundMs).toBeGreaterThan(0);
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await expect(page.locator("#effort-summary")).toContainText("已暂停");
  await expect(page.locator("#effort-summary")).toContainText("打开大图 1/4");
  await page.locator("#effort-open").click();
  await page.locator("#effort-resume").click();
  await expect(page.locator("#effort")).not.toBeVisible();
  await page.locator("#effort-open").click();
  await page.locator("#effort-finish").click();
  await expect(page.locator("#effort-status")).toContainText("已结束");
  await expect(page.locator("#effort-start")).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.locator("#effort-download").click();
  const file = await download;
  const exported = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(exported.type).toBe("local-review-effort");
  expect(exported.data.runs[0].status).toBe("completed");
  expect(exported.data.runs[0].operator).toBe("synthetic");
  expect((await read()).acceptedPlan.signature).toBe(signature);
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const q = indexedDB.open("photo-culler-local");
      q.onsuccess = () => resolve(q.result);
    });
    try {
      const tx = db.transaction("cull-sessions", "readwrite"),
        store = tx.objectStore("cull-sessions"),
        cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        const value = c.value;
        delete value.effort;
        c.update(value);
        c.continue();
      };
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#effort-open").click();
  await page.locator("#effort-import").setInputFiles({
    name: "effort-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator("#feedback")).toContainText("复核记录已恢复");
  const restored = await read();
  expect(restored.effort.runs[0].operator).toBe("synthetic");
  expect(restored.effort.runs[0].viewerIds).toHaveLength(1);
  expect(restored.acceptedPlan.signature).toBe(signature);
});

test("effort storage failure pauses the observation and leaves photo-review state usable", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.__effortOriginalPut = put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === "cull-sessions" && value.effort)
        throw new DOMException(
          "synthetic effort quota failure",
          "QuotaExceededError",
        );
      return put.call(this, value, ...args);
    };
  });
  await page.locator("#effort-open").click();
  await page.locator("#effort-start").click();
  await expect(page.locator("#feedback")).toContainText("复核记录保存失败");
  await expect(page.locator("#effort-status")).toContainText("已暂停");
  await expect(page.locator("#effort-download")).toBeEnabled();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.__effortOriginalPut;
  });
  await page.locator("#effort-resume").click();
  await expect(page.locator("#effort")).not.toBeVisible();
  await page.locator("#accept").click();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "已采纳",
  );
});

test("switching roots pauses effort in its original session without leaking it into the next root", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-toggle").click();
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("#effort-open").click();
  await page.locator("#effort-start").click();
  await expect(page.locator("#effort")).not.toBeVisible();
  await page.locator(".card img").first().click();
  await expect(page.locator("#effort-summary")).toContainText("打开大图 1/4");
  await page.keyboard.press("Escape");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(),
      other = await root.getDirectoryHandle("effort-other", { create: true }),
      f = await other.getFileHandle("A.jpg", { create: true }),
      w = await f.createWritable();
    await w.write(window.__blob);
    await w.close();
    window.showDirectoryPicker = async () => other;
  });
  await page.locator('[data-space="import"]').click();
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("effort-other");
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await expect(page.locator("#effort-summary")).toBeHidden();
  const rows = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const q = indexedDB.open("photo-culler-local");
      q.onsuccess = () => resolve(q.result);
    });
    try {
      return await new Promise((resolve) => {
        const q = db
          .transaction("cull-sessions")
          .objectStore("cull-sessions")
          .getAll();
        q.onsuccess = () => resolve(q.result);
      });
    } finally {
      db.close();
    }
  });
  expect(rows.find((r) => r.name === "camera").effort.runs[0].status).toBe(
    "paused",
  );
  expect(
    rows.find((r) => r.name === "camera").effort.runs[0].viewerIds,
  ).toHaveLength(1);
  expect(rows.find((r) => r.name === "effort-other").effort).toBeUndefined();
  await page.locator('[data-space="import"]').click();
  await page
    .locator("#sessions button")
    .filter({ hasText: "camera ·" })
    .click();
  await expect(page.locator("#global")).toContainText("camera · 7");
  await expect(page.locator("#effort-summary")).toContainText("已暂停");
  await expect(page.locator("#effort-summary")).toContainText("打开大图 1/4");
});

test("simple workflow keeps one next step, optional tools and protected reacceptance accessible", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#tools-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator("#mode")).not.toBeVisible();
  await expect(page.locator("#benchmark-open")).not.toBeVisible();
  await page.screenshot({
    path: "output/simple-workflow/first-run.png",
    fullPage: true,
  });
  await fixture(page);
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await expect(page.locator("#accept")).toHaveText("下一步：导出推荐照片");
  await expect(page.locator("#simple-result-guide")).toContainText("暂不选入");
  await expect(page.locator("#effort-open")).not.toBeVisible();
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "保留", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".card")
      .first()
      .getByRole("button", { name: "拆出连拍", exact: true }),
  ).not.toBeVisible();
  await page.locator(".card img").first().click();
  await expect(page.locator("#compare")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "output/simple-workflow/results.png",
    fullPage: true,
  });
  await page.locator("#accept").click();
  await expect(page.locator("#export-space")).toBeVisible();
  await page.screenshot({
    path: "output/simple-workflow/export.png",
    fullPage: true,
  });
  await expect(page.locator("#copy")).toBeDisabled();
  await page.locator("#include-protected").check();
  await page.getByRole("button", { name: "确认当前选择", exact: true }).click();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "已采纳",
  );
  await page.locator("#target").click();
  await page.locator("#copy").click();
  await expect(page.locator("#confirm-text")).toContainText("原件只读");
  await page.locator("#confirm-cancel").click();
  expect(
    await page.evaluate(
      async () => (await Array.fromAsync(window.__target.values())).length,
    ),
  ).toBe(0);
  await page.locator('[data-space="results"]').click();
  await expect(page.locator("#accept")).toHaveText("继续：选择保存位置");
  await page.locator("#accept").click();
  await expect(page.locator("#export-space")).toBeVisible();
  await page.locator('[data-space="results"]').click();
  await page.locator("#tools-toggle").click();
  await expect(page.locator("#effort-open")).toBeVisible();
  await expect(page.locator("#compare-two")).toBeVisible();
  await page.reload();
  await expect(page.locator("#tools-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("portrait enhancement is opt-in, self-hosted and versioned without changing source bytes", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) =>
    requests.push({ url: r.url(), method: r.method() }),
  );
  await page.goto("./");
  await fixture(page);
  await expect(page.locator("#portrait")).not.toBeChecked();
  await expect(page.locator("#portrait-budget")).not.toBeVisible();
  expect(
    requests.some((r) => /models\/portrait|portrait-runtime/.test(r.url)),
  ).toBe(false);
  await page.locator("#portrait").check();
  await expect(page.locator("#portrait-budget")).toBeVisible();
  await page.locator("#portrait-keep").selectOption("2");
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  const result = await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("photo-culler-local");
      q.onsuccess = () => r(q.result);
    });
    const all = (n) =>
      new Promise((r) => {
        const q = db.transaction(n).objectStore(n).getAll();
        q.onsuccess = () => r(q.result);
      });
    const analysis = await all("analysis"),
      sessions = await all("cull-sessions");
    db.close();
    return {
      portrait: analysis
        .filter((x) => x.analysis.analysis.thumbnail)
        .map((x) => x.analysis.analysis.portrait),
      prefs: sessions[0].preferences,
    };
  });
  expect(result.portrait).toHaveLength(4);
  expect(result.portrait.every((x) => x?.status === "ready")).toBe(true);
  expect(result.prefs.portrait).toBe(true);
  expect(result.prefs.portraitKeep).toBe(2);
  expect(
    requests.some((r) => /models\/portrait-v1\/.*\.wasm/.test(r.url)),
  ).toBe(true);
  expect(
    requests
      .filter((r) => /^https?:/.test(r.url))
      .every(
        (r) =>
          new URL(r.url).origin === new URL(page.url()).origin &&
          r.method === "GET",
      ),
  ).toBe(true);
  await page.locator("#accept").click();
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "已采纳",
  );
  await page.reload();
  await page.locator("#sessions button").first().click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await page.locator("[data-space=import]").click();
  await expect(page.locator("#portrait")).toBeChecked();
  await page.locator("#portrait-keep").selectOption("1");
  await expect(page.locator("#acceptance-status-export")).toContainText(
    "尚未采纳",
  );
});

test("missing portrait model falls back to unchanged rules and keeps photo review usable", async ({
  page,
}) => {
  await page.route("**/models/portrait-v1/**", (route) =>
    route.fulfill({ status: 404, body: "synthetic missing model" }),
  );
  await page.goto("./");
  await fixture(page);
  await page.locator("#portrait").check();
  await page.locator("#choose").click();
  await expect(page.locator("#global")).toContainText("本地分析完成");
  await expect(page.locator("#feedback")).toContainText("已安全使用原有规则");
  await page.locator("#accept").click();
  await expect(page.locator("#export-space")).toBeVisible();
  await expect(page.locator("#copy")).toBeDisabled();
});
