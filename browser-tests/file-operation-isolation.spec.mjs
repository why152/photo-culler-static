import { expect, test } from "@playwright/test";

async function createSource(page, name) {
  await page.evaluate(async (sourceName) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(sourceName, { create: true });
    const canvas = new OffscreenCanvas(24, 16);
    canvas.getContext("2d").fillRect(0, 0, 24, 16);
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg" });
    for (const filename of ["ONE.JPG", "TWO.JPG"]) {
      const file = await source.getFileHandle(filename, { create: true });
      const writable = await file.createWritable();
      await writable.write(jpeg);
      await writable.close();
    }
    window.__pickerCalls = 0;
    window.showDirectoryPicker = async () => {
      window.__pickerCalls += 1;
      return source;
    };
  }, name);
  await page.getByRole("button", { name: "选择照片文件夹", exact: true }).click();
  await expect(page.locator(".photo-card")).toHaveCount(2);
  await expect(page.locator("#operation-title")).toHaveText("照片分析完成");
}

async function diskState(page, name) {
  return page.evaluate(async (sourceName) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(sourceName);
    const files = [];
    const batches = [];
    for await (const handle of source.values()) {
      if (handle.kind === "file") files.push(handle.name);
      else {
        const manifest = await handle.getFileHandle("move-manifest.json");
        const journal = JSON.parse(await (await manifest.getFile()).text());
        batches.push({ id: handle.name, journal });
      }
    }
    return { files: files.sort(), batches: batches.sort((a, b) => a.id.localeCompare(b.id)) };
  }, name);
}

async function moveSelected(page, filename) {
  await page.getByRole("button", { name: `选择 ${filename}`, exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "移动已选项", exact: true }).click();
}

test("a completed move survives review-store failure, reconciles the grid, and retries the normalized review", async ({ page }) => {
  const name = `file-save-failure-${crypto.randomUUID()}`;
  await page.goto("/legacy.html");
  await createSource(page, name);
  for (const filename of ["ONE.JPG", "TWO.JPG"]) {
    await page.locator(`[id="photo-card:photo-group:${filename.slice(0, -4)}"]`).click();
    await page.locator("#viewer-keep").click();
    await page.getByRole("button", { name: "关闭大图", exact: true }).click();
  }
  await expect(page.locator("#review-save-status")).toBeHidden();
  await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("./modules/browser-store.js");
    const save = BrowserReviewStore.prototype.save;
    window.__rejectReviewSaves = true;
    window.__failedReviewSaves = 0;
    BrowserReviewStore.prototype.save = async function (...args) {
      if (window.__rejectReviewSaves) {
        window.__failedReviewSaves += 1;
        throw new DOMException("Movement review storage unavailable", "QuotaExceededError");
      }
      return save.apply(this, args);
    };
  });

  await moveSelected(page, "ONE.JPG");
  await expect(page.locator("#review-save-status")).toContainText("审核记录保存失败");
  await expect(page.locator('[id="photo-card:photo-group:ONE"]')).toHaveCount(0);
  await expect(page.locator('[id="photo-card:photo-group:TWO"]')).toContainText("保留");
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await expect(page.locator("#moved-count")).toHaveText("1");
  expect(await page.evaluate(() => window.__failedReviewSaves)).toBeGreaterThanOrEqual(2);
  const moved = await diskState(page, name);
  expect(moved.files).toEqual(["TWO.JPG"]);
  expect(moved.batches).toHaveLength(1);
  expect(moved.batches[0].journal.status).toBe("completed");
  expect(moved.batches[0].journal.records[0].state).toBe("moved");

  await page.evaluate(() => { window.__rejectReviewSaves = false; });
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.locator("#review-save-status")).toBeHidden();
  const saved = await page.evaluate(async (sourceName) => {
    const { BrowserReviewStore } = await import("./modules/browser-store.js");
    const source = await (await navigator.storage.getDirectory()).getDirectoryHandle(sourceName);
    const store = new BrowserReviewStore();
    const review = await store.load(source);
    await store.close();
    return review;
  }, name);
  expect(saved.decisions).toEqual({ "photo-group:TWO": "keep" });

  await page.locator("#moved-groups-button").click();
  await page.getByRole("button", { name: "恢复整批", exact: true }).click();
  await expect(page.locator(".photo-card")).toHaveCount(2);
  await expect.poll(() => diskState(page, name)).toEqual({ files: ["ONE.JPG", "TWO.JPG"], batches: [] });
});

test("pending member movement blocks duplicate file actions and directory switching in the UI", async ({ page }) => {
  const name = `file-operation-lock-${crypto.randomUUID()}`;
  await page.goto("/legacy.html");
  await createSource(page, name);
  await moveSelected(page, "ONE.JPG");
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await page.locator("#moved-groups-button").click();
  await expect(page.getByRole("button", { name: "恢复整批", exact: true })).toBeVisible();

  await page.evaluate(() => {
    const move = FileSystemFileHandle.prototype.move;
    window.__memberMoves = 0;
    window.__holdMemberMoves = true;
    FileSystemFileHandle.prototype.move = async function (...args) {
      window.__memberMoves += 1;
      if (window.__holdMemberMoves) {
        await new Promise((resolve) => { window.__releaseMemberMove = resolve; });
      }
      return move.apply(this, args);
    };
  });
  await moveSelected(page, "TWO.JPG");
  await expect.poll(() => page.evaluate(() => window.__memberMoves)).toBe(1);
  await expect(page.locator("#choose-folder")).toBeDisabled();
  await page.evaluate(() => {
    // Dispatch also exercises handler guards, even if disabled UI is bypassed.
    document.getElementById("choose-folder").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.getElementById("move-button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelector(".moved-batch-header button").click();
  });
  expect(await page.evaluate(() => window.__pickerCalls)).toBe(1);
  expect(await page.evaluate(() => window.__memberMoves)).toBe(1);
  const before = await diskState(page, name);
  expect(before.files).toEqual(["TWO.JPG"]);
  expect(before.batches.find((batch) => batch.journal.status === "completed").journal.records[0].source).toBe("ONE.JPG");
  await page.evaluate(() => { window.__holdMemberMoves = false; window.__releaseMemberMove(); });
  await expect(page.locator(".photo-card")).toHaveCount(0);
  await expect(page.locator("#moved-count")).toHaveText("2");

  await page.evaluate(() => { window.__holdMemberMoves = true; });
  await page.getByRole("button", { name: "恢复整批", exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => window.__memberMoves)).toBe(2);
  await page.evaluate(() => {
    document.getElementById("choose-folder").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelectorAll(".moved-batch-header button").forEach((button) => button.click());
  });
  expect(await page.evaluate(() => window.__pickerCalls)).toBe(1);
  expect(await page.evaluate(() => window.__memberMoves)).toBe(2);
  await page.evaluate(() => { window.__holdMemberMoves = false; window.__releaseMemberMove(); });
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await expect(page.locator("#moved-count")).toHaveText("1");
  const restored = await diskState(page, name);
  expect(restored.files).toHaveLength(1);
  expect(restored.batches).toHaveLength(1);
});
