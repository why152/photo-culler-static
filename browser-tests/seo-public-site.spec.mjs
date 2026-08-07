import { expect, test } from "@playwright/test";

const SITE_URL = "https://why152.github.io/photo-culler-static/";
const SITE_DESCRIPTION =
  /Photo Culler 在浏览器本地扫描 JPEG\/PNG\/WEBP 照片/;

test("the public site exposes indexable metadata, structured data, and crawler entry points", async ({
  page,
}) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  await expect(page).toHaveTitle("Photo Culler — 本地照片筛选与审核工具");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    SITE_DESCRIPTION,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    SITE_URL,
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "website",
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    SITE_URL,
  );
  await expect(
    page.locator('meta[property="og:image"]'),
  ).toHaveAttribute("content", `${SITE_URL}og-image.png`);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "./favicon.svg",
  );
  expect(await page.content()).toContain("照片不会离开你的电脑");

  const jsonLd = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent(),
  );
  expect(jsonLd["@type"]).toBe("WebApplication");
  expect(jsonLd.name).toBe("Photo Culler");
  expect(jsonLd.url).toBe(SITE_URL);
  expect(jsonLd.applicationCategory).toBe("PhotographyApplication");
  expect(jsonLd.offers.price).toBe("0");

  const robots = await page.request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(
    "Sitemap: https://why152.github.io/photo-culler-static/sitemap.xml",
  );

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(SITE_URL);

  const ogImage = await page.request.get("/og-image.png");
  expect(ogImage.status()).toBe(200);
  const ogImageBytes = await ogImage.body();
  expect(Array.from(ogImageBytes.subarray(0, 8))).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  expect(errors).toEqual([]);
});
