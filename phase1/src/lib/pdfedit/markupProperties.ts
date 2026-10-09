import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  type PDFDocument,
} from "pdf-lib";
import { buildAnnotation } from "../pdfannotate/export";
import { validateCreatedAnnotation } from "./annotationCreation";
import type { PdfCommentTarget } from "./comments";
import type { Rect, RgbColor, PdfAnnotation } from "../pdfannotate/types";
export interface MarkupProperties {
  rect: Rect;
  color: RgbColor;
  opacity: number;
}
export interface MarkupInspection {
  properties: MarkupProperties | null;
  reason: string | null;
}
const key = PDFName.of;
const numbers = (d: PDFDict, name: string) => {
  const a = d.lookupMaybe(key(name), PDFArray);
  return (
    a?.asArray().map((v) => d.context.lookup(v, PDFNumber).asNumber()) ?? []
  );
};
export function inspectMarkup(d: PDFDict): MarkupInspection {
  try {
    return inspectSafeMarkup(d);
  } catch {
    return {
      properties: null,
      reason: "Malformed annotation properties are view-only.",
    };
  }
}
function inspectSafeMarkup(d: PDFDict): MarkupInspection {
  const st = d.lookupMaybe(key("Subtype"), PDFName)?.decodeText();
  const no = (reason: string) => ({ properties: null, reason });
  if (!["Text", "Highlight", "Underline", "StrikeOut"].includes(st ?? ""))
    return no("This annotation type has no geometry editor.");
  if (d.has(key("IRT"))) return no("Reply geometry is view-only.");
  if (["A", "AA", "OC", "RD", "BE", "BS", "Border"].some((n) => d.has(key(n))))
    return no("Annotation actions, layers or effects are view-only.");
  const flags = d.lookupMaybe(key("F"), PDFNumber)?.asNumber() ?? 0;
  if (flags & (1 | 2 | 8 | 16 | 32 | 64 | 128 | 256 | 512))
    return no("Hidden, rotated, scaled or locked annotations are view-only.");
  const r = numbers(d, "Rect");
  if (
    r.length !== 4 ||
    !r.every(Number.isFinite) ||
    r[2] <= r[0] ||
    r[3] <= r[1]
  )
    return no("Invalid annotation rectangle.");
  const rect = { x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1] };
  if (
    st === "Text" &&
    (Math.abs(rect.width - 20) > 0.01 || Math.abs(rect.height - 20) > 0.01)
  )
    return no("Only 20 x 20 pt text-note icons can be redesigned.");
  if (st !== "Text") {
    const q = numbers(d, "QuadPoints");
    const z = [r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[1]],
      spec = [r[0], r[3], r[2], r[3], r[2], r[1], r[0], r[1]];
    if (
      q.length !== 8 ||
      ![z, spec].some((expected) =>
        expected.every((v, i) => Math.abs(v - q[i]) < 0.01),
      )
    )
      return no(
        "Only a single axis-aligned quad matching Rect can be redesigned.",
      );
  }
  const c = numbers(d, "C");
  if (
    c.length &&
    (c.length !== 3 || !c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
  )
    return no("Non-RGB annotation color is view-only.");
  const opacity = d.lookupMaybe(key("CA"), PDFNumber)?.asNumber() ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0.05 || opacity > 1)
    return no("Unsupported annotation opacity.");
  return {
    properties: {
      rect,
      color: (c.length ? c : [1, 0.8, 0]) as unknown as RgbColor,
      opacity,
    },
    reason: null,
  };
}
export function changeMarkup(
  doc: PDFDocument,
  op: {
    kind: "comment.properties";
    target: PdfCommentTarget;
    properties: MarkupProperties;
  },
) {
  const page = doc.getPages()[op.target.page],
    a = page?.node.Annots();
  if (
    !a ||
    !Number.isInteger(op.target.index) ||
    op.target.index < 0 ||
    op.target.index >= a.size()
  )
    throw Error("Comment target is stale.");
  const raw = a.get(op.target.index),
    d = a.lookup(op.target.index, PDFDict);
  if (
    raw.toString() !== op.target.object ||
    d.toString() !== op.target.expected
  )
    throw Error("Comment target is stale.");
  const entry = inspectMarkup(d);
  if (!entry.properties) throw Error(entry.reason ?? "Markup is view-only.");
  const st = d.lookup(key("Subtype"), PDFName).decodeText();
  const p = op.properties;
  if (!p || !p.rect) throw Error("Invalid annotation properties.");
  const kind = (
    {
      Text: "note",
      Highlight: "highlight",
      Underline: "underline",
      StrikeOut: "strikeout",
    } as const
  )[st as "Text" | "Highlight" | "Underline" | "StrikeOut"];
  if (kind === "note" && (p.rect.width !== 20 || p.rect.height !== 20))
    throw Error("Text-note size is fixed at 20 x 20 pt.");
  const annotation = {
    kind,
    page: op.target.page,
    color: p.color,
    opacity: p.opacity,
    contents: "properties",
    author: "",
    ...(kind === "note"
      ? { position: { x: p.rect.x, y: p.rect.y + 20 } }
      : { rects: [p.rect] }),
  } as PdfAnnotation;
  validateCreatedAnnotation(doc, annotation);
  const temporary = buildAnnotation(
      doc.context,
      annotation,
      "temporary-properties",
      page.ref,
    ),
    fresh = doc.context.lookup(temporary, PDFDict);
  for (const n of ["Rect", "QuadPoints", "C", "CA", "AP"]) {
    const v = fresh.get(key(n));
    if (v) d.set(key(n), v);
  }
  // Preserve original ref, contents, author, NM, flags, popup and reply relationships.
  d.set(key("M"), fresh.get(key("M"))!);
  if (kind === "note") d.set(key("Name"), PDFName.of("Note"));
  doc.context.delete(temporary);
}
