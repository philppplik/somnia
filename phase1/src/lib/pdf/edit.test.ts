import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  degrees,
} from "pdf-lib";
import {
  applyPdfEditCommand,
  createPdfEditDocument,
  extractPdfPages,
  parsePdfEdits,
  serializePdfEdits,
  commitPdfEdits,
  undoPdfEdits,
  redoPdfEdits,
  type PdfEditAnnotation,
} from "./model";
import { exportPdfEdits, inspectPdfEditSource } from "./export";
import { listPdfAnnotations } from "../pdfannotate/export";
import { readFormFields } from "../pdfforms/forms";
import { PDF_EDIT_LOCALES } from "./locales";
async function fixture(form = false) {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const p = doc.addPage([300 + i * 10, 400]);
    p.drawText(`Original page ${i + 1}`, { x: 40, y: 300, font, size: 16 });
  }
  doc.getPage(1).setRotation(degrees(90));
  if (form) {
    const f = doc.getForm();
    const text = f.createTextField("Customer");
    text.addToPage(doc.getPage(0), { x: 30, y: 200, width: 150, height: 25 });
    text.setText("Original");
    const cb = f.createCheckBox("Accepted");
    cb.addToPage(doc.getPage(0), { x: 30, y: 160, width: 20, height: 20 });
    const read = f.createTextField("Locked");
    read.addToPage(doc.getPage(0), { x: 30, y: 110, width: 150, height: 25 });
    read.enableReadOnly();
    const drop = f.createDropdown("Region");
    drop.addOptions(["DE", "FR"]);
    drop.addToPage(doc.getPage(0), { x: 30, y: 70, width: 150, height: 25 });
  }
  return doc.save();
}
const annotation = (
  kind: PdfEditAnnotation["kind"] = "highlight",
  sourcePage = 0,
): PdfEditAnnotation => ({
  id: kind,
  kind,
  sourcePage,
  rect: { x: 30, y: 250, width: 180, height: 40 },
  text: kind === "freeText" ? "Review this line" : "Comment",
  color: [1, 0.8, 0],
  opacity: 0.5,
  fontSize: 12,
});
test("metadata only edits are immutable; deleted-page annotations survive undo; stable page identity", () => {
  const initial = createPdfEditDocument(3),
    before = serializePdfEdits(initial);
  let h = { present: initial, past: [], future: [] } as Parameters<
    typeof commitPdfEdits
  >[0];
  h = commitPdfEdits(h, {
    kind: "annotation.add",
    annotation: annotation("highlight", 1),
  });
  h = commitPdfEdits(h, { kind: "rotate", sourcePage: 1 });
  h = commitPdfEdits(h, { kind: "reorder", sourcePages: [2, 1, 0] });
  h = commitPdfEdits(h, { kind: "delete", sourcePage: 1 });
  assert.equal(h.present.annotations[0].sourcePage, 1);
  h = undoPdfEdits(h);
  assert.equal(h.present.pages[1].sourcePage, 1);
  assert.equal(h.present.pages[1].rotation, 90);
  h = redoPdfEdits(h);
  assert.deepEqual(
    h.present.pages.map((p) => p.sourcePage),
    [2, 0],
  );
  assert.equal(serializePdfEdits(initial), before);
  const extracted = extractPdfPages(h.present, [0]);
  assert.equal(extracted.pages.length, 1);
  assert.equal(h.present.pages.length, 2);
  assert.deepEqual(parsePdfEdits(serializePdfEdits(h.present)), h.present);
});
test("validation rejects malformed persistence, duplicate identities, invalid order and last-page deletion", () => {
  const d = createPdfEditDocument(2);
  assert.throws(() =>
    applyPdfEditCommand(d, { kind: "reorder", sourcePages: [0, 0] }),
  );
  assert.throws(() =>
    applyPdfEditCommand(createPdfEditDocument(1), {
      kind: "delete",
      sourcePage: 0,
    }),
  );
  assert.throws(() => parsePdfEdits('{"schema":"other"}'));
  assert.throws(() => parsePdfEdits("bad"));
  const a = annotation();
  a.rect.width = NaN;
  assert.throws(() =>
    applyPdfEditCommand(d, { kind: "annotation.add", annotation: a }),
  );
  assert.throws(() => extractPdfPages(d, [1, 1]));
  const d2 = applyPdfEditCommand(d, {
    kind: "annotation.add",
    annotation: annotation(),
  });
  assert.throws(() =>
    applyPdfEditCommand(d2, {
      kind: "annotation.add",
      annotation: annotation(),
    }),
  );
});
test("export keeps source unchanged, preserves real annotations and page identity after reorder/rotation", async () => {
  const source = await fixture(),
    before = source.slice();
  let d = createPdfEditDocument(3);
  for (const k of ["highlight", "strikethrough", "freeText"] as const)
    d = applyPdfEditCommand(d, {
      kind: "annotation.add",
      annotation: annotation(k, 1),
    });
  d = applyPdfEditCommand(d, { kind: "rotate", sourcePage: 1 });
  d = applyPdfEditCommand(d, { kind: "reorder", sourcePages: [1, 2, 0] });
  d = applyPdfEditCommand(d, { kind: "delete", sourcePage: 2 });
  const output = await exportPdfEdits(source, d),
    pdf = await PDFDocument.load(output);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getPage(0).getWidth(), 310);
  assert.equal(pdf.getPage(0).getRotation().angle, 180);
  assert.deepEqual(
    (await listPdfAnnotations(output)).map((a) => [a.page, a.subtype]),
    [
      [0, "Highlight"],
      [0, "StrikeOut"],
      [0, "FreeText"],
    ],
  );
  const annots = pdf.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray);
  const note = annots.lookup(2, PDFDict);
  assert.equal(
    note.lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
    "Review this line",
  );
  assert.ok(note.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N")));
  assert.deepEqual(source, before);
  assert.equal((await PDFDocument.load(source)).getPageCount(), 3);
});
test("AcroForm filling remains editable; strict field errors abort export; no silent widget-page loss", async () => {
  const source = await fixture(true),
    before = source.slice();
  let d = createPdfEditDocument(3);
  d = applyPdfEditCommand(d, {
    kind: "field.set",
    name: "Customer",
    value: "Philipp",
  });
  d = applyPdfEditCommand(d, {
    kind: "field.set",
    name: "Accepted",
    value: true,
  });
  d = applyPdfEditCommand(d, {
    kind: "field.set",
    name: "Region",
    value: "FR",
  });
  d = applyPdfEditCommand(d, { kind: "reorder", sourcePages: [2, 0, 1] });
  const out = await exportPdfEdits(source, d);
  const fields = await readFormFields(out);
  assert.equal(fields.find((f) => f.name === "Customer")?.value, "Philipp");
  assert.equal(fields.find((f) => f.name === "Accepted")?.value, true);
  assert.deepEqual(fields.find((f) => f.name === "Region")?.value, ["FR"]);
  assert.equal(fields.length, 4);
  assert.deepEqual(source, before);
  await assert.rejects(
    () =>
      exportPdfEdits(
        source,
        applyPdfEditCommand(d, {
          kind: "field.set",
          name: "Locked",
          value: "no",
        }),
      ),
    /read-only/,
  );
  await assert.rejects(
    () =>
      exportPdfEdits(
        source,
        applyPdfEditCommand(d, {
          kind: "field.set",
          name: "Unknown",
          value: "no",
        }),
      ),
    /No such field/,
  );
  await assert.rejects(
    () =>
      exportPdfEdits(
        source,
        applyPdfEditCommand(d, {
          kind: "field.set",
          name: "Region",
          value: "XX",
        }),
      ),
    /Not in options/,
  );
  await assert.rejects(
    () =>
      exportPdfEdits(
        source,
        applyPdfEditCommand(d, { kind: "delete", sourcePage: 0 }),
      ),
    /form widgets/,
  );
  const extracted = extractPdfPages(d, [0]);
  assert.equal(
    (
      await PDFDocument.load(await exportPdfEdits(source, extracted))
    ).getPageCount(),
    1,
  );
});
test("bounds, unsupported text encoding and mismatched source are explicit errors", async () => {
  const source = await fixture();
  let d = createPdfEditDocument(3);
  const a = annotation("freeText");
  a.rect.x = 1000;
  await assert.rejects(
    () =>
      exportPdfEdits(
        source,
        applyPdfEditCommand(d, { kind: "annotation.add", annotation: a }),
      ),
    /crop box/,
  );
  a.rect.x = 30;
  a.text = "🤖";
  await assert.rejects(
    () =>
      exportPdfEdits(
        source,
        applyPdfEditCommand(d, { kind: "annotation.add", annotation: a }),
      ),
    /WinAnsi/,
  );
  a.text = "x".repeat(1000);
  await assert.rejects(
    () =>
      exportPdfEdits(
        source,
        applyPdfEditCommand(d, { kind: "annotation.add", annotation: a }),
      ),
    /wider/,
  );
  await assert.rejects(
    () => exportPdfEdits(source, createPdfEditDocument(1)),
    /page count/,
  );
});
test("source inspection disables signed documents", async () => {
  const doc = await PDFDocument.load(await fixture());
  doc.catalog.set(
    PDFName.of("PrivateSignature"),
    doc.context.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }),
  );
  const bytes = await doc.save();
  const info = await inspectPdfEditSource(bytes);
  assert.equal(info.editable, false);
  await assert.rejects(() => exportPdfEdits(bytes, info.document), /Signed/);
});
test("all five catalogues have exact English key parity, nonempty translations", () => {
  const keys = Object.keys(PDF_EDIT_LOCALES.en).sort();
  assert.deepEqual(Object.keys(PDF_EDIT_LOCALES).sort(), [
    "de",
    "en",
    "es",
    "fr",
    "pt-BR",
  ]);
  for (const catalog of Object.values(PDF_EDIT_LOCALES)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys);
    assert.ok(Object.values(catalog).every((v) => v.trim().length));
  }
});

test("all right-angle rotations, negative crop origin and annotation bounds export correctly", async () => {
  const doc = await PDFDocument.create();
  const p = doc.addPage([300, 400]);
  p.setMediaBox(-50, -50, 300, 400);
  p.setCropBox(-20, -20, 250, 350);
  const source = await doc.save();
  let d = createPdfEditDocument(1);
  const a = annotation("highlight");
  a.rect = { x: -10, y: 10, width: 100, height: 20 };
  d = applyPdfEditCommand(d, { kind: "annotation.add", annotation: a });
  for (let i = 0; i < 4; i++) {
    const exported = await PDFDocument.load(await exportPdfEdits(source, d));
    assert.equal(exported.getPage(0).getRotation().angle, i * 90);
    assert.equal(
      (await listPdfAnnotations(await exportPdfEdits(source, d))).length,
      1,
    );
    d = applyPdfEditCommand(d, { kind: "rotate", sourcePage: 0 });
  }
  assert.equal(d.pages[0].rotation, 0);
});
test("export snapshots source and metadata before async work", async () => {
  const source = await fixture(),
    d = createPdfEditDocument(3);
  const pending = exportPdfEdits(source, d);
  source.fill(0);
  d.pages.reverse();
  const result = await PDFDocument.load(await pending);
  assert.equal(result.getPage(0).getWidth(), 300);
});
