import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFName,
  PDFDict,
  StandardFonts,
  rgb,
  type PDFField,
} from "pdf-lib";
export type DesignFieldKind = "text" | "checkbox" | "dropdown";
export interface FieldProperties {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  readOnly: boolean;
  value: string | boolean;
  multiline: boolean;
  maxLength: number | null;
  fontSize: number;
  options: string[];
}
export interface DesignField {
  name: string;
  kind: DesignFieldKind;
  properties: FieldProperties;
  expected: string;
  editable: boolean;
  reason: string | null;
}
export type FormDesignOperation =
  | {
      kind: "field.create";
      name: string;
      fieldKind: DesignFieldKind;
      properties: FieldProperties;
    }
  | {
      kind: "field.properties";
      name: string;
      expected: string;
      properties: FieldProperties;
    };
const supported = (f: PDFField): DesignFieldKind | null =>
  f instanceof PDFTextField
    ? "text"
    : f instanceof PDFCheckBox
      ? "checkbox"
      : f instanceof PDFDropdown
        ? "dropdown"
        : null;
const snapshot = (f: PDFField) =>
  f.acroField.dict.toString() +
  f.acroField
    .getWidgets()
    .map((w) => w.dict.toString())
    .join("|");
export function designFields(doc: PDFDocument): DesignField[] {
  const pages = doc.getPages();
  const fields = doc.getForm().getFields();
  if (fields.length > 1000)
    throw Error("Form design is limited to 1000 fields.");
  return fields.flatMap((f) => {
    const kind = supported(f);
    if (!kind) return [];
    const widgets = f.acroField.getWidgets();
    const w = widgets[0];
    const page = w
      ? pages.findIndex(
          (p) =>
            w.P()?.toString() === p.ref.toString() ||
            p.node
              .Annots()
              ?.asArray()
              .some((a) => doc.context.lookup(a) === w.dict),
        )
      : -1;
    const r = w?.getRectangle() ?? { x: 0, y: 0, width: 100, height: 24 };
    const reason =
      f instanceof PDFDropdown && f.isMultiselect()
        ? "Multi-select dropdowns are view-only in the designer."
        : widgets.length !== 1
          ? "Only single-widget fields can be redesigned."
          : page < 0
            ? "Widget page could not be resolved."
            : (w?.getAppearanceCharacteristics()?.getRotation() ?? 0) !== 0
              ? "Rotated widgets are view-only in the designer."
              : null;
    return [
      {
        name: f.getName(),
        kind,
        expected: snapshot(f),
        editable: reason === null,
        reason,
        properties: {
          page,
          ...r,
          required: f.isRequired(),
          readOnly: f.isReadOnly(),
          value:
            f instanceof PDFTextField
              ? (f.getText() ?? "")
              : f instanceof PDFCheckBox
                ? f.isChecked()
                : ((f as PDFDropdown).getSelected()[0] ?? ""),
          multiline: f instanceof PDFTextField && f.isMultiline(),
          maxLength:
            f instanceof PDFTextField ? (f.getMaxLength() ?? null) : null,
          fontSize:
            Number(
              f.acroField.getDefaultAppearance()?.match(/([\d.]+)\s+Tf/)?.[1],
            ) || 12,
          options: f instanceof PDFDropdown ? f.getOptions() : [],
        },
      },
    ];
  });
}
export async function applyFieldDesign(
  doc: PDFDocument,
  op: FormDesignOperation,
) {
  const p = op.properties;
  const pages = doc.getPages();
  if (!Number.isInteger(p.page) || !pages[p.page])
    throw Error("Field page does not exist.");
  const page = pages[p.page];
  const box = page.getCropBox();
  if (
    ![p.x, p.y, p.width, p.height, p.fontSize].every(Number.isFinite) ||
    p.width < 8 ||
    p.height < 8 ||
    p.x < box.x ||
    p.y < box.y ||
    p.x + p.width > box.x + box.width ||
    p.y + p.height > box.y + box.height ||
    p.fontSize < 4 ||
    p.fontSize > 100
  )
    throw Error(
      "Field rectangle must fit inside the page crop box; minimum size is 8 pt. Font size must be 4–100 pt.",
    );
  if (
    p.maxLength !== null &&
    (!Number.isInteger(p.maxLength) || p.maxLength < 1 || p.maxLength > 100_000)
  )
    throw Error("Max length must be 1–100000 or empty.");
  if (
    doc.catalog
      .lookupMaybe(PDFName.of("AcroForm"), PDFDict)
      ?.has(PDFName.of("XFA"))
  )
    throw Error("XFA form design is not supported.");
  const form = doc.getForm();
  if (form.hasXFA()) throw Error("XFA form design is not supported.");
  if (form.getFields().length >= 1000 && op.kind === "field.create")
    throw Error("Form design is limited to 1000 fields.");
  let f: PDFField;
  let kind: DesignFieldKind;
  if (op.kind === "field.create") {
    if (
      typeof op.name !== "string" ||
      !op.name.trim() ||
      op.name.length > 100 ||
      /[.\x00-\x1f]/.test(op.name)
    )
      throw Error(
        "Choose a unique field name, up to 100 characters, without dots or control characters.",
      );
    if (form.getFields().some((f) => f.getName() === op.name))
      throw Error("A field with this name already exists.");
    kind = op.fieldKind;
    if (!["text", "checkbox", "dropdown"].includes(kind))
      throw Error("Unsupported field type.");
    f =
      kind === "text"
        ? form.createTextField(op.name)
        : kind === "checkbox"
          ? form.createCheckBox(op.name)
          : form.createDropdown(op.name);
  } else {
    f = form.getField(op.name);
    kind = supported(f)!;
    if (!kind) throw Error("This field type is view-only.");
    if (snapshot(f) !== op.expected)
      throw Error("Field target is stale. Refresh the properties.");
    const entry = designFields(doc).find((e) => e.name === op.name);
    if (!entry?.editable)
      throw Error(entry?.reason ?? "Cannot redesign this field.");
    if (p.page !== entry.properties.page)
      throw Error("Moving an existing field between pages is not supported.");
    f.acroField
      .getWidgets()[0]
      .setRectangle({ x: p.x, y: p.y, width: p.width, height: p.height });
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const texts = [
    ...(kind === "checkbox" ? [] : [String(p.value)]),
    ...p.options,
  ];
  if (texts.some((t) => t.length > 20_000))
    throw Error("Field text is limited to 20,000 characters.");
  for (const t of texts) font.encodeText(t.replace(/[\r\n]/g, ""));
  if (f instanceof PDFTextField) {
    if (typeof p.value !== "string")
      throw Error("Text fields need a string value.");
    f.removeMaxLength();
    if (p.multiline) f.enableMultiline();
    else f.disableMultiline();
    f.setText(p.value);
    if (p.maxLength !== null) {
      if (p.value.length > p.maxLength)
        throw Error("Value exceeds max length.");
      f.setMaxLength(p.maxLength);
    }
  }
  if (f instanceof PDFCheckBox) {
    if (typeof p.value !== "boolean")
      throw Error("Checkbox needs a boolean value.");
    if (p.value) f.check();
    else f.uncheck();
  }
  if (f instanceof PDFDropdown) {
    if (
      !p.options.length ||
      p.options.length > 100 ||
      p.options.some((o) => !o.trim()) ||
      new Set(p.options).size !== p.options.length
    )
      throw Error("Dropdown needs 1–100 unique non-empty options.");
    if (
      typeof p.value !== "string" ||
      (p.value && !p.options.includes(p.value))
    )
      throw Error("Selected value must be one of the dropdown options.");
    f.clear();
    f.setOptions(p.options);
    if (p.value) f.select(p.value);
  }
  if (op.kind === "field.create") {
    (f as PDFTextField | PDFCheckBox | PDFDropdown).addToPage(page, {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      borderWidth: 1,
      borderColor: rgb(0.3, 0.3, 0.35),
      backgroundColor: rgb(1, 1, 1),
      ...(f instanceof PDFCheckBox ? {} : { font, textColor: rgb(0, 0, 0) }),
    });
  }
  if (op.kind === "field.create")
    f.acroField
      .getWidgets()[0]
      .setRectangle({ x: p.x, y: p.y, width: p.width, height: p.height });
  if (f instanceof PDFCheckBox) {
    if (p.value) f.check();
    else f.uncheck();
  }
  if (f instanceof PDFTextField || f instanceof PDFDropdown) {
    f.setFontSize(p.fontSize);
    f.updateAppearances(font);
  } else if (f instanceof PDFCheckBox) f.updateAppearances();
  if (p.required) f.enableRequired();
  else f.disableRequired();
  if (p.readOnly) f.enableReadOnly();
  else f.disableReadOnly();
}
