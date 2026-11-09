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

test('an interrupted copy resumes after reload using its saved output without changing source files',async({page})=>{
 await page.goto('./');await fixture(page);await page.locator('#choose').click();await expect(page.locator('#global')).toContainText('本地分析完成');
 await page.locator('[data-space="export"]').click();await page.locator('#include-protected').check();await page.locator('#target').click();
 await page.evaluate(()=>{const original=FileSystemDirectoryHandle.prototype.getDirectoryHandle;let fail=true;FileSystemDirectoryHandle.prototype.getDirectoryHandle=function(name,options){if(name==='Keepers'&&fail){fail=false;return Promise.reject(new DOMException('simulated disk full','QuotaExceededError'));}return original.call(this,name,options);};});
 await page.locator('#copy').click();await page.locator('#confirm-copy').click();await expect(page.locator('#feedback')).toContainText('导出未完成');
 await page.reload();await page.locator('#sessions button').first().click();await expect(page.locator('#global')).toContainText('本地分析完成');await page.locator('[data-space="export"]').click();await page.getByRole('button',{name:'继续上次中断导出'}).click();await page.locator('#confirm-copy').click();await expect(page.locator('#feedback')).toContainText('已复制并校验');
 const count=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory();const target=await root.getDirectoryHandle('exports');return (await Array.fromAsync(target.values())).length;});expect(count).toBe(1);
});
