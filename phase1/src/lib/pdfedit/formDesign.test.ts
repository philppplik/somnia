import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { inspectPdf, applyPdfEdit } from "./backend";
import type { FieldProperties } from "./formDesign";
const properties = (patch: Partial<FieldProperties> = {}): FieldProperties => ({
  page: 0,
  x: 30,
  y: 50,
  width: 180,
  height: 30,
  required: false,
  readOnly: false,
  value: "",
  multiline: false,
  maxLength: null,
  fontSize: 12,
  options: ["Draft", "Approved"],
  ...patch,
});
async function blank() {
  const d = await PDFDocument.create();
  d.addPage([400, 500]);
  return d.save();
}
test("create all three field types, serialize and reopen real widgets", async () => {
  let b = await blank();
  b = await applyPdfEdit(b, {
    kind: "field.create",
    name: "Reviewer",
    fieldKind: "text",
    properties: properties({ value: "Philipp", required: true, maxLength: 40 }),
  });
  b = await applyPdfEdit(b, {
    kind: "field.create",
    name: "Approved",
    fieldKind: "checkbox",
    properties: properties({ y: 100, width: 20, height: 20, value: true }),
  });
  b = await applyPdfEdit(b, {
    kind: "field.create",
    name: "Stage",
    fieldKind: "dropdown",
    properties: properties({ y: 150, value: "Draft" }),
  });
  const d = await PDFDocument.load(b);
  assert.equal(d.getForm().getTextField("Reviewer").getText(), "Philipp");
  assert.equal(d.getForm().getTextField("Reviewer").isRequired(), true);
  assert.equal(d.getForm().getCheckBox("Approved").isChecked(), true);
  const check = d.getForm().getCheckBox("Approved");
  assert.notEqual(
    check.acroField.getWidgets()[0].getAppearanceState()?.toString(),
    "/Off",
  );
  assert.deepEqual(check.acroField.getWidgets()[0].getRectangle(), {
    x: 30,
    y: 100,
    width: 20,
    height: 20,
  });
  assert.deepEqual(d.getForm().getDropdown("Stage").getSelected(), ["Draft"]);
  for (const f of d.getForm().getFields()) {
    const w = f.acroField.getWidgets()[0];
    assert.equal(w.P()?.toString(), d.getPage(0).ref.toString());
    assert.ok(w.dict.get(PDFName.of("AP")));
  }
  assert.equal((await inspectPdf(b)).designFields.length, 3);
});
test("update geometry/text flags/value and preserve field ref and widget relationships", async () => {
  let b = await applyPdfEdit(await blank(), {
    kind: "field.create",
    name: "Notes",
    fieldKind: "text",
    properties: properties(),
  });
  const before = (await PDFDocument.load(b))
    .getForm()
    .getTextField("Notes")
    .ref.toString();
  const e = (await inspectPdf(b)).designFields[0];
  b = await applyPdfEdit(b, {
    kind: "field.properties",
    name: e.name,
    expected: e.expected,
    properties: {
      ...e.properties,
      x: 60,
      y: 90,
      width: 230,
      height: 80,
      value: "Two\nlines",
      multiline: true,
      readOnly: true,
      required: true,
      fontSize: 16,
      maxLength: 100,
    },
  });
  const d = await PDFDocument.load(b);
  const f = d.getForm().getTextField("Notes");
  assert.equal(f.ref.toString(), before);
  assert.equal(f.isMultiline(), true);
  assert.equal(f.isReadOnly(), true);
  assert.equal(f.getMaxLength(), 100);
  assert.equal(f.getText(), "Two\nlines");
  assert.deepEqual(f.acroField.getWidgets()[0].getRectangle(), {
    x: 60,
    y: 90,
    width: 230,
    height: 80,
  });
  assert.equal((await inspectPdf(b)).designFields[0].properties.fontSize, 16);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.properties",
        name: e.name,
        expected: e.expected,
        properties: e.properties,
      }),
    /stale/,
  );
});
test("dropdown options and checkbox values really change in appearance-backed fields", async () => {
  let b = await applyPdfEdit(await blank(), {
    kind: "field.create",
    name: "Choice",
    fieldKind: "dropdown",
    properties: properties({ value: "Draft" }),
  });
  let e = (await inspectPdf(b)).designFields[0];
  b = await applyPdfEdit(b, {
    kind: "field.properties",
    name: e.name,
    expected: e.expected,
    properties: { ...e.properties, options: ["One", "Two"], value: "Two" },
  });
  assert.deepEqual(
    (await PDFDocument.load(b)).getForm().getDropdown("Choice").getSelected(),
    ["Two"],
  );
  b = await applyPdfEdit(b, {
    kind: "field.create",
    name: "Check",
    fieldKind: "checkbox",
    properties: properties({ width: 20, height: 20, value: true }),
  });
  e = (await inspectPdf(b)).designFields.find((f) => f.kind === "checkbox")!;
  b = await applyPdfEdit(b, {
    kind: "field.properties",
    name: e.name,
    expected: e.expected,
    properties: { ...e.properties, value: false },
  });
  assert.equal(
    (await PDFDocument.load(b)).getForm().getCheckBox("Check").isChecked(),
    false,
  );
});
test("invalid inputs never mutate original bytes", async () => {
  const b = await blank();
  const original = b.slice();
  const create = (name: string, p: FieldProperties) =>
    applyPdfEdit(b, {
      kind: "field.create",
      name,
      fieldKind: "text",
      properties: p,
    });
  await assert.rejects(() => create("a.b", properties()), /name/);
  await assert.rejects(() => create("x", properties({ x: 390 })), /rectangle/);
  await assert.rejects(
    () => create("x", properties({ width: NaN })),
    /rectangle/,
  );
  await assert.rejects(
    () => create("x", properties({ value: "漢字" })),
    /encode/,
  );
  await assert.rejects(
    () => create("x", properties({ maxLength: 1, value: "long" })),
    /max length/,
  );
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.create",
        name: "Choice",
        fieldKind: "dropdown",
        properties: properties({ options: ["One", "One"] }),
      }),
    /unique/,
  );
  assert.deepEqual(b, original);
  const made = await create("unique", properties());
  await assert.rejects(
    () =>
      applyPdfEdit(made, {
        kind: "field.create",
        name: "unique",
        fieldKind: "checkbox",
        properties: properties({ value: false }),
      }),
    /already exists/,
  );
});
test("multi-widget, rotated widget and signatures are not silently redesigned", async () => {
  const d = await PDFDocument.create();
  const p = d.addPage([400, 500]);
  const f = d.getForm().createTextField("Repeated");
  f.addToPage(p, { x: 20, y: 20, width: 100, height: 20 });
  f.addToPage(p, { x: 20, y: 60, width: 100, height: 20 });
  let b = await d.save();
  let e = (await inspectPdf(b)).designFields[0];
  assert.equal(e.editable, false);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.properties",
        name: e.name,
        expected: e.expected,
        properties: e.properties,
      }),
    /single-widget/,
  );
  const sig = d.context.register(
    d.context.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }),
  );
  d.catalog.set(PDFName.of("SignatureTest"), sig);
  b = await d.save();
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.create",
        name: "x",
        fieldKind: "text",
        properties: properties(),
      }),
    /Signed/,
  );
});
test("rotated widget and XFA reject design, crop origins constrain creation", async () => {
  const d = await PDFDocument.create();
  const page = d.addPage([400, 500]);
  page.setCropBox(20, 30, 300, 400);
  const f = d.getForm().createTextField("Rotated");
  f.addToPage(page, { x: 30, y: 40, width: 100, height: 20 });
  f.acroField
    .getWidgets()[0]
    .getOrCreateAppearanceCharacteristics()
    .setRotation(90);
  let b = await d.save();
  let e = (await inspectPdf(b)).designFields[0];
  assert.equal(e.editable, false);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.properties",
        name: e.name,
        expected: e.expected,
        properties: e.properties,
      }),
    /Rotated/,
  );
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.create",
        name: "outside",
        fieldKind: "text",
        properties: properties({ x: 0 }),
      }),
    /crop box/,
  );
  d.getForm().acroForm.dict.set(
    PDFName.of("XFA"),
    d.context.obj("unsupported"),
  );
  b = await d.save({ updateFieldAppearances: false });
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.create",
        name: "xfa",
        fieldKind: "text",
        properties: properties(),
      }),
    /XFA/,
  );
});

test("multi-select dropdowns stay view-only and existing widgets cannot move pages", async () => {
  const d = await PDFDocument.create();
  const p = d.addPage([400, 500]);
  d.addPage([400, 500]);
  const f = d.getForm().createDropdown("Multi");
  f.setOptions(["One", "Two"]);
  f.enableMultiselect();
  f.select(["One", "Two"]);
  f.addToPage(p, { x: 30, y: 50, width: 180, height: 30 });
  let b = await d.save();
  let e = (await inspectPdf(b)).designFields[0];
  assert.equal(e.editable, false);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.properties",
        name: e.name,
        expected: e.expected,
        properties: e.properties,
      }),
    /Multi-select/,
  );
  f.disableMultiselect();
  f.select("One");
  b = await d.save();
  e = (await inspectPdf(b)).designFields[0];
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.properties",
        name: e.name,
        expected: e.expected,
        properties: { ...e.properties, page: 1 },
      }),
    /between pages/,
  );
});

test("rename preserves field/widget refs and delete removes actual page annotations", async () => {
  let b = await applyPdfEdit(await blank(), {
    kind: "field.create",
    name: "Old",
    fieldKind: "checkbox",
    properties: properties({ width: 20, height: 20, value: true }),
  });
  const old = await PDFDocument.load(b),
    ref = old.getForm().getField("Old").ref.toString();
  const widgetRef = old.getPage(0).node.Annots()!.get(0).toString();
  let e = (await inspectPdf(b)).designFields[0];
  b = await applyPdfEdit(b, {
    kind: "field.rename",
    name: "Old",
    expected: e.expected,
    newName: "Reviewed",
  });
  const d = await PDFDocument.load(b);
  assert.equal(d.getForm().getCheckBox("Reviewed").ref.toString(), ref);
  assert.equal(d.getForm().getCheckBox("Reviewed").isChecked(), true);
  assert.equal(d.getPage(0).node.Annots()!.get(0).toString(), widgetRef);
  await assert.rejects(
    () =>
      applyPdfEdit(b, {
        kind: "field.delete",
        name: "Reviewed",
        expected: e.expected,
      }),
    /stale/,
  );
  e = (await inspectPdf(b)).designFields[0];
  b = await applyPdfEdit(b, {
    kind: "field.delete",
    name: e.name,
    expected: e.expected,
  });
  const removed = await PDFDocument.load(b);
  assert.equal(removed.getForm().getFields().length, 0);
  assert.equal(removed.getPage(0).node.Annots()!.size(), 0);
  assert.ok(
    !removed.context
      .enumerateIndirectObjects()
      .some(([r]) => r.toString() === ref || r.toString() === widgetRef),
  );
});
test("rename rejects collisions, invalid names, hierarchy and action/calculation forms", async () => {
  let b = await applyPdfEdit(await blank(), {
    kind: "field.create",
    name: "One",
    fieldKind: "text",
    properties: properties(),
  });
  b = await applyPdfEdit(b, {
    kind: "field.create",
    name: "Two",
    fieldKind: "text",
    properties: properties({ y: 100 }),
  });
  const e = (await inspectPdf(b)).designFields[0];
  for (const newName of ["", "a.b", "Two"])
    await assert.rejects(() =>
      applyPdfEdit(b, {
        kind: "field.rename",
        name: e.name,
        expected: e.expected,
        newName,
      }),
    );
  const d = await PDFDocument.load(b);
  d.getForm()
    .getField("One")
    .acroField.dict.set(PDFName.of("AA"), d.context.obj({}));
  const action = await d.save(),
    ae = (await inspectPdf(action)).designFields[0];
  for (const kind of ["field.rename", "field.delete"] as const)
    await assert.rejects(
      () =>
        applyPdfEdit(action, {
          kind,
          name: ae.name,
          expected: ae.expected,
          newName: "New",
        }),
      /actions or calculations/,
    );
  const h = await PDFDocument.create(),
    p = h.addPage([400, 500]);
  h.getForm().createTextField("Group.Child").addToPage(p);
  const hb = await h.save(),
    he = (await inspectPdf(hb)).designFields[0];
  await assert.rejects(
    () =>
      applyPdfEdit(hb, {
        kind: "field.rename",
        name: he.name,
        expected: he.expected,
        newName: "New",
      }),
    /Hierarchical/,
  );
});
