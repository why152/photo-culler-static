import { expect, test } from "@playwright/test";

test("static workbench uses Chrome's real local file APIs without photo network requests", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "选择照片文件夹" }),
  ).toBeEnabled();
  await expect(
    page.getByText("浏览器可请求本地目录权限。选择后，照片不会上传到服务器。"),
  ).toBeVisible();
  await expect(page).toHaveTitle("Photo Culler Local");

  const result = await page.evaluate(async () => {
    const { BrowserPhotoAnalyzer } = await import(
      "./modules/photo-analysis.js"
    );
    const { ReviewWorkspace } = await import("./modules/review-workspace.js");
    const root = await navigator.storage.getDirectory();
    const sourceName = `photo-culler-e2e-${crypto.randomUUID()}`;
    const source = await root.getDirectoryHandle(sourceName, { create: true });
    const text = new TextEncoder();
    const canvas = new OffscreenCanvas(16, 16);
    const context = canvas.getContext("2d");
    context.fillStyle = "#808080";
    context.fillRect(0, 0, 16, 16);
    const jpegCopy = await canvas.convertToBlob({ type: "image/jpeg" });
    const writeFile = async (name, contents) => {
      const handle = await source.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
    };
    const readDirectory = async (directory) => {
      const files = {};
      for await (const handle of directory.values()) {
        if (handle.kind !== "file") continue;
        const file = await handle.getFile();
        files[file.name] = {
          contents: await file.text(),
          lastModified: file.lastModified,
        };
      }
      return files;
    };
    try {
      await writeFile("P1000001.JPG", jpegCopy);
      await writeFile("P1000001.RW2", text.encode("raw-copy"));
      await writeFile("P1000001.XMP", text.encode("xmp-copy"));
      const before = await readDirectory(source);
      const analyzer = new BrowserPhotoAnalyzer();
      const workspace = new ReviewWorkspace({
        pickDirectory: async () => source,
        analyzer: (groups, options) => analyzer.analyze(groups, options),
        batchNameFactory: () => "_PhotoCull_Review_e2e",
      });
      const scan = await workspace.chooseDirectory();
      await scan.analysisPromise;
      const analysis = scan.photoGroups[0].analysis;
      const moved = await workspace.movePhotoGroups([scan.photoGroups[0].id]);
      const batch = await source.getDirectoryHandle(moved.id);
      const duringMove = await readDirectory(batch);

      const restarted = new ReviewWorkspace({
        pickDirectory: async () => source,
      });
      const recovered = await restarted.chooseDirectory();
      await recovered.analysisPromise;
      await restarted.restoreMovedBatch(moved.id);
      const after = await readDirectory(source);

      analyzer.close();
      return { analysis, before, duringMove, after };
    } finally {
      await root.removeEntry(sourceName, { recursive: true });
    }
  });

  expect(result.analysis.status).toBe("review");
  expect(result.analysis.reasons.join("；")).toContain("清晰度");
  expect(result.analysis.thumbnail).toBeTruthy();
  for (const filename of ["P1000001.JPG", "P1000001.RW2", "P1000001.XMP"]) {
    expect(result.duringMove[filename].contents).toBe(
      result.before[filename].contents,
    );
    expect(result.duringMove[filename].lastModified).toBe(
      result.before[filename].lastModified,
    );
    expect(result.after[filename]).toEqual(result.before[filename]);
  }
  expect(
    requests.every((url) => url.startsWith("http://127.0.0.1:4173/")),
  ).toBe(true);
  expect(requests.some((url) => /\/api\//.test(url))).toBe(false);
});
