import { expect, test } from "@playwright/test";

async function createLargeSource(page, count) {
  await page.goto("/");
  await page.evaluate(async (size) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(`virtual-gallery-${crypto.randomUUID()}`, { create: true });
    const canvas = new OffscreenCanvas(180, 120);
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 180, 120);
    gradient.addColorStop(0, "#52678a");
    gradient.addColorStop(1, "#c5a47b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 180, 120);
    const image = await canvas.convertToBlob({ type: "image/jpeg" });
    for (let index = 1; index <= size; index++) {
      const file = await directory.getFileHandle(`S${String(index).padStart(4, "0")}.JPG`, { create: true });
      const writable = await file.createWritable();
      await writable.write(image);
      await writable.close();
    }
    window.showDirectoryPicker = async () => directory;
  }, count);
  await page.getByRole("button", { name: "选择照片文件夹", exact: true }).click();
  await expect(page.locator('[id="photo-card:photo-group:S0001"]')).toBeVisible();
}

async function scrollEnd(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

test("a 2000-group grid and filmstrip remain bounded with full-queue selection, keyboard access, and focus return", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    window.__activePreviewUrls = new Set();
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.__activePreviewUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__activePreviewUrls.delete(url);
      revoke(url);
    };
  });
  await createLargeSource(page, 2000);
  const bounded = async () => {
    expect(await page.locator(".photo-card").count()).toBeLessThanOrEqual(160);
    expect(await page.locator("#viewer-filmstrip .viewer-thumbnail").count()).toBeLessThanOrEqual(40);
    expect(await page.evaluate(() => window.__activePreviewUrls.size)).toBeLessThanOrEqual(220);
  };
  await bounded();
  await page.getByRole("button", { name: "选择 S0001.JPG", exact: true }).click();
  await scrollEnd(page);
  const tail = page.locator('[id="photo-card:photo-group:S2000"]');
  await expect(tail).toBeVisible();
  await expect(page.locator('[id="photo-card:photo-group:S0001"]')).toHaveCount(0);
  await page.getByRole("button", { name: "选择 S2000.JPG", exact: true }).click({ modifiers: ["Shift"] });
  await expect(page.locator("#action-selection-count")).toContainText("2000");
  await bounded();
  const returnScroll = await page.evaluate(() => window.scrollY);
  const originalViewport = page.viewportSize();
  await tail.click();
  await expect(page.locator("#viewer-position")).toHaveText("2000 / 2000");
  await expect(page.getByRole("button", { name: "查看 S2000.JPG", exact: true })).toBeVisible();
  await bounded();
  await page.setViewportSize({ width: 600, height: 800 });
  const tailThumbnail = page.getByRole("button", { name: "查看 S2000.JPG", exact: true });
  await expect(tailThumbnail).toBeInViewport();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(tailThumbnail).toBeInViewport();
  // Manual browsing away from the selection survives a CSS step change.
  await page.locator("#viewer-filmstrip").evaluate((element) => {
    const step = parseFloat(getComputedStyle(element).getPropertyValue("--filmstrip-item-width")) +
      parseFloat(getComputedStyle(element).columnGap);
    element.scrollLeft = 900 * step;
  });
  await expect(page.getByRole("button", { name: "查看 S0901.JPG", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByRole("button", { name: "查看 S0901.JPG", exact: true })).toBeInViewport();
  await expect(page.locator("#viewer-position")).toHaveText("2000 / 2000");
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.locator("#viewer-filmstrip").evaluate((element) => { element.scrollLeft = 0; });
  await expect(page.getByRole("button", { name: "查看 S0001.JPG", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看 S0001.JPG", exact: true }).click();
  await expect(page.locator("#viewer-position")).toHaveText("1 / 2000");
  await page.locator("#viewer-filmstrip").evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect(page.getByRole("button", { name: "查看 S2000.JPG", exact: true })).toBeVisible();
  await bounded();
  await page.setViewportSize(originalViewport);
  await page.getByRole("button", { name: "关闭大图", exact: true }).click();
  await expect(tail).toBeFocused();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - returnScroll)).toBeLessThan(4);
  await page.locator("#clear-action-selection").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('[id="photo-card:photo-group:S0001"]')).toBeVisible();
  const boundary = await page.locator(".photo-group-card").last().getAttribute("data-queue-index");
  await page.locator(".photo-group-card").last().locator(".selection-toggle").focus();
  await page.keyboard.press("Tab");
  const nextId = `photo-card:photo-group:S${String(Number(boundary) + 2).padStart(4, "0")}`;
  await expect(page.locator(`[id="${nextId}"]`)).toBeFocused();
  await bounded();
  expect(errors).toEqual([]);
});

test("narrow grid and filmstrip use responsive geometry through density changes and resize", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 600, height: 800 });
  await createLargeSource(page, 360);
  await scrollEnd(page);
  const tail = page.locator('[id="photo-card:photo-group:S0360"]');
  await expect(tail).toBeVisible();
  expect(await page.locator(".photo-card").count()).toBeLessThanOrEqual(160);
  await page.getByRole("button", { name: "舒展", exact: true }).click();
  await scrollEnd(page);
  await expect(tail).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  await scrollEnd(page);
  await expect(tail).toBeVisible();
  if (process.env.PHOTO_CULLER_GEOMETRY) await page.evaluate(() => {
    window.__gridGeometry = [];
    window.__gridGeometryChanges = 0;
    let previous;
    const sample = () => {
      const grid = document.getElementById("photo-grid");
      const target = document.getElementById("photo-card:photo-group:S0360");
      const round = (value) => Math.round(value * 100) / 100;
      const rectangle = grid.getBoundingClientRect();
      const style = getComputedStyle(grid);
      const cards = grid.querySelectorAll(".photo-group-card");
      const spacers = [...grid.querySelectorAll(".grid-virtual-spacer")].map((node) => round(node.getBoundingClientRect().height));
      const targetRect = target?.getBoundingClientRect();
      const value = { y: round(scrollY), doc: document.documentElement.scrollHeight,
        viewport: innerWidth, top: round(rectangle.top + scrollY), height: round(rectangle.height),
        width: grid.clientWidth, tracks: style.gridTemplateColumns, gap: style.rowGap,
        card: style.getPropertyValue("--virtual-card-height"),
        first: cards[0]?.dataset.queueIndex, last: cards[cards.length - 1]?.dataset.queueIndex,
        spacers, target: targetRect ? [round(targetRect.top), round(targetRect.height)] : null };
      const signature = JSON.stringify(value);
      if (signature !== previous) {
        previous = signature;
        window.__gridGeometryChanges += 1;
        window.__gridGeometry.push(value);
        if (window.__gridGeometry.length > 30) window.__gridGeometry.shift();
      }
      window.__gridGeometryFrame = requestAnimationFrame(sample);
    };
    sample();
  });
  await page.setViewportSize({ width: 600, height: 800 });
  await scrollEnd(page);
  await expect(tail).toBeVisible();
  try {
    await tail.click(process.env.PHOTO_CULLER_GEOMETRY ? { timeout: 10_000 } : {});
  } catch (error) {
    if (process.env.PHOTO_CULLER_GEOMETRY) {
      console.log("VIRTUAL_GRID_DIAGNOSTIC " + JSON.stringify(await page.evaluate(() => ({
        changes: window.__gridGeometryChanges, samples: window.__gridGeometry,
      }))));
    }
    throw error;
  } finally {
    if (process.env.PHOTO_CULLER_GEOMETRY) await page.evaluate(() => cancelAnimationFrame(window.__gridGeometryFrame));
  }
  await expect(page.getByRole("button", { name: "查看 S0360.JPG", exact: true })).toBeVisible();
  await page.locator("#viewer-filmstrip").evaluate((element) => { element.scrollLeft = 0; });
  await expect(page.getByRole("button", { name: "查看 S0001.JPG", exact: true })).toBeVisible();
  expect(await page.locator("#viewer-filmstrip .viewer-thumbnail").count()).toBeLessThanOrEqual(40);
  await page.getByRole("button", { name: "关闭大图", exact: true }).click();
  await expect(tail).toBeFocused();
  expect(errors).toEqual([]);
});
