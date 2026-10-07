import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
const catalogues = Object.fromEntries(
  ["en", "de", "es", "fr", "pt-BR"].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(
        new URL(`../src/locales/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>,
  ]),
);
for (const [locale, t] of Object.entries(catalogues)) {
  test(`${locale}: local profile, avatar and plan work without a cloud account`, async ({
    page,
  }) => {
    await page.addInitScript(
      (l) => localStorage.setItem("somnia.locale.v1", l),
      locale,
    );
    await page.goto("/");
    const pill = page.getByRole("button", {
      name: t["account.open"],
      exact: true,
      includeHidden: true,
    });
    await pill.click();
    const dialog = page.getByRole("dialog", {
      name: t["account.title"],
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel(t["account.nickname"], { exact: true })
      .fill("Philipp");
    await expect(pill).toContainText(
      t["account.hey"].replace("{name}", "Philipp"),
    );
    await dialog
      .getByLabel(t["account.upload"], { exact: true })
      .setInputFiles({
        name: "avatar.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAY0lEQVR4nO3PQQ3AIADAQMAqCf5xMBE8Lkt6Ctq5zx1/tnTAqwa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0D5BPAjqCvvbAAAAAAElFTkSuQmCC",
          "base64",
        ),
      });
    await expect(
      dialog.getByRole("button", { name: t["account.remove"], exact: true }),
    ).toBeVisible();
    await expect(pill.locator("img")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(pill).toContainText("Philipp");
    await expect(pill.locator("img")).toBeVisible();
    if (locale === "en")
      await page.screenshot({
        path: "test-results/evidence-account-personalized-header.png",
      });
    await pill.click();
    await dialog
      .getByRole("button", { name: t["account.activity"], exact: true })
      .click();
    await expect(
      dialog.getByRole("region", { name: t["account.heatmap"] }),
    ).toBeVisible();
    await expect(
      dialog.locator(".account-heatmap .account-cell:not(.padding)"),
    ).toHaveCount(365);
    await expect(dialog.locator(".account-activity-total strong")).toHaveText(
      "0",
    );
    await dialog
      .getByRole("button", { name: t["account.plan"], exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: t["account.soon"] }),
    ).toBeDisabled();
    await expect(dialog).toContainText(t["account.noBilling"]);
  });
}
test("real edits and saves populate activity; opening a fixture does not", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const store = await import("/src/store/appStore.ts");
    store.applyOperations(
      [
        {
          type: "replaceSource",
          file: store.getState().activeFile,
          text: "<html><body>Hello activity</body></html>",
        },
      ],
      "code",
    );
    store.markSaved({ ...store.getState().files });
  });
  await page
    .getByRole("button", {
      name: "Open account",
      exact: true,
      includeHidden: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await expect(page.locator(".account-activity-total strong")).toHaveText("2");
  await expect(page.locator(".account-heatmap .level-1")).toHaveCount(1);
  await page.screenshot({ path: "test-results/evidence-account-real-activity.png" });
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("button", {
      name: "Open account",
      exact: true,
      includeHidden: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await expect(page.locator(".account-activity-total strong")).toHaveText("2");
});
test("profile reports storage errors and rejects non-raster uploads", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Open account",
      exact: true,
      includeHidden: true,
    })
    .click();
  await page
    .getByLabel("Upload picture", { exact: true })
    .setInputFiles({
      name: "avatar.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await expect(page.getByRole("alert")).toContainText("valid PNG");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
  });
  await page.getByLabel("Nickname", { exact: true }).fill("Not saved");
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(
    page.getByRole("button", {
      name: "Open account",
      exact: true,
      includeHidden: true,
    }),
  ).toContainText("Account");
});
test("account visual evidence light and dark", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(async (theme) => {
      const { patchState } = await import("/src/store/appStore.ts");
      patchState({ themeChoice: theme, theme });
    }, theme);
    await page.screenshot({ path: `test-results/evidence-account-${theme}-header.png` });
    await page
      .getByRole("button", {
        name: "Open account",
        exact: true,
        includeHidden: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    for (const section of ["Profile", "Activity", "Plan"]) {
      await dialog.getByRole("button", { name: section, exact: true }).click();
      await expect(
        dialog.getByRole("heading", { name: section, exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/evidence-account-${theme}-${section.toLowerCase()}.png`,
      });
    }
    await page.keyboard.press("Escape");
  }
});
