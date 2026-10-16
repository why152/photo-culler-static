import { expect, test } from "@playwright/test";

async function openSource(page, count = 3, paired = false) {
  await page.goto("/");
  await page.evaluate(async ({ count, paired }) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(`usability-${crypto.randomUUID()}`, { create: true });
    const canvas = new OffscreenCanvas(24, 16);
    canvas.getContext("2d").fillRect(0, 0, 24, 16);
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg" });
    for (let index = 1; index <= count; index++) {
      for (const extension of paired && index === 1 ? ["JPG", "RW2", "XMP"] : ["JPG"]) {
        const file = await source.getFileHandle(`P${String(index).padStart(3, "0")}.${extension}`, { create: true });
        const writer = await file.createWritable();
        await writer.write(extension === "JPG" ? jpeg : extension);
        await writer.close();
      }
    }
    window.__usabilitySource = source;
    window.showDirectoryPicker = async () => source;
  }, { count, paired });
  await page.locator("#empty-choose-folder").click();
  await expect(page.locator('[id="photo-card:photo-group:P001"]')).toBeVisible();
}

async function review(page) {
  return page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const store = new BrowserReviewStore();
    try { return await store.load(window.__usabilitySource); }
    finally { await store.close(); }
  });
}

async function resume(page) {
  await page.reload();
  await page.locator("#resume-folder").click();
}

test("review progress tracks decisions and undo independently of the current filter", async ({ page }) => {
  await openSource(page);
  await expect(page.locator("#review-count")).toHaveText("已筛 0 / 3 · 当前筛选 3 个照片组");
  await page.locator('[id="photo-card:photo-group:P001"]').click();
  await page.keyboard.press("1");
  await expect(page.locator("#review-count")).toHaveText("已筛 1 / 3 · 当前筛选 3 个照片组");
  await page.keyboard.press("u");
  await expect(page.locator("#review-count")).toHaveText("已筛 0 / 3 · 当前筛选 3 个照片组");
  await page.keyboard.press("2");
  await page.locator("#viewer-close").click();
  await page.locator('[data-filter="unreviewed"]').click();
  await expect(page.locator("#review-count")).toHaveText("已筛 1 / 3 · 当前筛选 2 个照片组");
});

test("resume restores an open viewer and keeps a closed viewer closed", async ({ page }) => {
  await openSource(page);
  await page.locator('[id="photo-card:photo-group:P002"]').click();
  await expect.poll(async () => {
    const value = await review(page);
    return [value?.selectedId, value?.viewerOpen];
  }).toEqual(["photo-group:P002", true]);
  await resume(page);
  await expect(page.locator("#photo-viewer")).toBeVisible();
  await expect(page.locator("#viewer-name")).toHaveText("P002.JPG");
  // The source handle survives reload in IndexedDB; recover it for readback.
  await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const store = new BrowserReviewStore();
    window.__usabilitySource = await store.loadLastDirectory();
    await store.close();
  });
  await page.locator("#viewer-close").click();
  await expect.poll(async () => (await review(page))?.viewerOpen).toBe(false);
  await resume(page);
  await expect(page.locator("#photo-viewer")).toBeHidden();
});

test("grid-only scroll resumes without opening a viewer or restoring action selection", async ({ page }) => {
  await openSource(page, 160);
  await page.getByRole("button", { name: "选择 P001.JPG", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 1800));
  await expect.poll(async () => (await review(page))?.scrollY ?? 0).toBeGreaterThan(1000);
  const savedY = (await review(page)).scrollY;
  expect((await review(page)).selectedId).toBeNull();
  await resume(page);
  await expect(page.locator("#photo-viewer")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(savedY - 5);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - savedY)).toBeLessThan(5);
  await expect(page.locator("#action-selection-count")).not.toContainText("已选");
});

test("move confirmation names the exact destination and complete group member counts", async ({ page }) => {
  await openSource(page, 2, true);
  await page.getByRole("button", { name: "选择 P001.JPG", exact: true }).click();
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = page.locator("#move-button").click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  const match = message.match(/^确认移动 1 个照片组、共 3 个文件到“(_PhotoCull_Review_[^”]+)”？\n位置：当前文件夹“([^”]+)”内。\n可从“已移动”恢复。$/);
  await dialog.accept();
  await clickPromise;
  expect(match).not.toBeNull();
  await expect(page.locator('[id="photo-card:photo-group:P001"]')).toHaveCount(0);
  const destination = await page.evaluate(async (name) => {
    const batch = await window.__usabilitySource.getDirectoryHandle(name);
    const members = [];
    for await (const entry of batch.values()) members.push(entry.name);
    return { members: members.sort(), source: window.__usabilitySource.name };
  }, match[1]);
  expect(destination.source).toBe(match[2]);
  expect(destination.members).toEqual(["P001.JPG", "P001.RW2", "P001.XMP", "move-manifest.json"]);
});
