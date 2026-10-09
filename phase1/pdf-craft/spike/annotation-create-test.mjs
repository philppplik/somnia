import { chromium } from "playwright";
import assert from "node:assert/strict";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  StandardFonts,
  degrees,
  PDFHexString,
  PDFRef,
} from "pdf-lib";
import fs from "node:fs";
import { spawn } from "node:child_process";
const server = spawn(
  "node",
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "1491"],
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
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.6, `${a} != ${b}`);
try {
  for (let i = 0; i < 100; i++) {
    try {
      await page.goto("http://127.0.0.1:1491/?fallback=zip");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  for (const rotation of [0, 90, 180, 270]) {
    const name = `annotation-${rotation}.pdf`,
      d = await PDFDocument.create(),
      p = d.addPage([460, 560]);
    p.setCropBox(20, 30, 400, 500);
    p.setRotation(degrees(rotation));
    const font = await d.embedFont(StandardFonts.Helvetica);
    p.drawText("Native PDF annotations", { x: 44, y: 480, size: 22, font });
    for (const [y, text] of [
      [410, "Highlight this line"],
      [350, "Underline this line"],
      [290, "Strike through this line"],
    ])
      p.drawText(text, { x: 60, y, size: 16, font });
    const bytes = Array.from(await d.save());
    await page.evaluate(
      async ({ name, bytes }) => {
        const { addMediaFile } = await import("/src/lib/media.ts");
        await addMediaFile(new Blob([new Uint8Array(bytes)]), name);
      },
      { name, bytes },
    );
    await page.locator("canvas[data-rendered=true]").waitFor();
    await page.getByRole("tab", { name: "Add", exact: true }).click();
    const creator = page.getByRole("region", { name: "Create PDF annotation" });
    assert.equal(
      await creator
        .getByRole("button", { name: "Draw markup on page" })
        .isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Edit PDF", exact: true }).click();
    await page.getByRole("button", { name: "Fit page", exact: true }).click();
    async function state() {
      return page.evaluate(async (name) => {
        const { getPdfSession } = await import("/src/lib/pdfedit/session.ts");
        const s = getPdfSession(name);
        return {
          busy: s.busy,
          error: s.error,
          comments: s.info.comments.map((c) => ({
            subtype: c.subtype,
            contents: c.contents,
            target: c.target,
          })),
          undo: s.undo.length,
          placement: !!s.annotationPlacement,
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
        if (a && JSON.stringify(a) === JSON.stringify(z)) {
          box = z;
          break;
        }
      }
      assert.ok(box);
      const base = await page.evaluate(async (bytes) => {
        const { pdfjsBackend } =
          await import("/src/lib/pdfview/pdfjsBrowser.ts");
        const doc = await pdfjsBackend.open(new Uint8Array(bytes));
        const p = await doc.getPage(1),
          c = p.coordinates(1, 0),
          size = p.size;
        await doc.destroy();
        return { ...c, size };
      }, bytes);
      return {
        box,
        t: base.transform.map((n) => (n * box.width) / base.size.width),
      };
    }
    function xy(x, y, m) {
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
    for (const [kind, y, color, opacity] of [
      ["highlight", 406, "#ffe033", 40],
      ["underline", 346, "#18a04e", 100],
      ["strikeout", 286, "#e02c45", 100],
    ]) {
      await creator
        .getByLabel("PDF annotation type", { exact: true })
        .selectOption(kind);
      await creator
        .getByLabel("New annotation comment", { exact: true })
        .fill(`New ${kind} comment`);
      await creator.getByLabel("Annotation color", { exact: true }).fill(color);
      await creator
        .getByLabel("Annotation opacity", { exact: true })
        .fill(String(opacity));
      await creator
        .getByRole("button", { name: "Draw markup on page", exact: true })
        .click();
      const m = await matrix();
      await drag(xy(58, y, m), xy(264, y + 21, m));
      await until(
        (s) =>
          !s.busy &&
          s.comments.length ===
            (kind === "highlight" ? 1 : kind === "underline" ? 2 : 3),
      );
    }
    await creator
      .getByLabel("PDF annotation type", { exact: true })
      .selectOption("note");
    await creator
      .getByLabel("New annotation comment", { exact: true })
      .fill("Text note: reviewed 漢字");
    await creator
      .getByLabel("Annotation color", { exact: true })
      .fill("#3388ff");
    await creator
      .getByRole("button", { name: "Place text note on page", exact: true })
      .click();
    let m = await matrix(),
      anchor = xy(70, 220, m);
    await page.mouse.click(anchor.x, anchor.y);
    await until((s) => !s.busy && s.comments.length === 4);
    await page
      .getByRole("button", { name: "Undo PDF edit", exact: true })
      .click();
    await until((s) => !s.busy && s.comments.length === 3);
    await page
      .getByRole("button", { name: "Redo PDF edit", exact: true })
      .click();
    await until((s) => !s.busy && s.comments.length === 4);
    // Escape cancels armed tool; a mere click cannot create accidental tiny markup.
    await creator
      .getByLabel("PDF annotation type", { exact: true })
      .selectOption("highlight");
    await creator
      .getByRole("button", { name: "Draw markup on page", exact: true })
      .click();
    m = await matrix();
    anchor = xy(330, 130, m);
    await page.mouse.click(anchor.x, anchor.y);
    assert.equal((await state()).comments.length, 4);
    await page.getByLabel("PDF annotation placement", { exact: true }).focus();
    await page.keyboard.press("Escape");
    assert.equal((await state()).placement, false);
    if (rotation === 0) {
      await creator.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "/downloads/pdf-annotation-create-tools.png",
      });
    }
    await page.getByRole("tab", { name: "Comments", exact: true }).click();
    await page.getByText("4 of 4 comments", { exact: true }).waitFor();
    const notes = page.getByRole("article", {
      name: "Comment on page 1",
      exact: true,
    });
    await notes
      .last()
      .getByRole("button", { name: "Edit comment", exact: true })
      .click();
    await page
      .getByLabel("Edit comment text", { exact: true })
      .fill("Created here, then edited. 漢字");
    await page
      .getByRole("button", { name: "Save comment", exact: true })
      .click();
    await until(
      (s) =>
        !s.busy &&
        s.comments.some((c) => c.contents.startsWith("Created here")),
    );
    await matrix();
    if (rotation === 0) {
      await page.screenshot({
        path: "/downloads/pdf-annotation-create-light.png",
      });
      await page.evaluate(() =>
        window.__somnia.patch({ themeChoice: "dark", theme: "dark" }),
      );
      await matrix();
      await page.screenshot({
        path: "/downloads/pdf-annotation-create-dark.png",
      });
    }
    if (rotation === 90)
      await page.screenshot({
        path: "/downloads/pdf-annotation-create-rotated.png",
      });
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Save copy/ }).click();
    const path = `/downloads/pdf-annotation-create-${rotation}.pdf`;
    await (await event).saveAs(path);
    const saved = await PDFDocument.load(fs.readFileSync(path)),
      annots = saved.getPage(0).node.Annots();
    assert.equal(annots.size(), 4);
    for (let i = 0; i < 4; i++) {
      const a = annots.lookup(i, PDFDict);
      assert.ok(
        a.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N")) instanceof
          PDFRef,
      );
      assert.equal(
        a.get(PDFName.of("P")).toString(),
        saved.getPage(0).ref.toString(),
      );
      const rect = a
        .lookup(PDFName.of("Rect"), PDFArray)
        .asArray()
        .map((n) => n.asNumber());
      if (i < 3) {
        near(rect[0], 58);
        near(rect[1], [406, 346, 286][i]);
        near(rect[2] - rect[0], 206);
        near(rect[3] - rect[1], 21);
        assert.equal(a.lookup(PDFName.of("QuadPoints"), PDFArray).size(), 8);
      } else {
        near(rect[0], 70);
        near(rect[1], 200);
        assert.equal(
          a.lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
          "Created here, then edited. 漢字",
        );
      }
    }
    console.log(
      `${rotation} degrees/crop-origin: create 4 types, comments edit, undo/redo, click guard/Escape, save AP/quads/page/geometry pass.`,
    );
  }
  assert.deepEqual(errors, []);
  console.log("No pageerrors.");
} catch (e) {
  console.log("pageerrors", errors);
  await page.screenshot({
    path: "/downloads/pdf-annotation-create-failure.png",
  });
  throw e;
} finally {
  await browser.close();
  server.kill();
}
