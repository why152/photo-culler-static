import { expect, test } from "@playwright/test";

async function createMixedPhotoSource(page, sourceName) {
  await page.goto("/");
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const makeImage = async (type, fillStyle) => {
      const canvas = new OffscreenCanvas(64, 48);
      const context = canvas.getContext("2d");
      context.fillStyle = fillStyle;
      context.fillRect(0, 0, 64, 48);
      return canvas.convertToBlob({ type });
    };
    const pngCopy = await makeImage("image/png", "#8a5a44");
    const webpCopy = await makeImage("image/webp", "#44718a");
    const writeFile = async (filename, contents) => {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    };
    await writeFile("P6000001.PNG", pngCopy);
    await writeFile("P6000001.XMP", new TextEncoder().encode("xmp-copy"));
    await writeFile("P6000002.WEBP", webpCopy);
    window.showDirectoryPicker = async () => source;
  }, sourceName);
}

test("PNG and WEBP photo groups scan, analyze, move, and restore like JPEG groups", async ({
  page,
}) => {
  const sourceName = `photo-culler-png-webp-${crypto.randomUUID()}`;
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await createMixedPhotoSource(page, sourceName);

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(2);
  const operation = page.getByRole("status", {
    name: "操作进度",
    exact: true,
  });
  await expect(operation).toContainText("照片分析完成");
  await expect(page.locator(".photo-card > img")).toHaveCount(2);

  await page.getByRole("button", { name: "选择 P6000001.PNG" }).click();
  await page.getByRole("button", { name: "选择 P6000002.WEBP" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "移动已选项" }).click();
  await expect(page.getByRole("button", { name: "已移动 1" })).toBeEnabled();

  await page.getByRole("button", { name: "已移动 1" }).click();
  await expect(page.locator(".moved-photo")).toHaveCount(2);
  await expect
    .poll(async () =>
      page.locator(".moved-photo img").evaluateAll((images) =>
        images.every((image) => image.getAttribute("src")?.startsWith("blob:")),
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "恢复整批" }).click();
  await expect(operation).toContainText("已恢复 review batch");
  await expect(page.locator(".photo-card")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("a JPEG-first stem keeps JPEG as the analysis source beside PNG and WEBP members", async ({
  page,
}) => {
  const sourceName = `photo-culler-jpeg-first-${crypto.randomUUID()}`;
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const makeImage = async (type, fillStyle) => {
      const canvas = new OffscreenCanvas(48, 48);
      const context = canvas.getContext("2d");
      context.fillStyle = fillStyle;
      context.fillRect(0, 0, 48, 48);
      return canvas.convertToBlob({ type });
    };
    const writeFile = async (filename, contents) => {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    };
    await writeFile("P7000001.JPG", await makeImage("image/jpeg", "#5a6b7c"));
    await writeFile("P7000001.PNG", await makeImage("image/png", "#8a5a44"));
    await writeFile("P7000001.WEBP", await makeImage("image/webp", "#44718a"));
    window.showDirectoryPicker = async () => source;
  }, sourceName);

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await expect(page.locator(".photo-card")).toContainText("P7000001.JPG");
  await page.locator(".photo-card").click();
  await expect(
    page.getByRole("img", { name: /P7000001.JPG 全分辨率预览/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
