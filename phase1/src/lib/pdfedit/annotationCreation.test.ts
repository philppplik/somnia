import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFRef,
  PDFHexString,
} from "pdf-lib";
import { applyPdfEdit, inspectPdf } from "./backend";
import type { PdfAnnotation } from "../pdfannotate/types";
const mark = (
  kind: "highlight" | "underline" | "strikeout" = "highlight",
): PdfAnnotation => ({
  kind,
  page: 0,
  rects: [{ x: 40, y: 80, width: 150, height: 20 }],
  color: [1, 0.8, 0],
  opacity: 0.4,
  contents: "Review 漢字",
  author: "",
});
async function blank() {
  const d = await PDFDocument.create();
  d.addPage([400, 500]).setCropBox(20, 30, 350, 450);
  return d.save();
}
test("create all four annotations with real AP, page refs, markup quads and unicode Contents", async () => {
  let b = await blank();
  for (const kind of ["highlight", "underline", "strikeout"] as const)
    b = await applyPdfEdit(b, { kind: "annotation", annotation: mark(kind) });
  b = await applyPdfEdit(b, {
    kind: "annotation",
    annotation: {
      kind: "note",
      page: 0,
      position: { x: 60, y: 160 },
      color: [0.2, 0.6, 1],
      opacity: 1,
      contents: "Text note: 漢字",
      author: "",
    },
  });
  const d = await PDFDocument.load(b),
    annots = d.getPage(0).node.Annots()!;
  assert.equal(annots.size(), 4);
  const ids = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const a = annots.lookup(i, PDFDict),
      ap = a.lookup(PDFName.of("AP"), PDFDict);
    assert.ok(ap.get(PDFName.of("N")) instanceof PDFRef);
    assert.equal(
      a.get(PDFName.of("P"))?.toString(),
      d.getPage(0).ref.toString(),
    );
    assert.match(
      a.lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
      /漢字/,
    );
    ids.add(a.get(PDFName.of("NM"))!.toString());
    if (i < 3)
      assert.equal(a.lookup(PDFName.of("QuadPoints"), PDFArray).size(), 8);
  }
  assert.equal(ids.size, 4);
  assert.deepEqual(
    (await inspectPdf(b)).comments.map((c) => c.subtype),
    ["Highlight", "Underline", "StrikeOut", "Text"],
  );
  const c = (await inspectPdf(b)).comments[3];
  b = await applyPdfEdit(b, {
    kind: "comment.update",
    target: c.target,
    contents: "Updated new note",
  });
  assert.equal((await inspectPdf(b)).comments[3].contents, "Updated new note");
});
test("annotation creation rejects bad color/text/page/geometry, tiny marks and empty notes without mutation", async () => {
  const b = await blank(),
    copy = b.slice(),
    a = mark();
  for (const patch of [
    { page: 99 },
    { color: [NaN, 0, 0] },
    { opacity: 0 },
    { contents: "x".repeat(20001) },
    { rects: [] },
    { rects: [{ x: 0, y: 80, width: 10, height: 10 }] },
    { rects: [{ x: 40, y: 80, width: NaN, height: 10 }] },
    { rects: [{ x: 40, y: 80, width: 1, height: 10 }] },
  ])
    await assert.rejects(() =>
      applyPdfEdit(b, {
        kind: "annotation",
        annotation: { ...a, ...patch } as PdfAnnotation,
      }),
    );
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "annotation",
        annotation: {
          kind: "note",
          page: 0,
          position: { x: 50, y: 80 },
          color: [1, 1, 0],
          opacity: 1,
          contents: "",
          author: "",
        },
      }),
    /Write/,
  );
  const note: PdfAnnotation = {
    kind: "note",
    page: 0,
    position: { x: 50, y: 35 },
    color: [1, 1, 0],
    opacity: 1,
    contents: "note",
    author: "",
  };
  await assert.rejects(
    () => applyPdfEdit(b, { kind: "annotation", annotation: note }),
    /crop/,
  );
  assert.deepEqual(b, copy);
});
test("signed and XFA sources cannot gain new annotations", async () => {
  for (const signed of [true, false]) {
    const d = await PDFDocument.load(await blank());
    if (signed)
      d.catalog.set(
        PDFName.of("SigTest"),
        d.context.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }),
      );
    else
      d.getForm().acroForm.dict.set(
        PDFName.of("XFA"),
        d.context.obj("unsupported"),
      );
    const b = await d.save({ updateFieldAppearances: false });
    await assert.rejects(
      () => applyPdfEdit(b, { kind: "annotation", annotation: mark() }),
      signed ? /Signed/ : /XFA/,
    );
  }
});
