import { expect, test } from "@playwright/test";

async function createPhotoSource(page, sourceName) {
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(24, 16);
    const context = canvas.getContext("2d");
    context.fillStyle = "#596f8f";
    context.fillRect(0, 0, 24, 16);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    for (const filename of Array.from(
      { length: 3 },
      (_, index) => `P8${String(index + 1).padStart(6, "0")}.JPG`,
    )) {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(image);
      await writable.close();
    }
    window.showDirectoryPicker = async () => source;
  }, sourceName);
}

test("Photo Viewer zooms with the wheel, pans with drag, and resets with keyboard and navigation", async ({
  page,
}) => {
  const sourceName = `photo-culler-zoom-${crypto.randomUUID()}`;
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await createPhotoSource(page, sourceName);

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  const card = page.locator('[id="photo-card:photo-group:P8000002"]');
  await expect(card).toBeVisible();
  await card.click();

  const viewer = page.getByRole("dialog", { name: "Photo Viewer" });
  await expect(viewer).toBeVisible();
  const zoomLabel = page.locator("#viewer-zoom-label");
  await expect(zoomLabel).toHaveText("100%");

  const frame = page.locator("#viewer-image-frame");
  const frameBox = await frame.boundingBox();
  await page.mouse.move(
    frameBox.x + frameBox.width / 2,
    frameBox.y + frameBox.height / 2,
  );
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, -240);
  await expect(zoomLabel).toHaveText("156%");
  await expect(page.locator("#viewer-zoom-reset")).toBeEnabled();

  const imageBefore = await page.locator("#viewer-image").boundingBox();
  await page.mouse.down();
  await page.mouse.move(
    frameBox.x + frameBox.width / 2 + 60,
    frameBox.y + frameBox.height / 2 + 30,
    { steps: 4 },
  );
  await page.mouse.up();
  const imageAfter = await page.locator("#viewer-image").boundingBox();
  expect(imageAfter.x).not.toBeCloseTo(imageBefore.x, 0);
  expect(imageAfter.y).not.toBeCloseTo(imageBefore.y, 0);

  await page.keyboard.press("-");
  await expect(zoomLabel).toHaveText("125%");
  await page.keyboard.press("=");
  await expect(zoomLabel).toHaveText("156%");
  await page.keyboard.press("Control+0");
  await expect(zoomLabel).toHaveText("100%");
  await expect(page.locator("#viewer-zoom-reset")).toBeDisabled();

  await page.keyboard.press("=");
  await expect(zoomLabel).toHaveText("125%");
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("3 / 3")).toBeVisible();
  await expect(zoomLabel).toHaveText("100%");

  expect(errors).toEqual([]);
});

test("Photo Viewer zoom buttons and double-click toggle, and zoom resets when the viewer closes", async ({
  page,
}) => {
  const sourceName = `photo-culler-zoom-close-${crypto.randomUUID()}`;
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await createPhotoSource(page, sourceName);

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  const card = page.locator('[id="photo-card:photo-group:P8000001"]');
  await expect(card).toBeVisible();
  await card.click();

  const viewer = page.getByRole("dialog", { name: "Photo Viewer" });
  await expect(viewer).toBeVisible();
  const zoomLabel = page.locator("#viewer-zoom-label");
  const frame = page.locator("#viewer-image-frame");
  const frameBox = await frame.boundingBox();
  await page.mouse.move(
    frameBox.x + frameBox.width / 2,
    frameBox.y + frameBox.height / 2,
  );

  await page.mouse.dblclick(
    frameBox.x + frameBox.width / 2,
    frameBox.y + frameBox.height / 2,
  );
  await expect(zoomLabel).toHaveText("200%");
  await page.mouse.dblclick(
    frameBox.x + frameBox.width / 2,
    frameBox.y + frameBox.height / 2,
  );
  await expect(zoomLabel).toHaveText("100%");

  await page.locator("#viewer-zoom-in").click();
  await expect(zoomLabel).toHaveText("125%");
  await page.locator("#viewer-zoom-out").click();
  await expect(zoomLabel).toHaveText("100%");

  await page.locator("#viewer-zoom-in").click();
  await expect(zoomLabel).toHaveText("125%");
  await page.getByRole("button", { name: "关闭大图" }).click();
  await expect(viewer).toBeHidden();

  await card.click();
  await expect(viewer).toBeVisible();
  await expect(zoomLabel).toHaveText("100%");
  await expect(page.locator("#viewer-zoom-reset")).toBeDisabled();

  expect(errors).toEqual([]);
});
