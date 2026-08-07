import { expect, test } from "@playwright/test";

async function createMixedPhotoSource(page, sourceName) {
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const makePhoto = async (width, height, fillStyle) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = fillStyle;
      context.fillRect(0, 0, width, height);
      return canvas.convertToBlob({ type: "image/jpeg" });
    };
    const writeFile = async (filename, contents) => {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    };
    await writeFile("P9000001.JPG", await makePhoto(480, 720, "#3a6ea5"));
    await writeFile("P9000002.JPG", await makePhoto(720, 480, "#3e7a54"));
    window.showDirectoryPicker = async () => source;
  }, sourceName);
}

async function openPhotoAndWaitForImage(page, filename) {
  await page
    .locator(`[id="photo-card:photo-group:${filename}"]`)
    .click();
  const viewer = page.getByRole("dialog", { name: "Photo Viewer" });
  await expect(viewer).toBeVisible();
  await page.waitForFunction(() => {
    const image = document.getElementById("viewer-image");
    return image.complete && image.naturalWidth > 0;
  });
}

function imageGeometry(page) {
  return page.evaluate(() => {
    const frame = document.getElementById("viewer-image-frame");
    const image = document.getElementById("viewer-image");
    return {
      frame: [frame.clientWidth, frame.clientHeight],
      image: [image.clientWidth, image.clientHeight],
      objectFit: getComputedStyle(image).objectFit,
      transform: getComputedStyle(image).transform,
    };
  });
}

test("Photo Viewer shows full portrait and landscape sources without clipping", async ({
  page,
}) => {
  const sourceName = `photo-culler-portrait-${crypto.randomUUID()}`;
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await createMixedPhotoSource(page, sourceName);

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await openPhotoAndWaitForImage(page, "P9000001");

  const portrait = await imageGeometry(page);
  expect(Math.abs(portrait.image[0] - portrait.frame[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(portrait.image[1] - portrait.frame[1])).toBeLessThanOrEqual(1);
  expect(portrait.objectFit).toBe("contain");
  expect(portrait.transform).toBe("matrix(1, 0, 0, 1, 0, 0)");

  const frameBox = await page.locator("#viewer-image-frame").boundingBox();
  await page.mouse.move(
    frameBox.x + frameBox.width / 2,
    frameBox.y + frameBox.height / 2,
  );
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, -240);
  await expect(page.locator("#viewer-zoom-label")).toHaveText("156%");

  await page.getByRole("button", { name: "关闭大图" }).click();
  await openPhotoAndWaitForImage(page, "P9000002");
  const landscape = await imageGeometry(page);
  expect(Math.abs(landscape.image[0] - landscape.frame[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(landscape.image[1] - landscape.frame[1])).toBeLessThanOrEqual(1);
  expect(landscape.objectFit).toBe("contain");

  expect(errors).toEqual([]);
});
