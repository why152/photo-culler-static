import { expect, test } from "@playwright/test";

async function openSource(page, count = 4) {
  await page.evaluate(async (photoCount) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(`review-${crypto.randomUUID()}`, { create: true });
    const canvas = new OffscreenCanvas(24, 16);
    canvas.getContext("2d").fillRect(0, 0, 24, 16);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    for (let index = 1; index <= photoCount; index++) {
      const file = await source.getFileHandle(`P${index}.JPG`, { create: true });
      const writable = await file.createWritable();
      await writable.write(image);
      await writable.close();
    }
    window.__reviewSource = source;
    window.showDirectoryPicker = async () => source;
  }, count);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator('[id="photo-card:photo-group:P1"]')).toBeVisible();
}

async function delaySaves(page) {
  await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const save = BrowserReviewStore.prototype.save;
    window.__reviewWrites = [];
    window.__reviewGate = new Promise((resolve) => { window.__releaseReviewSave = resolve; });
    BrowserReviewStore.prototype.save = async function(directory, review) {
      window.__reviewWrites.push(structuredClone(review));
      await window.__reviewGate;
      return save.call(this, directory, review);
    };
  });
}

async function persistedReview(page) {
  return page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const store = new BrowserReviewStore();
    const review = await store.load(window.__reviewSource);
    await store.close();
    return review;
  });
}

test("rapid review keys advance immediately and undo remains ordered while saves wait", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await openSource(page);
  await delaySaves(page);
  await page.locator('[id="photo-card:photo-group:P1"]').click();
  await page.evaluate(() => {
    for (const key of ["1", "2", "x", "u"])
      document.getElementById("photo-viewer").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
  expect(errors).toEqual([]);
  await expect(page.locator("#viewer-name")).toHaveText("P4.JPG");
  await expect(page.locator('[id="photo-card:photo-group:P1"]')).toContainText("精选");
  await expect(page.locator('[id="photo-card:photo-group:P2"]')).toContainText("保留");
  await expect(page.locator('[id="photo-card:photo-group:P3"]')).not.toContainText("建议移出");
  expect(await page.evaluate(() => window.__reviewWrites.length)).toBe(1);
  await page.evaluate(() => window.__releaseReviewSave());
  await expect(page.locator("#review-save-status")).toBeHidden();
  expect((await persistedReview(page)).decisions).toEqual({ "photo-group:P1": "pick", "photo-group:P2": "keep" });
  expect(errors).toEqual([]);
});

test("storage failure retains optimistic decisions and exposes a working retry", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await openSource(page, 2);
  await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const save = BrowserReviewStore.prototype.save;
    window.__reviewSaveFails = true;
    BrowserReviewStore.prototype.save = function(...args) {
      return window.__reviewSaveFails ? Promise.reject(new Error("test storage failure")) : save.apply(this, args);
    };
  });
  await page.locator('[id="photo-card:photo-group:P1"]').click();
  await page.keyboard.press("1");
  await expect(page.locator("#viewer-name")).toHaveText("P2.JPG");
  await expect(page.locator("#review-save-status")).toContainText("审核记录保存失败");
  await expect(page.locator('[id="photo-card:photo-group:P1"]')).toContainText("精选");
  await page.evaluate(() => { window.__reviewSaveFails = false; });
  await page.getByRole("button", { name: "重试保存" }).click();
  await expect(page.locator("#review-save-status")).toBeHidden();
  expect((await persistedReview(page)).decisions).toEqual({ "photo-group:P1": "pick" });
  expect(errors).toEqual([]);
});

test("directory switching waits for pending saves and clears old undo history", async ({ page }) => {
  await page.goto("/");
  await openSource(page, 2);
  await delaySaves(page);
  await page.locator('[id="photo-card:photo-group:P1"]').click();
  await page.keyboard.press("1");
  await page.getByRole("button", { name: "关闭大图" }).click();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const next = await root.getDirectoryHandle(`review-next-${crypto.randomUUID()}`, { create: true });
    const sourceFile = await window.__reviewSource.getFileHandle("P1.JPG");
    const nextFile = await next.getFileHandle("P1.JPG", { create: true });
    const writable = await nextFile.createWritable();
    await writable.write(await sourceFile.getFile());
    await writable.close();
    window.showDirectoryPicker = async () => next;
  });
  await page.locator("#choose-folder").click();
  await expect(page.locator('[id="photo-card:photo-group:P2"]')).toBeVisible();
  await page.evaluate(() => window.__releaseReviewSave());
  await expect(page.locator('[id="photo-card:photo-group:P2"]')).toHaveCount(0);
  await page.locator('[id="photo-card:photo-group:P1"]').click();
  await page.keyboard.press("u");
  await expect(page.locator('[id="photo-card:photo-group:P1"]')).not.toContainText("精选");
  expect((await persistedReview(page))).toBeNull();
});
