import { expect, test } from "@playwright/test";

async function preparePhotoDirectory(page, sourceName) {
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(24, 16);
    const context = canvas.getContext("2d");
    context.fillStyle = "#5f7f9e";
    context.fillRect(0, 0, 24, 16);
    const file = await source.getFileHandle("P5000001.JPG", { create: true });
    const writable = await file.createWritable();
    await writable.write(await canvas.convertToBlob({ type: "image/jpeg" }));
    await writable.close();
    window.showDirectoryPicker = async () => source;
  }, sourceName);
}

test("first run gives the local directory picker one compact, keyboard-operable entry", async ({
  page,
}) => {
  const sourceName = `photo-culler-first-run-${crypto.randomUUID()}`;
  await page.goto("/");
  await preparePhotoDirectory(page, sourceName);

  const entry = page.locator("#empty-state");
  const chooseFolder = page.locator("#empty-choose-folder");
  await expect(entry).toBeVisible();
  await expect(entry.getByRole("heading", { name: "开始筛选照片" })).toBeVisible();
  await expect(chooseFolder).toHaveAccessibleName("选择照片文件夹");
  await expect(page.getByRole("button", { name: "选择照片文件夹" })).toHaveCount(1);
  await expect(page.locator("#choose-folder")).toBeHidden();
  await expect(page.getByRole("button", { name: "已移动 0" })).toBeHidden();
  await expect(page.getByRole("contentinfo")).toBeHidden();
  await expect(page.locator("#operation-feedback")).toBeHidden();
  expect((await entry.boundingBox()).height).toBeLessThan(220);

  await chooseFolder.focus();
  await expect(chooseFolder).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("status", { name: "操作进度", exact: true }),
  ).toContainText("正在读取照片文件夹");
  await expect(entry).toBeHidden();
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "选择其他文件夹" }),
  ).toBeVisible();
});

test("first-run directory entry also accepts Enter", async ({ page }) => {
  const sourceName = `photo-culler-first-run-enter-${crypto.randomUUID()}`;
  await page.goto("/");
  await preparePhotoDirectory(page, sourceName);

  await page.locator("#empty-choose-folder").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status", { name: "操作进度", exact: true }),
  ).toContainText("正在读取照片文件夹");
  await expect(page.locator(".photo-card")).toHaveCount(1);
});

test("first-run directory action has a visible pointer press state", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.showDirectoryPicker = () => new Promise(() => {});
  });
  const action = page.locator("#empty-choose-folder");
  const box = await action.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => action.evaluate((button) => getComputedStyle(button).transform))
    .toBe("matrix(1, 0, 0, 1, 0, 1)");
  await page.mouse.up();
  await expect(
    page.getByRole("status", { name: "操作进度", exact: true }),
  ).toContainText("正在读取照片文件夹");
});
