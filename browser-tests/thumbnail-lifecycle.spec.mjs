import { expect, test } from "@playwright/test";

test("thumbnail views reuse previews, update changed analysis and release filtered entries", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { PhotoGridView, FilmstripView } = await import("/modules/thumbnail-views.js");
    const revoked = [];
    const nativeRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => { revoked.push(url); nativeRevoke(url); };
    const canvas = new OffscreenCanvas(8, 8);
    canvas.getContext("2d").fillRect(0, 0, 8, 8);
    const thumbnail = await canvas.convertToBlob({ type: "image/png" });
    const replacement = await canvas.convertToBlob({ type: "image/png" });
    const group = (id) => ({ id, analysisFile: { name: `${id}.PNG` },
      analysis: { thumbnail: null, status: "pending", sharpness: 0 } });
    const a = group("a"), b = group("b");
    let visible = [a, b];
    const context = { filter: "all", density: "comfortable", decisions: {}, actionSelection: new Set() };
    const gridElement = document.createElement("div");
    const filmstripElement = document.createElement("div");
    const grid = new PhotoGridView({ element: gridElement, visibleGroups: () => visible,
      context: () => context, onOpen: () => {}, onSelection: () => {},
      filterLabels: { all: "全部" }, decisionLabels: {} });
    const filmstrip = new FilmstripView({ element: filmstripElement, onNavigate: () => {} });
    grid.render(); filmstrip.render(visible, "a");
    const placeholders = gridElement.querySelectorAll(".thumbnail-placeholder").length;
    a.analysis = { thumbnail, status: "review", sharpness: 20 };
    grid.update(a); filmstrip.update(a);
    const firstGridImage = gridElement.querySelector("img");
    const firstFilmImage = filmstripElement.querySelector("img");
    const firstGridUrl = firstGridImage.src;
    const firstFilmUrl = firstFilmImage.src;
    grid.render(); filmstrip.render(visible, "b");
    const reused = gridElement.querySelector("img") === firstGridImage &&
      filmstripElement.querySelector("img") === firstFilmImage && revoked.length === 0;
    const selectedAfterNavigation = filmstripElement.querySelector('[aria-current="true"]').dataset.photoGroupId;
    a.analysis.thumbnail = replacement;
    grid.update(a);
    // Completion-only analysis refreshes stable group objects without a
    // per-group callback, so explicitly revisit previews once at completion.
    filmstrip.invalidate(); filmstrip.render(visible, "b");
    const replacementRevokedOld = revoked.includes(firstGridUrl) && revoked.includes(firstFilmUrl);
    const replacementGridUrl = gridElement.querySelector("img").src;
    const replacementFilmUrl = filmstripElement.querySelector("img").src;
    visible = [b];
    grid.render(); filmstrip.render(visible, "b");
    const filtered = !grid.has("a") && !filmstrip.has("a") &&
      revoked.includes(replacementGridUrl) && revoked.includes(replacementFilmUrl);
    b.analysis.thumbnail = thumbnail;
    grid.update(b); filmstrip.update(b);
    grid.clear(); filmstrip.clear(); grid.clear(); filmstrip.clear();
    URL.revokeObjectURL = nativeRevoke;
    return { placeholders, reused, selectedAfterNavigation, replacementRevokedOld,
      filtered, revokeCount: revoked.length, uniqueRevokeCount: new Set(revoked).size,
      gridChildren: gridElement.childElementCount, filmstripChildren: filmstripElement.childElementCount };
  });
  expect(result).toEqual({ placeholders: 2, reused: true, selectedAfterNavigation: "b",
    replacementRevokedOld: true, filtered: true, revokeCount: 6, uniqueRevokeCount: 6,
    gridChildren: 0, filmstripChildren: 0 });
});
