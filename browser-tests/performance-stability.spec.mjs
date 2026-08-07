import { expect, test } from "@playwright/test";

async function preparePhotoSource(page, sourceName, photoCount) {
  await page.goto("/");
  await page.evaluate(async ([name, count]) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(160, 120);
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 160, 120);
    gradient.addColorStop(0, "#5b6e8c");
    gradient.addColorStop(1, "#c3a38a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 160, 120);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    for (const filename of Array.from(
      { length: count },
      (_, index) => `P5${String(index + 1).padStart(6, "0")}.JPG`,
    )) {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(image);
      await writable.close();
    }
    window.showDirectoryPicker = async () => source;
  }, [sourceName, photoCount]);
}

test("a long directory analyzes incrementally and the moved panel previews recover without renderer errors", async ({
  page,
}) => {
  const sourceName = `photo-culler-performance-${crypto.randomUUID()}`;
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await preparePhotoSource(page, sourceName, 80);

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(80);
  const operation = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(operation).toContainText("照片分析完成");
  await expect(page.locator(".photo-card > img")).toHaveCount(80);

  await page.locator('[id="photo-card:photo-group:P5000002"]').click();
  const viewer = page.getByRole("dialog", { name: "Photo Viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("2 / 80")).toBeVisible();
  await expect(page.locator("#viewer-filmstrip img")).toHaveCount(80);
  await page.getByRole("button", { name: "关闭大图" }).click();

  await page.getByRole("button", { name: "选择 P5000001.JPG" }).click();
  await page.getByRole("button", { name: "选择 P5000002.JPG" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "移动已选项" }).click();
  await expect(page.getByRole("button", { name: "已移动 1" })).toBeEnabled();

  await page.getByRole("button", { name: "已移动 1" }).click();
  await expect(page.locator(".moved-photo")).toHaveCount(2);
  await expect(page.locator(".moved-photo img").first()).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect
    .poll(async () =>
      page.locator(".moved-photo img").evaluateAll((images) =>
        images.every((image) => image.getAttribute("src")?.startsWith("blob:")),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "恢复整批" }).click();
  await expect(operation).toContainText("已恢复 review batch");
  await expect(page.locator(".photo-card")).toHaveCount(80);
  expect(errors).toEqual([]);
});

test("a large JPEG analyzes through the downscaled decode path and still yields a thumbnail", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { BrowserPhotoAnalyzer } = await import(
      "./modules/photo-analysis.js"
    );
    const canvas = new OffscreenCanvas(1800, 1350);
    const context = canvas.getContext("2d");
    const imageData = context.createImageData(1800, 1350);
    for (let index = 0; index < imageData.data.length; index += 4) {
      imageData.data[index] = (index * 7) % 256;
      imageData.data[index + 1] = (index * 13) % 256;
      imageData.data[index + 2] = (index * 29) % 256;
      imageData.data[index + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    const largeJpeg = await canvas.convertToBlob({ type: "image/jpeg" });
    const analyzer = new BrowserPhotoAnalyzer();
    try {
      const [analyzed] = await analyzer.analyze([
        {
          id: "photo-group:large",
          stem: "large",
          members: [],
          analysisHandle: null,
          analysisFile: new File([largeJpeg], "LARGE0001.JPG", {
            type: "image/jpeg",
          }),
          hasRaw: false,
        },
      ]);
      return {
        bytes: largeJpeg.size,
        status: analyzed.analysis.status,
        thumbnailBytes: analyzed.analysis.thumbnail?.size ?? 0,
      };
    } finally {
      analyzer.close();
    }
  });

  expect(result.bytes).toBeGreaterThan(1_000_000);
  expect(["keep", "review"]).toContain(result.status);
  expect(result.thumbnailBytes).toBeGreaterThan(0);
});
