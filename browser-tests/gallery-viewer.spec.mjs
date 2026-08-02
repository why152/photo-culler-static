import { expect, test } from "@playwright/test";

async function createPhotoSource(page, sourceName, photoCount = 3) {
  await page.evaluate(async ([name, count]) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(24, 16);
    const context = canvas.getContext("2d");
    context.fillStyle = "#596f8f";
    context.fillRect(0, 0, 24, 16);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    for (const filename of Array.from(
      { length: count },
      (_, index) => `P1${String(index + 1).padStart(6, "0")}.JPG`,
    )) {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(image);
      await writable.close();
    }
    window.showDirectoryPicker = async () => source;
  }, [sourceName, photoCount]);
}

async function sourceEntryNames(page, sourceName) {
  return await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name);
    const names = [];
    for await (const entry of source.values()) names.push(entry.name);
    return names.sort();
  }, sourceName);
}

test("Photo Viewer provides a filmstrip and continuous review before returning focus to its opening thumbnail", async ({
  page,
}) => {
  const sourceName = `photo-culler-gallery-${crypto.randomUUID()}`;
  const errors = [];
  const requests = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");

  await createPhotoSource(page, sourceName);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();

  const card = page.locator('[id="photo-card:photo-group:P1000002"]');
  await expect(card).toBeVisible();
  await card.click();

  const viewer = page.getByRole("dialog", { name: "Photo Viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "查看 P1000001.JPG" }),
  ).toBeVisible();
  await viewer.getByRole("button", { name: "查看 P1000001.JPG" }).click();
  await expect(viewer.getByText("1 / 3")).toBeVisible();
  await page.locator("#photo-viewer").focus();
  await page.keyboard.press("Space");
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("1 / 3")).toBeVisible();
  await page.keyboard.press("j");
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("3 / 3")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await page.keyboard.press("1");
  await expect(viewer.getByText("3 / 3")).toBeVisible();
  await page.getByRole("button", { name: "关闭大图" }).click();

  await expect(viewer).toBeHidden();
  await expect(card).toBeFocused();
  await expect(card).toContainText("精选");
  expect(errors).toEqual([]);
  expect(
    requests.filter((url) => /^https?:/.test(url)).every((url) =>
      url.startsWith("http://127.0.0.1:4173/"),
    ),
  ).toBe(true);
});

test("action selection is explicit, supports Shift ranges, and does not replace opening Photo Viewer", async ({
  page,
}) => {
  const sourceName = `photo-culler-selection-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName);
  const originalEntries = await sourceEntryNames(page, sourceName);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();

  await page
    .getByRole("button", { name: "选择 P1000001.JPG" })
    .click();
  await page
    .getByRole("button", { name: "选择 P1000003.JPG" })
    .click({ modifiers: ["Shift"] });

  const selectionBar = page.getByRole("region", { name: "批量选择" });
  await expect(selectionBar).toContainText("已选 3 个 photo group");
  await page.locator('[id="photo-card:photo-group:P1000002"]').click();
  await expect(page.getByRole("dialog", { name: "Photo Viewer" })).toBeVisible();
  await expect(selectionBar).toContainText("已选 3 个 photo group");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(selectionBar).toBeHidden();
  expect(await sourceEntryNames(page, sourceName)).toEqual(originalEntries);
});

test("an empty review filter explains its result without creating a file action", async ({
  page,
}) => {
  const sourceName = `photo-culler-empty-filter-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName);
  const originalEntries = await sourceEntryNames(page, sourceName);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();

  await page.getByRole("button", { name: "精选" }).click();
  await expect(page.locator("#photo-grid").getByRole("status")).toHaveText(
    "没有符合“精选”筛选条件的 photo group。",
  );
  expect(await sourceEntryNames(page, sourceName)).toEqual(originalEntries);
});

test("Photo Viewer leaves Space to its focused controls and returns focus after the last unreviewed decision hides it", async ({
  page,
}) => {
  const sourceName = `photo-culler-viewer-focus-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName, 1);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();

  const card = page.locator('[id="photo-card:photo-group:P1000001"]');
  await card.click();
  const viewer = page.getByRole("dialog", { name: "Photo Viewer" });
  await expect(page.getByRole("button", { name: "关闭大图" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(viewer).toBeHidden();
  await expect(card).toBeFocused();

  await page.getByRole("button", { name: "未筛" }).click();
  await card.click();
  await page.keyboard.press("1");
  await expect(viewer).toBeHidden();
  await expect(page.locator("#photo-grid").getByRole("status")).toHaveText(
    "没有符合“未筛”筛选条件的 photo group。",
  );
  await expect(page.getByRole("button", { name: "未筛" })).toBeFocused();
});

test("Photo Viewer restores the opening grid scroll position", async ({ page }) => {
  const sourceName = `photo-culler-viewer-scroll-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName, 24);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(24);
  await expect(page.getByRole("status", { name: "操作进度" })).toContainText(
    "JPEG 分析完成",
  );

  const card = page.locator('[id="photo-card:photo-group:P1000024"]');
  await card.scrollIntoViewIfNeeded();
  const openingScrollY = await page.evaluate(() => window.scrollY);
  await card.click();
  await page.getByRole("button", { name: "关闭大图" }).click();

  await expect(card).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(openingScrollY);
});
