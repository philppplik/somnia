import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
} from "pdf-lib";
import { inspectPdf } from "../pdfedit/backend";
import { buildAnnotation } from "../pdfannotate/export";
import { fillForm, readFormFields } from "../pdfforms/forms";
import {
  PdfEditError,
  createPdfEditDocument,
  validatePdfEditDocument,
  type PdfEditAnnotation,
  type PdfEditDocument,
} from "./model";

export async function inspectPdfEditSource(source: Uint8Array) {
  const bytes = source.slice();
  const info = await inspectPdf(bytes);
  const reason = info.encrypted
    ? "Encrypted PDFs are view-only."
    : info.signed
      ? "Signed PDFs are view-only to protect signatures."
      : info.xfa
        ? "XFA forms are view-only."
        : null;
  return {
    info,
    fields: reason ? [] : await readFormFields(bytes),
    editable: !reason,
    reason,
    document: createPdfEditDocument(info.pages.length),
  };
}
function guardRect(page: PDFPage, a: PdfEditAnnotation) {
  const b = page.getCropBox(),
    r = a.rect;
  if (
    r.x < b.x ||
    r.y < b.y ||
    r.x + r.width > b.x + b.width + 0.001 ||
    r.y + r.height > b.y + b.height + 0.001
  )
    throw new PdfEditError(
      "Annotation rectangle must fit within the unrotated page crop box.",
    );
}
function append(
  page: PDFPage,
  doc: PDFDocument,
  ref: ReturnType<typeof buildAnnotation>,
) {
  let annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!annots) {
    annots = doc.context.obj([]);
    page.node.set(PDFName.of("Annots"), annots);
  }
  annots.push(ref);
}
async function freeText(doc: PDFDocument, page: PDFPage, a: PdfEditAnnotation) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { x, y, width, height } = a.rect;
  const lines = a.text.replace(/\r\n?/g, "\n").split("\n");
  // Explicitly reject overflow and unsupported glyphs rather than exporting clipped or missing text.
  try {
    for (const line of lines)
      if (font.widthOfTextAtSize(line, a.fontSize) > width - 8)
        throw new PdfEditError(
          "Free text is wider than its rectangle. Use line breaks or a wider rectangle.",
        );
  } catch (e) {
    if (e instanceof PdfEditError) throw e;
    throw new PdfEditError(
      "Free text uses characters unsupported by Helvetica (WinAnsi).",
    );
  }
  if (lines.length * a.fontSize * 1.2 + 8 > height)
    throw new PdfEditError("Free text is taller than its rectangle.");
  const appearancePage = await PDFDocument.create();
  const appearanceFont = await appearancePage.embedFont(
    StandardFonts.Helvetica,
  );
  const temporary = appearancePage.addPage([width, height]);
  temporary.drawText(a.text, {
    x: 4,
    y: height - 4 - a.fontSize,
    size: a.fontSize,
    lineHeight: a.fontSize * 1.2,
    font: appearanceFont,
    color: rgb(...a.color),
    opacity: a.opacity,
  });
  const embedded = await doc.embedPage(temporary);
  await embedded.embed();
  const dict = doc.context.obj({
    Type: "Annot",
    Subtype: "FreeText",
    P: page.ref,
    Rect: [x, y, x + width, y + height],
    F: 4,
    Contents: PDFHexString.fromText(a.text),
    NM: PDFString.of(a.id),
    C: a.color,
    CA: a.opacity,
    DA: PDFString.of(`/Helv ${a.fontSize} Tf ${a.color.join(" ")} rg`),
    AP: { N: embedded.ref },
  });
  append(page, doc, doc.context.register(dict));
}
/** Recompose in memory from a private source copy. Never writes files and never changes source bytes. */
export async function exportPdfEdits(
  source: Uint8Array,
  metadata: PdfEditDocument,
): Promise<Uint8Array> {
  validatePdfEditDocument(metadata);
  // Snapshot before any await: caller edits cannot race an in-progress export.
  const model: PdfEditDocument = JSON.parse(JSON.stringify(metadata));
  let bytes: Uint8Array = source.slice();
  const inspected = await inspectPdfEditSource(bytes);
  if (!inspected.editable) throw new PdfEditError(inspected.reason!);
  if (inspected.info.pages.length !== model.sourcePageCount)
    throw new PdfEditError("Metadata does not match the source page count.");
  if (Object.keys(model.fieldValues).length) {
    const filled = await fillForm(bytes, model.fieldValues);
    if (filled.errors.length)
      throw new PdfEditError(
        filled.errors.map((e) => `${e.field}: ${e.message}`).join("\n"),
      );
    bytes = filled.bytes;
  }
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const originalPages = doc.getPages();
  const kept = new Set(model.pages.map((p) => p.sourcePage));
  // Keep the form tree intact. Widget-page deletion/extraction needs explicit flattening, not silent loss.
  for (let i = 0; i < originalPages.length; i++) {
    if (kept.has(i)) continue;
    const annots = originalPages[i].node.Annots();
    if (
      annots?.asArray().some((ref) => {
        const dict = doc.context.lookup(ref);
        return (
          dict instanceof PDFDict &&
          dict.get(PDFName.of("Subtype")) === PDFName.of("Widget")
        );
      })
    )
      throw new PdfEditError(
        "Cannot omit a page with form widgets. Flatten a copy in a trusted PDF tool first.",
      );
  }
  for (const a of model.annotations) {
    if (!kept.has(a.sourcePage)) continue;
    const page = originalPages[a.sourcePage];
    guardRect(page, a);
    if (a.kind === "freeText") await freeText(doc, page, a);
    else
      append(
        page,
        doc,
        buildAnnotation(
          doc.context,
          {
            kind: a.kind === "highlight" ? "highlight" : "strikeout",
            page: a.sourcePage,
            rects: [a.rect],
            color: a.color,
            opacity: a.opacity,
            contents: a.text,
            author: "",
          },
          a.id,
          page.ref,
        ),
      );
  }
  for (const p of model.pages) {
    const page = originalPages[p.sourcePage];
    page.setRotation(
      degrees((((page.getRotation().angle + p.rotation) % 360) + 360) % 360),
    );
    page.node.normalize();
  }
  // Reinsert the same page objects: form widget /P and existing annotation refs remain valid.
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  for (const p of model.pages) doc.addPage(originalPages[p.sourcePage]);
  return doc.save();
}
