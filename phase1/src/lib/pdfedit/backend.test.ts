import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { applyPdfEdit, inspectPdf } from "./backend";
async function fixture() {
  const d = await PDFDocument.create();
  d.addPage([200, 300]);
  d.addPage([400, 500]);
  return d.save();
}
test("rotate, move and delete reopen with intended geometry", async () => {
  let b = await fixture();
  b = await applyPdfEdit(b, { kind: "rotate", page: 0 });
  assert.equal((await inspectPdf(b)).pages[0].rotation, 90);
  b = await applyPdfEdit(b, { kind: "move", from: 0, to: 1 });
  assert.equal((await inspectPdf(b)).pages[1].width, 200);
  assert.equal((await inspectPdf(b)).pages[1].rotation, 90);
  b = await applyPdfEdit(b, { kind: "delete", page: 0 });
  assert.equal((await inspectPdf(b)).pages.length, 1);
  await assert.rejects(
    () => applyPdfEdit(b, { kind: "delete", page: 0 }),
    /at least one/,
  );
});
test("annotation saves real /Annots and AP; original unchanged", async () => {
  const b = await fixture();
  const out = await applyPdfEdit(b, {
    kind: "annotation",
    annotation: {
      kind: "highlight",
      page: 0,
      color: [1, 1, 0],
      opacity: 0.4,
      contents: "review",
      author: "",
      rects: [{ x: 10, y: 20, width: 80, height: 15 }],
    },
  });
  const d = await PDFDocument.load(out);
  assert.ok(d.getPage(0).node.get(PDFName.of("Annots")));
  assert.equal(
    (await PDFDocument.load(b)).getPage(0).node.get(PDFName.of("Annots")),
    undefined,
  );
});
test("text and inserted pages serialize and retain form fields", async () => {
  const b = await fixture();
  const out = await applyPdfEdit(b, {
    kind: "text",
    page: 0,
    text: "Hello",
    x: 20,
    y: 40,
    size: 12,
  });
  assert.ok(out.length > b.length);
  const combined = await applyPdfEdit(out, {
    kind: "insert",
    data: b,
    after: 0,
  });
  assert.deepEqual(
    (await inspectPdf(combined)).pages.map((p) => p.width),
    [200, 200, 400, 400],
  );
});
test("signatures are protected; bad page indices and unsupported text fail honestly", async () => {
  const d = await PDFDocument.create();
  const p = d.addPage();
  p.node.set(
    PDFName.of("TestSig"),
    d.context.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }),
  );
  const b = await d.save();
  assert.equal((await inspectPdf(b)).signed, true);
  await assert.rejects(
    () => applyPdfEdit(b, { kind: "rotate", page: 0 }),
    /Signed/,
  );
  await assert.rejects(() =>
    applyPdfEdit(new Uint8Array([1, 2]), { kind: "delete", page: 0 }),
  );
  const f = await fixture();
  await assert.rejects(
    () => applyPdfEdit(f, { kind: "move", from: 0, to: 10 }),
    /Page/,
  );
  await assert.rejects(
    () =>
      applyPdfEdit(f, {
        kind: "text",
        page: 0,
        text: "漢字",
        x: 20,
        y: 20,
        size: 10,
      }),
    /encode/,
  );
});

test("reorder keeps widget and AcroForm references, so later fill changes the visible page", async () => {
  const d = await PDFDocument.create();
  const p = d.addPage([200, 300]);
  d.addPage([400, 500]);
  const f = d.getForm().createTextField("Name");
  f.addToPage(p, { x: 20, y: 40, width: 100, height: 20 });
  const out = await applyPdfEdit(await d.save(), {
    kind: "move",
    from: 0,
    to: 1,
  });
  const read = await PDFDocument.load(out);
  const field = read.getForm().getTextField("Name");
  const widget = field.acroField.getWidgets()[0];
  assert.equal(widget.P()?.toString(), read.getPage(1).ref.toString());
  field.setText("Visible value");
  const saved = await read.save();
  assert.equal(
    (await PDFDocument.load(saved)).getForm().getTextField("Name").getText(),
    "Visible value",
  );
  await assert.rejects(
    () => applyPdfEdit(out, { kind: "delete", page: 1 }),
    /form widgets/,
  );
  const original = await d.save();
  await assert.rejects(
    () => applyPdfEdit(original, { kind: "insert", data: out, after: 0 }),
    /Importing form/,
  );
});
