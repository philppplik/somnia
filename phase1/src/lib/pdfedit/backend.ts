import {
  commentsFromDocument,
  changeComment,
  type PdfComment,
  type PdfCommentChange,
} from "./comments";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import { exportAnnotatedPdf } from "../pdfannotate/export";
import type { PdfAnnotation } from "../pdfannotate/types";
export interface PdfPageInfo {
  width: number;
  height: number;
  rotation: number;
}
export interface PdfEditInfo {
  comments: PdfComment[];
  pages: PdfPageInfo[];
  signed: boolean;
  encrypted: boolean;
}
export type PdfEditOperation =
  | PdfCommentChange
  | { kind: "rotate"; page: number }
  | { kind: "delete"; page: number }
  | { kind: "move"; from: number; to: number }
  | { kind: "annotation"; annotation: PdfAnnotation }
  | {
      kind: "text";
      page: number;
      text: string;
      x: number;
      y: number;
      size: number;
    }
  | { kind: "insert"; data: Uint8Array; after: number };
/** Read-only inspection is allowed for signed files. Editing signatures invalidates them, so refuse it. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfEditInfo> {
  if (bytes.length > 25_000_000) throw Error("PDF exceeds 25 MB.");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (doc.getPageCount() > 2000)
    throw Error("PDF editing is limited to 2000 pages.");
  const seen = new Set<unknown>();
  const signature = (o: unknown): boolean => {
    if (seen.has(o)) return false;
    seen.add(o);
    if (o instanceof PDFDict) {
      if (
        o.get(PDFName.of("Type")) === PDFName.of("Sig") ||
        o.get(PDFName.of("FT")) === PDFName.of("Sig") ||
        o.has(PDFName.of("ByteRange"))
      )
        return true;
      return o.values().some(signature);
    }
    if (o instanceof PDFArray) return o.asArray().some(signature);
    return false;
  };
  const signed = doc.context
    .enumerateIndirectObjects()
    .some(([, o]) => signature(o));
  return {
    comments: doc.isEncrypted ? [] : commentsFromDocument(doc),
    encrypted: doc.isEncrypted,
    signed,
    pages: doc
      .getPages()
      .map((p) => ({ ...p.getSize(), rotation: p.getRotation().angle })),
  };
}
export async function applyPdfEdit(
  bytes: Uint8Array,
  op: PdfEditOperation,
): Promise<Uint8Array> {
  const info = await inspectPdf(bytes);
  if (info.encrypted)
    throw Error(
      "Encrypted PDFs are view-only. Save a decrypted copy in a trusted PDF tool before editing.",
    );
  if (info.signed)
    throw Error("Signed PDFs are view-only to protect their signatures.");
  const doc = await PDFDocument.load(bytes);
  const count = doc.getPageCount();
  const valid = (p: number) => {
    if (!Number.isInteger(p) || p < 0 || p >= count)
      throw Error("Page does not exist.");
  };
  if (op.kind === "comment.update" || op.kind === "comment.delete")
    changeComment(doc, op);
  if (op.kind === "rotate") {
    valid(op.page);
    const p = doc.getPage(op.page);
    p.setRotation(degrees((p.getRotation().angle + 90) % 360));
  }
  if (op.kind === "delete") {
    valid(op.page);
    if (count <= 1) throw Error("Keep at least one page.");
    const target = doc.getPage(op.page);
    const annots = target.node.Annots();
    if (
      annots?.asArray().some((a) => {
        const o = doc.context.lookup(a);
        return (
          o instanceof PDFDict &&
          o.get(PDFName.of("Subtype")) === PDFName.of("Widget")
        );
      })
    )
      throw Error(
        "This page contains form widgets. Deleting it could break the form; deletion is disabled.",
      );
    doc.removePage(op.page);
  }
  if (op.kind === "move") {
    valid(op.from);
    valid(op.to);
    const p = doc.getPage(op.from);
    p.node.normalize();
    doc.removePage(op.from);
    doc.insertPage(op.to, p);
  }
  if (op.kind === "annotation") {
    valid(op.annotation.page);
    const result = await exportAnnotatedPdf(bytes, [
      { id: crypto.randomUUID(), annotation: op.annotation },
    ]);
    if (result.skipped.length) throw Error(result.skipped[0].reason);
    return result.bytes;
  }
  if (op.kind === "text") {
    valid(op.page);
    if (!op.text.trim()) throw Error("Enter text first.");
    if (
      ![op.x, op.y, op.size].every(Number.isFinite) ||
      op.size < 1 ||
      op.size > 300
    )
      throw Error("Invalid text position or size.");
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(op.page).drawText(op.text, {
      x: op.x,
      y: op.y,
      size: op.size,
      font,
      color: rgb(0, 0, 0),
    });
  }
  if (op.kind === "insert") {
    if (!Number.isInteger(op.after) || op.after < 0 || op.after >= count)
      throw Error("Page does not exist.");
    const otherInfo = await inspectPdf(op.data);
    if (otherInfo.encrypted || otherInfo.signed)
      throw Error("Cannot combine encrypted or signed PDFs.");
    const other = await PDFDocument.load(op.data);
    if (other.getForm().getFields().length)
      throw Error(
        "Importing form fields is not supported. Flatten the source form in a trusted PDF tool before combining.",
      );
    if (count + other.getPageCount() > 2000)
      throw Error("Keep the document below 2000 pages.");
    const pages = await doc.copyPages(other, other.getPageIndices());
    pages.forEach((p, i) => doc.insertPage(op.after + 1 + i, p));
  }
  return doc.save();
}
