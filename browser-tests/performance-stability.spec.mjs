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

test("switching directories terminates stale worker analysis and keeps new progress authoritative", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__terminatedAnalysisWorkers = 0;
    window.Worker = class DelayedWorker {
      constructor(...args) {
        this.worker = new NativeWorker(...args);
      }

      addEventListener(type, listener, options) {
        const wrapped =
          type === "message"
            ? (event) => setTimeout(() => listener(event), 240)
            : listener;
        this.worker.addEventListener(type, wrapped, options);
      }

      postMessage(...args) {
        this.worker.postMessage(...args);
      }

      terminate() {
        window.__terminatedAnalysisWorkers += 1;
        this.worker.terminate();
      }
    };
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const canvas = new OffscreenCanvas(32, 20);
    const context = canvas.getContext("2d");
    context.fillStyle = "#596f8f";
    context.fillRect(0, 0, 32, 20);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    const createSource = async (name, filenames) => {
      const source = await root.getDirectoryHandle(name, { create: true });
      for (const filename of filenames) {
        const handle = await source.getFileHandle(filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write(image);
        await writable.close();
      }
      return source;
    };
    const oldSource = await createSource(
      `old-source-${crypto.randomUUID()}`,
      Array.from(
        { length: 12 },
        (_, index) => `OLD${String(index + 1).padStart(5, "0")}.JPG`,
      ),
    );
    const newSource = await createSource(
      `new-source-${crypto.randomUUID()}`,
      ["NEW00001.JPG"],
    );
    const choices = [oldSource, newSource];
    window.showDirectoryPicker = async () => choices.shift();
  });

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(12);
  await page.getByRole("button", { name: "选择其他文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await expect(
    page.locator('[id="photo-card:photo-group:NEW00001"]'),
  ).toBeVisible();
  const operation = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(operation).toContainText("照片分析完成");
  await expect(operation).toContainText("1 / 1");
  await page.waitForTimeout(500);

  await expect(operation).toContainText("1 / 1");
  expect(await page.evaluate(() => window.__terminatedAnalysisWorkers)).toBe(1);
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

test("a hundreds-photo directory keeps the first grid DOM batch bounded", async ({
  page,
}) => {
  const sourceName = `photo-culler-bounded-grid-${crypto.randomUUID()}`;
  await preparePhotoSource(page, sourceName, 360);

  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  const operation = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(operation).toContainText("照片分析完成");
  await expect(page.locator(".photo-card")).toHaveCount(160);
  await expect(page.getByText("已显示 160 / 360")).toBeVisible();

  await page.locator("#grid-load-more").evaluate((button) => button.click());
  await expect(page.locator(".photo-card")).toHaveCount(320);
  await expect(page.getByText("已显示 320 / 360")).toBeVisible();
});

test("closing the moved panel invalidates previews that have not started decoding", async ({
  page,
}) => {
  const sourceName = `photo-culler-moved-preview-stop-${crypto.randomUUID()}`;
  await page.addInitScript(() => {
    const createImageBitmap = window.createImageBitmap.bind(window);
    window.__movedPreviewDecodeStarts = 0;
    window.createImageBitmap = async (...args) => {
      window.__movedPreviewDecodeStarts += 1;
      await new Promise((resolve) => setTimeout(resolve, 120));
      return createImageBitmap(...args);
    };
  });
  await preparePhotoSource(page, sourceName, 6);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(
    page.getByRole("status", { name: "操作进度", exact: true }),
  ).toContainText("照片分析完成");

  for (let index = 1; index <= 6; index += 1)
    await page
      .getByRole("button", {
        name: `选择 P5${String(index).padStart(6, "0")}.JPG`,
      })
      .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "移动已选项" }).click();
  await page.getByRole("button", { name: "已移动 1" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__movedPreviewDecodeStarts))
    .toBe(1);

  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__movedPreviewDecodeStarts)).toBe(1);
});

test("the analysis cache evicts its oldest entries instead of growing without a bound", async ({
  page,
}) => {
  await page.goto("/");
  const databaseName = `photo-culler-cache-${crypto.randomUUID()}`;
  const availability = await page.evaluate(async (name) => {
    const { BrowserReviewStore } = await import("./modules/browser-store.js");
    const store = new BrowserReviewStore({
      databaseName: name,
      analysisCacheLimit: 3,
    });
    const files = Array.from({ length: 5 }, (_, index) => ({
      name: `CACHE${index}.JPG`,
      size: 100 + index,
      lastModified: 10 + index,
    }));
    for (const [index, file] of files.entries())
      await store.saveAnalysis(file, {
        status: "keep",
        sharpness: index,
        thumbnail: null,
      });
    const found = await Promise.all(
      files.map(async (file) => Boolean(await store.loadAnalysis(file))),
    );
    await store.close?.();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.addEventListener("success", resolve, { once: true });
      request.addEventListener("error", () => reject(request.error), {
        once: true,
      });
    });
    return found;
  }, databaseName);

  expect(availability).toEqual([false, false, true, true, true]);
});

test("the version-one analysis cache migrates without losing readable results", async ({
  page,
}) => {
  await page.goto("/");
  const databaseName = `photo-culler-cache-migration-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const legacyDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.addEventListener("upgradeneeded", () => {
        request.result.createObjectStore("workspace");
        request.result.createObjectStore("analysis");
      });
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
      request.addEventListener("error", () => reject(request.error), {
        once: true,
      });
    });
    await new Promise((resolve, reject) => {
      const transaction = legacyDatabase.transaction("analysis", "readwrite");
      transaction.objectStore("analysis").put(
        { status: "keep", sharpness: 73, thumbnail: null },
        "LEGACY.JPG:100:1",
      );
      transaction.addEventListener("complete", resolve, { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), {
        once: true,
      });
    });
    legacyDatabase.close();

    const { BrowserReviewStore } = await import("./modules/browser-store.js");
    const store = new BrowserReviewStore({ databaseName: name });
    const analysis = await store.loadAnalysis({
      name: "LEGACY.JPG",
      size: 100,
      lastModified: 1,
    });
    await store.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.addEventListener("success", resolve, { once: true });
      request.addEventListener("error", () => reject(request.error), {
        once: true,
      });
    });
    return analysis;
  }, databaseName);

  expect(result).toMatchObject({ status: "keep", sharpness: 73 });
});
