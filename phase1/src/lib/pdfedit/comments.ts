import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFString,
  PDFHexString,
  PDFRef,
  PDFNumber,
} from "pdf-lib";
import { buildAnnotation } from "../pdfannotate/export";
export interface PdfCommentTarget {
  page: number;
  index: number;
  object: string;
  expected: string;
}
export interface PdfComment {
  target: PdfCommentTarget;
  subtype: string;
  contents: string;
  author: string;
  editable: boolean;
  locked: boolean;
  reply: boolean;
  hasReplies: boolean;
  parentObject: string | null;
  replyType: string | null;
  canReply: boolean;
}
export type PdfCommentChange =
  | { kind: "comment.reply"; target: PdfCommentTarget; contents: string }
  | { kind: "comment.update"; target: PdfCommentTarget; contents: string }
  | { kind: "comment.delete"; target: PdfCommentTarget };
const SUPPORTED = new Set([
  "Text",
  "Highlight",
  "Underline",
  "StrikeOut",
  "Ink",
]);
const key = (name: string) => PDFName.of(name);
function text(d: PDFDict, name: string) {
  const v = d.lookupMaybe(key(name), PDFString, PDFHexString);
  return v?.decodeText() ?? "";
}
function snapshot(d: PDFDict) {
  return d.toString();
}
function flags(d: PDFDict) {
  const value = d.lookupMaybe(key("F"), PDFNumber)?.asNumber() ?? 0;
  return { locked: !!(value & (64 | 128 | 512)) };
}
function arrays(doc: PDFDocument, page: number) {
  const p = doc.getPages()[page];
  if (!p) throw Error("Comment page no longer exists.");
  return p.node.lookupMaybe(key("Annots"), PDFArray);
}
function allAnnotations(doc: PDFDocument) {
  const out: { page: number; index: number; raw: unknown; dict: PDFDict }[] =
    [];
  for (const [page, p] of doc.getPages().entries()) {
    const a = p.node.lookupMaybe(key("Annots"), PDFArray);
    if (!a) continue;
    for (let index = 0; index < a.size(); index++) {
      const d = a.lookupMaybe(index, PDFDict);
      if (d) out.push({ page, index, raw: a.get(index), dict: d });
      if (out.length > 10_000)
        throw Error("Comment inspection is limited to 10,000 annotations.");
    }
  }
  return out;
}
export function commentsFromDocument(doc: PDFDocument): PdfComment[] {
  const all = allAnnotations(doc);
  const repliedTo = new Set(
    all.map((a) => a.dict.get(key("IRT"))?.toString()).filter(Boolean),
  );
  return all.flatMap((a) => {
    const subtype =
      a.dict.lookupMaybe(key("Subtype"), PDFName)?.decodeText() ?? "";
    if (!SUPPORTED.has(subtype)) return [];
    const { locked } = flags(a.dict);
    const reply = a.dict.has(key("IRT"));
    const hasReplies =
      a.raw instanceof PDFRef && repliedTo.has(a.raw.toString());
    return [
      {
        target: {
          page: a.page,
          index: a.index,
          object: a.raw instanceof PDFRef ? a.raw.toString() : "direct",
          expected: snapshot(a.dict),
        },
        subtype,
        contents: text(a.dict, "Contents"),
        author: text(a.dict, "T"),
        editable: !locked,
        locked,
        reply,
        hasReplies,
        parentObject: a.dict.get(key("IRT"))?.toString() ?? null,
        replyType: a.dict.lookupMaybe(key("RT"), PDFName)?.decodeText() ?? null,
        canReply: !locked && !reply && a.raw instanceof PDFRef,
      },
    ];
  });
}
/** Guard by page, array slot, original object ref and full dictionary snapshot. Never patch a look-alike comment. */
export function changeComment(doc: PDFDocument, op: PdfCommentChange) {
  const a = arrays(doc, op.target.page);
  if (
    !a ||
    !Number.isInteger(op.target.index) ||
    op.target.index < 0 ||
    op.target.index >= a.size()
  )
    throw Error("Comment target is stale. Refresh the comments list.");
  const raw = a.get(op.target.index);
  const d = a.lookupMaybe(op.target.index, PDFDict);
  if (
    !d ||
    (raw instanceof PDFRef ? raw.toString() : "direct") !== op.target.object ||
    snapshot(d) !== op.target.expected
  )
    throw Error("Comment target is stale. Refresh the comments list.");
  const subtype = d.lookupMaybe(key("Subtype"), PDFName)?.decodeText() ?? "";
  if (!SUPPORTED.has(subtype))
    throw Error("This annotation type is view-only.");
  if (flags(d).locked) throw Error("This comment is locked or read-only.");
  if (op.kind === "comment.reply") {
    if (!(raw instanceof PDFRef))
      throw Error("Direct-dictionary comments cannot receive replies.");
    if (d.has(key("IRT")))
      throw Error("Reply to the thread's original comment, not to a reply.");
    if (
      typeof op.contents !== "string" ||
      !op.contents.trim() ||
      op.contents.length > 20000
    )
      throw Error("Write a reply of 1-20,000 characters.");
    if (allAnnotations(doc).length >= 10000)
      throw Error("Comment inspection is limited to 10,000 annotations.");
    const page = doc.getPage(op.target.page),
      box = page.getCropBox();
    if (box.width < 20 || box.height < 20)
      throw Error("Page crop is too small for a reply annotation.");
    const r = d.lookupMaybe(key("Rect"), PDFArray);
    const x = r?.lookupMaybe(0, PDFNumber)?.asNumber() ?? box.x;
    const top = r?.lookupMaybe(3, PDFNumber)?.asNumber() ?? box.y + 20;
    const reply = buildAnnotation(
      doc.context,
      {
        kind: "note",
        page: op.target.page,
        position: {
          x: Math.max(
            box.x,
            Math.min(box.x + box.width - 20, Number.isFinite(x) ? x : box.x),
          ),
          y: Math.max(
            box.y + 20,
            Math.min(
              box.y + box.height,
              Number.isFinite(top) ? top : box.y + 20,
            ),
          ),
        },
        color: [1, 0.8, 0],
        opacity: 1,
        contents: op.contents,
        author: "",
      },
      crypto.randomUUID(),
      page.ref,
    );
    const rd = doc.context.lookup(reply, PDFDict);
    rd.set(key("IRT"), raw);
    rd.set(key("RT"), PDFName.of("R"));
    rd.set(key("F"), doc.context.obj(2)); // Hidden: replies live in threads, not as duplicate page icons.
    a.push(reply);
    return;
  }
  if (op.kind === "comment.update") {
    if (typeof op.contents !== "string" || op.contents.length > 20_000)
      throw Error("Comment text is limited to 20,000 characters.");
    d.set(key("Contents"), PDFHexString.fromText(op.contents));
    d.delete(key("RC")); // rich-text contents cannot disagree with the newly saved plain text
    d.set(key("M"), PDFString.fromDate(new Date()));
    return;
  }
  const all = allAnnotations(doc);
  if (
    raw instanceof PDFRef &&
    all.some(
      (other) => other.dict.get(key("IRT"))?.toString() === raw.toString(),
    )
  )
    throw Error(
      "This comment has replies. Deleting a thread is not supported.",
    );
  // Remove only popup annotations whose Parent refers to the exact removed comment.
  const popup = d.get(key("Popup"));
  const remove = new Map<number, Set<number>>();
  remove.set(op.target.page, new Set([op.target.index]));
  if (raw instanceof PDFRef)
    for (const other of all) {
      if (
        other.dict.lookupMaybe(key("Subtype"), PDFName)?.decodeText() ===
          "Popup" &&
        other.dict.get(key("Parent"))?.toString() === raw.toString() &&
        (!popup ||
          (other.raw instanceof PDFRef &&
            other.raw.toString() === popup.toString()))
      ) {
        const set = remove.get(other.page) ?? new Set<number>();
        set.add(other.index);
        remove.set(other.page, set);
      }
    }
  for (const [page, indices] of remove) {
    const arr = arrays(doc, page)!;
    for (const index of [...indices].sort((a, b) => b - a)) arr.remove(index);
  }
}
