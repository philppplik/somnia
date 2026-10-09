import { test, expect } from "@playwright/test";
test("real Chromium renders original, true exported annotations/forms and five-language inspector", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  for (const locale of ["en", "de", "es", "fr", "pt-BR"]) {
    await page.goto(
      `http://127.0.0.1:1435/src/lib/pdf/verification/index.html?locale=${locale}`,
    );
    await expect(page.locator("#original")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 20000 },
    );
    await expect(page.locator("#exported")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 20000 },
    );
    const inspector = page.locator(".pdf-edit-inspector");
    await expect(inspector).toBeVisible();
    await page.screenshot({
      path: `/downloads/pdf-edit-${locale}-chromium.png`,
    });
    await inspector.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await page.screenshot({
      path: `/downloads/pdf-edit-${locale}-forms-chromium.png`,
    });
    if (locale === "en") {
      await page
        .getByRole("textbox", { name: "Customer", exact: true })
        .fill("Browser verified");
      await page
        .getByRole("button", { name: "Export PDF copy", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Export PDF copy", exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.screenshot({
        path: "/downloads/pdf-edit-form-filled-chromium.png",
      });
    }
  }
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "http://127.0.0.1:1435/src/lib/pdf/verification/index.html?locale=de",
  );
  await expect(page.locator("#exported")).toHaveAttribute(
    "data-rendered",
    "true",
    { timeout: 20000 },
  );
  await page.screenshot({
    path: "/downloads/pdf-edit-mobile-chromium.png",
    fullPage: true,
  });
});
