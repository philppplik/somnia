import { chromium } from "playwright";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, PDFName, degrees } from "pdf-lib";
import fs from "node:fs";
import { spawn } from "node:child_process";
const server = spawn(
  "node",
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "1490"],
  { stdio: "ignore" },
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.6, `${a} != ${b}`);
try {
  for (let i = 0; i < 100; i++) {
    try {
      await page.goto("http://127.0.0.1:1490/?fallback=zip");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  for (const rotation of [0, 90, 180, 270]) {
    const name = `layout-${rotation}.pdf`,
      d = await PDFDocument.create(),
      p = d.addPage([460, 560]);
    p.setCropBox(20, 30, 400, 500);
    p.setRotation(degrees(rotation));
    const font = await d.embedFont(StandardFonts.Helvetica);
    p.drawText("Drag, resize, rename", { x: 44, y: 480, size: 20, font });
    const bytes = Array.from(await d.save());
    await page.evaluate(
      async ({ bytes, name }) => {
        const { addMediaFile } = await import("/src/lib/media.ts");
        await addMediaFile(new Blob([new Uint8Array(bytes)]), name);
      },
      { bytes, name },
    );
    await page.locator("canvas[data-rendered=true]").waitFor();
    await page.getByRole("button", { name: "Edit PDF", exact: true }).click();
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await page.getByRole("button", { name: "Fit page", exact: true }).click();
    async function state() {
      return page.evaluate(async (name) => {
        const { getPdfSession } = await import("/src/lib/pdfedit/session.ts");
        const s = getPdfSession(name);
        return {
          busy: s?.busy,
          error: s?.error,
          undo: s?.undo.length,
          fields: s?.info?.designFields.map((f) => ({
            name: f.name,
            p: f.properties,
          })),
          placement: !!s?.formPlacement,
        };
      }, name);
    }
    async function until(f) {
      for (let i = 0; i < 400; i++) {
        const s = await state();
        if (!s.busy && s.error) throw Error(s.error);
        if (f(s)) return s;
        await new Promise((r) => setTimeout(r, 30));
      }
      throw Error("timeout " + JSON.stringify(await state()));
    }
    async function matrix() {
      await page.locator("canvas[data-rendered=true]").waitFor();
      let box;
      for (let i = 0; i < 30; i++) {
        const a = await page.locator("canvas[role=img]").boundingBox();
        await page.waitForTimeout(100);
        const z = await page.locator("canvas[role=img]").boundingBox();
        if (a && z && JSON.stringify(a) === JSON.stringify(z)) {
          box = z;
          break;
        }
      }
      assert.ok(box, "viewport must settle");
      const base = await page.evaluate(async (bytes) => {
        const { pdfjsBackend } =
          await import("/src/lib/pdfview/pdfjsBrowser.ts");
        const doc = await pdfjsBackend.open(new Uint8Array(bytes));
        const p = await doc.getPage(1),
          coordinates = p.coordinates(1, 0),
          size = p.size;
        await doc.destroy();
        return { ...coordinates, size };
      }, bytes);
      const scale = box.width / base.size.width;
      return { box, t: base.transform.map((n) => n * scale) };
    }
    const initial = await matrix();
    function xy(x, y, m = initial) {
      const t = m.t;
      return {
        x: m.box.x + t[0] * x + t[2] * y + t[4],
        y: m.box.y + t[1] * x + t[3] * y + t[5],
      };
    }
    async function drag(a, z) {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(z.x, z.y, { steps: 8 });
      await page.mouse.up();
    }
    await page
      .getByLabel("Design field name", { exact: true })
      .fill("Reviewer");
    await page
      .getByLabel("Field design value", { exact: true })
      .fill("Philipp");
    await page
      .getByRole("button", {
        name: "Place on page (click or drag)",
        exact: true,
      })
      .click();
    await drag(xy(60, 340), xy(220, 380));
    let s = await until((s) => !s.busy && s.fields.length === 1);
    let f = s.fields[0].p;
    close(f.x, 60);
    close(f.y, 340);
    close(f.width, 160);
    close(f.height, 40);
    await page.locator("canvas[data-rendered=true]").waitFor();
    let m = await matrix();
    await drag(xy(120, 360, m), xy(150, 330, m));
    s = await until((s) => !s.busy && s.undo === 2);
    f = s.fields[0].p;
    close(f.x, 90);
    close(f.y, 310);
    await page.locator("canvas[data-rendered=true]").waitFor();
    m = await matrix();
    await drag(xy(250, 350, m), xy(290, 370, m));
    s = await until((s) => !s.busy && s.undo === 3);
    f = s.fields[0].p;
    close(f.width, 200);
    close(f.height, 60);
    await page.locator("canvas[data-rendered=true]").waitFor();
    await page.getByLabel("Rename field to", { exact: true }).fill("Reviewed");
    await page
      .getByRole("button", { name: "Rename field", exact: true })
      .click();
    await until((s) => !s.busy && s.fields[0]?.name === "Reviewed");
    // Deletion confirmation cancel leaves the graph intact.
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Delete field", exact: true })
      .click();
    assert.equal((await state()).fields.length, 1);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete field", exact: true })
      .click();
    await until((s) => !s.busy && s.fields.length === 0);
    const deleted = await page.evaluate(async (name) => {
      const { getPdfSession } = await import("/src/lib/pdfedit/session.ts");
      return Array.from(getPdfSession(name).bytes);
    }, name);
    const removed = await PDFDocument.load(new Uint8Array(deleted));
    assert.equal(removed.getForm().getFields().length, 0);
    assert.equal(removed.getPage(0).node.Annots().size(), 0);

    await page
      .getByRole("button", { name: "Undo PDF edit", exact: true })
      .click();
    await until((s) => !s.busy && s.fields[0]?.name === "Reviewed");
    await page
      .getByRole("button", { name: "Redo PDF edit", exact: true })
      .click();
    await until((s) => !s.busy && s.fields.length === 0);
    await page
      .getByRole("button", { name: "Undo PDF edit", exact: true })
      .click();
    await until((s) => !s.busy && s.fields[0]?.name === "Reviewed");
    // Click placement of a checkbox with default dimensions.
    await page
      .getByLabel("Choose field properties", { exact: true })
      .selectOption("");
    await page
      .getByLabel("Design field name", { exact: true })
      .fill("Approved");
    await page
      .getByLabel("Design field type", { exact: true })
      .selectOption("checkbox");
    await page.getByLabel("Field checked", { exact: true }).check();
    await page
      .getByRole("button", {
        name: "Place on page (click or drag)",
        exact: true,
      })
      .click();
    m = await matrix();
    const check = xy(100, 240, m);
    await page.mouse.click(check.x, check.y);
    s = await until((s) => !s.busy && s.fields.length === 2);
    const cp = s.fields.find((f) => f.name === "Approved").p;
    close(cp.x, 100);
    close(cp.y, 240);
    close(cp.width, 20);
    await page.locator("canvas[data-rendered=true]").waitFor();
    // Escape cancels an armed new placement without adding history.
    await page
      .getByLabel("Choose field properties", { exact: true })
      .selectOption("");
    await page
      .getByLabel("Design field name", { exact: true })
      .fill("Cancelled");
    await page
      .getByRole("button", {
        name: "Place on page (click or drag)",
        exact: true,
      })
      .click();
    await page.getByLabel("PDF field layout", { exact: true }).focus();
    await page.keyboard.press("Escape");
    assert.equal((await state()).placement, false);
    assert.equal((await state()).fields.length, 2);
    await page
      .getByRole("button", {
        name: "Select / move / resize fields",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Choose field properties", { exact: true })
      .selectOption("Reviewed");
    await page.getByRole("button", { name: "Fit page", exact: true }).click();
    await page.locator("canvas[data-rendered=true]").waitFor();
    if (rotation === 0) {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page
        .getByRole("button", { name: "Rotate clockwise", exact: true })
        .click();
      await page.locator("canvas[data-rendered=true]").waitFor();
      const field = await page
        .getByLabel("Move field Reviewed", { exact: true })
        .boundingBox();
      const canvas = await page.locator("canvas[role=img]").boundingBox();
      assert.ok(
        field && canvas && field.width < field.height,
        "view rotation rotates the overlay",
      );
      await page
        .getByRole("button", { name: "Rotate clockwise", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Rotate clockwise", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Rotate clockwise", exact: true })
        .click();
      await page.getByRole("button", { name: "Fit page", exact: true }).click();
      await matrix();
    }
    if (rotation === 0) {
      await page.screenshot({ path: "/downloads/pdf-field-layout-light.png" });
      await page.evaluate(() =>
        window.__somnia.patch({ themeChoice: "dark", theme: "dark" }),
      );
      await page.screenshot({ path: "/downloads/pdf-field-layout-dark.png" });
    }
    if (rotation === 90)
      await page.screenshot({
        path: "/downloads/pdf-field-layout-rotated.png",
      });
    const ev = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Save copy/ }).click();
    const output = `/downloads/pdf-field-layout-${rotation}.pdf`;
    await (await ev).saveAs(output);
    const saved = await PDFDocument.load(fs.readFileSync(output));
    assert.equal(saved.getForm().getTextField("Reviewed").getText(), "Philipp");
    assert.equal(saved.getForm().getCheckBox("Approved").isChecked(), true);
    assert.equal(saved.getForm().getFields().length, 2);
    const r = saved
      .getForm()
      .getTextField("Reviewed")
      .acroField.getWidgets()[0]
      .getRectangle();
    close(r.x, 90);
    close(r.y, 310);
    close(r.width, 200);
    close(r.height, 60);
    assert.equal(saved.getPage(0).node.Annots().size(), 2);
    for (const a of saved.getPage(0).node.Annots().asArray())
      assert.ok(saved.context.lookup(a));
    console.log(
      `Crop-origin ${rotation} degrees: drag/create, move, resize, rename, delete cancel/confirm, undo/redo, click placement, Escape, saved graph pass.`,
    );
  }
  assert.deepEqual(errors, []);
  console.log("No pageerrors.");
} catch (e) {
  console.log("pageerrors", errors);
  console.log("alerts", await page.getByRole("alert").allTextContents());
  await page.screenshot({ path: "/downloads/layout-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.kill();
}
