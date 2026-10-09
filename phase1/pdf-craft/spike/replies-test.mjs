import { chromium } from "playwright";
import assert from "node:assert/strict";
import {
  PDFDocument,
  StandardFonts,
  PDFName,
  PDFDict,
  PDFHexString,
  PDFRef,
} from "pdf-lib";
import fs from "node:fs";
import { spawn } from "node:child_process";
const server = spawn(
  "node",
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "1492"],
  { stdio: "ignore" },
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  for (let i = 0; i < 100; i++) {
    try {
      await page.goto("http://127.0.0.1:1492/?fallback=zip");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const doc = await PDFDocument.create(),
    p = doc.addPage([400, 500]),
    font = await doc.embedFont(StandardFonts.Helvetica);
  p.drawText("Review thread", { x: 40, y: 440, size: 26, font });
  p.drawText("Original note stays on the page. Replies stay in the thread.", {
    x: 40,
    y: 410,
    size: 10,
    font,
  });
  const note = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [40, 340, 60, 360],
      F: 4,
      Contents: PDFHexString.fromText("Please review the heading."),
      T: PDFHexString.fromText("Reviewer"),
      Name: "Note",
    }),
  );
  p.node.set(PDFName.of("Annots"), doc.context.obj([note]));
  const noteAp = doc.context.register(
    doc.context.stream(
      "1 0.8 0 rg 0.2 0.2 0 RG 1 w 41 341 18 18 re B 44 347 m 56 347 l S 44 351 m 56 351 l S 44 355 m 56 355 l S",
      { Type: "XObject", Subtype: "Form", BBox: [40, 340, 60, 360] },
    ),
  );
  doc.context
    .lookup(note, PDFDict)
    .set(PDFName.of("AP"), doc.context.obj({ N: noteAp }));

  await page.evaluate(
    async (bytes) => {
      const { addMediaFile } = await import("/src/lib/media.ts");
      await addMediaFile(new Blob([new Uint8Array(bytes)]), "replies.pdf");
    },
    Array.from(await doc.save()),
  );
  await page.locator("canvas[data-rendered=true]").waitFor();
  await page.getByRole("tab", { name: "Comments", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Reply to comment", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Edit PDF", exact: true }).click();
  async function state() {
    return page.evaluate(async () => {
      const { getPdfSession } = await import("/src/lib/pdfedit/session.ts");
      const s = getPdfSession("replies.pdf");
      return { busy: s.busy, error: s.error, comments: s.info.comments };
    });
  }
  async function until(f) {
    for (let i = 0; i < 300; i++) {
      const s = await state();
      if (!s.busy && s.error) throw Error(s.error);
      if (f(s)) return s;
      await new Promise((r) => setTimeout(r, 40));
    }
    throw Error("timeout");
  }
  async function reply(text) {
    await page
      .getByRole("button", { name: "Reply to comment", exact: true })
      .click();
    await page.getByLabel("Write PDF reply", { exact: true }).fill(text);
    assert.equal(
      await page
        .getByRole("button", { name: "Add reply", exact: true })
        .isDisabled(),
      false,
    );
    await page.getByRole("button", { name: "Add reply", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Reply to comment", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Add reply", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Cancel reply", exact: true }).click();
  await reply("First reply: heading looks clear. 漢字");
  await until((s) => !s.busy && s.comments.length === 2);
  await reply("Second reply: keep the short introduction.");
  await until((s) => !s.busy && s.comments.length === 3);
  const thread = page.getByRole("region", {
      name: "PDF comment thread",
      exact: true,
    }),
    cards = page.getByRole("article", {
      name: "Comment on page 1",
      exact: true,
    });
  assert.equal(await thread.count(), 1);
  assert.equal(
    await page.getByLabel("Thread replies", { exact: true }).count(),
    1,
  );
  assert.equal(
    await cards
      .first()
      .getByRole("button", { name: "Delete comment", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Reply to comment", exact: true })
      .count(),
    1,
  );
  await cards
    .nth(1)
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await page
    .getByLabel("Edit comment text", { exact: true })
    .fill("Edited reply: approved 漢字");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await until((s) => !s.busy && s.comments[1].contents.startsWith("Edited"));
  await page
    .getByLabel("Filter PDF comments", { exact: true })
    .fill("approved");
  await page.getByText("1 of 3 comments", { exact: true }).waitFor();
  assert.equal(await cards.count(), 3);
  await page.getByLabel("Filter PDF comments", { exact: true }).fill("");
  page.once("dialog", (d) => d.dismiss());
  await cards
    .last()
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  assert.equal((await state()).comments.length, 3);
  page.once("dialog", (d) => d.accept());
  await cards
    .last()
    .getByRole("button", { name: "Delete comment", exact: true })
    .click();
  await until((s) => !s.busy && s.comments.length === 2);
  await page
    .getByRole("button", { name: "Undo PDF edit", exact: true })
    .click();
  await until((s) => !s.busy && s.comments.length === 3);
  await page
    .getByRole("button", { name: "Redo PDF edit", exact: true })
    .click();
  await until((s) => !s.busy && s.comments.length === 2);
  await page
    .getByRole("button", { name: "Undo PDF edit", exact: true })
    .click();
  await until((s) => !s.busy && s.comments.length === 3);
  await page.locator("canvas[data-rendered=true]").waitFor();
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/downloads/pdf-replies-light.png" });
  await page.evaluate(() =>
    window.__somnia.patch({ themeChoice: "dark", theme: "dark" }),
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/downloads/pdf-replies-dark.png" });
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Save copy/ }).click();
  await (await event).saveAs("/downloads/pdf-replies-roundtrip.pdf");
  const saved = await PDFDocument.load(
      fs.readFileSync("/downloads/pdf-replies-roundtrip.pdf"),
    ),
    a = saved.getPage(0).node.Annots();
  assert.equal(a.size(), 3);
  for (let i = 1; i < 3; i++) {
    const d = a.lookup(i, PDFDict);
    assert.equal(d.get(PDFName.of("IRT")).toString(), a.get(0).toString());
    assert.equal(d.get(PDFName.of("RT")), PDFName.of("R"));
    assert.equal(
      d.get(PDFName.of("P")).toString(),
      saved.getPage(0).ref.toString(),
    );
    assert.equal(d.lookup(PDFName.of("F")).toString(), "2");
    assert.ok(
      d.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N")) instanceof
        PDFRef,
    );
  }
  assert.equal(
    a
      .lookup(1, PDFDict)
      .lookup(PDFName.of("Contents"), PDFHexString)
      .decodeText(),
    "Edited reply: approved 漢字",
  );
  await page.evaluate(
    async (bytes) => {
      const { addMediaFile } = await import("/src/lib/media.ts");
      await addMediaFile(
        new Blob([new Uint8Array(bytes)]),
        "reopened-replies.pdf",
      );
    },
    Array.from(fs.readFileSync("/downloads/pdf-replies-roundtrip.pdf")),
  );
  await page.locator("canvas[data-rendered=true]").waitFor();
  await page.getByText("3 of 3 comments", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Thread replies", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Reply to comment", exact: true })
      .isDisabled(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Reply create/edit/delete, root protection, thread filter, cancel, undo/redo and real IRT/RT/AP/Page/Unicode roundtrip pass. No pageerrors.",
  );
} catch (e) {
  console.log(errors);
  await page.screenshot({ path: "/downloads/pdf-replies-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.kill();
}
