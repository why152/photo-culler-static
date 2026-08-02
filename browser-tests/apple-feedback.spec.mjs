import { expect, test } from "@playwright/test";

async function prepareDelayedPhotoSource(
  page,
  sourceName,
  photoCount,
  { analysisDelay = 120 } = {},
) {
  await page.addInitScript((delay) => {
    const NativeWorker = window.Worker;
    window.Worker = class DelayedWorker {
      constructor(...args) {
        this.worker = new NativeWorker(...args);
      }

      addEventListener(type, listener, options) {
        const delayedListener =
          type === "message"
            ? (event) => setTimeout(() => listener(event), delay)
            : listener;
        return this.worker.addEventListener(type, delayedListener, options);
      }

      postMessage(...args) {
        return this.worker.postMessage(...args);
      }

      terminate() {
        return this.worker.terminate();
      }
    };
  }, analysisDelay);
  await page.goto("/");
  await page.evaluate(async ([name, count]) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(32, 20);
    const context = canvas.getContext("2d");
    context.fillStyle = "#7d8fa6";
    context.fillRect(0, 0, 32, 20);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    for (const filename of Array.from(
      { length: count },
      (_, index) => `P2${String(index + 1).padStart(6, "0")}.JPG`,
    )) {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(image);
      await writable.close();
    }
    window.showDirectoryPicker = () =>
      new Promise((resolve) => {
        window.releasePhotoDirectory = () => resolve(source);
      });
  }, [sourceName, photoCount]);
}

test("local scan becomes immediate, honest progress while JPEG analysis continues, then a completion result", async ({
  page,
}) => {
  const sourceName = `photo-culler-feedback-${crypto.randomUUID()}`;
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await prepareDelayedPhotoSource(page, sourceName, 8);

  const chooseFolder = page.getByRole("button", { name: "选择照片文件夹" });
  const feedback = page.getByRole("status", { name: "操作进度", exact: true });
  await chooseFolder.click();
  await expect(feedback).toContainText("正在读取照片文件夹");
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "总数尚未确定",
  );

  await page.evaluate(() => window.releasePhotoDirectory());
  await expect(page.locator(".photo-card")).toHaveCount(8);
  await expect(page.locator("#empty-state")).toBeHidden();
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuemax",
    "8",
  );
  await expect(feedback).toContainText("正在分析 JPEG");
  await expect(page.locator(".photo-card.is-pending")).not.toHaveCount(8);
  await expect(feedback).toContainText("JPEG 分析完成");
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "8",
  );
  const completedThumbnail = await page.locator(".photo-card > img").first().boundingBox();
  expect(completedThumbnail).not.toBeNull();
  expect(Math.round(completedThumbnail.width)).toBe(Math.round(completedThumbnail.height));
  expect(errors).toEqual([]);
});

test("resuming a saved folder refreshes grid thumbnails and completion feedback", async ({
  page,
}) => {
  const sourceName = `photo-culler-resume-feedback-${crypto.randomUUID()}`;
  await prepareDelayedPhotoSource(page, sourceName, 3, { analysisDelay: 400 });
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await page.evaluate(() => window.releasePhotoDirectory());
  await expect(page.locator(".photo-card")).toHaveCount(3);

  await page.reload();
  const feedback = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(page.getByRole("button", { name: "继续上次筛选" })).toBeVisible();
  await page.getByRole("button", { name: "继续上次筛选" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(3);
  await expect(page.locator(".photo-card.is-pending")).not.toHaveCount(3);
  await expect(feedback).toContainText("JPEG 分析完成");
});

test("the content shell follows the system appearance while Photo Viewer keeps a dark image canvas", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(245, 245, 247)",
  );
  await expect(page.locator("#photo-viewer")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#viewer-next")).toHaveCSS("width", "44px");
  await expect(page.locator("#viewer-next")).toHaveCSS("height", "44px");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(page.locator("#photo-viewer")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
});

test("Reduce Motion keeps local operation feedback readable without relying on animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sourceName = `photo-culler-reduced-motion-${crypto.randomUUID()}`;
  await prepareDelayedPhotoSource(page, sourceName, 2);

  const feedback = page.getByRole("status", { name: "操作进度", exact: true });
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(feedback).toContainText("正在读取照片文件夹");
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "总数尚未确定",
  );
  expect(
    await page.evaluate(
      () =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        Number.parseFloat(
          getComputedStyle(document.querySelector(".operation-indicator"))
            .animationDuration,
        ) <= 0.001,
    ),
  ).toBe(true);

  await page.evaluate(() => window.releasePhotoDirectory());
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuemax",
    "2",
  );
  await expect(feedback).toContainText("JPEG 分析完成");
});

test("explicit recoverable move and restore report their own photo group progress and completion", async ({
  page,
}) => {
  const sourceName = `photo-culler-move-feedback-${crypto.randomUUID()}`;
  await page.addInitScript(() => {
    const nativeMove = globalThis.FileSystemFileHandle?.prototype?.move;
    if (!nativeMove) return;
    globalThis.FileSystemFileHandle.prototype.move = async function (...args) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return nativeMove.apply(this, args);
    };
  });
  await page.goto("/");
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(20, 20);
    const context = canvas.getContext("2d");
    context.fillStyle = "#7184a1";
    context.fillRect(0, 0, 20, 20);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    for (const filename of ["P3000001.JPG", "P3000002.JPG"]) {
      const handle = await source.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(image);
      await writable.close();
    }
    window.showDirectoryPicker = async () => source;
  }, sourceName);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(2);
  await expect(page.getByRole("status", { name: "操作进度", exact: true })).toContainText(
    "JPEG 分析完成",
  );

  await page.getByRole("button", { name: "选择 P3000001.JPG" }).click();
  await page.getByRole("button", { name: "选择 P3000002.JPG" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "移动已选项" }).click();

  const feedback = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(feedback).toContainText("正在移动 photo group");
  await expect(page.getByRole("status", { name: "文件操作进度" })).toContainText(
    "正在移动 photo group",
  );
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuemax",
    "2",
  );
  await expect(feedback).toContainText("已移动到可恢复 review batch");
  await expect(page.getByRole("status", { name: "文件操作进度" })).toContainText(
    "已移动到可恢复 review batch",
  );
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
  await expect(page.getByRole("button", { name: "已移动 1" })).toBeEnabled();

  await page.getByRole("button", { name: "已移动 1" }).click();
  await page.getByRole("button", { name: "恢复整批" }).click();
  await expect(feedback).toContainText("正在恢复 review batch");
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuemax",
    "2",
  );
  await expect(feedback).toContainText("已恢复 review batch");
  await expect(feedback.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
  await expect(page.locator(".photo-card")).toHaveCount(2);
});

test("viewer boundary feedback stays separate from a completed operation", async ({ page }) => {
  const sourceName = `photo-culler-interaction-feedback-${crypto.randomUUID()}`;
  await prepareDelayedPhotoSource(page, sourceName, 1);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await page.evaluate(() => window.releasePhotoDirectory());
  const operation = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(operation).toContainText("JPEG 分析完成");
  await page.locator(".photo-card").first().click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status", { name: "浏览反馈" })).toContainText(
    "已经是当前筛选结果中的最后一张照片。",
  );
  await expect(operation).toContainText("JPEG 分析完成");
});

test("Photo Viewer exposes and completes a local image presentation state", async ({ page }) => {
  const sourceName = `photo-culler-viewer-feedback-${crypto.randomUUID()}`;
  await page.goto("/");
  await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(120, 80);
    const context = canvas.getContext("2d");
    context.fillStyle = "#54739e";
    context.fillRect(0, 0, 120, 80);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    const handle = await source.getFileHandle("P4000001.JPG", { create: true });
    const writable = await handle.createWritable();
    await writable.write(image);
    await writable.close();
    window.showDirectoryPicker = async () => source;
  }, sourceName);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(
    page.getByRole("status", { name: "操作进度", exact: true }),
  ).toContainText("JPEG 分析完成");
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    );
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        if (this.id !== "viewer-image") return descriptor.set.call(this, value);
        setTimeout(() => descriptor.set.call(this, value), 160);
      },
    });
  });
  const card = page.locator('[id="photo-card:photo-group:P4000001"]');
  await expect(card).toBeVisible();
  await card.click();

  const frame = page.locator("#viewer-image-frame");
  await expect(frame).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#viewer-image-status")).toBeVisible();
  await expect(frame).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#viewer-image-status")).toBeHidden();
  await expect(page.getByRole("img", { name: /P4000001.JPG 全分辨率预览/ })).toBeVisible();
});
