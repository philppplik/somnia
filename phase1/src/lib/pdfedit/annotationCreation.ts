import { PDFName, PDFArray, type PDFDocument } from "pdf-lib";
import type { PdfAnnotation } from "../pdfannotate/types";
export function validateCreatedAnnotation(doc: PDFDocument, a: PdfAnnotation) {
  if (!a || !["highlight", "underline", "strikeout", "note"].includes(a.kind))
    throw Error("This annotation creation type is not supported.");
  if (!Number.isInteger(a.page) || !doc.getPages()[a.page])
    throw Error("Annotation page does not exist.");
  if (
    typeof a.contents !== "string" ||
    a.contents.length > 20000 ||
    typeof a.author !== "string" ||
    a.author.length > 200
  )
    throw Error(
      "Annotation comment is limited to 20,000 characters; author to 200.",
    );
  if (
    !Array.isArray(a.color) ||
    a.color.length !== 3 ||
    !a.color.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
    !Number.isFinite(a.opacity) ||
    a.opacity < 0.05 ||
    a.opacity > 1
  )
    throw Error("Choose a valid annotation color and opacity (5-100%).");
  const count = doc
    .getPages()
    .reduce(
      (n, p) =>
        n + (p.node.lookupMaybe(PDFName.of("Annots"), PDFArray)?.size() ?? 0),
      0,
    );
  if (count >= 10000)
    throw Error("Annotation creation is limited to 10,000 annotations.");
  const box = doc.getPage(a.page).getCropBox();
  const rects =
    a.kind === "note"
      ? [{ x: a.position?.x, y: a.position?.y - 20, width: 20, height: 20 }]
      : "rects" in a
        ? a.rects
        : [];
  if (!Array.isArray(rects) || !rects.length || rects.length > 500)
    throw Error("Markup needs 1-500 rectangles.");
  for (const r of rects)
    if (
      !r ||
      ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
      r.width < 2 ||
      r.height < 2 ||
      r.x < box.x ||
      r.y < box.y ||
      r.x + r.width > box.x + box.width + 0.001 ||
      r.y + r.height > box.y + box.height + 0.001
    )
      throw Error(
        "Annotation rectangle must fit inside the page crop box (minimum 2 pt).",
      );
  if (a.kind === "note" && !a.contents.trim())
    throw Error("Write the text note before placing it.");
}
