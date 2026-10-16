import { expect, test } from "@playwright/test";

async function setup(page) {
  await page.addInitScript(() => {
    const NativeImage = window.Image;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    window.pendingFullPreviews = [];
    window.Image = class extends NativeImage {
      constructor(...args) {
        super(...args);
        Object.defineProperty(this, "src", {
          get: () => descriptor.get.call(this),
          set: (url) => window.pendingFullPreviews.push({
            load: () => descriptor.set.call(this, url),
            fail: () => this.onerror?.(new Event("error")),
          }),
        });
      }
    };
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(`progressive-${crypto.randomUUID()}`, { create: true });
    const canvas = new OffscreenCanvas(120, 80);
    canvas.getContext("2d").fillRect(0, 0, 120, 80);
    const blob = await canvas.convertToBlob({ type: "image/jpeg" });
    for (const name of ["A.JPG", "B.JPG", "C.JPG"]) {
      const file = await source.getFileHandle(name, { create: true });
      const writer = await file.createWritable();
      await writer.write(blob); await writer.close();
    }
    window.showDirectoryPicker = async () => source;
  });
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator('[id="photo-card:photo-group:A"] img')).toHaveAttribute("src", /^blob:/);
  await page.locator('[id="photo-card:photo-group:A"]').click();
  await expect(page.locator("#viewer-image")).toHaveAttribute("data-preview-stage", "thumbnail");
}

test("thumbnail stays reviewable while full image loads, then full image fits after resize", async ({ page }) => {
  await setup(page);
  await expect(page.locator("#viewer-image-frame")).toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => window.pendingFullPreviews[0].load());
  await expect(page.locator("#viewer-image-frame")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#viewer-image")).toHaveAttribute("data-preview-stage", "full");
  await page.locator("#viewer-zoom-in").click();
  await expect(page.locator("#viewer-zoom-label")).toHaveText("125%");
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator("#viewer-zoom-label")).toHaveText("125%");
  await page.locator("#viewer-zoom-reset").click();
  const image = await page.locator("#viewer-image").boundingBox();
  const frame = await page.locator("#viewer-image-frame").boundingBox();
  expect(image.width).toBeLessThanOrEqual(frame.width + 1);
  expect(image.height).toBeLessThanOrEqual(frame.height + 1);
});

test("full preview failure keeps thumbnail and navigation cancels stale completion", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.pendingFullPreviews[0].fail());
  await expect(page.locator("#viewer-image-status")).toContainText("可继续审核缩略图");
  await expect(page.locator("#viewer-image")).toHaveAttribute("data-preview-stage", "thumbnail");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#viewer-image")).toHaveAttribute("alt", "B.JPG 缩略图预览");
  await page.evaluate(() => window.pendingFullPreviews[0].load());
  await expect(page.locator("#viewer-image")).toHaveAttribute("alt", "B.JPG 缩略图预览");
  await page.locator("#viewer-close").click();
  await expect(page.locator("#photo-viewer")).toBeHidden();
  await page.evaluate(() => window.pendingFullPreviews[1].load());
  await expect(page.locator("#photo-viewer")).toBeHidden();
});
