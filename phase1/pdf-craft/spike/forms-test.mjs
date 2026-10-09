import { chromium } from "playwright";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";
import { spawn } from "node:child_process";
const server = spawn(
  "node",
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "1489"],
  { stdio: "ignore" },
);
const d = await PDFDocument.create();
const p = d.addPage([400, 500]);
const font = await d.embedFont(StandardFonts.Helvetica);
p.drawText("Native form design", { x: 36, y: 440, size: 24, font });
p.drawText("Created inside Somnia. Saved as real PDF widgets.", {
  x: 36,
  y: 410,
  size: 10,
  font,
});
const bytes = await d.save();
const b = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await b.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  for (let i = 0; i < 100; i++) {
    try {
      await page.goto("http://127.0.0.1:1489/?fallback=zip");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await page.evaluate(async (bytes) => {
    const { addMediaFile } = await import("/src/lib/media.ts");
    await addMediaFile(new Blob([new Uint8Array(bytes)]), "form.pdf");
  }, Array.from(bytes));
  await page.locator("canvas[data-rendered=true]").waitFor();
  await page.getByRole("button", { name: "Edit PDF", exact: true }).click();
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  const design = page.getByRole("region", { name: "PDF form designer" });
  async function state() {
    return page.evaluate(async () => {
      const { getPdfSession } = await import("/src/lib/pdfedit/session.ts");
      const s = getPdfSession("form.pdf");
      return {
        busy: s?.busy,
        error: s?.error,
        fields: s?.info?.designFields.map((f) => ({
          name: f.name,
          properties: f.properties,
        })),
        undo: s?.undo.length,
      };
    });
  }
  async function until(f) {
    for (let i = 0; i < 500; i++) {
      const s = await state();
      if (f(s)) return s;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("timeout " + JSON.stringify(await state()));
  }
  async function create(name, kind, y, value) {
    await page
      .getByLabel("Choose field properties", { exact: true })
      .selectOption("");
    await page.getByLabel("Design field name", { exact: true }).fill(name);
    await page
      .getByLabel("Design field type", { exact: true })
      .selectOption(kind);
    await page.getByLabel("Field y", { exact: true }).fill(String(y));
    if (kind === "checkbox")
      await page.getByLabel("Field checked", { exact: true }).check();
    else
      await page.getByLabel("Field design value", { exact: true }).fill(value);
    await page
      .getByRole("button", { name: "Create field", exact: true })
      .click();
    await until((s) => !s.busy && s.fields.some((f) => f.name === name));
    await page.locator("canvas[data-rendered=true]").waitFor();
  }
  await create("Reviewer", "text", 350, "Philipp");
  await create("Approved", "checkbox", 300, true);
  await create("Stage", "dropdown", 250, "Option 1");
  await page
    .getByLabel("Choose field properties", { exact: true })
    .selectOption("Stage");
  await page
    .getByLabel("Field options", { exact: true })
    .fill("Draft\nReview\nApproved");
  await page.getByLabel("Field design value", { exact: true }).fill("Review");
  await page.getByLabel("Field required", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save field properties", exact: true })
    .click();
  await until(
    (s) =>
      !s.busy &&
      s.fields.find((f) => f.name === "Stage").properties.value === "Review",
  );
  await page.locator("canvas[data-rendered=true]").waitFor();
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await page.screenshot({ path: "/downloads/pdf-form-design-light.png" });
  await page
    .getByRole("button", { name: "Undo PDF edit", exact: true })
    .click();
  await until((s) => !s.busy && s.undo === 3);
  await page.locator("canvas[data-rendered=true]").waitFor();
  await page
    .getByRole("button", { name: "Redo PDF edit", exact: true })
    .click();
  await until((s) => !s.busy && s.undo === 4);
  await page.locator("canvas[data-rendered=true]").waitFor();
  await page.evaluate(() =>
    window.__somnia.patch({ themeChoice: "dark", theme: "dark" }),
  );
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await page.screenshot({ path: "/downloads/pdf-form-design-dark.png" });
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Save copy/ }).click();
  await (await event).saveAs("/downloads/pdf-form-design-roundtrip.pdf");
  const read = await PDFDocument.load(
    fs.readFileSync("/downloads/pdf-form-design-roundtrip.pdf"),
  );
  assert.equal(read.getForm().getTextField("Reviewer").getText(), "Philipp");
  assert.equal(read.getForm().getCheckBox("Approved").isChecked(), true);
  assert.deepEqual(read.getForm().getDropdown("Stage").getOptions(), [
    "Draft",
    "Review",
    "Approved",
  ]);
  assert.deepEqual(read.getForm().getDropdown("Stage").getSelected(), [
    "Review",
  ]);
  assert.equal(read.getForm().getDropdown("Stage").isRequired(), true);
  assert.deepEqual(errors, []);
  console.log(
    "Native create/properties/undo/redo/save roundtrip passed; no pageerrors.",
  );
} finally {
  await b.close();
  server.kill();
}
