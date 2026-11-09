import { test, expect } from "@playwright/test";

test("production grid receives a usable thumbnail while final scoring messages are still pending", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__pendingAnalysisResults = [];
    window.Worker = class PreviewFirstWorker {
      constructor(...args) { this.worker = new NativeWorker(...args); }
      addEventListener(type,listener,options) {
        return this.worker.addEventListener(type,type === "message" ? (event) => {
          if (event.data.result) window.__pendingAnalysisResults.push(() => listener(event));
          else listener(event);
        } : listener,options);
      }
      postMessage(...args) { return this.worker.postMessage(...args); }
      terminate() { return this.worker.terminate(); }
    };
  });
  await page.goto("/legacy.html");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(`preview-before-score-${crypto.randomUUID()}`,{create:true});
    const canvas = new OffscreenCanvas(640,480);canvas.getContext("2d").fillRect(0,0,640,480);
    const handle = await directory.getFileHandle("synthetic.JPG",{create:true});
    const writable = await handle.createWritable();await writable.write(await canvas.convertToBlob({type:"image/jpeg"}));await writable.close();
    window.showDirectoryPicker = async () => directory;
  });
  await page.locator("#empty-choose-folder").click();
  const image = page.locator(".photo-card-preview");
  await expect(image).toHaveJSProperty("tagName","IMG");
  await expect.poll(() => page.evaluate(() => window.__pendingAnalysisResults.length)).toBe(1);
  await expect(page.locator(".photo-card-detail")).toContainText("正在分析技术指标");
  const previewUrl = await image.getAttribute("src");
  await page.evaluate(() => { for (const deliver of window.__pendingAnalysisResults.splice(0)) deliver(); });
  await expect(page.locator(".photo-card-detail")).not.toContainText("正在分析技术指标");
  await expect(image).toHaveAttribute("src",previewUrl);
});
