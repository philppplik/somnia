import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString } from "pdf-lib";
import { applyPdfEdit, inspectPdf } from "./backend";
async function fixture() {
  const d = await PDFDocument.create();
  d.addPage([400, 500]);
  return applyPdfEdit(await d.save(), {
    kind: "annotation",
    annotation: {
      kind: "highlight",
      page: 0,
      color: [1, 1, 0],
      opacity: 0.4,
      contents: "Original",
      author: "Reviewer",
      rects: [{ x: 30, y: 80, width: 160, height: 20 }],
    },
  });
}
test("geometry/color/opacity edit regenerates AP/quads while preserving ref/author/content/replies", async () => {
  let b = await fixture();
  let c = (await inspectPdf(b)).comments[0];
  const ref = c.target.object;
  b = await applyPdfEdit(b, {
    kind: "comment.reply",
    target: c.target,
    contents: "Reply",
  });
  c = (await inspectPdf(b)).comments[0];
  const before = await PDFDocument.load(b),
    oldAp = before
      .getPage(0)
      .node.Annots()!
      .lookup(0, PDFDict)
      .lookup(PDFName.of("AP"), PDFDict)
      .get(PDFName.of("N"))!
      .toString();
  b = await applyPdfEdit(b, {
    kind: "comment.properties",
    target: c.target,
    properties: {
      rect: { x: 60, y: 120, width: 220, height: 30 },
      color: [0, 0.6, 1],
      opacity: 0.7,
    },
  });
  const d = await PDFDocument.load(b),
    a = d.getPage(0).node.Annots()!,
    root = a.lookup(0, PDFDict);
  assert.equal(a.get(0).toString(), ref);
  assert.notEqual(
    root.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N"))!.toString(),
    oldAp,
  );
  assert.deepEqual(
    root
      .lookup(PDFName.of("Rect"), PDFArray)
      .asArray()
      .map((n) => n.toString()),
    ["60", "120", "280", "150"],
  );
  assert.deepEqual(
    root
      .lookup(PDFName.of("QuadPoints"), PDFArray)
      .asArray()
      .map((n) => n.toString()),
    ["60", "150", "280", "150", "60", "120", "280", "120"],
  );
  assert.equal(a.lookup(1, PDFDict).get(PDFName.of("IRT"))!.toString(), ref);
  const info = await inspectPdf(b);
  assert.equal(info.comments[0].contents, "Original");
  assert.equal(info.comments[0].author, "Reviewer");
  assert.equal(info.comments[0].hasReplies, true);
  assert.equal(info.comments[0].markup?.properties?.opacity, 0.7);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "comment.properties",
        target: c.target,
        properties: c.markup!.properties!,
      }),
    /stale/,
  );
});
test("complex/locked/reply/action annotations refuse geometry edits and bad values fail", async () => {
  const b = await fixture(),
    c = (await inspectPdf(b)).comments[0],
    p = c.markup!.properties!;
  for (const patch of [
    { opacity: 0 },
    { color: [NaN, 0, 0] },
    { rect: { ...p.rect, x: 999 } },
  ])
    await assert.rejects(() =>
      applyPdfEdit(b, {
        kind: "comment.properties",
        target: c.target,
        properties: { ...p, ...patch } as typeof p,
      }),
    );
  for (const kind of ["quads", "lock", "reply", "action", "border"]) {
    const d = await PDFDocument.load(b),
      a = d.getPage(0).node.Annots()!.lookup(0, PDFDict);
    if (kind === "quads")
      a.set(PDFName.of("QuadPoints"), d.context.obj([1, 2, 3, 4, 5, 6, 7, 8]));
    if (kind === "lock") a.set(PDFName.of("F"), d.context.obj(128));
    if (kind === "reply") a.set(PDFName.of("IRT"), d.context.obj("bad"));
    if (kind === "action") a.set(PDFName.of("AA"), d.context.obj({}));
    if (kind === "border")
      a.set(PDFName.of("Border"), d.context.obj([0, 0, 1]));
    const bytes = await d.save(),
      target = (await inspectPdf(bytes)).comments[0];
    assert.equal(target.markup?.properties, null);
    await assert.rejects(() =>
      applyPdfEdit(bytes, {
        kind: "comment.properties",
        target: target.target,
        properties: p,
      }),
    );
  }
});

test("signed/XFA sources and note resizing are blocked; malformed properties do not disable PDF viewing", async () => {
  const b = await fixture();
  for (const kind of ["sig", "xfa", "malformed"]) {
    const d = await PDFDocument.load(b);
    if (kind === "sig")
      d.catalog.set(
        PDFName.of("SigTest"),
        d.context.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }),
      );
    if (kind === "xfa")
      d.getForm().acroForm.dict.set(
        PDFName.of("XFA"),
        d.context.obj("unsupported"),
      );
    if (kind === "malformed")
      d.getPage(0)
        .node.Annots()!
        .lookup(0, PDFDict)
        .set(PDFName.of("C"), d.context.obj(["invalid"]));
    const bytes = await d.save({ updateFieldAppearances: false }),
      c = (await inspectPdf(bytes)).comments[0];
    if (kind === "malformed") assert.equal(c.markup?.properties, null);
    else
      await assert.rejects(
        () =>
          applyPdfEdit(bytes, {
            kind: "comment.properties",
            target: c.target,
            properties: {
              rect: { x: 30, y: 80, width: 160, height: 20 },
              color: [1, 1, 0],
              opacity: 0.4,
            },
          }),
        kind === "sig" ? /Signed/ : /XFA/,
      );
  }
  const d = await PDFDocument.create();
  d.addPage([400, 500]);
  const nb = await applyPdfEdit(await d.save(), {
      kind: "annotation",
      annotation: {
        kind: "note",
        page: 0,
        position: { x: 50, y: 100 },
        color: [1, 1, 0],
        opacity: 1,
        contents: "note",
        author: "",
      },
    }),
    c = (await inspectPdf(nb)).comments[0];
  await assert.rejects(
    () =>
      applyPdfEdit(nb, {
        kind: "comment.properties",
        target: c.target,
        properties: {
          ...c.markup!.properties!,
          rect: { x: 50, y: 80, width: 30, height: 20 },
        },
      }),
    /fixed/,
  );
});
