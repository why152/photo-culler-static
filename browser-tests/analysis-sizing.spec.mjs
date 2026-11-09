import { expect, test } from "@playwright/test";

test("native resized JPEG decode respects EXIF quarter-turns and preserves long edge", async ({ page }) => {
  await page.goto("/legacy.html");
  const dimensions = await page.evaluate(async () => {
    const { decodeBitmap } = await import("/modules/photo-analysis-worker.js");
    const canvas = new OffscreenCanvas(2400,1200);
    const context = canvas.getContext("2d");
    context.fillStyle = "red"; context.fillRect(0,0,1200,1200);
    context.fillStyle = "blue"; context.fillRect(1200,0,1200,1200);
    const blob = await canvas.convertToBlob({ type:"image/jpeg",quality:0.95 });
    const encoded = new Uint8Array(await blob.arrayBuffer());
    const results = [];
    for (const orientation of [1,6,8]) {
      const metadata = new Uint8Array([69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);
      const file = new File([encoded.subarray(0,2),new Uint8Array([255,225,0,metadata.length+2]),metadata,encoded.subarray(2)],"synthetic.JPG",{type:"image/jpeg"});
      const bitmap = await decodeBitmap(file);
      const target = new OffscreenCanvas(bitmap.width,bitmap.height);
      const pixels = target.getContext("2d"); pixels.drawImage(bitmap,0,0);
      const sample = pixels.getImageData(Math.round(bitmap.width/2),Math.round(bitmap.height/4),1,1).data;
      results.push({ orientation,width:bitmap.width,height:bitmap.height,topColor: sample[0]>sample[2]?"red":"blue" });
      bitmap.close();
    }
    return results;
  });
  expect(dimensions).toEqual([
    {orientation:1,width:1600,height:800,topColor:"blue"},
    {orientation:6,width:800,height:1600,topColor:"red"},
    {orientation:8,width:800,height:1600,topColor:"blue"},
  ]);
});

test("production directory reopen reuses the scoped analysis cache", async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    window.__analysisDispatchCount = 0;
    Worker.prototype.postMessage = function(message,...args) {
      if (message.file) window.__analysisDispatchCount++;
      return post.call(this,message,...args);
    };
  });
  await page.goto("/legacy.html");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(`cache-production-${crypto.randomUUID()}`,{create:true});
    const canvas = new OffscreenCanvas(32,24);canvas.getContext("2d").fillRect(0,0,32,24);
    const handle = await directory.getFileHandle("synthetic.JPG",{create:true});
    const writable = await handle.createWritable();await writable.write(await canvas.convertToBlob({type:"image/jpeg"}));await writable.close();
    window.showDirectoryPicker = async () => directory;
  });
  await page.locator("#empty-choose-folder").click();
  await expect(page.locator(".photo-card-preview")).toHaveCount(1);
  await expect(page.locator(".photo-card-preview")).toHaveJSProperty("tagName","IMG");
  expect(await page.evaluate(() => window.__analysisDispatchCount)).toBe(1);
  await page.evaluate(() => { window.__firstCachePreview = document.querySelector(".photo-card-preview"); });
  await page.locator("#choose-folder").click();
  await expect.poll(() => page.evaluate(() => window.__firstCachePreview.isConnected)).toBe(false);
  await expect(page.locator(".photo-card-preview")).toHaveJSProperty("tagName","IMG");
  expect(await page.evaluate(() => window.__analysisDispatchCount)).toBe(1);
});
