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

async function createDelayedPhotoSource(page, sourceName, photoCount) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class DelayedWorker {
      constructor(...args) {
        this.worker = new NativeWorker(...args);
      }

      addEventListener(type, listener, options) {
        const delayedListener =
          type === "message"
            ? (event) => setTimeout(() => listener(event), 220)
            : listener;
        return this.worker.addEventListener(type, delayedListener, options);
      }

      postMessage(...args) {
        return this.worker.postMessage(...args);
      }

      terminate() {
        this.worker.terminate();
      }
    };
  });
  await page.goto("/");
  await page.evaluate(async ([name, count]) => {
    const root = await navigator.storage.getDirectory();
    const source = await root.getDirectoryHandle(name, { create: true });
    const canvas = new OffscreenCanvas(32, 20);
    const context = canvas.getContext("2d");
    context.fillStyle = "#596f8f";
    context.fillRect(0, 0, 32, 20);
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

test("Photo Viewer releases its full-resolution object URL when it closes", async ({
  page,
}) => {
  const sourceName = `photo-culler-viewer-release-${crypto.randomUUID()}`;
  await page.addInitScript(() => {
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    window.__revokedObjectUrls = [];
    URL.revokeObjectURL = (url) => {
      window.__revokedObjectUrls.push(url);
      revokeObjectURL(url);
    };
  });
  await page.goto("/");
  await createPhotoSource(page, sourceName, 2);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await page.locator('[id="photo-card:photo-group:P1000001"]').click();

  const viewerImage = page.locator("#viewer-image");
  await expect(viewerImage).toHaveAttribute("src", /^blob:/);
  const viewerUrl = await viewerImage.getAttribute("src");
  const filmstripUrls = await page
    .locator("#viewer-filmstrip img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  await page.getByRole("button", { name: "关闭大图" }).click();

  await expect(viewerImage).not.toHaveAttribute("src", /.+/);
  await expect(page.locator("#viewer-filmstrip img")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        (urls) =>
          urls.every((url) => window.__revokedObjectUrls.includes(url)),
        [viewerUrl, ...filmstripUrls],
      ),
    )
    .toBe(true);
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
    "照片分析完成",
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

test("Photo Viewer gives its analysis source most of the available desktop and narrow screen", async ({
  page,
}) => {
  const sourceName = `photo-culler-viewer-size-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName, 1);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await page.locator('[id="photo-card:photo-group:P1000001"]').click();
  await expect(
    page.getByRole("img", { name: /P1000001.JPG 全分辨率预览/ }),
  ).toBeVisible();

  async function imageHeightRatio() {
    return page.locator("#viewer-image").evaluate((image) =>
      image.getBoundingClientRect().height / window.innerHeight,
    );
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(imageHeightRatio).toBeGreaterThanOrEqual(0.74);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(imageHeightRatio).toBeGreaterThanOrEqual(0.7);
});

test("Photo Viewer keeps the current thumbnail and its next photo visible in a long filmstrip", async ({
  page,
}) => {
  const sourceName = `photo-culler-long-filmstrip-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName, 60);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await expect(page.locator(".photo-card")).toHaveCount(60);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[id="photo-card:photo-group:P1000001"]').click();

  async function currentAndNextAreVisible() {
    return page.locator("#viewer-filmstrip").evaluate((filmstrip) => {
      const current = filmstrip.querySelector('[aria-current="true"]');
      const next = current?.nextElementSibling;
      const filmstripRect = filmstrip.getBoundingClientRect();
      const fullyVisible = (element) => {
        const rect = element?.getBoundingClientRect();
        return Boolean(
          rect &&
            rect.left >= filmstripRect.left &&
            rect.right <= filmstripRect.right,
        );
      };
      return fullyVisible(current) && fullyVisible(next);
    });
  }

  await expect.poll(currentAndNextAreVisible).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(currentAndNextAreVisible).toBe(true);
  await page.getByRole("button", { name: "下一张" }).click();
  await expect.poll(currentAndNextAreVisible).toBe(true);
  await page
    .getByRole("button", { name: "查看 P1000030.JPG" })
    .click();
  await expect.poll(currentAndNextAreVisible).toBe(true);
  await page
    .getByRole("button", { name: "查看 P1000059.JPG" })
    .click();
  await expect.poll(currentAndNextAreVisible).toBe(true);
});

test("selecting a photo group does not replace already presented thumbnail sources", async ({
  page,
}) => {
  const sourceName = `photo-culler-stable-preview-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName, 3);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  const firstPreview = page.locator(
    '#photo-card\\:photo-group\\:P1000001 img',
  );
  await expect(firstPreview).toBeVisible();
  const sourceBeforeSelection = await firstPreview.getAttribute("src");

  await page.getByRole("button", { name: "选择 P1000002.JPG" }).click();

  await expect(firstPreview).toHaveAttribute("src", sourceBeforeSelection);
});

test("suggested removal provides an explicit selection step before a recoverable move", async ({
  page,
}) => {
  const sourceName = `photo-culler-reject-action-${crypto.randomUUID()}`;
  await page.goto("/");
  await createPhotoSource(page, sourceName, 3);
  const originalEntries = await sourceEntryNames(page, sourceName);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  await page.locator('[id="photo-card:photo-group:P1000001"]').click();
  await page.getByRole("button", { name: "建议移出 X" }).click();
  await page.getByRole("button", { name: "关闭大图" }).click();
  await page.getByRole("button", { name: "建议移出", exact: true }).click();

  const selectionBar = page.getByRole("region", { name: "批量选择" });
  await expect(selectionBar).toBeVisible();
  await expect(
    selectionBar.getByRole("button", { name: "选择全部建议移出" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "移动已选项" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "选择 P1000001.JPG" }),
  ).toHaveCSS("opacity", "1");

  await selectionBar
    .getByRole("button", { name: "选择全部建议移出" })
    .click();

  await expect(selectionBar).toContainText("已选 1 个 photo group");
  await expect(page.getByRole("button", { name: "移动已选项" })).toBeVisible();
  expect(await sourceEntryNames(page, sourceName)).toEqual(originalEntries);
});

test("JPEG analysis progress keeps an already presented thumbnail stable", async ({
  page,
}) => {
  const sourceName = `photo-culler-loading-preview-${crypto.randomUUID()}`;
  await createDelayedPhotoSource(page, sourceName, 3);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  const firstPreview = page.locator(
    '#photo-card\\:photo-group\\:P1000001 img',
  );
  await expect(firstPreview).toBeVisible();
  const sourceAfterFirstAnalysis = await firstPreview.getAttribute("src");

  await expect(page.getByRole("status", { name: "操作进度" })).toContainText(
    "照片分析完成",
  );
  await expect(firstPreview).toHaveAttribute("src", sourceAfterFirstAnalysis);
});

test("JPEG analysis progress does not reload the current Photo Viewer source", async ({
  page,
}) => {
  const sourceName = `photo-culler-loading-viewer-${crypto.randomUUID()}`;
  await createDelayedPhotoSource(page, sourceName, 3);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  const card = page.locator('[id="photo-card:photo-group:P1000001"]');
  await expect(card.locator("img")).toBeVisible();
  await card.click();
  const viewerImage = page.getByRole("img", {
    name: /P1000001.JPG 全分辨率预览/,
  });
  await expect(viewerImage).toBeVisible();
  const sourceAfterOpening = await viewerImage.getAttribute("src");

  await expect(page.getByRole("status", { name: "操作进度" })).toContainText(
    "照片分析完成",
  );
  await expect(viewerImage).toHaveAttribute("src", sourceAfterOpening);
});

test("JPEG analysis progress keeps already presented filmstrip thumbnails stable", async ({
  page,
}) => {
  const sourceName = `photo-culler-loading-filmstrip-${crypto.randomUUID()}`;
  await createDelayedPhotoSource(page, sourceName, 3);
  await page.getByRole("button", { name: "选择照片文件夹" }).click();
  const card = page.locator('[id="photo-card:photo-group:P1000001"]');
  await expect(card.locator("img")).toBeVisible();
  await card.click();
  const firstFilmstripPreview = page.locator("#viewer-filmstrip img").first();
  await expect(firstFilmstripPreview).toBeVisible();
  const sourceAfterOpening = await firstFilmstripPreview.getAttribute("src");

  await expect(page.getByRole("status", { name: "操作进度" })).toContainText(
    "照片分析完成",
  );
  await expect(firstFilmstripPreview).toHaveAttribute("src", sourceAfterOpening);
});
