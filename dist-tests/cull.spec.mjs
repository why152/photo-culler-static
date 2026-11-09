import { test, expect } from "@playwright/test";
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
  await expect(page.locator("#choose")).toBeEnabled();
  await page.getByRole("link", { name: "1.0 图库与历史恢复" }).click();
  await expect(page.locator("#choose-folder")).toBeEnabled();
});

test("an interrupted copy resumes after reload using its saved output without changing source files", async ({
  page,
}) => {
  await page.goto("./");
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
    .poll(() => page.evaluate(() => document.fullscreenElement?.tagName.toLowerCase()))
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

test("changed source invalidates a saved acceptance without aborting session analysis", async ({
  page,
}) => {
  await page.goto("./");
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
      detail: card.querySelectorAll("p")[1].textContent,
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
